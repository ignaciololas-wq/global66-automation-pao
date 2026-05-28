// Configuración runtime — leída por server components / route handlers.

export const AUTH_ENABLED =
  (process.env.AUTH_ENABLED ?? 'false').toLowerCase() === 'true';

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const SITE_URL = (
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  'http://localhost:3000'
).replace(/\/$/, '');

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_PUBLISHABLE_KEY ??
  '';
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_KEY ??
  '';

export const DEV_BYPASS_EMAIL = process.env.DEV_BYPASS_EMAIL ?? 'dev@global66.com';
export const DEV_BYPASS_ROLES = (process.env.DEV_BYPASS_ROLES ?? 'admin,aprobador,solicitante')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const COOKIE_NAME = 'g66_session';
