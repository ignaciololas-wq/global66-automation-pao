// PR2: notificaciones (in-app + Slack DM + email).

import { sb } from './supabase_audit.js';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SITE_URL = (process.env.SITE_URL ?? process.env.SERVER_PUBLIC_URL ?? 'https://global66-automation-pao.vercel.app').replace(/\/$/, '');

async function slackApiJson(method, body) {
  if (!SLACK_TOKEN) return { ok: false, error: 'SLACK_BOT_TOKEN not set' };
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${SLACK_TOKEN}` },
    body: JSON.stringify(body),
  });
  return r.json();
}

async function slackApiForm(method, params) {
  if (!SLACK_TOKEN) return { ok: false, error: 'SLACK_BOT_TOKEN not set' };
  const qs = new URLSearchParams(params);
  const r = await fetch(`https://slack.com/api/${method}?${qs.toString()}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  });
  return r.json();
}

async function slackDM(email, blocks, fallbackText) {
  // lookupByEmail no acepta POST JSON: usa GET con query string.
  const lookup = await slackApiForm('users.lookupByEmail', { email });
  if (!lookup.ok || !lookup.user?.id) return { ok: false, error: lookup.error ?? 'user_not_found' };
  const open = await slackApiJson('conversations.open', { users: lookup.user.id });
  if (!open.ok || !open.channel?.id) return { ok: false, error: open.error ?? 'open_failed' };
  return slackApiJson('chat.postMessage', {
    channel: open.channel.id,
    text: fallbackText,
    blocks,
  });
}

function buildMentionEmail({ authorEmail, body, runId, fileId, pageNumber }) {
  const previewUrl = `${SITE_URL}/admin?file=${fileId}#workflows/${runId}`;
  const pageLine = pageNumber ? ` · página ${pageNumber}` : '';
  return {
    subject: `${authorEmail} te mencionó en un contrato${pageLine}`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#132046">
        <h2 style="font-family:Montserrat,sans-serif;font-size:20px;margin-bottom:12px">Nueva mención en un contrato</h2>
        <p><b>${authorEmail}</b> te etiquetó${pageLine}:</p>
        <blockquote style="background:#f5f7fe;border-left:3px solid #1F49B6;padding:12px 16px;margin:12px 0;border-radius:6px">
          ${escapeHtml(body).replace(/\n/g, '<br>')}
        </blockquote>
        <p><a href="${previewUrl}" style="display:inline-block;background:#1F49B6;color:white;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Ver comentario →</a></p>
        <p style="color:#565656;font-size:12px;margin-top:24px">Global66 Contratos · plataforma interna</p>
      </div>
    `,
    text: `${authorEmail} te mencionó${pageLine}:\n\n${body}\n\nVer: ${previewUrl}`,
  };
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function sendMentionNotification({ mentionedEmails, authorEmail, body, fileId, workflowRunId, commentId, pageNumber }) {
  if (!mentionedEmails?.length) return;

  // Insert notifications rows (badge in-app).
  const rows = mentionedEmails.map((e) => ({
    recipient_email: e,
    kind: 'mention',
    workflow_run_id: workflowRunId,
    payload: { author: authorEmail, body, file_id: fileId, comment_id: commentId, page: pageNumber },
  }));
  const { data: created } = await sb.from('notifications').insert(rows).select('id, recipient_email');

  // Resolver recipient_id (user_profiles).
  const { data: profiles } = await sb.from('user_profiles').select('user_id, email').in('email', mentionedEmails);
  const byEmail = Object.fromEntries((profiles ?? []).map((p) => [p.email.toLowerCase(), p.user_id]));
  if (created?.length) {
    await Promise.all(created.map((n) => byEmail[n.recipient_email.toLowerCase()] && sb
      .from('notifications')
      .update({ recipient_id: byEmail[n.recipient_email.toLowerCase()] })
      .eq('id', n.id)));
  }

  // Slack DM + email en paralelo.
  const { sendEmail } = await import('./email.js');
  const tpl = buildMentionEmail({ authorEmail, body, runId: workflowRunId, fileId, pageNumber });
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `🔔 *${authorEmail}* te mencionó${pageNumber ? ` (p.${pageNumber})` : ''}` },
    },
    { type: 'section', text: { type: 'mrkdwn', text: '> ' + body.replace(/\n/g, '\n> ').slice(0, 600) } },
    {
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: 'Ver comentario' },
        url: `${SITE_URL}/admin?file=${fileId}#workflows/${workflowRunId}`,
      }],
    },
  ];

  for (const email of mentionedEmails) {
    Promise.all([
      slackDM(email, blocks, `${authorEmail} te mencionó`).then((r) => sb
        .from('notifications')
        .update({ delivered_slack: !!r.ok })
        .eq('recipient_email', email)
        .eq('kind', 'mention')
        .eq('workflow_run_id', workflowRunId)
        .order('created_at', { ascending: false })
        .limit(1)).catch((e) => console.error('[slack DM]', email, e.message)),
      sendEmail({ to: email, ...tpl, tags: ['mention', 'comment'] })
        .then(() => sb
          .from('notifications')
          .update({ delivered_email: true })
          .eq('recipient_email', email)
          .eq('kind', 'mention')
          .eq('workflow_run_id', workflowRunId))
        .catch((e) => console.error('[email]', email, e.message)),
    ]).catch(() => {});
  }
}

// Notif a solicitante/owner cuando alguien comenta su run (sin mención).
// Slack DM + email + in-app row. Idéntico flow que mention, distinta kind/copy.
export async function sendCommentNotification({ recipients, authorEmail, body, fileId, workflowRunId, commentId, pageNumber }) {
  if (!recipients?.length) return;

  const rows = recipients.map((e) => ({
    recipient_email: e,
    kind: 'comment_reply',
    workflow_run_id: workflowRunId,
    payload: { author: authorEmail, body, file_id: fileId, comment_id: commentId, page: pageNumber },
  }));
  const { data: created } = await sb.from('notifications').insert(rows).select('id, recipient_email');

  const { data: profiles } = await sb.from('user_profiles').select('user_id, email').in('email', recipients);
  const byEmail = Object.fromEntries((profiles ?? []).map((p) => [p.email.toLowerCase(), p.user_id]));
  if (created?.length) {
    await Promise.all(created.map((n) => byEmail[n.recipient_email.toLowerCase()] && sb
      .from('notifications')
      .update({ recipient_id: byEmail[n.recipient_email.toLowerCase()] })
      .eq('id', n.id)));
  }

  const { sendEmail } = await import('./email.js');
  const previewUrl = `${SITE_URL}/admin?file=${fileId}#workflows/${workflowRunId}`;
  const pageLine = pageNumber ? ` · página ${pageNumber}` : '';
  const tpl = {
    subject: `Nuevo comentario en tu solicitud · ${authorEmail}`,
    html: `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#132046">
        <h2 style="font-family:Montserrat,sans-serif;font-size:20px;margin-bottom:12px">Comentario en tu solicitud</h2>
        <p><b>${authorEmail}</b> dejó un comentario en el contrato${pageLine}:</p>
        <blockquote style="background:#f5f7fe;border-left:3px solid #1F49B6;padding:12px 16px;margin:12px 0;border-radius:6px">
          ${escapeHtml(body).replace(/\n/g, '<br>')}
        </blockquote>
        <p><a href="${previewUrl}" style="display:inline-block;background:#1F49B6;color:white;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Ver y responder →</a></p>
        <p style="color:#565656;font-size:12px;margin-top:24px">Global66 Contratos</p>
      </div>
    `,
    text: `${authorEmail} comentó${pageLine}:\n\n${body}\n\nVer: ${previewUrl}`,
  };

  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `💬 *${authorEmail}* comentó en tu solicitud${pageNumber ? ` (p.${pageNumber})` : ''}` } },
    { type: 'section', text: { type: 'mrkdwn', text: '> ' + body.replace(/\n/g, '\n> ').slice(0, 600) } },
    { type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Ver y responder' }, url: previewUrl }] },
  ];

  for (const email of recipients) {
    Promise.all([
      slackDM(email, blocks, `${authorEmail} comentó en tu solicitud`).then((r) => sb
        .from('notifications')
        .update({ delivered_slack: !!r.ok })
        .eq('recipient_email', email)
        .eq('kind', 'comment_reply')
        .eq('workflow_run_id', workflowRunId)
        .order('created_at', { ascending: false })
        .limit(1)).catch((e) => console.error('[slack DM comment]', email, e.message)),
      sendEmail({ to: email, ...tpl, tags: ['comment', 'workflow'] })
        .then(() => sb
          .from('notifications')
          .update({ delivered_email: true })
          .eq('recipient_email', email)
          .eq('kind', 'comment_reply')
          .eq('workflow_run_id', workflowRunId))
        .catch((e) => console.error('[email comment]', email, e.message)),
    ]).catch(() => {});
  }
}

export async function listForUser(email, { limit = 50, unreadOnly = false } = {}) {
  let q = sb
    .from('notifications')
    .select('id, kind, workflow_run_id, payload, read_at, created_at')
    .eq('recipient_email', email.toLowerCase())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is('read_at', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function markRead({ ids, email }) {
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_email', email.toLowerCase())
    .in('id', ids);
  if (error) throw new Error(error.message);
}

export async function markAllRead(email) {
  const { error } = await sb
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_email', email.toLowerCase())
    .is('read_at', null);
  if (error) throw new Error(error.message);
}

export async function unreadCount(email) {
  const { count, error } = await sb
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_email', email.toLowerCase())
    .is('read_at', null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
