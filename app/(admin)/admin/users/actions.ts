'use server';
import { revalidatePath } from 'next/cache';
import { updateUserRoles, inviteUser } from '@/lib/data/users';
import { requireAdmin } from '@/lib/auth';
import type { Role } from '@/lib/types';

async function ensureAdmin() {
  const auth = await requireAdmin();
  if (!auth.ok) throw new Error('forbidden — admin only');
}

export async function saveUserRolesAction(formData: FormData) {
  await ensureAdmin();
  const userId = String(formData.get('user_id') ?? '');
  const rolesRaw = (formData.getAll('roles') as string[]).filter(Boolean);
  if (!userId) throw new Error('user_id required');
  const allowed: Role[] = ['admin', 'aprobador', 'solicitante', 'proveedor'];
  const roles = rolesRaw.filter((r): r is Role => allowed.includes(r as Role));
  await updateUserRoles(userId, roles);
  revalidatePath('/admin/users');
}

export async function inviteUserAction(formData: FormData) {
  await ensureAdmin();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const rolesRaw = (formData.getAll('roles') as string[]).filter(Boolean);
  if (!email || !email.includes('@')) throw new Error('email inválido');
  const allowed: Role[] = ['admin', 'aprobador', 'solicitante', 'proveedor'];
  const roles = rolesRaw.filter((r): r is Role => allowed.includes(r as Role));
  if (!roles.length) roles.push('solicitante');
  await inviteUser(email, roles);
  revalidatePath('/admin/users');
}
