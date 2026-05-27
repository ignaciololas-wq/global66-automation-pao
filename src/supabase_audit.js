// Cliente Supabase (Stack A — audit layer).
// Usa service_role key porque corre server-side (n8n / cron / scripts).

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
// Prefiere service_role (server-side, bypasses RLS). Fallback a SUPABASE_KEY legacy.
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;

// No throwear en module load — Vercel cold start sin env vars rompe TODO el handler.
// Lazy proxy: si falta config, falla solo al USAR sb (no al importar).
function makeMissingProxy() {
  return new Proxy({}, {
    get() {
      throw new Error('Supabase no configurado: setea SUPABASE_URL + SUPABASE_KEY/SUPABASE_SERVICE_ROLE_KEY en .env');
    },
  });
}

export const sb = (URL && KEY)
  ? createClient(URL, KEY, { auth: { persistSession: false } })
  : makeMissingProxy();

export async function findActiveRunByTaxId(taxId) {
  const { data, error } = await sb
    .from('workflow_runs')
    .select('id, current_phase, razon_social, created_at')
    .eq('tax_id', taxId)
    .not('current_phase', 'in', '(signed,rejected,cancelled)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function startRun(formResponse, { allowDuplicate = false } = {}) {
  if (!allowDuplicate) {
    const existing = await findActiveRunByTaxId(formResponse.rut);
    if (existing) {
      const e = new Error(`Active run already exists for tax_id=${formResponse.rut} (run ${existing.id}, phase ${existing.current_phase})`);
      e.code = 'DUPLICATE_ACTIVE_RUN';
      e.existing = existing;
      throw e;
    }
  }
  const insert = {
    form_response_id: formResponse.id,
    owner_email: formResponse.owner_email,
    razon_social: formResponse.razon_social,
    tax_id: formResponse.rut,
    pais: formResponse.pais,
    tipo_contrato: formResponse.tipo_contrato,
    tipo_proveedor: formResponse.tipo_proveedor ?? null,
    monto: formResponse.monto,
    moneda: formResponse.moneda,
    vigencia_meses: typeof formResponse.vigencia === 'number' ? formResponse.vigencia : null,
    is_adhesion: formResponse.adhesion === 'Sí',
    criticidad: formResponse.criticidad,
    nivel_acceso: formResponse.nivel_acceso,
    draft_url: formResponse.link_drive,
    // Campos nuevos del form unificado (migración 005)
    solicitante_nombre: formResponse.solicitante_nombre ?? null,
    solicitante_email: formResponse.solicitante_email ?? null,
    solicitante_area: formResponse.solicitante_area ?? null,
    owner_es_solicitante: formResponse.owner_es_solicitante ?? null,
    owner_nombre: formResponse.owner_nombre ?? null,
    responsable_backup_email: formResponse.responsable_backup_email ?? null,
    sociedad_contratante: formResponse.sociedad_contratante ?? null,
    representante_legal: formResponse.representante_legal ?? null,
    servicio_descripcion: formResponse.servicio_descripcion ?? null,
    proveedor_existente: formResponse.proveedor_existente ?? null,
    periodicidad: formResponse.periodicidad ?? null,
    tipo_duracion: formResponse.tipo_duracion ?? null,
    fecha_inicio: formResponse.fecha_inicio ?? null,
    fecha_fin: formResponse.fecha_fin ?? null,
    justificacion: formResponse.justificacion ?? null,
  };
  // Quitar `null`s para tolerar pre-migración 005
  for (const k of Object.keys(insert)) if (insert[k] === null) delete insert[k];

  const { data, error } = await sb.from('workflow_runs').insert(insert).select().single();
  if (error) throw error;
  await logAudit(data.id, 'system', 'workflow.started', 'workflow_run', data.id, { form_response_id: formResponse.id });
  return data;
}

export async function setPhase(runId, phase, extra = {}) {
  const { error } = await sb
    .from('workflow_runs')
    .update({ current_phase: phase, ...extra })
    .eq('id', runId);
  if (error) throw error;
  await logAudit(runId, 'system', 'workflow.phase_changed', 'workflow_run', runId, { phase, ...extra });
}

export async function recordApproval({ runId, team, decision, slackUserId, email, comment }) {
  const { error } = await sb
    .from('approvals')
    .upsert({
      workflow_run_id: runId,
      team,
      decision,
      approver_slack_id: slackUserId,
      approver_email: email,
      comment,
      decided_at: new Date().toISOString(),
    }, { onConflict: 'workflow_run_id,team' });
  if (error) throw error;
  await logAudit(runId, email ?? slackUserId ?? 'unknown', `approval.${decision}`, 'approval', `${runId}:${team}`, { team, comment });
}

export async function getApprovals(runId) {
  const { data, error } = await sb
    .from('approvals')
    .select('team, decision, comment, decided_at')
    .eq('workflow_run_id', runId);
  if (error) throw error;
  return data.reduce((acc, row) => ({ ...acc, [row.team]: row.decision }), {});
}

export async function recordExtraction({ runId, pdfHash, pdfUrl, model, json, tokensIn, tokensOut, costUsd }) {
  const { data, error } = await sb
    .from('extractions')
    .insert({
      workflow_run_id: runId,
      source_pdf_hash: pdfHash,
      source_pdf_url: pdfUrl,
      model,
      extracted_json: json,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: costUsd,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function findExtractionByHash(pdfHash) {
  const { data, error } = await sb
    .from('extractions')
    .select('*')
    .eq('source_pdf_hash', pdfHash)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function recordSanctionsCheck(runId, result) {
  const { error } = await sb
    .from('sanctions_checks')
    .insert({
      workflow_run_id: runId,
      hit: result.hit,
      matches: result.matches ?? [],
      raw_response: result,
    });
  if (error) throw error;
  await logAudit(runId, 'system', 'sanctions.checked', 'workflow_run', runId, { hit: result.hit });
}

export async function setSemaforo(runId, color, reason) {
  const { error } = await sb
    .from('workflow_runs')
    .update({ semaforo: color, metadata: { hito1_reason: reason } })
    .eq('id', runId);
  if (error) throw error;
  await logAudit(runId, 'system', `hito1.${color}`, 'workflow_run', runId, { reason });
}

export async function logAudit(runId, actor, action, targetType, targetId, payload = {}) {
  const { error } = await sb.from('audit_log').insert({
    workflow_run_id: runId,
    actor,
    action,
    target_type: targetType,
    target_id: String(targetId),
    payload,
  });
  if (error) console.error('audit_log insert failed', error);
}

export async function getRunById(id) {
  const { data, error } = await sb.from('workflow_runs').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function listActiveRuns() {
  const { data, error } = await sb
    .from('workflow_runs')
    .select('*')
    .not('current_phase', 'in', '(signed,rejected,cancelled)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
