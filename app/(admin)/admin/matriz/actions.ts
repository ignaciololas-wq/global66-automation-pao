'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

async function requireAdmin() {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin')) throw new Error('Solo admin');
  return auth;
}

function revalidate() { revalidatePath('/admin/matriz'); }

export async function createSociedad(input: { slug: string; name: string; country: string; active: boolean }) {
  await requireAdmin();
  const sb = createAdminClient();
  const { data, error } = await sb.from('sociedades').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidate();
  return data;
}

export async function updateSociedad(id: string, patch: Partial<{ slug: string; name: string; country: string; active: boolean }>) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('sociedades').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteSociedad(id: string) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('sociedades').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function createApoderado(input: {
  sociedad_id: string;
  name: string;
  email?: string;
  scope: 'siempre' | 'saas' | 'comercial' | 'general';
  tipo_proveedor_match: string[];
  priority: 1 | 2;
  notes?: string;
  active: boolean;
}) {
  await requireAdmin();
  const sb = createAdminClient();
  const { data, error } = await sb.from('apoderados').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidate();
  return data;
}

export async function updateApoderado(id: string, patch: Record<string, unknown>) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('apoderados').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteApoderado(id: string) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('apoderados').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function createSociedadDoc(input: {
  sociedad_id: string;
  name: string;
  kind: 'base' | 'sign';
  required: boolean;
  valid_months?: number | null;
  sort_order: number;
  active: boolean;
}) {
  await requireAdmin();
  const sb = createAdminClient();
  const { data, error } = await sb.from('sociedad_documents').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidate();
  return data;
}

export async function updateSociedadDoc(id: string, patch: Record<string, unknown>) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('sociedad_documents').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteSociedadDoc(id: string) {
  await requireAdmin();
  const sb = createAdminClient();
  const { error } = await sb.from('sociedad_documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}
