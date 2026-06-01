'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { runAiEdit, applyAiDraft, discardAiDraft } from '@/lib/ai';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { recordApproval, getApprovals, setSemaforo, setPhase } from '@/lib/data/approvals';
import { computeSemaphore } from '@/lib/hito1';
import { requiredApprovalTeams, markInternalApprovalsDone } from '@/lib/slack/dispatch';
import { sendToSignNow, syncSignatureStatus } from '@/lib/signing';

// Envía el contrato a firma (SignNow) — admin/aprobador.
export async function sendForSignature(runId: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) throw new Error('Solo admin o aprobador');
  const r = await sendToSignNow(runId);
  revalidatePath(`/admin/workflows/${runId}`);
  return r;
}

// Consulta el estado de firma en SignNow y finaliza si está completo.
export async function checkSignatureStatus(runId: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) throw new Error('Solo admin o aprobador');
  const r = await syncSignatureStatus(runId);
  revalidatePath(`/admin/workflows/${runId}`);
  return r;
}

// Aprobación manual desde la plataforma (mismo camino que el callback de Slack).
// Permite a admin/aprobador decidir sin usar el DM de Slack.
export async function recordManualApproval(runId: string, team: string, decision: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) throw new Error('Solo admin o aprobador');
  if (!['compliance', 'legal', 'admin'].includes(team)) throw new Error('Equipo inválido');
  if (!['approved', 'rejected', 'requested_changes'].includes(decision)) throw new Error('Decisión inválida');

  await recordApproval({ runId, team, decision, email: auth.email });

  const approvals = await getApprovals(runId);
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('pais').eq('id', runId).maybeSingle();
  const requiredTeams = await requiredApprovalTeams((run as any)?.pais);
  if (requiredTeams.every((t) => approvals[t])) {
    const result = computeSemaphore({ approvals: approvals as Record<string, any>, requiredTeams });
    await setSemaforo(runId, result.color, result.reason);
    if (result.color === 'red') await setPhase(runId, 'rejected');
    else await markInternalApprovalsDone(runId, result.color, result.reason);
  }
  revalidatePath(`/admin/workflows/${runId}`);
}

const MENTION_RE = /@([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;

function parseMentions(body: string): string[] {
  const set = new Set<string>();
  for (const m of body.matchAll(MENTION_RE)) set.add(m[1].toLowerCase());
  return Array.from(set);
}

export async function addComment(input: {
  fileId: string;
  workflowRunId: string;
  body: string;
  parentId?: string;
  pageNumber?: number;
  anchorText?: string;
  anchorMeta?: Record<string, unknown>;
}) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) {
    throw new Error('Solo admin/aprobador puede comentar');
  }
  const sb = createAdminClient();
  const authorEmail = auth.email;
  if (!input.body?.trim()) throw new Error('Comentario vacío');

  const { data: comment, error } = await sb
    .from('file_comments')
    .insert({
      file_id: input.fileId,
      workflow_run_id: input.workflowRunId,
      parent_id: input.parentId ?? null,
      author_email: authorEmail,
      author_id: auth.user_id ?? null,
      body: input.body.trim(),
      page_number: input.pageNumber ?? null,
      anchor_text: input.anchorText ?? null,
      anchor_meta: (input.anchorMeta as any) ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const mentions = parseMentions(input.body).filter((e) => e !== authorEmail.toLowerCase());
  if (mentions.length) {
    const rows = mentions.map((e) => ({ comment_id: (comment as any).id, mentioned_email: e }));
    await sb.from('file_comment_mentions').upsert(rows, { onConflict: 'comment_id,mentioned_email' });
  }

  revalidatePath(`/admin/workflows/${input.workflowRunId}`);
  return { id: (comment as any).id };
}

export async function resolveComment(commentId: string, runId: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) {
    throw new Error('Solo admin/aprobador puede resolver comentarios');
  }
  const sb = createAdminClient();
  const { error } = await sb.from('file_comments').update({ resolved: true }).eq('id', commentId).eq('workflow_run_id', runId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/workflows/${runId}`);
  return { ok: true };
}

export async function unresolveComment(commentId: string, runId: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) {
    throw new Error('Solo admin/aprobador puede modificar comentarios');
  }
  const sb = createAdminClient();
  const { error } = await sb.from('file_comments').update({ resolved: false }).eq('id', commentId).eq('workflow_run_id', runId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/workflows/${runId}`);
  return { ok: true };
}

export async function applyAiEditAction(input: { workflowRunId: string; sourceFileId: string; extraPrompt?: string }) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) {
    throw new Error('Solo admin/aprobador puede correr IA');
  }
  const r = await runAiEdit({
    workflowRunId: input.workflowRunId,
    sourceFileId: input.sourceFileId,
    requestedBy: auth.email,
    requestedById: auth.user_id ?? null,
    extraPrompt: input.extraPrompt,
  });
  revalidatePath(`/admin/workflows/${input.workflowRunId}`);
  return r;
}

export async function applyDraft(jobId: string, runId: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  const r = await applyAiDraft(jobId, auth.email);
  revalidatePath(`/admin/workflows/${runId}`);
  return r;
}

export async function discardDraft(jobId: string, runId: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  const r = await discardAiDraft(jobId);
  revalidatePath(`/admin/workflows/${runId}`);
  return r;
}

// Plan B manual RegCheq: la API de RegCheq no entrega resultados (sync 500 / async sin callback).
// El admin corre el chequeo en la web de RegCheq, baja el informe y lo carga acá con la decisión.
export async function submitRegcheqManual(formData: FormData) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  if (!auth.roles.includes('admin') && !auth.roles.includes('aprobador')) {
    throw new Error('Solo admin/aprobador puede registrar RegCheq manual');
  }

  const providerId = String(formData.get('provider_id') ?? '');
  const runId = String(formData.get('run_id') ?? '') || null;
  const decision = String(formData.get('decision') ?? '').toLowerCase();
  const reason = String(formData.get('reason') ?? '').trim() || null;
  const file = formData.get('file');

  if (!providerId) throw new Error('provider_id requerido');
  const VALID = new Set(['block', 'review', 'approve_flag', 'approve']);
  if (!VALID.has(decision)) throw new Error(`Decisión inválida: '${decision}'. Use ${[...VALID].join('|')}`);

  const sb = createAdminClient();
  const BUCKET = 'contracts';
  const ALLOWED = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
  const MAX = 10 * 1024 * 1024;

  let reportUploadId: string | null = null;
  let reportFilename: string | null = null;

  if (file && typeof file !== 'string' && (file as File).size > 0) {
    const blob = file as File;
    if (blob.size > MAX) throw new Error('Archivo supera 10 MB');
    if (!ALLOWED.has(blob.type)) throw new Error('Tipo no permitido: ' + blob.type);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const cleanName = (blob.name || 'regcheq-report.pdf').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
    const storagePath = `providers/${providerId}/${randomUUID()}-${cleanName}`;
    const up = await sb.storage.from(BUCKET).upload(storagePath, buffer, { contentType: blob.type, upsert: false });
    if (up.error) throw new Error('storage.upload: ' + up.error.message);
    const ins = await sb
      .from('provider_uploads')
      .insert({
        provider_id: providerId,
        workflow_run_id: runId,
        doc_type: 'regcheq_report',
        doc_filename: cleanName,
        file_url: storagePath,
        file_size: blob.size,
        uploaded_by_email: auth.email ?? null,
      })
      .select('id, doc_filename')
      .single();
    if (ins.error) {
      await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      throw new Error(ins.error.message);
    }
    reportUploadId = (ins.data as any).id;
    reportFilename = (ins.data as any).doc_filename;
  }

  const { error: rcErr } = await sb.from('regcheq_checks').insert({
    workflow_run_id: runId,
    provider_id: providerId,
    decision,
    reason: reason ?? 'manual_review',
    company: { manual: true, decision, notes: reason, report_upload_id: reportUploadId, by: auth.email ?? null },
    relations: [],
  });
  if (rcErr) throw new Error(rcErr.message);

  if (runId) {
    const { error: aErr } = await sb.from('audit_log').insert({
      workflow_run_id: runId,
      actor: auth.email ?? 'admin',
      action: 'regcheq.manual',
      target_type: 'provider',
      target_id: String(providerId),
      payload: { decision, reason, report_upload_id: reportUploadId },
    });
    if (aErr) console.error('audit_log insert failed', aErr);
  }

  revalidatePath(`/admin/workflows/${runId}`);
  revalidatePath(`/admin/providers/${providerId}`);
  return { ok: true, decision, report_filename: reportFilename };
}
