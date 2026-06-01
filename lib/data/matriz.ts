import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { Sociedad, Apoderado, SociedadDocument } from '@/lib/types';

export async function listSociedades({ activeOnly = false } = {}): Promise<Sociedad[]> {
  const sb = createAdminClient();
  let q = sb.from('sociedades').select('*').order('country').order('name');
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Sociedad[];
}

export async function listApoderados({ sociedadId, activeOnly = false }: { sociedadId?: string; activeOnly?: boolean } = {}): Promise<Apoderado[]> {
  const sb = createAdminClient();
  let q = sb.from('apoderados').select('*');
  if (sociedadId) q = q.eq('sociedad_id', sociedadId);
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q.order('priority').order('name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Apoderado[];
}

export async function listSociedadDocs(sociedadId?: string, activeOnly = false): Promise<SociedadDocument[]> {
  const sb = createAdminClient();
  let q = sb.from('sociedad_documents').select('*');
  if (sociedadId) q = q.eq('sociedad_id', sociedadId);
  if (activeOnly) q = q.eq('active', true);
  const { data, error } = await q.order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as SociedadDocument[];
}

export interface ApprovalAssignment {
  id: string;
  country: string;
  team: 'compliance' | 'legal' | 'admin';
  user_id: string | null;
  email: string;
  display_name: string | null;
  active: boolean;
}

export async function listApprovers(country?: string): Promise<ApprovalAssignment[]> {
  const sb = createAdminClient();
  let q = sb
    .from('approval_assignments')
    .select('id, country, team, user_id, email, display_name, active')
    .eq('active', true);
  if (country) q = q.eq('country', country);
  const { data, error } = await q.order('country').order('team');
  if (error) throw new Error(error.message);
  return (data ?? []) as ApprovalAssignment[];
}

// Países para el selector: unión de sociedades.country + países con asignaciones.
export async function listApproverCountries(): Promise<string[]> {
  const sb = createAdminClient();
  const [soc, asg] = await Promise.all([
    sb.from('sociedades').select('country').eq('active', true),
    sb.from('approval_assignments').select('country').eq('active', true),
  ]);
  const set = new Set<string>();
  for (const r of (soc.data ?? []) as { country: string }[]) if (r.country) set.add(r.country);
  for (const r of (asg.data ?? []) as { country: string }[]) if (r.country) set.add(r.country);
  return [...set].sort();
}

export interface MatrizSnapshot {
  sociedades: Sociedad[];
  apoderadosBySociedad: Record<string, Apoderado[]>;
  docsBySociedad: Record<string, SociedadDocument[]>;
}

export async function getMatrizSnapshot(): Promise<MatrizSnapshot> {
  const [sociedades, apoderados, docs] = await Promise.all([
    listSociedades(),
    listApoderados(),
    listSociedadDocs(),
  ]);
  const apoderadosBySociedad: Record<string, Apoderado[]> = {};
  for (const a of apoderados) (apoderadosBySociedad[a.sociedad_id] ??= []).push(a);
  const docsBySociedad: Record<string, SociedadDocument[]> = {};
  for (const d of docs) (docsBySociedad[d.sociedad_id] ??= []).push(d);
  return { sociedades, apoderadosBySociedad, docsBySociedad };
}
