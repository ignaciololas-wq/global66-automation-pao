import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { uploadDocument, freeFormInvite, getDocumentStatus, downloadSigned, subscribeDocumentComplete } from '@/lib/signnow';
import { logAudit } from '@/lib/data/approvals';
import { sendEmail } from '@/lib/email';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SITE_URL = (process.env.SITE_URL ?? 'https://global66-automation-pao.vercel.app').replace(/\/$/, '');

// DM de Slack por email (lookup → open → postMessage). Best-effort.
async function slackDM(email: string, text: string) {
  if (!SLACK_TOKEN || !email) return;
  try {
    const H = { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${SLACK_TOKEN}` };
    const lk = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }).then((r) => r.json());
    if (!lk.ok || !lk.user?.id) return;
    const open = await fetch('https://slack.com/api/conversations.open', { method: 'POST', headers: H, body: JSON.stringify({ users: lk.user.id }) }).then((r) => r.json());
    if (!open.ok || !open.channel?.id) return;
    await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: H, body: JSON.stringify({ channel: open.channel.id, text }) });
  } catch (e) {
    console.error('[signing] slackDM falló:', (e as any)?.message);
  }
}

const BUCKET = 'contracts';

export interface Signer { email: string; name: string | null }

// Resuelve los apoderados firmantes del run:
//   1) run.apoderados_firmantes (configurado en el paso de firma)
//   2) apoderados activos con email de la sociedad contratante (priority 1 primero)
export async function resolveSigners(run: any): Promise<Signer[]> {
  const fromRun: Signer[] = (run.apoderados_firmantes ?? [])
    .filter((s: any) => s?.email)
    .map((s: any) => ({ email: String(s.email), name: s.name ?? null }));
  if (fromRun.length) return fromRun;

  const sb = createAdminClient();
  const { data: soc } = await sb.from('sociedades').select('id').eq('name', run.sociedad_contratante).maybeSingle();
  if (!soc) return [];
  const { data: aps } = await sb
    .from('apoderados')
    .select('name, email, priority')
    .eq('sociedad_id', (soc as any).id)
    .eq('active', true)
    .not('email', 'is', null);
  return (aps ?? [])
    .filter((a: any) => a.email)
    .sort((a: any, b: any) => (a.priority ?? 2) - (b.priority ?? 2))
    .map((a: any) => ({ email: a.email, name: a.name }));
}

// Envía el contrato (PDF main del run) a SignNow y dispara la invitación de
// firma free-form al apoderado. Guarda signnow_document_id en el run.
export async function sendToSignNow(runId: string): Promise<{ document_id: string; signer: string; all_signers: string[] }> {
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('*').eq('id', runId).single();
  if (!run) throw new Error('run no encontrado');

  const { data: files } = await sb
    .from('contract_files')
    .select('*')
    .eq('workflow_run_id', runId)
    .eq('kind', 'main')
    .is('archived_at', null)
    .order('version', { ascending: false })
    .limit(1);
  const main = files?.[0] as any;
  if (!main) throw new Error('No hay contrato (archivo principal) para enviar a firma');

  const dl = await sb.storage.from(BUCKET).download(main.storage_path);
  if (dl.error || !dl.data) throw new Error('storage.download: ' + (dl.error?.message ?? 'sin datos'));
  const buf = Buffer.from(await dl.data.arrayBuffer());

  const docId = await uploadDocument(buf, main.filename ?? 'contrato.pdf');

  // Webhook automático: cuando se complete la firma, SignNow pega a nuestro callback.
  const secret = process.env.SIGNNOW_WEBHOOK_SECRET;
  const callback = `${SITE_URL}/api/signnow/callback${secret ? `?secret=${encodeURIComponent(secret)}` : ''}`;
  await subscribeDocumentComplete(docId, callback).catch(() => {});

  const signers = await resolveSigners(run);
  if (!signers.length) throw new Error('No hay apoderados firmantes con email para esta sociedad');

  // Free-form admite un firmante por documento; invitamos al primario (priority 1).
  const primary = signers[0];
  await freeFormInvite(docId, primary.email);

  await sb.from('workflow_runs').update({ signnow_document_id: docId }).eq('id', runId);
  await logAudit(runId, 'system', 'signature.sent_to_signnow', 'workflow_run', runId, {
    document_id: docId, signer: primary.email, signers_count: signers.length,
  });

  return { document_id: docId, signer: primary.email, all_signers: signers.map((s) => s.email) };
}

// Baja el PDF firmado, lo guarda como nueva versión 'main' (visible en el viewer),
// marca la solicitud 'signed' y avisa al solicitante (mail + Slack). Idempotente.
async function finalizeSigned(run: any, docId: string) {
  const sb = createAdminClient();
  if (run.current_phase === 'signed') return;

  const pdf = await downloadSigned(docId);
  const path = `providers/${run.id}/firmado-${docId}.pdf`;
  const up = await sb.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error('storage.upload signed: ' + up.error.message);

  // provider_id + próxima versión para el contract_files
  const { data: prov } = await sb.from('providers').select('id').eq('tax_id', run.tax_id).maybeSingle();
  const { data: last } = await sb.from('contract_files').select('version').eq('workflow_run_id', run.id).order('version', { ascending: false }).limit(1);
  const nextVersion = ((last?.[0] as any)?.version ?? 0) + 1;

  await sb.from('contract_files').insert({
    workflow_run_id: run.id,
    provider_id: (prov as any)?.id ?? null,
    kind: 'main',
    storage_path: path,
    filename: 'contrato-firmado.pdf',
    mime_type: 'application/pdf',
    size_bytes: pdf.length,
    version: nextVersion,
    uploaded_by: 'signnow',
  });

  await sb.from('workflow_runs').update({ current_phase: 'signed' }).eq('id', run.id);
  await logAudit(run.id, 'system', 'signature.completed', 'workflow_run', run.id, { document_id: docId });

  // Avisar al solicitante (mail + Slack DM).
  const to = run.solicitante_email ?? run.owner_email;
  const link = `${SITE_URL}/admin/workflows/${run.id}`;
  if (to) {
    sendEmail({
      to,
      subject: `✅ Contrato firmado — ${run.razon_social}`,
      html: `<div style="font-family:Inter,system-ui,Arial;max-width:560px;margin:0 auto;padding:24px;color:#132046"><h2 style="font-family:Montserrat,sans-serif">✅ Contrato firmado</h2><p>El contrato con <b>${run.razon_social}</b> fue firmado por el/los apoderado(s) y quedó archivado.</p><p><a href="${link}" style="display:inline-block;background:#1F49B6;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Ver solicitud →</a></p></div>`,
      text: `Contrato firmado — ${run.razon_social}. Ver: ${link}`,
    }).catch((e) => console.error('[signing] mail solicitante falló:', e.message));
  }
  await slackDM(to ?? '', `✅ Contrato *firmado*: ${run.razon_social} (${run.tax_id}). ${link}`);
}

// Consulta el estado en SignNow y, si está completo, finaliza (idempotente).
export async function syncSignatureStatus(runId: string): Promise<{ signed: boolean; reason?: string }> {
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('*').eq('id', runId).single();
  if (!run) return { signed: false, reason: 'run_not_found' };
  if (run.current_phase === 'signed') return { signed: true };
  if (!run.signnow_document_id) return { signed: false, reason: 'no_document' };
  const status = await getDocumentStatus(run.signnow_document_id);
  if (!status.fully_signed) return { signed: false, reason: 'pending' };
  await finalizeSigned(run, run.signnow_document_id);
  return { signed: true };
}

// Procesa un evento de webhook por document_id (busca el run y finaliza).
export async function processSignedByDocumentId(documentId: string): Promise<boolean> {
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('*').eq('signnow_document_id', documentId).maybeSingle();
  if (!run) return false;
  if (run.current_phase === 'signed') return true;
  const status = await getDocumentStatus(documentId);
  if (!status.fully_signed) return false;
  await finalizeSigned(run, documentId);
  return true;
}
