import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { ContractFile, FileComment } from '@/lib/types';

const BUCKET = 'contracts';

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
