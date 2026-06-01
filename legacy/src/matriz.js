// PR7: helpers para catálogo sociedades + apoderados + docs.

import { sb } from './supabase_audit.js';

export async function listSociedades({ country = null, activeOnly = true } = {}) {
  let q = sb.from('sociedades').select('id, slug, name, country, active').order('country').order('name');
  if (activeOnly) q = q.eq('active', true);
  if (country) q = q.eq('country', country);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listApoderados({ sociedadId = null, activeOnly = true } = {}) {
  let q = sb.from('apoderados').select('id, sociedad_id, name, email, scope, tipo_proveedor_match, priority, notes, active');
  if (activeOnly) q = q.eq('active', true);
  if (sociedadId) q = q.eq('sociedad_id', sociedadId);
  const { data, error } = await q.order('priority').order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Devuelve apoderados sugeridos para una sociedad + tipo_proveedor.
// Regla:
//   - todos los con scope='siempre' priority=1 → mandatorios
//   - de los priority=2: si tipo_proveedor matchea tipo_proveedor_match → ese
//   - si nadie matchea: el primero de los priority=2 con scope='general'
export async function suggestApoderados({ sociedadId, tipoProveedor }) {
  const all = await listApoderados({ sociedadId });
  if (!all.length) return [];

  const mandatorios = all.filter((a) => a.priority === 1);
  const secundarios = all.filter((a) => a.priority === 2);

  let pick = null;
  if (tipoProveedor) {
    pick = secundarios.find((a) => (a.tipo_proveedor_match ?? []).includes(tipoProveedor));
  }
  if (!pick) {
    pick = secundarios.find((a) => a.scope === 'general') ?? secundarios[0] ?? null;
  }

  const result = [...mandatorios];
  if (pick && !result.find((a) => a.id === pick.id)) result.push(pick);
  // Si no hay mandatorios (ej. 100x Corp) y tampoco secundario obvio, devolver todos los secundarios como opciones.
  if (!mandatorios.length && secundarios.length > 1 && !pick) return secundarios;
  return result;
}

export async function listSociedadDocs(sociedadId) {
  const { data, error } = await sb
    .from('sociedad_documents')
    .select('id, name, kind, required, valid_months, sort_order, active')
    .eq('sociedad_id', sociedadId)
    .eq('active', true)
    .order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// CRUD helpers para endpoints admin.
export async function createSociedad(input) {
  const { data, error } = await sb.from('sociedades').insert(input).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSociedad(id, patch) {
  const { data, error } = await sb.from('sociedades').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSociedad(id) {
  const { error } = await sb.from('sociedades').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createApoderado(input) {
  const { data, error } = await sb.from('apoderados').insert(input).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateApoderado(id, patch) {
  const { data, error } = await sb.from('apoderados').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteApoderado(id) {
  const { error } = await sb.from('apoderados').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── Aprobadores internos por país × equipo (migración 025) ──────────────────

export async function listApprovers({ country = null } = {}) {
  let q = sb
    .from('approval_assignments')
    .select('id, country, team, user_id, email, display_name, active')
    .eq('active', true);
  if (country) q = q.eq('country', country);
  const { data, error } = await q.order('country').order('team');
  if (error) throw new Error(error.message);
  return data ?? [];
}

// Reemplaza el set de aprobadores de un (country, team) por la lista dada.
// members: [{ user_id, email, display_name }]. Borra los previos e inserta los nuevos.
export async function setTeamApprovers({ country, team, members }) {
  if (!country || !team) throw new Error('country y team requeridos');
  if (!['compliance', 'legal', 'admin'].includes(team)) throw new Error(`team inválido: ${team}`);
  const del = await sb.from('approval_assignments').delete().eq('country', country).eq('team', team);
  if (del.error) throw new Error(del.error.message);
  const rows = (members ?? [])
    .filter((m) => m && m.email)
    .map((m) => ({
      country,
      team,
      user_id: m.user_id ?? null,
      email: String(m.email).trim(),
      display_name: m.display_name ?? null,
    }));
  if (!rows.length) return [];
  const { data, error } = await sb.from('approval_assignments').insert(rows).select();
  if (error) throw new Error(error.message);
  return data;
}

// Países disponibles para el selector: unión de sociedades.country + países con asignaciones.
export async function listApproverCountries() {
  const [soc, asg] = await Promise.all([
    sb.from('sociedades').select('country').eq('active', true),
    sb.from('approval_assignments').select('country').eq('active', true),
  ]);
  const set = new Set();
  (soc.data ?? []).forEach((r) => r.country && set.add(r.country));
  (asg.data ?? []).forEach((r) => r.country && set.add(r.country));
  return [...set].sort();
}

export async function createSociedadDoc(input) {
  const { data, error } = await sb.from('sociedad_documents').insert(input).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSociedadDoc(id, patch) {
  const { data, error } = await sb.from('sociedad_documents').update(patch).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSociedadDoc(id) {
  const { error } = await sb.from('sociedad_documents').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
