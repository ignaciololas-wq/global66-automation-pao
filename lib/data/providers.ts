import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { Provider, SociedadDocument } from '@/lib/types';

export async function listProviders({
  limit = 200,
  status,
  pais,
}: { limit?: number; status?: string; pais?: string } = {}): Promise<Provider[]> {
  const sb = createAdminClient();
  let q = sb.from('providers').select('*').order('created_at', { ascending: false }).limit(limit);
  if (status) q = q.eq('status', status);
  if (pais) q = q.eq('pais', pais);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Provider[];
}

export async function getProvider(id: string): Promise<Provider | null> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('providers').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Provider | null;
}

export interface RegcheqCheck {
  id: string;
  workflow_run_id: string | null;
  provider_id: string | null;
  decision: string;
  reason: string | null;
  company: any;
  relations: any[];
  created_at: string;
}

export async function getRegcheqHistory(providerId: string): Promise<RegcheqCheck[]> {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('regcheq_checks')
    .select('*')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []) as RegcheqCheck[];
}


export async function findProviderByToken(token: string): Promise<Provider | null> {
  if (!token) return null;
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('providers')
    .select('*')
    .eq('public_token', token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as Provider | null;
}

export async function listSociedadDocumentsForProvider(sociedadName: string | null): Promise<SociedadDocument[]> {
  if (!sociedadName) return [];
  const sb = createAdminClient();
  const { data: sociedad } = await sb.from('sociedades').select('id').eq('name', sociedadName).maybeSingle();
  if (!sociedad) return [];
  const { data, error } = await sb
    .from('sociedad_documents')
    .select('*')
    .eq('sociedad_id', (sociedad as any).id)
    .eq('active', true)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SociedadDocument[];
}

export async function listProviderUploads(providerId: string) {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('provider_uploads')
    .select('id, doc_type, doc_filename, file_url, file_size, rag_status, validation_status, created_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function findRunsForProvider(providerId: string) {
  const sb = createAdminClient();
  const { data, error } = await sb
    .from('workflow_runs')
    .select('id, current_phase, razon_social, sociedad_contratante, profile_invited_at, profile_completed_at, created_at')
    .eq('provider_id', providerId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}
