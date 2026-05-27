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
    // Genera magic link con redirect a /api/auth/callback (PKCE / token_hash).
    const body = JSON.parse(await readBody(req));
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email) return json(res, 400, { error: 'email required' });

    const { data: { users } } = await sb.auth.admin.listUsers();
    const user = users.find((u) => (u.email ?? '').toLowerCase() === email);
    if (!user) {
      // Anti-enumeration.
      return json(res, 200, { ok: true, sent: false, info: 'Si el email existe, recibirás un link en breve.' });
    }

    const redirectTo = callbackUrl();
    const { data, error } = await sb.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo },
    });
    if (error) return json(res, 500, { error: error.message });

    const magicLink = data?.properties?.action_link;
    if (!magicLink) return json(res, 500, { error: 'no action_link generated' });

    const { sendEmail, magicLinkEmail } = await import('./email.js');
    try {
      await sendEmail({
        to: email,
        ...magicLinkEmail({ email, magicLink, role: user.app_metadata?.role ?? 'user' }),
        tags: ['magic-link', 'auth'],
      });
    } catch (e) {
      console.error('[magic-link] sendEmail failed:', e.message);
      return json(res, 500, { error: 'failed to deliver email', detail: e.message });
    }

    await logAudit(null, email, 'auth.magic_link_sent', 'auth_user', user.id, { redirectTo });
    json(res, 200, { ok: true, sent: true });
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
      res.statusCode = 302;
      res.setHeader('Set-Cookie', buildSessionCookie(stored));
      res.setHeader('Location', `${siteUrl()}/admin`);
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
    res.setHeader('Set-Cookie', buildClearCookie());
    res.end(JSON.stringify({ ok: true }));
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
