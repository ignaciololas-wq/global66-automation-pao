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
import crypto from 'node:crypto';
import { URL } from 'node:url';
import busboy from 'busboy';
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
import { checkSupplier as checkRegcheq } from './regcheq.js';
import { recordRegcheqCheck } from './supabase_audit.js';
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
import {
  AUTH_ENABLED,
  ADMIN_EMAILS,
  SESSION_COOKIE,
  buildSessionCookie,
  buildClearCookie,
  readSessionCookie,
  publicSupabase,
  getUserFromRequest,
  requireRole,
  requireAdmin,
  siteUrl,
  callbackUrl,
} from './auth.js';
import {
  uploadFile,
  listFiles,
  getSignedUrl,
  deleteFile,
  isAllowedMime,
} from './files.js';
import {
  listComments,
  createComment,
  updateComment,
  deleteComment as deleteFileComment,
} from './comments.js';
import {
  listForUser as listNotifications,
  markRead as markNotificationsRead,
  markAllRead as markAllNotificationsRead,
  unreadCount as notificationUnreadCount,
} from './notifications.js';
import {
  runAiEdit,
  applyAiDraft,
  discardAiDraft,
  listJobsForRun as listAiJobs,
} from './ai_edit.js';
import {
  listSociedades,
  listApoderados,
  suggestApoderados,
  listSociedadDocs,
  createSociedad,
  updateSociedad,
  deleteSociedad,
  createApoderado,
  updateApoderado,
  deleteApoderado,
  createSociedadDoc,
  updateSociedadDoc,
  deleteSociedadDoc,
} from './matriz.js';

const PORT = process.env.PORT ?? 3000;

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw;
}

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Parser multipart/form-data minimal (sin dependencias). Soporta un file + campos.
function parseMultipart(buffer, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = 0;
  while (start < buffer.length) {
    const idx = buffer.indexOf(delim, start);
    if (idx < 0) break;
    const next = buffer.indexOf(delim, idx + delim.length);
    if (next < 0) break;
    const slice = buffer.slice(idx + delim.length, next);
    parts.push(slice);
    start = next;
  }
  const fields = {};
  let file = null;
  for (const raw of parts) {
    const headerEnd = raw.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd < 0) continue;
    const headerStr = raw.slice(2, headerEnd).toString('utf8');
    let bodyBuf = raw.slice(headerEnd + 4);
    if (bodyBuf.length >= 2 && bodyBuf[bodyBuf.length - 2] === 0x0d && bodyBuf[bodyBuf.length - 1] === 0x0a) {
      bodyBuf = bodyBuf.slice(0, bodyBuf.length - 2);
    }
    const nameMatch = headerStr.match(/name="([^"]+)"/);
    const filenameMatch = headerStr.match(/filename="([^"]+)"/);
    const ctMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (filenameMatch) {
      file = {
        field: name,
        filename: filenameMatch[1],
        mimeType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
        buffer: bodyBuf,
      };
    } else {
      fields[name] = bodyBuf.toString('utf8');
    }
  }
  return { fields, file };
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

  'POST /regcheq': async (req, res) => {
    // body: { run_id?, provider_id?, supplier: { razon_social, tax_id, pais, email_contacto }, relations?: [{ dni, name, type }] }
    const body = JSON.parse(await readBody(req));
    if (!body.supplier) return json(res, 400, { error: 'supplier required' });
    const result = await checkRegcheq(body.supplier, body.relations ?? []);
    if (body.run_id || body.provider_id) {
      await recordRegcheqCheck(body.run_id ?? null, result, {
        providerId: body.provider_id,
        taxId: body.supplier.tax_id,
      });
    }
    json(res, 200, result);
  },

  'GET /api/provider-uploads/url': async (req, res, url) => {
    // Devuelve signed URL para descargar un provider_upload (RUT cert, NDA firmado, etc.).
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    const { data: row, error } = await sb
      .from('provider_uploads')
      .select('file_url, doc_filename')
      .eq('id', id)
      .maybeSingle();
    if (error || !row) return json(res, 404, { error: 'upload not found' });
    const { data: signed, error: e2 } = await sb.storage.from('contracts').createSignedUrl(row.file_url, 3600, { download: row.doc_filename });
    if (e2) return json(res, 500, { error: e2.message });
    json(res, 200, { url: signed.signedUrl, filename: row.doc_filename });
  },

  'GET /api/regcheq-history': async (req, res, url) => {
    const pid = url.searchParams.get('provider_id');
    if (!pid) return json(res, 400, { error: 'provider_id required' });
    const { data, error } = await sb
      .from('regcheq_checks')
      .select('id, workflow_run_id, decision, reason, company, relations, created_at')
      .eq('provider_id', pid)
      .order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    json(res, 200, data ?? []);
  },

  'POST /hito1-semaforo': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    if (body.run_id && !body.approvals) body.approvals = await getApprovals(body.run_id);
    const result = computeSemaphore(body);
    if (body.run_id) {
      await setSemaforo(body.run_id, result.color, result.reason);
      // En modo paralelo: marcamos aprobaciones internas como done sin avanzar a fase3 hasta que provider también termine
      if (result.color === 'red') {
        await setPhase(body.run_id, 'rejected');
      } else {
        const { markInternalApprovalsDone } = await import('./approvals_dispatch.js');
        await markInternalApprovalsDone(body.run_id, result.color, result.reason);
      }
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
  'GET /api/health': async (req, res) => json(res, 200, {
    ok: true,
    ts: new Date().toISOString(),
    auth_enabled: AUTH_ENABLED,
    admin_emails_count: ADMIN_EMAILS.length,
    site_url: siteUrl(),
    keys: {
      anthropic: !!(process.env.ANTHROPIC_API_KEY ?? process.env.ANHTROPIC_API_KEY ?? process.env.CLAUDE_API_KEY),
      anthropic_var_name: process.env.ANTHROPIC_API_KEY ? 'ANTHROPIC_API_KEY' : process.env.ANHTROPIC_API_KEY ? 'ANHTROPIC_API_KEY (typo!)' : process.env.CLAUDE_API_KEY ? 'CLAUDE_API_KEY' : 'NONE',
      gemini: !!process.env.GEMINI_API_KEY,
      resend: !!process.env.RESEND_API_KEY,
      n8n_email: !!process.env.N8N_EMAIL_WEBHOOK_URL,
      slack: !!process.env.SLACK_BOT_TOKEN,
    },
  }),

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
    // Internal user submits intake. INMEDIATAMENTE dispara branches paralelos:
    //   - Mail al proveedor con magic-link para que complete su parte
    //   - Slack a compliance/legal/admin para aprobaciones internas
    const body = JSON.parse(await readBody(req));
    const { upsertProviderFromIntake, buildProfileUrl } = await import('./provider_profile.js');
    const { sendEmail, intakeConfirmation, providerInvitation } = await import('./email.js');
    const { suggestSociedad, getDocsForSociedad } = await import('./sociedad.js');
    const { dispatchApprovalRequests } = await import('./approvals_dispatch.js');

    try {
      // Sugerir sociedad si no vino (auto por país)
      if (!body.sociedad_contratante) {
        body.sociedad_contratante = suggestSociedad({ pais: body.pais });
      }

      const run = await startRun(body, { allowDuplicate: body.allow_duplicate === true });
      const { provider, isNew } = await upsertProviderFromIntake(body, { runId: run.id });

      // Arrancar branches paralelos: provider data || internal approvals
      await sb.from('workflow_runs').update({
        current_phase: 'parallel',
        active_phases: ['fase2_provider_data', 'hito1_approvals'],
        internal_approval_status: 'pending',
      }).eq('id', run.id);

      // Email confirmación al solicitante interno (avisa que está en marcha)
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

      // Branch A: mail al proveedor con magic-link
      if (provider.email_contacto) {
        const sociedadDocs = getDocsForSociedad(body.sociedad_contratante);
        const profileUrl = buildProfileUrl(provider.public_token);
        const tpl = providerInvitation({
          providerName: body.representante_legal ?? provider.razon_social,
          profileUrl,
          sociedadContratante: body.sociedad_contratante,
          solicitanteNombre: body.solicitante_nombre,
          sociedadDocs,
        });
        sendEmail({ to: provider.email_contacto, ...tpl })
          .then(() => sb.from('providers').update({ profile_invited_at: new Date().toISOString() }).eq('id', provider.id))
          .catch((e) => console.error('Provider invitation failed:', e.message));
      }

      // Branch B: Slack a compliance/legal/admin
      dispatchApprovalRequests(run.id).catch((e) => console.error('dispatchApprovalRequests failed:', e.message));

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

  'POST /api/intake/signature-config': async (req, res) => {
    // Nodo 5 (Firma): guarda sociedad+apoderado y opcionalmente dispara SignNow.
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    if (!auth.roles?.some((r) => r === 'admin' || r === 'aprobador')) {
      return json(res, 403, { error: 'admin o aprobador required' });
    }
    const body = JSON.parse(await readBody(req));
    if (!body.run_id) return json(res, 400, { error: 'run_id required' });

    const patch = {};
    if (body.sociedad_contratante) patch.sociedad_contratante = body.sociedad_contratante;
    if (body.sociedad_apoderado_email) patch.sociedad_apoderado_email = body.sociedad_apoderado_email;
    if (Array.isArray(body.apoderados_firmantes)) patch.apoderados_firmantes = body.apoderados_firmantes;
    if (Object.keys(patch).length) {
      const { error } = await sb.from('workflow_runs').update(patch).eq('id', body.run_id);
      if (error) return json(res, 500, { error: error.message });
    }
    await logAudit(body.run_id, auth.email, 'signature.config_saved', 'workflow_run', body.run_id, {
      sociedad: body.sociedad_contratante,
      signers_count: body.apoderados_firmantes?.length ?? 0,
      note: body.note,
    });

    if (!body.send_to_signnow) return json(res, 200, { ok: true, saved: true });

    try {
      const { sendToSignNow } = await import('./signnow.js').catch(() => ({}));
      if (!sendToSignNow) return json(res, 200, { ok: true, saved: true, signnow: 'not_implemented_yet' });
      const result = await sendToSignNow({ runId: body.run_id });
      await sb.from('workflow_runs').update({ current_phase: 'fase3' }).eq('id', body.run_id);
      await logAudit(body.run_id, auth.email, 'signature.sent_to_signnow', 'workflow_run', body.run_id, result);
      json(res, 200, { ok: true, saved: true, signnow_document_id: result?.document_id ?? null });
    } catch (e) {
      console.error('[signature signnow]', e);
      json(res, 500, { error: 'SignNow falló: ' + e.message });
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
    const { sendEmail, providerInvitation, providerRevisionRequest } = await import('./email.js');
    const { getDocsForSociedad } = await import('./sociedad.js');
    const { dispatchApprovalRequests } = await import('./approvals_dispatch.js');

    const patch = {
      internal_approval_status: decision,
      internal_approver_email: approver_email,
      internal_approved_at: new Date().toISOString(),
      internal_approval_comment: comment ?? null,
    };
    if (sociedad_contratante) patch.sociedad_contratante = sociedad_contratante;
    if (sociedad_apoderado_email) patch.sociedad_apoderado_email = sociedad_apoderado_email;
    if (decision === 'rejected') patch.current_phase = 'rejected';
    if (decision === 'requested_changes') patch.current_phase = 'fase2';
    if (decision === 'approved') {
      patch.current_phase = 'parallel'; // marca de UI: hay branches activos
      patch.active_phases = ['fase2_provider_data', 'hito1_approvals'];
    }

    const upd = await sb.from('workflow_runs').update(patch).eq('id', run_id);
    if (upd.error) console.error('[intake/approve] update error:', upd.error.message);
    await logAudit(run_id, approver_email ?? 'admin', `intake.${decision}`, 'workflow_run', run_id, { sociedad_contratante, comment });

    if (decision === 'rejected') return json(res, 200, { ok: true, decision });

    // En aprobado: dispara aprobaciones internas Slack en paralelo (no bloquea mail proveedor)
    if (decision === 'approved') {
      dispatchApprovalRequests(run_id).catch((e) => console.error('dispatchApprovalRequests failed:', e.message));
    }

    // approved | requested_changes → mail al proveedor
    const { data: run } = await sb.from('workflow_runs').select('*').eq('id', run_id).single();
    const { data: provider } = await sb.from('providers').select('*').eq('tax_id', run.tax_id).maybeSingle();
    if (!provider) return json(res, 200, { ok: true, decision, warning: 'provider not found, no email sent' });

    if (sociedad_contratante) await sb.from('providers').update({ sociedad_contratante }).eq('id', provider.id);

    const profileUrl = buildProfileUrl(provider.public_token);
    let tpl;

    if (decision === 'requested_changes') {
      tpl = providerRevisionRequest({
        providerName: run.representante_legal ?? provider.razon_social,
        profileUrl,
        comment,
        solicitanteNombre: run.solicitante_nombre,
        approverEmail: approver_email,
      });
    } else {
      const sociedadDocs = getDocsForSociedad(sociedad_contratante ?? run.sociedad_contratante);
      tpl = providerInvitation({
        providerName: run.representante_legal ?? provider.razon_social,
        profileUrl,
        sociedadContratante: sociedad_contratante ?? run.sociedad_contratante,
        solicitanteNombre: run.solicitante_nombre,
        sociedadDocs,
      });
    }

    if (provider.email_contacto) {
      sendEmail({ to: provider.email_contacto, ...tpl })
        .then(() => {
          if (decision === 'approved') {
            sb.from('providers').update({ profile_invited_at: new Date().toISOString() }).eq('id', provider.id);
          }
        })
        .catch((e) => console.error(`Provider ${decision} email failed:`, e.message));
    }

    json(res, 200, { ok: true, decision, provider_notified: !!provider.email_contacto, profile_url: profileUrl });
  },

  'POST /api/provider/upload': async (req, res) => {
    // Provider sube documento — acepta multipart/form-data (file binary) o JSON con file_url ya hosteada.
    const ct = (req.headers['content-type'] ?? '').toLowerCase();
    const { findByToken } = await import('./provider_profile.js');

    if (ct.startsWith('multipart/form-data')) {
      const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
      const MAX = 10 * 1024 * 1024;

      let parsed;
      try {
        parsed = await new Promise((resolve, reject) => {
          const fields = {};
          let fileResult = null;
          let fileError = null;
          const bb = busboy({ headers: req.headers, limits: { fileSize: MAX, files: 1 } });
          bb.on('field', (name, val) => { fields[name] = val; });
          bb.on('file', (name, stream, info) => {
            const chunks = [];
            let size = 0;
            let truncated = false;
            stream.on('data', (c) => { chunks.push(c); size += c.length; });
            stream.on('limit', () => { truncated = true; });
            stream.on('end', () => {
              if (truncated) { fileError = 'file too large (max 10MB)'; return; }
              fileResult = {
                field: name,
                filename: info.filename,
                mimeType: info.mimeType,
                buffer: Buffer.concat(chunks),
              };
            });
            stream.on('error', (e) => { fileError = e.message; });
          });
          bb.on('error', reject);
          bb.on('close', () => resolve({ fields, file: fileResult, fileError }));
          req.pipe(bb);
        });
      } catch (e) {
        console.error('[upload] busboy parse failed:', e.message);
        return json(res, 400, { error: `multipart parse: ${e.message}` });
      }

      const { fields, file, fileError } = parsed;
      if (fileError) return json(res, 413, { error: fileError });

      if (!fields.token || !fields.doc_type) {
        console.error('[upload] missing fields, got keys:', Object.keys(fields));
        return json(res, 400, { error: 'token, doc_type required', got_fields: Object.keys(fields) });
      }
      if (!file || !file.buffer.length) return json(res, 400, { error: 'file required' });
      if (!ALLOWED.has(file.mimeType)) return json(res, 400, { error: `mime not allowed: ${file.mimeType}` });

      const provider = await findByToken(fields.token);
      if (!provider) return json(res, 404, { error: 'token invalid' });

      const safeName = (file.filename ?? 'archivo').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
      const fileId = crypto.randomUUID();
      const storagePath = `providers/${provider.id}/${fileId}-${safeName}`;
      const up = await sb.storage.from('contracts').upload(storagePath, file.buffer, {
        contentType: file.mimeType,
        upsert: false,
      });
      if (up.error) return json(res, 500, { error: `storage.upload: ${up.error.message}` });

      const { data, error } = await sb.from('provider_uploads').insert({
        provider_id: provider.id,
        doc_type: fields.doc_type,
        doc_filename: safeName,
        file_url: storagePath,
        file_size: file.buffer.length,
        uploaded_by_email: fields.by_email ?? null,
      }).select().single();
      if (error) return json(res, 500, { error: error.message });

      import('./rag_extract.js').then(({ extractAndValidate }) =>
        extractAndValidate(data.id, provider).catch((e) => console.error('RAG failed:', e.message)),
      );

      return json(res, 200, { upload_id: data.id, doc_filename: safeName, file_size: file.buffer.length, rag_status: 'pending' });
    }

    // Legacy JSON path (file_url pre-hosteada)
    const body = JSON.parse(await readBody(req));
    if (!body.token || !body.doc_type || !body.file_url)
      return json(res, 400, { error: 'token, doc_type, file_url required' });
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

    import('./rag_extract.js').then(({ extractAndValidate }) =>
      extractAndValidate(data.id, provider).catch((e) => console.error('RAG failed:', e.message)),
    );

    json(res, 200, { upload_id: data.id, rag_status: 'pending' });
  },

  'GET /api/provider/uploads': async (req, res, url) => {
    // Lista uploads ya hechos por un proveedor (acceso público por token).
    const token = url.searchParams.get('token');
    if (!token) return json(res, 400, { error: 'token required' });
    const { findByToken } = await import('./provider_profile.js');
    const provider = await findByToken(token);
    if (!provider) return json(res, 404, { error: 'token invalid' });
    const { data, error } = await sb
      .from('provider_uploads')
      .select('id, doc_type, doc_filename, file_size, rag_status, validation_status, created_at')
      .eq('provider_id', provider.id)
      .order('created_at', { ascending: false });
    if (error) return json(res, 500, { error: error.message });
    json(res, 200, data ?? []);
  },

  'GET /api/providers/lookup': async (req, res, url) => {
    // Autocomplete intake: buscá por tax_id y devolvé todos los campos disponibles
    // + último profile_data (contacto comercial, datos bancarios, certificaciones).
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const taxId = (url.searchParams.get('tax_id') ?? '').trim();
    if (!taxId) return json(res, 400, { error: 'tax_id required' });
    const { data, error } = await sb
      .from('providers')
      .select('id, razon_social, tax_id, pais, tipo_proveedor, email_contacto, email_facturacion, representante_legal, domicilio, nivel_acceso, criticidad, sociedad_contratante, servicio_descripcion, status, profile_data, profile_completed_at, created_at')
      .eq('tax_id', taxId)
      .maybeSingle();
    if (error) return json(res, 500, { error: error.message });
    if (!data) return json(res, 404, { error: 'not found' });

    // Resumen último flow del provider (cuántas solicitudes, última sociedad usada).
    const { data: runs } = await sb
      .from('workflow_runs')
      .select('id, sociedad_contratante, tipo_proveedor, current_phase, created_at')
      .eq('tax_id', taxId)
      .order('created_at', { ascending: false })
      .limit(3);

    json(res, 200, {
      ...data,
      recent_runs: runs ?? [],
      run_count: runs?.length ?? 0,
    });
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

    // Adjuntar docs requeridos según sociedad + uploads ya hechos
    let sociedadDocs = null;
    try {
      const { getDocsForSociedad } = await import('./sociedad.js');
      sociedadDocs = getDocsForSociedad(p.sociedad_contratante);
    } catch (e) {
      console.error('getDocsForSociedad failed:', e.message);
    }
    const { data: uploads } = await sb
      .from('provider_uploads')
      .select('id, doc_type, doc_filename, file_size, rag_status, validation_status, created_at')
      .eq('provider_id', p.id)
      .order('created_at', { ascending: false });

    json(res, 200, { ...p, sociedad_docs: sociedadDocs, uploads: uploads ?? [] });
  },

  // ── Admin: gestión usuarios (solo role=admin) ──────────────────────────
  'GET /api/admin/users': async (req, res) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const { data, error } = await sb.auth.admin.listUsers();
    if (error) return json(res, 500, { error: error.message });

    const profilesById = new Map();
    const { data: profiles } = await sb.from('user_profiles').select('user_id, roles, sociedades, display_name');
    (profiles ?? []).forEach((p) => profilesById.set(p.user_id, p));

    json(res, 200, data.users.map((u) => {
      const profile = profilesById.get(u.id);
      const isAllowlistedAdmin = ADMIN_EMAILS.includes((u.email ?? '').toLowerCase());
      const baseRoles = profile?.roles?.length
        ? profile.roles
        : (u.app_metadata?.role === 'admin'
          ? ['admin', 'aprobador', 'solicitante']
          : u.app_metadata?.role
            ? [u.app_metadata.role]
            : ['solicitante']);
      const roles = isAllowlistedAdmin
        ? Array.from(new Set([...baseRoles, 'admin', 'aprobador', 'solicitante']))
        : baseRoles;
      return {
        id: u.id,
        email: u.email,
        roles,
        sociedades: profile?.sociedades ?? [],
        display_name: profile?.display_name ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed: !!u.email_confirmed_at,
        admin_via_allowlist: isAllowlistedAdmin,
      };
    }));
  },

  'POST /api/admin/users': async (req, res) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    if (!body.email) return json(res, 400, { error: 'email required' });
    const email = body.email.toLowerCase();
    const roles = normalizeRoles(body.roles ?? body.role ?? ['solicitante']);
    const sociedades = Array.isArray(body.sociedades) ? body.sociedades : [];

    const { data: { users } } = await sb.auth.admin.listUsers();
    let user = users.find((u) => (u.email ?? '').toLowerCase() === email);

    if (!user) {
      const created = await sb.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (created.error) return json(res, 400, { error: created.error.message });
      user = created.data.user;
    }

    await sb.from('user_profiles').upsert({
      user_id: user.id,
      email,
      roles,
      sociedades,
      display_name: body.display_name ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    // Magic link bienvenida
    const linkRes = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: callbackUrl() },
    });

    await logAudit(null, auth.email, 'user.invited', 'auth_user', user.id, { roles, sociedades });
    json(res, 200, {
      id: user.id,
      email: user.email,
      roles,
      sociedades,
      magic_link: linkRes.data?.properties?.action_link,
    });
  },

  'POST /api/admin/users/role': async (req, res) => {
    // Backward-compat: actualiza roles desde body.roles (array) o body.role (string).
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    if (!body.user_id) return json(res, 400, { error: 'user_id required' });
    const roles = normalizeRoles(body.roles ?? body.role);
    if (!roles.length) return json(res, 400, { error: 'roles required' });

    const { data: { user } } = await sb.auth.admin.getUserById(body.user_id);
    if (!user) return json(res, 404, { error: 'user not found' });

    await sb.from('user_profiles').upsert({
      user_id: user.id,
      email: user.email,
      roles,
      sociedades: body.sociedades ?? undefined,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    await logAudit(null, auth.email, 'user.role_changed', 'auth_user', body.user_id, { roles });
    json(res, 200, { ok: true, roles });
  },

  'DELETE /api/admin/users': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    const { error } = await sb.auth.admin.deleteUser(id);
    if (error) return json(res, 500, { error: error.message });
    await logAudit(null, auth.email, 'user.deleted', 'auth_user', id, {});
    json(res, 200, { ok: true });
  },

  'POST /api/auth/login': async (req, res) => {
    // Password login (legacy fallback). Magic link es el path principal.
    const body = JSON.parse(await readBody(req));
    if (!body.email || !body.password) return json(res, 400, { error: 'email + password required' });
    const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: process.env.SUPABASE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: body.email, password: body.password }),
    });
    const data = await r.json();
    if (!r.ok) return json(res, r.status, { error: data.msg ?? data.error_description ?? 'login failed' });

    const session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      user: { id: data.user?.id, email: data.user?.email },
    };
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Set-Cookie', buildSessionCookie(session));
    res.end(JSON.stringify({
      ok: true,
      user: { email: data.user.email },
    }));
  },

  'POST /api/auth/magic-link': async (req, res) => {
    // Genera magic link con redirect a /api/auth/callback. Si el user no existe,
    // lo crea on-the-fly (admin self-service de nuevos users).
    try {
      const body = JSON.parse(await readBody(req));
      const email = (body.email ?? '').trim().toLowerCase();
      if (!email) return json(res, 400, { error: 'email required' });

      const redirectTo = callbackUrl();

      // Buscar/crear user antes de generar link.
      let user = null;
      try {
        const { data, error: listErr } = await sb.auth.admin.listUsers();
        if (listErr) throw listErr;
        user = data?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
      } catch (e) {
        console.error('[magic-link] listUsers error:', e.message, e.stack);
        return json(res, 500, { error: 'supabase admin listUsers failed: ' + e.message });
      }

      if (!user) {
        // Auto-create (no anti-enumeration: el form en producción es para
        // usuarios internos invitados por allowlist).
        try {
          const created = await sb.auth.admin.createUser({
            email,
            email_confirm: true,
          });
          if (created.error) throw created.error;
          user = created.data.user;
        } catch (e) {
          console.error('[magic-link] createUser error:', e.message);
          return json(res, 500, { error: 'crear usuario falló: ' + e.message });
        }
      }

      let magicLink;
      try {
        const { data, error: linkErr } = await sb.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo },
        });
        if (linkErr) throw linkErr;
        // Usar hashed_token (no action_link) para construir link que apunte
        // directo a NUESTRO callback con token_hash en QUERY (no fragment).
        // action_link de Supabase pone tokens en # que no llega al server.
        const hashedToken = data?.properties?.hashed_token;
        if (hashedToken) {
          const params = new URLSearchParams({
            token_hash: hashedToken,
            type: 'magiclink',
            next: '/admin',
          });
          magicLink = `${redirectTo}?${params.toString()}`;
        } else {
          // Fallback al action_link si Supabase no devuelve hashed_token.
          magicLink = data?.properties?.action_link;
        }
        if (!magicLink) throw new Error('no token_hash ni action_link en respuesta supabase');
      } catch (e) {
        console.error('[magic-link] generateLink error:', e.message);
        return json(res, 500, { error: 'generar link falló: ' + e.message });
      }

      const { sendEmail, magicLinkEmail } = await import('./email.js');
      try {
        await sendEmail({
          to: email,
          ...magicLinkEmail({ email, magicLink, role: user.app_metadata?.role ?? 'user' }),
          tags: ['magic-link', 'auth'],
        });
      } catch (e) {
        console.error('[magic-link] sendEmail failed:', e.message);
        return json(res, 500, { error: 'envío email falló: ' + e.message, magic_link: magicLink });
      }

      await logAudit(null, email, 'auth.magic_link_sent', 'auth_user', user.id, { redirectTo });
      json(res, 200, { ok: true, sent: true });
    } catch (e) {
      console.error('[magic-link] unhandled:', e.message, e.stack);
      json(res, 500, { error: 'magic-link handler crash: ' + e.message });
    }
  },

  'GET /api/auth/callback': async (req, res, url) => {
    // Intercambia code (PKCE) o token_hash (server-side OTP) por sesión.
    const code = url.searchParams.get('code');
    const tokenHash = url.searchParams.get('token_hash');
    const type = url.searchParams.get('type') ?? 'magiclink';
    const errParam = url.searchParams.get('error_description') ?? url.searchParams.get('error');

    function redirectErr(msg) {
      const target = `${siteUrl()}/admin?auth_error=${encodeURIComponent(msg)}`;
      res.statusCode = 302;
      res.setHeader('Location', target);
      res.end();
    }

    if (errParam) return redirectErr(errParam);
    if (!code && !tokenHash) return redirectErr('missing code or token_hash');

    try {
      const pub = publicSupabase();
      let session = null;
      if (code) {
        const { data, error } = await pub.auth.exchangeCodeForSession(code);
        if (error) return redirectErr(error.message);
        session = data.session;
      } else {
        const { data, error } = await pub.auth.verifyOtp({ type, token_hash: tokenHash });
        if (error) return redirectErr(error.message);
        session = data.session;
      }
      if (!session) return redirectErr('no session returned');

      const stored = {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: { id: session.user?.id, email: session.user?.email },
      };
      await logAudit(null, session.user?.email ?? 'unknown', 'auth.login', 'auth_user', session.user?.id ?? null, { via: code ? 'pkce' : 'otp' });
      const next = url.searchParams.get('next') ?? '/admin';
      const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
      res.statusCode = 302;
      res.setHeader('Set-Cookie', buildSessionCookie(stored));
      res.setHeader('Location', `${siteUrl()}${safeNext}`);
      res.end();
    } catch (e) {
      console.error('[auth/callback]', e);
      redirectErr(e.message);
    }
  },

  'GET /api/auth/me': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { ok: false, error: auth.error });
    json(res, 200, {
      ok: true,
      auth_enabled: AUTH_ENABLED,
      bypass: !!auth.bypass,
      email: auth.email,
      user_id: auth.user_id,
      roles: auth.roles,
      sociedades: auth.sociedades,
      display_name: auth.display_name,
      avatar_url: auth.avatar_url,
    });
  },

  'GET /api/data': async (req, res, url) => {
    // Proxy a Supabase REST con JWT del cookie (RLS aplica server-side).
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const table = url.searchParams.get('table');
    if (!table) return json(res, 400, { error: 'table required' });
    if (!/^[a-zA-Z0-9_]+$/.test(table)) return json(res, 400, { error: 'invalid table name' });

    const passthrough = new URLSearchParams(url.searchParams);
    passthrough.delete('table');

    const SB_URL = process.env.SUPABASE_URL;
    const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_KEY;
    const session = auth.session;
    const headers = {
      apikey: ANON,
      Authorization: `Bearer ${session?.access_token ?? ANON}`,
    };
    if (auth.bypass) {
      // Bypass dev: usa service role para saltarse RLS (sin cookie/JWT real).
      const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (svc) headers.Authorization = `Bearer ${svc}`;
    }

    const r = await fetch(`${SB_URL}/rest/v1/${table}?${passthrough.toString()}`, { headers });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', r.headers.get('content-type') ?? 'application/json');
    res.end(text);
  },

  'POST /api/auth/logout': async (req, res) => {
    const session = readSessionCookie(req);
    if (session?.access_token) {
      try { await sb.auth.admin.signOut(session.access_token); } catch {}
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    // Emitir múltiples variantes de Set-Cookie para cubrir edge cases de browser.
    const variants = [
      `g66_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax; HttpOnly; Secure`,
      `g66_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`,
      `g66_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`,
    ];
    res.setHeader('Set-Cookie', variants);
    res.end(JSON.stringify({ ok: true }));
  },

  'GET /api/auth/logout': async (req, res, url) => {
    // GET-redirect variant: full HTTP nav que evita pitfalls del fetch+SPA.
    // El mismo request que setea cookie cleared es el que el browser sigue al redirect.
    const session = readSessionCookie(req);
    if (session?.access_token) {
      try { await sb.auth.admin.signOut(session.access_token); } catch {}
    }
    const next = url.searchParams.get('next') ?? '/admin';
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/admin';
    const variants = [
      `g66_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax; HttpOnly; Secure`,
      `g66_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`,
      `g66_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/`,
    ];
    res.statusCode = 302;
    res.setHeader('Set-Cookie', variants);
    res.setHeader('Location', `${siteUrl()}${safeNext}?logout=${Date.now()}`);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  },

  // ─── Files (PR2) ────────────────────────────────────────────────────────
  'POST /api/files/upload': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });

    const ct = req.headers['content-type'] ?? '';
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!m) return json(res, 400, { error: 'multipart/form-data required' });
    const boundary = (m[1] ?? m[2]).trim();

    const raw = await readRawBody(req);
    const { fields, file } = parseMultipart(raw, boundary);
    if (!file) return json(res, 400, { error: 'file field required' });
    if (!fields.workflow_run_id) return json(res, 400, { error: 'workflow_run_id required' });
    if (!isAllowedMime(file.mimeType)) return json(res, 415, { error: `mime ${file.mimeType} not allowed` });

    try {
      const created = await uploadFile({
        workflowRunId: fields.workflow_run_id,
        providerId: fields.provider_id || null,
        kind: fields.kind || 'anexo',
        filename: file.filename,
        mimeType: file.mimeType,
        buffer: file.buffer,
        uploadedBy: auth.email,
        uploadedById: auth.user_id,
        previousVersionId: fields.previous_version_id || null,
      });
      json(res, 200, created);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  'GET /api/files': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const runId = url.searchParams.get('workflow_run_id');
    if (!runId) return json(res, 400, { error: 'workflow_run_id required' });
    try {
      const files = await listFiles(runId);
      json(res, 200, files);
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  'GET /api/files/url': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const id = url.searchParams.get('id');
    const download = url.searchParams.get('download') === '1';
    if (!id) return json(res, 400, { error: 'id required' });
    try {
      const out = await getSignedUrl(id, { download });
      json(res, 200, out);
    } catch (e) {
      json(res, 404, { error: e.message });
    }
  },

  'DELETE /api/files': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    try {
      await deleteFile(id, { by: auth.email });
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  // ─── Comments (PR2) ─────────────────────────────────────────────────────
  'GET /api/comments': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const fileId = url.searchParams.get('file_id');
    if (!fileId) return json(res, 400, { error: 'file_id required' });
    try {
      json(res, 200, await listComments(fileId));
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  'POST /api/comments': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    if (!body.file_id || !body.workflow_run_id || !body.body) {
      return json(res, 400, { error: 'file_id + workflow_run_id + body required' });
    }
    try {
      const comment = await createComment({
        fileId: body.file_id,
        workflowRunId: body.workflow_run_id,
        parentId: body.parent_id ?? null,
        authorEmail: auth.email,
        authorId: auth.user_id,
        body: body.body,
        pageNumber: body.page_number ?? null,
        anchorText: body.anchor_text ?? null,
        anchorMeta: body.anchor_meta ?? null,
      });
      json(res, 200, comment);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  'PATCH /api/comments': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    const body = JSON.parse(await readBody(req));
    try {
      const updated = await updateComment({ commentId: id, authorEmail: auth.email, body: body.body, resolved: body.resolved });
      json(res, 200, updated);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  'DELETE /api/comments': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    try {
      await deleteFileComment({ commentId: id, authorEmail: auth.email });
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  // ─── Notifications (PR2) ────────────────────────────────────────────────
  'GET /api/notifications': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const unreadOnly = url.searchParams.get('unread') === '1';
    const limit = Number(url.searchParams.get('limit') ?? 50);
    try {
      const [items, count] = await Promise.all([
        listNotifications(auth.email, { limit, unreadOnly }),
        notificationUnreadCount(auth.email),
      ]);
      json(res, 200, { items, unread_count: count });
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  'POST /api/notifications/read': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    try {
      if (body.all) await markAllNotificationsRead(auth.email);
      else if (Array.isArray(body.ids) && body.ids.length) await markNotificationsRead({ ids: body.ids, email: auth.email });
      else return json(res, 400, { error: 'ids[] or all=true required' });
      json(res, 200, { ok: true });
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  // ─── AI edit (PR3) ──────────────────────────────────────────────────────
  'POST /api/files/ai-edit': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    if (!auth.roles?.includes('admin') && !auth.roles?.includes('aprobador')) {
      return json(res, 403, { error: 'admin o aprobador required' });
    }
    const body = JSON.parse(await readBody(req));
    if (!body.workflow_run_id || !body.source_file_id) {
      return json(res, 400, { error: 'workflow_run_id + source_file_id required' });
    }
    try {
      const out = await runAiEdit({
        workflowRunId: body.workflow_run_id,
        sourceFileId: body.source_file_id,
        requestedBy: auth.email,
        requestedById: auth.user_id,
        extraPrompt: body.extra_prompt,
      });
      json(res, 200, out);
    } catch (e) {
      console.error('[ai-edit]', e);
      json(res, 500, { error: e.message });
    }
  },

  'POST /api/files/apply-v2': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    if (!body.job_id) return json(res, 400, { error: 'job_id required' });
    try {
      const out = await applyAiDraft({ jobId: body.job_id, by: auth.email, byId: auth.user_id });
      json(res, 200, out);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  'POST /api/files/discard-v2': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    if (!body.job_id) return json(res, 400, { error: 'job_id required' });
    try {
      const out = await discardAiDraft({ jobId: body.job_id, by: auth.email });
      json(res, 200, out);
    } catch (e) {
      json(res, 400, { error: e.message });
    }
  },

  'GET /api/files/ai-jobs': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const runId = url.searchParams.get('workflow_run_id');
    if (!runId) return json(res, 400, { error: 'workflow_run_id required' });
    try {
      json(res, 200, await listAiJobs(runId));
    } catch (e) {
      json(res, 500, { error: e.message });
    }
  },

  // ─── Matriz (PR7) ────────────────────────────────────────────────────────
  'GET /api/matriz/sociedades': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const country = url.searchParams.get('country');
    try { json(res, 200, await listSociedades({ country })); }
    catch (e) { json(res, 500, { error: e.message }); }
  },

  'GET /api/matriz/apoderados': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const sociedadId = url.searchParams.get('sociedad_id');
    try { json(res, 200, await listApoderados({ sociedadId })); }
    catch (e) { json(res, 500, { error: e.message }); }
  },

  'GET /api/matriz/apoderados/suggest': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const sociedadId = url.searchParams.get('sociedad_id');
    const tipoProveedor = url.searchParams.get('tipo_proveedor');
    if (!sociedadId) return json(res, 400, { error: 'sociedad_id required' });
    try { json(res, 200, await suggestApoderados({ sociedadId, tipoProveedor })); }
    catch (e) { json(res, 500, { error: e.message }); }
  },

  'GET /api/matriz/documents': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const sociedadId = url.searchParams.get('sociedad_id');
    if (!sociedadId) return json(res, 400, { error: 'sociedad_id required' });
    try { json(res, 200, await listSociedadDocs(sociedadId)); }
    catch (e) { json(res, 500, { error: e.message }); }
  },

  // Admin CRUD.
  'POST /api/admin/matriz/sociedades': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    try { json(res, 200, await createSociedad(body)); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'PATCH /api/admin/matriz/sociedades': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    const body = JSON.parse(await readBody(req));
    try { json(res, 200, await updateSociedad(id, body)); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'DELETE /api/admin/matriz/sociedades': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    try { await deleteSociedad(id); json(res, 200, { ok: true }); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'POST /api/admin/matriz/apoderados': async (req, res) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    try { json(res, 200, await createApoderado(body)); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'PATCH /api/admin/matriz/apoderados': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    const body = JSON.parse(await readBody(req));
    try { json(res, 200, await updateApoderado(id, body)); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'DELETE /api/admin/matriz/apoderados': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    try { await deleteApoderado(id); json(res, 200, { ok: true }); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'POST /api/admin/matriz/documents': async (req, res) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    try { json(res, 200, await createSociedadDoc(body)); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'PATCH /api/admin/matriz/documents': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    const body = JSON.parse(await readBody(req));
    try { json(res, 200, await updateSociedadDoc(id, body)); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'DELETE /api/admin/matriz/documents': async (req, res, url) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const id = url.searchParams.get('id');
    if (!id) return json(res, 400, { error: 'id required' });
    try { await deleteSociedadDoc(id); json(res, 200, { ok: true }); }
    catch (e) { json(res, 400, { error: e.message }); }
  },

  'GET /api/settings': async (req, res) => {
    const { data, error } = await sb.from('app_settings').select('key, value');
    if (error) return json(res, 500, { error: error.message });
    const out = {};
    for (const row of (data ?? [])) out[row.key] = row.value;
    json(res, 200, out);
  },

  'POST /api/admin/settings': async (req, res) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    if (!body.key) return json(res, 400, { error: 'key required' });
    const { data, error } = await sb.from('app_settings').upsert({
      key: body.key,
      value: body.value ?? {},
      updated_at: new Date().toISOString(),
      updated_by: auth.email,
    }, { onConflict: 'key' }).select().single();
    if (error) return json(res, 500, { error: error.message });
    json(res, 200, data);
  },

  'POST /api/admin/upload-logo': async (req, res) => {
    const auth = await requireAdmin(req);
    if (!auth.ok) return json(res, auth.status, { error: auth.error });
    const ct = req.headers['content-type'] ?? '';
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!m) return json(res, 400, { error: 'multipart/form-data required' });
    const boundary = (m[1] ?? m[2]).trim();
    const raw = await readRawBody(req);
    const { file } = parseMultipart(raw, boundary);
    if (!file) return json(res, 400, { error: 'file required' });
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.mimeType)) {
      return json(res, 415, { error: 'solo png/jpg/webp/svg' });
    }
    if (file.buffer.length > 2 * 1024 * 1024) return json(res, 413, { error: 'max 2MB' });

    const ext = file.mimeType.split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
    const path = `brand/logo-${Date.now()}.${ext}`;
    const up = await sb.storage.from('avatars').upload(path, file.buffer, {
      contentType: file.mimeType,
      upsert: true,
    });
    if (up.error) return json(res, 500, { error: up.error.message });
    const { data: pub } = sb.storage.from('avatars').getPublicUrl(path);
    const logoUrl = pub.publicUrl;

    await sb.from('app_settings').upsert({
      key: 'logo_url',
      value: { url: logoUrl },
      updated_at: new Date().toISOString(),
      updated_by: auth.email,
    }, { onConflict: 'key' });

    await logAudit(null, auth.email, 'settings.logo_uploaded', 'app_settings', 'logo_url', { url: logoUrl });
    json(res, 200, { ok: true, logo_url: logoUrl });
  },

  'POST /api/profile/avatar': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    if (!auth.email) return json(res, 400, { error: 'no email' });

    const ct = req.headers['content-type'] ?? '';
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!m) return json(res, 400, { error: 'multipart/form-data required' });
    const boundary = (m[1] ?? m[2]).trim();

    const raw = await readRawBody(req);
    const { file } = parseMultipart(raw, boundary);
    if (!file) return json(res, 400, { error: 'file field required' });
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimeType)) {
      return json(res, 415, { error: 'solo png/jpg/webp/gif' });
    }
    if (file.buffer.length > 2 * 1024 * 1024) return json(res, 413, { error: 'max 2MB' });

    const ext = file.mimeType.split('/')[1].replace('jpeg', 'jpg');
    const safeEmail = auth.email.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    const path = `${safeEmail}/${Date.now()}.${ext}`;
    const up = await sb.storage.from('avatars').upload(path, file.buffer, {
      contentType: file.mimeType,
      upsert: true,
    });
    if (up.error) return json(res, 500, { error: up.error.message });

    const { data: urlData } = sb.storage.from('avatars').getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    await sb.from('user_profiles').update({ avatar_url: publicUrl, updated_at: new Date().toISOString() }).eq('email', auth.email.toLowerCase());

    json(res, 200, { avatar_url: publicUrl });
  },

  'DELETE /api/profile/avatar': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    if (!auth.email) return json(res, 400, { error: 'no email' });

    const safeEmail = auth.email.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
    const { data: list } = await sb.storage.from('avatars').list(safeEmail);
    if (Array.isArray(list) && list.length) {
      const paths = list.map((o) => `${safeEmail}/${o.name}`);
      await sb.storage.from('avatars').remove(paths);
    }
    await sb.from('user_profiles').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('email', auth.email.toLowerCase());
    json(res, 200, { ok: true });
  },

  'POST /api/profile/me': async (req, res) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const body = JSON.parse(await readBody(req));
    const patch = { updated_at: new Date().toISOString() };
    if (typeof body.display_name === 'string') patch.display_name = body.display_name;
    if (typeof body.avatar_url === 'string') patch.avatar_url = body.avatar_url;
    const { data, error } = await sb.from('user_profiles').update(patch).eq('email', auth.email.toLowerCase()).select().single();
    if (error) return json(res, 500, { error: error.message });
    json(res, 200, data);
  },

  'GET /api/users/mentions': async (req, res, url) => {
    const auth = await getUserFromRequest(req);
    if (!auth.ok) return json(res, auth.status ?? 401, { error: auth.error });
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const { data, error } = await sb
      .from('user_profiles')
      .select('email, display_name, roles, avatar_url')
      .order('email', { ascending: true })
      .limit(50);
    if (error) return json(res, 500, { error: error.message });
    const filtered = q
      ? (data ?? []).filter((u) => u.email.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q))
      : (data ?? []);
    json(res, 200, filtered.slice(0, 8));
  },

  'POST /api/provider/fill': async (req, res) => {
    const body = JSON.parse(await readBody(req));
    if (!body.token) return json(res, 400, { error: 'token required' });
    const { fillProfile } = await import('./provider_profile.js');
    try {
      const p = await fillProfile(body.token, body.profile_data ?? {}, { byEmail: body.by_email });

      // PR-B: marca branch datos proveedor como done en cualquier run activo del proveedor
      const { data: runs } = await sb
        .from('workflow_runs')
        .select('id, active_phases')
        .eq('tax_id', p.tax_id)
        .not('current_phase', 'in', '(signed,rejected,cancelled)');
      const { markProviderDataDone } = await import('./approvals_dispatch.js');
      for (const run of runs ?? []) {
        const phases = run.active_phases ?? [];
        if (phases.includes('fase2_provider_data')) {
          await markProviderDataDone(run.id).catch((e) => console.error('markProviderDataDone failed:', e.message));
        }
      }

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

const VALID_ROLES = ['admin', 'aprobador', 'solicitante', 'proveedor'];
function normalizeRoles(input) {
  const arr = Array.isArray(input) ? input : input ? [input] : [];
  return Array.from(new Set(arr.map((r) => String(r).toLowerCase()))).filter((r) => VALID_ROLES.includes(r));
}

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

  // Root → landing
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '')) {
    try {
      const html = await readStatic('public/index.html');
      res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    } catch (e) {
      // Fallback redirect
      res.statusCode = 302; res.setHeader('Location', '/admin'); return res.end();
    }
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
