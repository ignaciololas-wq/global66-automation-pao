// Módulo central de auth — PR1.
// Estrategia: cookie httpOnly g66_session con la sesión Supabase serializada.
// PKCE flow para magic link. Roles array desde tabla user_profiles.
// AUTH_ENABLED=false ⇒ bypass dev (impersona email dev@global66.com con role admin).

import { createClient } from '@supabase/supabase-js';
import { sb } from './supabase_audit.js';

export const AUTH_ENABLED = (process.env.AUTH_ENABLED ?? 'false').toLowerCase() === 'true';

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const SESSION_COOKIE = 'g66_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7d, refresh_token vive más largo
const COOKIE_BASE_OPTS = `Path=/; SameSite=Lax; HttpOnly; Secure`;

const DEV_BYPASS_EMAIL = process.env.DEV_BYPASS_EMAIL ?? 'dev@global66.com';
const DEV_BYPASS_ROLES = (process.env.DEV_BYPASS_ROLES ?? 'admin,aprobador,solicitante')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Cliente público (anon key) para flows PKCE / exchangeCodeForSession.
let _publicClient;
export function publicSupabase() {
  if (_publicClient) return _publicClient;
  const url = process.env.SUPABASE_URL;
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_KEY;
  if (!url || !anonKey) {
    throw new Error('publicSupabase: falta SUPABASE_URL o SUPABASE_ANON_KEY/PUBLISHABLE_KEY');
  }
  _publicClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: 'pkce' },
  });
  return _publicClient;
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

export function buildSessionCookie(session, { maxAge = COOKIE_MAX_AGE } = {}) {
  const value = encodeURIComponent(JSON.stringify(session));
  return `${SESSION_COOKIE}=${value}; Max-Age=${maxAge}; ${COOKIE_BASE_OPTS}`;
}

export function buildClearCookie() {
  return `${SESSION_COOKIE}=; Max-Age=0; ${COOKIE_BASE_OPTS}`;
}

export function readSessionCookie(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[SESSION_COOKIE];
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (!s?.access_token) return null;
    if (s.expires_at && Number(s.expires_at) * 1000 < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

async function loadProfile(email, userId) {
  if (!email) return null;
  const { data } = await sb
    .from('user_profiles')
    .select('user_id, email, roles, sociedades, display_name, avatar_url')
    .eq(userId ? 'user_id' : 'email', userId ?? email.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

function mergeAdminAllowlist(email, roles) {
  const set = new Set(roles ?? []);
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
    set.add('admin');
    set.add('aprobador');
    set.add('solicitante');
  }
  return Array.from(set);
}

function devBypassUser() {
  return {
    ok: true,
    bypass: true,
    email: DEV_BYPASS_EMAIL,
    user_id: null,
    roles: mergeAdminAllowlist(DEV_BYPASS_EMAIL, DEV_BYPASS_ROLES),
    sociedades: [],
    display_name: 'Dev (bypass)',
  };
}

// Resuelve el usuario desde:
//   1) Cookie g66_session (preferido, server-side)
//   2) Header Authorization: Bearer <token> (fallback legacy + tests)
//   3) Bypass dev cuando AUTH_ENABLED=false
export async function getUserFromRequest(req) {
  if (!AUTH_ENABLED) return devBypassUser();

  const cookieSession = readSessionCookie(req);
  let token = cookieSession?.access_token;
  if (!token) {
    const authHeader = req.headers?.authorization ?? '';
    const m = authHeader.match(/^Bearer\s+(.+)$/i);
    if (m) token = m[1];
  }
  if (!token) return { ok: false, status: 401, error: 'no session' };

  try {
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user) return { ok: false, status: 401, error: error?.message ?? 'invalid token' };

    const profile = await loadProfile(user.email, user.id);
    const legacyRole = user.app_metadata?.role;
    const baseRoles =
      profile?.roles?.length
        ? profile.roles
        : legacyRole
          ? legacyRole === 'admin'
            ? ['admin', 'aprobador', 'solicitante']
            : [legacyRole]
          : ['solicitante'];

    const roles = mergeAdminAllowlist(user.email, baseRoles);
    return {
      ok: true,
      bypass: false,
      email: user.email,
      user_id: user.id,
      roles,
      sociedades: profile?.sociedades ?? [],
      display_name: profile?.display_name ?? user.user_metadata?.name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      session: cookieSession,
    };
  } catch (e) {
    return { ok: false, status: 401, error: e.message };
  }
}

export function hasRole(authResult, ...roles) {
  if (!authResult?.ok) return false;
  return roles.some((r) => authResult.roles.includes(r));
}

export async function requireRole(req, ...roles) {
  const auth = await getUserFromRequest(req);
  if (!auth.ok) return auth;
  if (roles.length && !hasRole(auth, ...roles)) {
    return { ok: false, status: 403, error: `role required: ${roles.join('|')}` };
  }
  return auth;
}

export async function requireAdmin(req) {
  return requireRole(req, 'admin');
}

export function siteUrl() {
  return (
    process.env.SITE_URL ??
    process.env.SERVER_PUBLIC_URL ??
    'https://global66-automation-pao.vercel.app'
  ).replace(/\/$/, '');
}

export function callbackUrl() {
  return `${siteUrl()}/api/auth/callback`;
}
