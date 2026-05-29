import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { ContractFile, FileComment } from '@/lib/types';

const BUCKET = 'contracts';

export interface Contract {
  id: string;
  provider_id: string;
  workflow_run_id?: string | null;
  tipo_contrato?: string | null;
  monto?: number | null;
  moneda?: string | null;
  vigencia_meses?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  status?: string | null;
  draft_pdf_url?: string | null;
  signed_pdf_url?: string | null;
  signnow_document_id?: string | null;
  signed_at?: string | null;
  owner_email?: string | null;
  sociedad_contratante?: string | null;
  periodicidad?: string | null;
  created_at: string;
}

// Columnas que la tabla de lista necesita. Evita traer payload pesado (jsonb,
// urls largas) en la vista de listado — la vista detalle usa getContract (select *).
const CONTRACT_LIST_COLS =
  'id, provider_id, tipo_contrato, monto, moneda, periodicidad, end_date, status, signed_at, created_at';

export async function listContracts({ limit = 200 }: { limit?: number } = {}): Promise<Contract[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('contracts')
    .select(CONTRACT_LIST_COLS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Contract[];
}

export async function getContract(id: string): Promise<Contract | null> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('contracts').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Contract | null;
}

export async function listProviderUploadsByProvider(providerId: string) {
  const sb = createAdminClient();
  const { data } = await sb
    .from('provider_uploads')
    .select('id, doc_type, doc_filename, file_url, file_size, created_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function listContractFiles(workflowRunId: string): Promise<ContractFile[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('contract_files')
    .select('*')
    .eq('workflow_run_id', workflowRunId)
    .is('archived_at', null)
    .order('version', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ContractFile[];
}

export async function getContractFile(id: string): Promise<ContractFile | null> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('contract_files').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as ContractFile | null;
}

export async function getSignedUrl(storagePath: string, filename?: string, ttlSeconds = 3600) {
  const sb = createAdminClient();
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(storagePath, ttlSeconds, {
    download: filename ?? false,
  });
  if (error) throw new Error('storage.signedUrl: ' + error.message);
  return data.signedUrl;
}

export async function listComments(fileId: string): Promise<FileComment[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('file_comments')
    .select('id, file_id, workflow_run_id, parent_id, author_email, body, page_number, resolved, anchor_text, anchor_meta, created_at, updated_at')
    .eq('file_id', fileId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  if (!data?.length) return [];
  const emails = Array.from(new Set(data.map((c: any) => (c.author_email ?? '').toLowerCase()).filter(Boolean)));
  const { data: profiles } = await sb.from('user_profiles').select('email, display_name, avatar_url').in('email', emails);
  const byEmail = Object.fromEntries((profiles ?? []).map((p: any) => [String(p.email).toLowerCase(), p]));
  return (data as any[]).map((c) => ({
    ...c,
    author_display_name: byEmail[String(c.author_email).toLowerCase()]?.display_name ?? null,
    author_avatar_url: byEmail[String(c.author_email).toLowerCase()]?.avatar_url ?? null,
  })) as FileComment[];
}
