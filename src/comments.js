// PR2: thread comentarios por archivo + parsing @menciones + fanout notif.

import { sb, logAudit } from './supabase_audit.js';
import { sendMentionNotification, sendCommentNotification } from './notifications.js';

const MENTION_RE = /@([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})/gi;

export function parseMentions(body) {
  const set = new Set();
  for (const m of body.matchAll(MENTION_RE)) {
    set.add(m[1].toLowerCase());
  }
  return Array.from(set);
}

export async function listComments(fileId) {
  const { data, error } = await sb
    .from('file_comments')
    .select('id, file_id, workflow_run_id, parent_id, author_email, body, page_number, resolved, anchor_text, anchor_meta, created_at, updated_at')
    .eq('file_id', fileId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createComment({
  fileId,
  workflowRunId,
  parentId,
  authorEmail,
  authorId,
  body,
  pageNumber,
  anchorText,
  anchorMeta,
}) {
  if (!fileId || !workflowRunId) throw new Error('fileId + workflowRunId required');
  if (!body || !body.trim()) throw new Error('body required');
  if (!authorEmail) throw new Error('authorEmail required');

  const { data: comment, error } = await sb
    .from('file_comments')
    .insert({
      file_id: fileId,
      workflow_run_id: workflowRunId,
      parent_id: parentId ?? null,
      author_email: authorEmail,
      author_id: authorId ?? null,
      body: body.trim(),
      page_number: pageNumber ?? null,
      anchor_text: anchorText ?? null,
      anchor_meta: anchorMeta ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  const mentionEmails = parseMentions(body).filter((e) => e !== authorEmail.toLowerCase());
  if (mentionEmails.length) {
    const rows = mentionEmails.map((e) => ({ comment_id: comment.id, mentioned_email: e }));
    await sb.from('file_comment_mentions').upsert(rows, { onConflict: 'comment_id,mentioned_email' });

    sb.from('user_profiles').select('user_id, email').in('email', mentionEmails).then(({ data }) => {
      if (!data?.length) return;
      const byEmail = Object.fromEntries(data.map((p) => [p.email.toLowerCase(), p.user_id]));
      const updates = mentionEmails.map((e) => byEmail[e] && sb
        .from('file_comment_mentions')
        .update({ mentioned_id: byEmail[e] })
        .eq('comment_id', comment.id)
        .eq('mentioned_email', e));
      Promise.all(updates.filter(Boolean)).catch(() => {});
    });

    sendMentionNotification({
      mentionedEmails: mentionEmails,
      authorEmail,
      body: comment.body,
      fileId,
      workflowRunId,
      commentId: comment.id,
      pageNumber: pageNumber ?? null,
    }).catch((e) => console.error('[mention notif]', e.message));
  }

  // Notif a solicitante + owner del workflow (sin importar mención), excepto si son el autor o ya mencionados.
  (async () => {
    const { data: run } = await sb
      .from('workflow_runs')
      .select('solicitante_email, owner_email')
      .eq('id', workflowRunId)
      .maybeSingle();
    if (!run) return;
    const targets = new Set();
    [run.solicitante_email, run.owner_email].forEach((e) => {
      if (!e) return;
      const lc = e.toLowerCase();
      if (lc === authorEmail.toLowerCase()) return;
      if (mentionEmails.includes(lc)) return; // ya notificado por mention
      targets.add(lc);
    });
    if (!targets.size) return;
    await sendCommentNotification({
      recipients: Array.from(targets),
      authorEmail,
      body: comment.body,
      fileId,
      workflowRunId,
      commentId: comment.id,
      pageNumber: pageNumber ?? null,
    });
  })().catch((e) => console.error('[comment notif solicitante]', e.message));

  await logAudit(workflowRunId, authorEmail, 'comment.created', 'file_comment', comment.id, {
    file_id: fileId, mentions: emails.length, page: pageNumber,
  });
  return comment;
}

export async function updateComment({ commentId, authorEmail, body, resolved }) {
  const patch = { updated_at: new Date().toISOString() };
  if (body !== undefined) patch.body = body.trim();
  if (resolved !== undefined) patch.resolved = !!resolved;

  const { data, error } = await sb
    .from('file_comments')
    .update(patch)
    .eq('id', commentId)
    .eq('author_email', authorEmail)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteComment({ commentId, authorEmail }) {
  const { error } = await sb
    .from('file_comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('author_email', authorEmail);
  if (error) throw new Error(error.message);
}
