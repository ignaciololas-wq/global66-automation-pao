import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { ADMIN_EMAILS } from '@/lib/config';
import type { Role } from '@/lib/types';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
  roles: Role[];
  avatar_url: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  is_admin_allowlisted: boolean;
}

export async function listUsers(): Promise<AdminUser[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.auth.admin.listUsers();
  if (error) throw new Error(error.message);

  const { data: profiles } = await sb
    .from('user_profiles')
    .select('user_id, roles, display_name, avatar_url, email');
  const byId = new Map<string, any>();
  for (const p of (profiles ?? []) as any[]) byId.set(p.user_id, p);

  return data.users.map((u) => {
    const profile = byId.get(u.id);
    const email = (u.email ?? '').toLowerCase();
    const isAllowAdmin = ADMIN_EMAILS.includes(email);
    const baseRoles = profile?.roles?.length
      ? profile.roles
      : isAllowAdmin
        ? ['admin', 'aprobador', 'solicitante']
        : ['solicitante'];
    return {
      id: u.id,
      email: u.email ?? '',
      display_name: profile?.display_name ?? (u.user_metadata?.full_name ?? null),
      roles: baseRoles as Role[],
      avatar_url: profile?.avatar_url ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
      is_admin_allowlisted: isAllowAdmin,
    };
  });
}

export async function updateUserRoles(userId: string, roles: Role[]): Promise<void> {
  const sb = createAdminClient();
  const { data: existing } = await sb.from('user_profiles').select('user_id').eq('user_id', userId).maybeSingle();
  if (existing) {
    const { error } = await sb.from('user_profiles').update({ roles, updated_at: new Date().toISOString() }).eq('user_id', userId);
    if (error) throw new Error(error.message);
  } else {
    const { data: userData } = await sb.auth.admin.getUserById(userId);
    if (!userData?.user?.email) throw new Error('user not found');
    const { error } = await sb.from('user_profiles').insert({
      user_id: userId,
      email: userData.user.email,
      roles,
    });
    if (error) throw new Error(error.message);
  }
}

export async function inviteUser(email: string, roles: Role[]): Promise<{ id: string; email: string }> {
  const sb = createAdminClient();
  const { data, error } = await sb.auth.admin.inviteUserByEmail(email);
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) throw new Error('invite returned no user');
  await updateUserRoles(user.id, roles);
  return { id: user.id, email: user.email ?? email };
}
