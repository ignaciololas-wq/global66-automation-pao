// Provider self-service profile. Token público para que el proveedor complete sus datos.

import crypto from 'node:crypto';
import { sb, logAudit } from './supabase_audit.js';

export function genToken() {
  return crypto.randomBytes(24).toString('base64url');
}

// ── Crea provider si no existe, o actualiza datos básicos ────────────────────
export async function upsertProviderFromIntake(intake, { runId } = {}) {
  // intake: { razon_social, rut, pais, tipo_proveedor, email_contacto, email_facturacion,
  //          representante_legal, sociedad_contratante, servicio_descripcion, proveedor_existente }
  let { data: existing } = await sb
    .from('providers')
    .select('*')
    .eq('tax_id', intake.rut)
    .maybeSingle();

  if (existing) {
    // Overwrite: si intake trae un valor distinto al existente, actualizar (solicitante puede corregir info vieja).
    const patch = {};
    const changes = [];
    const fields = ['razon_social','tipo_proveedor','email_contacto','email_facturacion','representante_legal','sociedad_contratante','servicio_descripcion','pais'];
    for (const f of fields) {
      if (intake[f] != null && intake[f] !== '' && intake[f] !== existing[f]) {
        patch[f] = intake[f];
        changes.push({ field: f, from: existing[f], to: intake[f] });
      }
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const { data } = await sb.from('providers').update(patch).eq('id', existing.id).select().single();
      existing = data;
      await logAudit(runId, 'system', 'provider.updated_from_intake', 'provider', existing.id, { tax_id: intake.rut, changes });
    } else {
      await logAudit(runId, 'system', 'provider.reused', 'provider', existing.id, { tax_id: intake.rut });
    }
    return { provider: existing, isNew: false };
  }

  const insert = {
    razon_social: intake.razon_social,
    tax_id: intake.rut,
    pais: intake.pais,
    tipo_proveedor: intake.tipo_proveedor,
    email_contacto: intake.email_contacto,
    email_facturacion: intake.email_facturacion,
    representante_legal: intake.representante_legal,
    sociedad_contratante: intake.sociedad_contratante,
    servicio_descripcion: intake.servicio_descripcion,
    public_token: genToken(),
    status: 'pendiente_revision',
  };
  for (const k of Object.keys(insert)) if (insert[k] == null) delete insert[k];

  const { data, error } = await sb.from('providers').insert(insert).select().single();
  if (error) throw error;
  await logAudit(runId, 'system', 'provider.created', 'provider', data.id, { tax_id: intake.rut });
  return { provider: data, isNew: true };
}

export async function findByToken(token) {
  const { data, error } = await sb
    .from('providers')
    .select('id, razon_social, tax_id, pais, tipo_proveedor, email_contacto, email_facturacion, representante_legal, sociedad_contratante, servicio_descripcion, profile_data, profile_completed_at, public_token')
    .eq('public_token', token)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function fillProfile(token, profileData, { byEmail } = {}) {
  const provider = await findByToken(token);
  if (!provider) {
    const e = new Error('Token inválido');
    e.code = 'INVALID_TOKEN';
    throw e;
  }
  const mergedProfile = { ...(provider.profile_data ?? {}), ...profileData };

  // Si profileData tiene campos top-level que coinciden, los actualizamos también
  const topLevelPatch = {};
  const allowed = ['representante_legal','email_contacto','email_facturacion','tipo_proveedor'];
  for (const k of allowed) if (profileData[k]) topLevelPatch[k] = profileData[k];

  const { data, error } = await sb.from('providers')
    .update({
      profile_data: mergedProfile,
      profile_completed_at: new Date().toISOString(),
      profile_last_filled_by_email: byEmail ?? null,
      ...topLevelPatch,
    })
    .eq('id', provider.id)
    .select()
    .single();
  if (error) throw error;

  await logAudit(null, byEmail ?? 'provider', 'profile.filled', 'provider', provider.id, { fields: Object.keys(profileData) });
  return data;
}

export function buildProfileUrl(token, { serverBase } = {}) {
  const base = serverBase ?? process.env.SERVER_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  return `${base}/p/${token}`;
}
