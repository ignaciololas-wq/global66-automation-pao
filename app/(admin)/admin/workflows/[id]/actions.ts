'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { runAiEdit, applyAiDraft, discardAiDraft } from '@/lib/ai';
import { revalidatePath } from 'next/cache';

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
  const sb = createAdminClient();
  const { error } = await sb.from('file_comments').update({ resolved: true }).eq('id', commentId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/workflows/${runId}`);
  return { ok: true };
}

export async function unresolveComment(commentId: string, runId: string) {
  const auth = await getCurrentUser();
  if (!auth.ok) throw new Error('No autorizado');
  const sb = createAdminClient();
  const { error } = await sb.from('file_comments').update({ resolved: false }).eq('id', commentId);
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
