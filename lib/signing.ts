import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { uploadDocument, freeFormInvite } from '@/lib/signnow';
import { logAudit } from '@/lib/data/approvals';

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
