// Auth helpers — leen sesión Supabase + roles desde user_profiles.
// Modo bypass (AUTH_ENABLED=false) impersona dev user con roles configurados.

import 'server-only';
import { createServerClient, createAdminClient } from '@/lib/supabase/server';
import {
  AUTH_ENABLED,
  ADMIN_EMAILS,
  DEV_BYPASS_EMAIL,
  DEV_BYPASS_ROLES,
} from '@/lib/config';

export type AuthUser = {
  ok: true;
  bypass: boolean;
  email: string;
  user_id: string | null;
  roles: string[];
  sociedades: string[];
  display_name: string | null;
  avatar_url: string | null;
};

export type AuthFail = {
  ok: false;
  status: number;
  error: string;
};

export type AuthResult = AuthUser | AuthFail;

function mergeAdminAllowlist(email: string, roles: string[]): string[] {
  const set = new Set(roles);
  if (email && ADMIN_EMAILS.includes(email.toLowerCase())) {
    set.add('admin');
    set.add('aprobador');
    set.add('solicitante');
  }
  return Array.from(set);
}

function devBypass(): AuthUser {
  return {
    ok: true,
    bypass: true,
    email: DEV_BYPASS_EMAIL,
    user_id: null,
    roles: mergeAdminAllowlist(DEV_BYPASS_EMAIL, DEV_BYPASS_ROLES),
    sociedades: [],
    display_name: 'Dev (bypass)',
    avatar_url: null,
  };
}

async function loadProfile(
  email: string,
  userId: string | null,
): Promise<{
  display_name: string | null;
  avatar_url: string | null;
  roles: string[];
  sociedades: string[];
} | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('user_profiles')
    .select('user_id, email, roles, sociedades, display_name, avatar_url')
    .eq(userId ? 'user_id' : 'email', userId ?? email.toLowerCase())
    .maybeSingle();
  return data
    ? {
        display_name: (data as any).display_name ?? null,
        avatar_url: (data as any).avatar_url ?? null,
        roles: (data as any).roles ?? [],
        sociedades: (data as any).sociedades ?? [],
      }
    : null;
}

export async function getCurrentUser(): Promise<AuthResult> {
  if (!AUTH_ENABLED) return devBypass();

  const sb = await createServerClient();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) {
    return { ok: false, status: 401, error: 'no session' };
  }

  const profile = await loadProfile(user.email ?? '', user.id);
  const legacyRole = (user.app_metadata as { role?: string } | null)?.role;
  const baseRoles =
    profile?.roles?.length
      ? profile.roles
      : legacyRole
        ? legacyRole === 'admin'
          ? ['admin', 'aprobador', 'solicitante']
          : [legacyRole]
        : ['solicitante'];
  const roles = mergeAdminAllowlist(user.email ?? '', baseRoles);

  return {
    ok: true,
    bypass: false,
    email: user.email ?? '',
    user_id: user.id,
    roles,
    sociedades: profile?.sociedades ?? [],
    display_name: profile?.display_name ?? (user.user_metadata as { name?: string } | null)?.name ?? null,
    avatar_url: profile?.avatar_url ?? null,
  };
}

export async function requireRole(...roles: string[]): Promise<AuthResult> {
  const auth = await getCurrentUser();
  if (!auth.ok) return auth;
  if (roles.length && !roles.some((r) => auth.roles.includes(r))) {
    return { ok: false, status: 403, error: `role required: ${roles.join('|')}` };
  }
  return auth;
}

export async function requireAdmin(): Promise<AuthResult> {
  return requireRole('admin');
}
