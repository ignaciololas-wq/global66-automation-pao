'use server';

import crypto from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/server';
import { findProviderByToken } from '@/lib/data/providers';
import { revalidatePath } from 'next/cache';

const BUCKET = 'contracts';
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'image/png',
  'image/jpeg',
]);

export interface ProviderProfileInput {
  representante_legal?: string;
  email_contacto?: string;
  email_facturacion?: string;
  tipo_proveedor?: string;
  razon_social?: string;
  tax_id?: string;
  pais?: string;
  domicilio?: string;
  giro?: string;
  banco_nombre?: string;
  banco_cuenta_tipo?: string;
  banco_cuenta_numero?: string;
  banco_titular?: string;
  banco_swift?: string;
  banco_iban?: string;
  contacto_admin_nombre?: string;
  contacto_admin_email?: string;
  contacto_admin_telefono?: string;
  [k: string]: unknown;
}

export async function saveProviderProfile(token: string, profile: ProviderProfileInput) {
  const provider = await findProviderByToken(token);
  if (!provider) throw new Error('Token inválido o expirado');
  const sb = createAdminClient();

  const merged = { ...((provider as any).profile_data ?? {}), ...profile };
  const topLevelKeys = ['representante_legal', 'email_contacto', 'email_facturacion', 'tipo_proveedor', 'razon_social', 'tax_id', 'pais', 'domicilio'];
  const topPatch: Record<string, unknown> = {};
  for (const k of topLevelKeys) if (profile[k] != null && String(profile[k]).trim() !== '') topPatch[k] = profile[k];

  const { error } = await sb
    .from('providers')
    .update({
      ...topPatch,
      profile_data: merged,
      profile_completed_at: new Date().toISOString(),
    })
    .eq('id', provider.id);
  if (error) throw new Error(error.message);

  await sb
    .from('workflow_runs')
    .update({ provider_data_completed_at: new Date().toISOString() })
    .eq('tax_id', (provider as any).tax_id)
    .is('provider_data_completed_at', null);

  revalidatePath(`/p/${token}`);
  return { ok: true };
}

export async function uploadProviderDoc(token: string, formData: FormData) {
  const provider = await findProviderByToken(token);
  if (!provider) throw new Error('Token inválido o expirado');

  const docKind = String(formData.get('docKind') ?? '');
  const file = formData.get('file');
  if (!docKind) throw new Error('docKind requerido');
  if (!file || typeof file === 'string') throw new Error('Archivo requerido');

  const blob = file as File;
  if (blob.size === 0) throw new Error('Archivo vacío');
  if (blob.size > MAX_BYTES) throw new Error(`Archivo supera ${MAX_BYTES / 1024 / 1024} MB`);
  if (!ALLOWED_MIME.has(blob.type)) throw new Error('Tipo no permitido: ' + blob.type);

  const sb = createAdminClient();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const cleanName = (blob.name || 'doc').replace(/[^a-zA-Z0-9._-]+/g, '_');
  const storagePath = `provider/${provider.id}/${docKind}/${crypto.randomUUID()}-${cleanName}`;

  const up = await sb.storage.from(BUCKET).upload(storagePath, buffer, { contentType: blob.type, upsert: false });
  if (up.error) throw new Error('storage.upload: ' + up.error.message);

  const { error } = await sb.from('provider_uploads').insert({
    provider_id: provider.id,
    doc_type: docKind,
    doc_filename: blob.name || cleanName,
    file_url: storagePath,
    file_size: blob.size,
  });
  if (error) {
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(error.message);
  }

  revalidatePath(`/p/${token}`);
  return { ok: true };
}

export async function deleteProviderUpload(token: string, uploadId: string) {
  const provider = await findProviderByToken(token);
  if (!provider) throw new Error('Token inválido');
  const sb = createAdminClient();
  const { data: row } = await sb
    .from('provider_uploads')
    .select('id, provider_id, file_url')
    .eq('id', uploadId)
    .maybeSingle();
  if (!row || (row as any).provider_id !== provider.id) throw new Error('Upload no encontrado');
  await sb.storage.from(BUCKET).remove([(row as any).file_url]).catch(() => {});
  await sb.from('provider_uploads').delete().eq('id', uploadId);
  revalidatePath(`/p/${token}`);
  return { ok: true };
}
