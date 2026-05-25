// CRUD providers + contracts. Reemplaza src/finnecto.js para escrituras.
// Stack B (Supabase es source of truth post-decisión 2026-05-25).

import { sb, logAudit } from './supabase_audit.js';
import { MOCK } from './mock_mode.js';

// ── Providers ──────────────────────────────────────────────────────────────

export async function findProviderByTaxId(taxId) {
  const { data, error } = await sb
    .from('providers')
    .select('*')
    .eq('tax_id', taxId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createProvider(input, { runId } = {}) {
  const existing = await findProviderByTaxId(input.tax_id);
  if (existing) {
    const e = new Error(`Provider tax_id=${input.tax_id} already exists (id=${existing.id})`);
    e.code = 'PROVIDER_EXISTS';
    e.existing = existing;
    throw e;
  }

  const { data, error } = await sb
    .from('providers')
    .insert({
      razon_social: input.razon_social,
      tax_id: input.tax_id,
      pais: input.pais,
      tipo_proveedor: input.tipo_proveedor,
      email_contacto: input.email_contacto,
      email_facturacion: input.email_facturacion,
      domicilio: input.domicilio,
      representante_legal: input.representante_legal,
      nivel_acceso: input.nivel_acceso,
      criticidad: input.criticidad,
      status: 'pendiente_revision',
    })
    .select()
    .single();
  if (error) throw error;
  await logAudit(runId ?? null, 'system', 'provider.created', 'provider', data.id, { tax_id: input.tax_id });
  return data;
}

export async function setProviderStatus(providerId, status, { runId } = {}) {
  const { error } = await sb
    .from('providers')
    .update({ status })
    .eq('id', providerId);
  if (error) throw error;
  await logAudit(runId ?? null, 'system', `provider.${status}`, 'provider', providerId, {});
}

export async function setProviderDriveFolder(providerId, folderId) {
  const { error } = await sb
    .from('providers')
    .update({ drive_folder_id: folderId })
    .eq('id', providerId);
  if (error) throw error;
}

export async function listProviders({ status, pais } = {}) {
  let q = sb.from('providers').select('*').order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  if (pais) q = q.eq('pais', pais);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// ── Contracts ──────────────────────────────────────────────────────────────

export async function createContract(input, { runId } = {}) {
  const { data, error } = await sb
    .from('contracts')
    .insert({
      provider_id: input.provider_id,
      workflow_run_id: runId ?? null,
      tipo_contrato: input.tipo_contrato,
      monto: input.monto,
      moneda: input.moneda,
      vigencia_meses: input.vigencia_meses,
      start_date: input.start_date,
      end_date: input.end_date,
      is_adhesion: input.is_adhesion ?? false,
      renovacion_automatica: input.renovacion_automatica ?? false,
      preaviso_dias: input.preaviso_dias,
      draft_pdf_url: input.draft_pdf_url,
      owner_email: input.owner_email,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw error;
  await logAudit(runId ?? null, 'system', 'contract.created', 'contract', data.id, {});
  return data;
}

export async function setContractStatus(contractId, status, extra = {}, { runId } = {}) {
  const patch = { status, ...extra };
  if (status === 'signed' && !extra.signed_at) patch.signed_at = new Date().toISOString();
  const { data, error } = await sb
    .from('contracts')
    .update(patch)
    .eq('id', contractId)
    .select()
    .single();
  if (error) throw error;
  await logAudit(runId ?? null, 'system', `contract.${status}`, 'contract', contractId, extra);
  return data;
}

export async function attachSignedPdf(contractId, signedPdfUrl, signnowDocumentId, { runId } = {}) {
  return setContractStatus(contractId, 'signed', {
    signed_pdf_url: signedPdfUrl,
    signnow_document_id: signnowDocumentId,
    signed_at: new Date().toISOString(),
  }, { runId });
}

export async function listExpiringContracts(daysAhead) {
  if (MOCK) {
    return [{
      id: 'mock-c-001', provider_id: 'mock-p-001',
      supplier_name: 'ACME SpA', provider_name: 'ACME SpA',
      type: 'servicios', amount: 12000, currency: 'USD',
      expires_at: new Date(Date.now() + daysAhead * 86400 * 1000).toISOString().slice(0, 10),
      owner_slack_id: null, owner_email: 'mock@global66.com',
      status: 'active',
    }];
  }
  const { data, error } = await sb
    .from('v_expiring_contracts')
    .select('*')
    .lte('days_until_expiry', daysAhead);
  if (error) throw error;
  return data ?? [];
}

export async function getContractById(id) {
  const { data, error } = await sb.from('contracts').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}
