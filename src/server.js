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
  'POST /form-webhook': async (req, res) => {
    const raw = JSON.parse(await readBody(req));
    const { isTallyPayload, adaptTally } = await import('./tally_adapter.js');
    const body = isTallyPayload(raw) ? adaptTally(raw) : raw;
    try {
      const run = await startRun(body, { allowDuplicate: body.allow_duplicate === true });
      // Email confirmación al solicitante (fire-and-forget)
      const to = body.solicitante_email ?? body.owner_email;
      if (to) {
        import('./email.js').then(({ sendEmail, intakeConfirmation }) => {
          const tpl = intakeConfirmation({
            runId: run.id,
            solicitanteNombre: body.solicitante_nombre,
            razonSocial: body.razon_social,
            taxId: body.rut,
            pais: body.pais,
            monto: body.monto,
            moneda: body.moneda,
          });
          return sendEmail({ to, ...tpl });
        }).catch((e) => console.error('Confirmation email failed:', e.message));
      }
      json(res, 200, { run_id: run.id, source: isTallyPayload(raw) ? 'tally' : 'google' });
    } catch (e) {
      if (e.code === 'DUPLICATE_ACTIVE_RUN') {
        return json(res, 409, { error: e.message, existing: e.existing });
      }
      throw e;
    }
  },

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
    // Internal user submits intake form natively from admin UI.
    const body = JSON.parse(await readBody(req));
    const { upsertProviderFromIntake, buildProfileUrl } = await import('./provider_profile.js');
    const { sendEmail, providerInvitation } = await import('./email.js');

    try {
      const run = await startRun(body, { allowDuplicate: body.allow_duplicate === true });
      const { provider, isNew } = await upsertProviderFromIntake(body, { runId: run.id });

      // Invite provider only if proveedor_existente=false and email_contacto present
      let inviteSent = false;
      if (isNew && body.email_contacto && provider.public_token) {
        const url = buildProfileUrl(provider.public_token);
        const tpl = providerInvitation({
          providerName: body.representante_legal ?? body.razon_social,
          profileUrl: url,
          sociedadContratante: body.sociedad_contratante,
          solicitanteNombre: body.solicitante_nombre,
        });
        sendEmail({ to: body.email_contacto, ...tpl })
          .then(() => sb.from('providers').update({ profile_invited_at: new Date().toISOString() }).eq('id', provider.id))
          .catch((e) => console.error('Provider invitation failed:', e.message));
        inviteSent = true;
      }

      // Email confirmación al solicitante interno
      const to = body.solicitante_email ?? body.owner_email;
      if (to) {
        const tpl = (await import('./email.js')).intakeConfirmation({
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
        provider_profile_url: provider.public_token ? buildProfileUrl(provider.public_token) : null,
        provider_invite_sent: inviteSent,
      });
    } catch (e) {
      if (e.code === 'DUPLICATE_ACTIVE_RUN') return json(res, 409, { error: e.message, existing: e.existing });
      throw e;
    }
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const key = `${req.method} ${url.pathname}`;

  // Custom: provider self-service page /p/:token serves public HTML
  if (req.method === 'GET' && url.pathname.startsWith('/p/')) {
    try {
      const html = await import('node:fs/promises').then((fs) => fs.readFile('public/provider.html', 'utf-8'));
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  const handler = routes[key];
  if (!handler || handler === null) return json(res, 404, { error: 'not found', path: key });
  try {
    await handler(req, res, url);
  } catch (e) {
    console.error(`[${key}]`, e);
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`Server up on ${PORT}`));
