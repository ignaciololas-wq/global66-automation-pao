// Server HTTP unificado para n8n + Slack callbacks.
// Endpoints:
//   POST /form-webhook        ingestar Google Form (Apps Script trigger)
//   POST /extract             Claude extracción + cache
//   POST /sanctions           OpenSanctions check
//   POST /hito1-semaforo      computa color + persiste
//   POST /slack-callback      Slack interactive payload (buttons)
//   POST /validate-checklist  Fase 2 valida docs Drive
//   POST /run-alertas         dispara cron alertas
//   GET  /health              health check

import http from 'node:http';
import { URL } from 'node:url';
import { computeSemaphore } from './hito1_semaforo.js';
import {
  sb,
  startRun,
  setPhase,
  recordApproval,
  getApprovals,
  setSemaforo,
  logAudit,
  getRunById,
} from './supabase_audit.js';
import { extractFromPdfBuffer } from './gemini_extract.js';
import { checkSanctions } from './lista_negra.js';
import { validateChecklist, listFolderFiles } from './drive_docs.js';
import { runDailyAlerts } from './alertas.js';
import { verifySlackSignature } from './slack_verify.js';
import {
  createProvider,
  findProviderByTaxId,
  setProviderStatus,
  listProviders,
  createContract,
  setContractStatus,
  attachSignedPdf,
  getContractById,
} from './providers.js';

const PORT = process.env.PORT ?? 3000;

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

const routes = {
  'POST /extract': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    if (!body.pdf_base64) return json(res, 400, { error: 'pdf_base64 required' });
    const buf = Buffer.from(body.pdf_base64, 'base64');
    const out = await extractFromPdfBuffer(buf, { runId: body.run_id, pdfUrl: body.pdf_url });
    json(res, 200, out);
  },

  'POST /sanctions': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    const result = await checkSanctions(body);
    json(res, 200, result);
  },

  'POST /hito1-semaforo': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    if (body.run_id && !body.approvals) body.approvals = await getApprovals(body.run_id);
    const result = computeSemaphore(body);
    if (body.run_id) {
      await setSemaforo(body.run_id, result.color, result.reason);
      await setPhase(body.run_id, result.color === 'green' ? 'fase2' : result.color === 'red' ? 'rejected' : 'hito1');
    }
    json(res, 200, result);
  },

  'POST /slack-callback': async (req, res) => {
    const raw = await readBody(req);
    if (!verifySlackSignature(raw, req.headers)) return json(res, 401, { error: 'invalid signature' });

    const params = new URLSearchParams(raw);
    const payload = JSON.parse(params.get('payload') ?? '{}');
    const action = payload.actions?.[0];
    if (!action) return json(res, 400, { error: 'no action' });

    const { run_id, team, decision } = JSON.parse(action.value);
    await recordApproval({
      runId: run_id,
      team,
      decision,
      slackUserId: payload.user?.id,
      email: payload.user?.email ?? payload.user?.name,
    });

    const approvals = await getApprovals(run_id);
    const allDecided = ['compliance', 'legal', 'admin'].every((t) => approvals[t]);

    if (allDecided) {
      await fetch(`http://localhost:${PORT}/hito1-semaforo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id, approvals }),
      }).catch((e) => console.error('hito1 trigger failed', e));
    }

    json(res, 200, {
      response_action: 'update',
      text: `Decisión registrada: *${decision}* por ${team}`,
    });
  },

  'POST /validate-checklist': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    const files = await listFolderFiles(body.folder_id);
    const uploaded = files.map((f) => ({ id: matchDocId(f.name), issued_at: f.createdTime }));
    const result = validateChecklist(body.country, uploaded);
    if (body.run_id) await logAudit(body.run_id, 'system', 'fase2.checklist_validated', 'workflow_run', body.run_id, result);
    json(res, 200, result);
  },

  'POST /run-alertas': async (req, res) => {
    const r = await runDailyAlerts();
    json(res, 200, { sent: r.length, detail: r });
  },

  'GET /health': async (req, res) => json(res, 200, { ok: true, ts: new Date().toISOString() }),

  'GET /run': async (req, res, url) => {
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    json(res, 200, await getRunById(id));
  },

  'GET /dashboard': async (req, res) => {
    try {
      const html = await import('node:fs/promises').then((fs) => fs.readFile('public/dashboard.html', 'utf-8'));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  'POST /api/intake': async (req, res) => {
    // Internal user submits intake. Provider NOT invited yet — espera aprobación interna.
    const body = JSON.parse(await readBody(req));
    const { upsertProviderFromIntake } = await import('./provider_profile.js');
    const { sendEmail, intakeConfirmation } = await import('./email.js');
    const { suggestSociedad } = await import('./sociedad.js');

    try {
      // Sugerir sociedad si no vino (auto por país)
      if (!body.sociedad_contratante) {
        body.sociedad_contratante = suggestSociedad({ pais: body.pais });
      }

      const run = await startRun(body, { allowDuplicate: body.allow_duplicate === true });
      const { provider, isNew } = await upsertProviderFromIntake(body, { runId: run.id });

      // Marcar run en estado pendiente de aprobación interna
      await sb.from('workflow_runs').update({ internal_approval_status: 'pending' }).eq('id', run.id);

      // Email confirmación al solicitante interno (avisa que está en revisión)
      const to = body.solicitante_email ?? body.owner_email;
      if (to) {
        const tpl = intakeConfirmation({
          runId: run.id,
          solicitanteNombre: body.solicitante_nombre,
          razonSocial: body.razon_social,
          taxId: body.rut,
          pais: body.pais,
          monto: body.monto,
          moneda: body.moneda,
        });
        sendEmail({ to, ...tpl }).catch((e) => console.error('Confirmation email failed:', e.message));
      }

      json(res, 200, {
        run_id: run.id,
        provider_id: provider.id,
        provider_new: isNew,
        sociedad_sugerida: body.sociedad_contratante,
        internal_approval_status: 'pending',
        next_step: 'Aprobador interno revisa en /admin#workflows/' + run.id,
      });
    } catch (e) {
      if (e.code === 'DUPLICATE_ACTIVE_RUN') return json(res, 409, { error: e.message, existing: e.existing });
      throw e;
    }
  },

  'POST /api/intake/approve': async (req, res) => {
    // Aprobador interno aprueba/rechaza la solicitud. Si aprueba → manda email al proveedor.
    const body = JSON.parse(await readBody(req));
    const { run_id, decision, sociedad_contratante, sociedad_apoderado_email, comment, approver_email } = body;
    if (!run_id || !decision) return json(res, 400, { error: 'run_id and decision required' });
    if (!['approved', 'rejected', 'requested_changes'].includes(decision))
      return json(res, 400, { error: 'invalid decision' });

    const { buildProfileUrl, findByToken } = await import('./provider_profile.js');
    const { sendEmail, providerInvitation } = await import('./email.js');
    const { getDocsForSociedad } = await import('./sociedad.js');

    const patch = {
      internal_approval_status: decision,
      internal_approver_email: approver_email,
      internal_approved_at: new Date().toISOString(),
      internal_approval_comment: comment ?? null,
    };
    if (sociedad_contratante) patch.sociedad_contratante = sociedad_contratante;
    if (sociedad_apoderado_email) patch.sociedad_apoderado_email = sociedad_apoderado_email;
    if (decision === 'rejected') patch.current_phase = 'rejected';

    await sb.from('workflow_runs').update(patch).eq('id', run_id);
    await logAudit(run_id, approver_email ?? 'admin', `intake.${decision}`, 'workflow_run', run_id, { sociedad_contratante, comment });

    if (decision !== 'approved') return json(res, 200, { ok: true, decision });

    // Buscar provider asociado para mandar email
    const { data: run } = await sb.from('workflow_runs').select('*').eq('id', run_id).single();
    const { data: provider } = await sb.from('providers').select('*').eq('tax_id', run.tax_id).maybeSingle();
    if (!provider) return json(res, 200, { ok: true, decision, warning: 'provider not found, no email sent' });

    // Persist sociedad en provider también
    if (sociedad_contratante) await sb.from('providers').update({ sociedad_contratante }).eq('id', provider.id);

    const sociedadDocs = getDocsForSociedad(sociedad_contratante ?? run.sociedad_contratante);
    const profileUrl = buildProfileUrl(provider.public_token);
    const tpl = providerInvitation({
      providerName: run.representante_legal ?? provider.razon_social,
      profileUrl,
      sociedadContratante: sociedad_contratante ?? run.sociedad_contratante,
      solicitanteNombre: run.solicitante_nombre,
      sociedadDocs,
    });

    if (provider.email_contacto) {
      sendEmail({ to: provider.email_contacto, ...tpl })
        .then(() => sb.from('providers').update({ profile_invited_at: new Date().toISOString() }).eq('id', provider.id))
        .catch((e) => console.error('Provider invitation failed:', e.message));
    }

    json(res, 200, { ok: true, decision, provider_invited: !!provider.email_contacto, profile_url: profileUrl });
  },

  'POST /api/provider/upload': async (req, res) => {
    // Provider sube documento. file_url ya en Drive/Vercel Blob; aquí solo registramos + RAG.
    const body = JSON.parse(await readBody(req));
    if (!body.token || !body.doc_type || !body.file_url)
      return json(res, 400, { error: 'token, doc_type, file_url required' });
    const { findByToken } = await import('./provider_profile.js');
    const provider = await findByToken(body.token);
    if (!provider) return json(res, 404, { error: 'token invalid' });

    const { data, error } = await sb.from('provider_uploads').insert({
      provider_id: provider.id,
      doc_type: body.doc_type,
      doc_filename: body.doc_filename ?? body.file_url.split('/').pop(),
      file_url: body.file_url,
      file_size: body.file_size,
      uploaded_by_email: body.by_email,
    }).select().single();
    if (error) return json(res, 500, { error: error.message });

    // Trigger RAG async
    import('./rag_extract.js').then(({ extractAndValidate }) =>
      extractAndValidate(data.id, provider).catch((e) => console.error('RAG failed:', e.message)),
    );

    json(res, 200, { upload_id: data.id, rag_status: 'pending' });
  },

  'GET /api/sociedades': async (req, res) => {
    const { SOCIEDADES, getDocsForSociedad } = await import('./sociedad.js');
    json(res, 200, SOCIEDADES.map((s) => ({ id: s, ...getDocsForSociedad(s) })));
  },

  'GET /api/provider': async (req, res, url) => {
    const token = url.searchParams.get('token');
    if (!token) return json(res, 400, { error: 'token required' });
    const { findByToken } = await import('./provider_profile.js');
    const p = await findByToken(token);
    if (!p) return json(res, 404, { error: 'token invalid' });
    json(res, 200, p);
  },

  'POST /api/provider/fill': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    if (!body.token) return json(res, 400, { error: 'token required' });
    const { fillProfile } = await import('./provider_profile.js');
    try {
      const p = await fillProfile(body.token, body.profile_data ?? {}, { byEmail: body.by_email });
      json(res, 200, { ok: true, provider_id: p.id });
    } catch (e) {
      if (e.code === 'INVALID_TOKEN') return json(res, 404, { error: 'token invalid' });
      throw e;
    }
  },

  'GET /p/:token': null, // handled below via custom routing

  'GET /admin': async (req, res) => {
    try {
      const html = await import('node:fs/promises').then((fs) => fs.readFile('public/admin.html', 'utf-8'));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(html);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  'POST /providers': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    try {
      const p = await createProvider(body, { runId: body.run_id });
      json(res, 201, p);
    } catch (e) {
      if (e.code === 'PROVIDER_EXISTS') return json(res, 409, { error: e.message, existing: e.existing });
      throw e;
    }
  },

  'GET /providers': async (req, res, url) => {
    const status = url.searchParams.get('status');
    const pais = url.searchParams.get('pais');
    json(res, 200, await listProviders({ status, pais }));
  },

  'POST /providers/status': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    await setProviderStatus(body.provider_id, body.status, { runId: body.run_id });
    json(res, 200, { ok: true });
  },

  'POST /contracts': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    const c = await createContract(body, { runId: body.run_id });
    json(res, 201, c);
  },

  'POST /contracts/sign': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    const c = await attachSignedPdf(body.contract_id, body.signed_pdf_url, body.signnow_document_id, { runId: body.run_id });
    json(res, 200, c);
  },

  'GET /contracts': async (req, res, url) => {
    const id = url.searchParams.get('id');
    if (id) return json(res, 200, await getContractById(id));
    json(res, 400, { error: 'id required' });
  },

  'GET /digest': async (req, res) => {
    const { buildDigest } = await import('./digest.js');
    const d = await buildDigest();
    if (req.headers.accept?.includes('text/html')) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(d.html);
    } else {
      json(res, 200, d);
    }
  },
};

function matchDocId(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('rut')) return 'rut_empresa';
  if (lower.includes('vigencia')) return 'vigencia_sociedad';
  if (lower.includes('poder')) return 'poderes';
  if (lower.includes('cedula') || lower.includes('cédula')) return 'cedula_representante';
  if (lower.includes('antecedentes')) return 'certificado_antecedentes';
  if (lower.includes('f29')) return 'f29_ultimos_3';
  if (lower.includes('ruc')) return 'ruc';
  if (lower.includes('dni')) return 'dni_representante';
  if (lower.includes('rfc')) return 'rfc';
  if (lower.includes('acta')) return 'acta_constitutiva';
  if (lower.includes('ine')) return 'ine_representante';
  if (lower.includes('camara')) return 'camara_comercio';
  if (lower.includes('cuit')) return 'cuit';
  return 'unknown';
}

async function readStatic(rel) {
  const path = await import('node:path');
  const fs = await import('node:fs/promises');
  // En Vercel el cwd puede no tener public/. Resolver relativo al archivo importador.
  const tryPaths = [
    path.resolve(process.cwd(), rel),
    path.resolve(process.cwd(), 'public', rel.replace(/^public\//, '')),
    new URL('../' + rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
  ];
  for (const p of tryPaths) {
    try { return await fs.readFile(p, 'utf-8'); } catch {}
  }
  throw new Error('Static file not found: ' + rel);
}

export async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  // Provider self-service
  if (req.method === 'GET' && url.pathname.startsWith('/p/')) {
    try {
      const html = await readStatic('public/provider.html');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    } catch (e) { return json(res, 500, { error: e.message }); }
  }

  const handler = routes[key];
  if (!handler || handler === null) return json(res, 404, { error: 'not found', path: key });
  try { await handler(req, res, url); }
  catch (e) { console.error(`[${key}]`, e); json(res, 500, { error: e.message }); }
}

// Override /admin + /dashboard to use readStatic so funciona en Vercel
const _adminHandler = routes['GET /admin'];
routes['GET /admin'] = async (req, res) => {
  try {
    const html = await readStatic('public/admin.html');
    res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (e) { json(res, 500, { error: e.message }); }
};
routes['GET /dashboard'] = async (req, res) => {
  try {
    const html = await readStatic('public/dashboard.html');
    res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (e) { json(res, 500, { error: e.message }); }
};

// Standalone Node mode (no Vercel): start server.
if (!process.env.VERCEL) {
  http.createServer(handleRequest).listen(PORT, () => console.log(`Server up on ${PORT}`));
}

export default handleRequest;
