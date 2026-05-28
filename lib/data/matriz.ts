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
