'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
  assert,
  requireField,
  optionalString,
  optionalEmail,
  requirePositiveNumber,
} from '@/lib/validation';

async function requireAdmin() {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin')) throw new Error('Solo admin');
  return auth;
}

function revalidate() { revalidatePath('/admin/matriz'); }

// Allowlist de columnas editables por tabla — evita mass-assignment (setear
// sociedad_id, created_at, etc. vía patch crudo del cliente).
function pick<T extends Record<string, unknown>>(obj: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}
const APODERADO_EDITABLE = ['name', 'email', 'scope', 'tipo_proveedor_match', 'priority', 'notes', 'active'];
const DOC_EDITABLE = ['name', 'kind', 'required', 'valid_months', 'sort_order', 'active'];

export async function createSociedad(input: { slug: string; name: string; country: string; active: boolean }) {
  await requireAdmin();
  requireField(input.slug, 'slug', 120);
  requireField(input.name, 'nombre', 120);
  requireField(input.country, 'país', 120);
  const sb = createAdminClient();
  const { data, error } = await sb.from('sociedades').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidate();
  return data;
}

export async function updateSociedad(id: string, patch: Partial<{ slug: string; name: string; country: string; active: boolean }>) {
  await requireAdmin();
  requireField(id, 'id', 120);
  if ('slug' in patch) patch.slug = optionalString(patch.slug, 120);
  if ('name' in patch) patch.name = optionalString(patch.name, 120);
  if ('country' in patch) patch.country = optionalString(patch.country, 120);
  const sb = createAdminClient();
  const { error } = await sb.from('sociedades').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteSociedad(id: string) {
  await requireAdmin();
  requireField(id, 'id', 120);
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
  requireField(input.sociedad_id, 'sociedad_id', 120);
  requireField(input.name, 'nombre', 120);
  assert(input.priority === 1 || input.priority === 2, 'La prioridad debe ser 1 o 2');
  assert(
    ['siempre', 'saas', 'comercial', 'general'].includes(input.scope),
    'El alcance debe ser uno de: siempre, saas, comercial, general',
  );
  optionalEmail(input.email, 'email');
  const sb = createAdminClient();
  const { data, error } = await sb.from('apoderados').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidate();
  return data;
}

export async function updateApoderado(id: string, patch: Record<string, unknown>) {
  await requireAdmin();
  requireField(id, 'id', 120);
  const clean = pick(patch, APODERADO_EDITABLE);
  if ('priority' in clean) assert(clean.priority === 1 || clean.priority === 2, 'La prioridad debe ser 1 o 2');
  if ('scope' in clean) assert(['siempre', 'saas', 'comercial', 'general'].includes(clean.scope as string), 'Alcance inválido');
  if ('email' in clean) optionalEmail(clean.email, 'email');
  const sb = createAdminClient();
  const { error } = await sb.from('apoderados').update(clean).eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteApoderado(id: string) {
  await requireAdmin();
  requireField(id, 'id', 120);
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
  requireField(input.sociedad_id, 'sociedad_id', 120);
  requireField(input.name, 'nombre', 120);
  assert(input.kind === 'base' || input.kind === 'sign', 'El tipo debe ser base o sign');
  requirePositiveNumber(input.sort_order, 'orden');
  if (input.valid_months != null) requirePositiveNumber(input.valid_months, 'meses de vigencia');
  const sb = createAdminClient();
  const { data, error } = await sb.from('sociedad_documents').insert(input).select().single();
  if (error) throw new Error(error.message);
  revalidate();
  return data;
}

export async function updateSociedadDoc(id: string, patch: Record<string, unknown>) {
  await requireAdmin();
  requireField(id, 'id', 120);
  const clean = pick(patch, DOC_EDITABLE);
  if ('kind' in clean) assert(clean.kind === 'base' || clean.kind === 'sign', 'El tipo debe ser base o sign');
  if ('sort_order' in clean) requirePositiveNumber(clean.sort_order, 'orden');
  if ('valid_months' in clean && clean.valid_months != null) requirePositiveNumber(clean.valid_months, 'meses de vigencia');
  const sb = createAdminClient();
  const { error } = await sb.from('sociedad_documents').update(clean).eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function deleteSociedadDoc(id: string) {
  await requireAdmin();
  requireField(id, 'id', 120);
  const sb = createAdminClient();
  const { error } = await sb.from('sociedad_documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidate();
}

// Reemplaza el set de aprobadores de un (country, team). Las aprobaciones Slack
// (legacy dispatch) van por DM a estos según el país del run.
export async function setTeamApprovers(input: {
  country: string;
  team: 'compliance' | 'legal' | 'admin';
  members: { user_id?: string | null; email: string; display_name?: string | null }[];
}) {
  await requireAdmin();
  requireField(input.country, 'país', 120);
  assert(['compliance', 'legal', 'admin'].includes(input.team), 'Equipo inválido');
  const sb = createAdminClient();
  const del = await sb.from('approval_assignments').delete().eq('country', input.country).eq('team', input.team);
  if (del.error) throw new Error(del.error.message);
  const rows = (input.members ?? [])
    .filter((m) => m && m.email)
    .map((m) => ({
      country: input.country,
      team: input.team,
      user_id: m.user_id ?? null,
      email: String(m.email).trim(),
      display_name: m.display_name ?? null,
    }));
  if (rows.length) {
    const { error } = await sb.from('approval_assignments').insert(rows);
    if (error) throw new Error(error.message);
  }
  revalidate();
  return rows;
}
