// PR2: upload, list, signed URL, delete de archivos por workflow_run.
// Usa Supabase Storage bucket "contracts" privado.

import crypto from 'node:crypto';
import { sb } from './supabase_audit.js';
import { logAudit } from './supabase_audit.js';

const BUCKET = 'contracts';
const SIGNED_URL_TTL = 60 * 60; // 1h

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
]);

function sanitizeFilename(name) {
  return (name ?? 'archivo')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

function buildStoragePath(workflowRunId, fileId, filename) {
  const safe = sanitizeFilename(filename);
  return `${workflowRunId}/${fileId}-${safe}`;
}

export async function uploadFile({
  workflowRunId,
  providerId,
  kind = 'anexo',
  filename,
  mimeType,
  buffer,
  uploadedBy,
  uploadedById,
  previousVersionId,
}) {
  if (!workflowRunId) throw new Error('workflow_run_id required');
  if (!filename) throw new Error('filename required');
  if (!buffer || !buffer.length) throw new Error('empty file');
  if (!ALLOWED_MIME.has(mimeType)) throw new Error(`mime not allowed: ${mimeType}`);
  if (!['main', 'anexo', 'papel_proveedor'].includes(kind)) throw new Error('invalid kind');

  const fileId = crypto.randomUUID();
  const storagePath = buildStoragePath(workflowRunId, fileId, filename);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  // Versioning: si previousVersionId viene, archiva el anterior y bump version.
  let version = 1;
  if (previousVersionId) {
    const { data: prev } = await sb
      .from('contract_files')
      .select('version, kind')
      .eq('id', previousVersionId)
      .single();
    if (prev) {
      version = (prev.version ?? 1) + 1;
      await sb.from('contract_files').update({
        archived_at: new Date().toISOString(),
        draft_status: 'superseded',
      }).eq('id', previousVersionId);
    }
  }

  const up = await sb.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (up.error) throw new Error(`storage.upload: ${up.error.message}`);

  const { data, error } = await sb
    .from('contract_files')
    .insert({
      id: fileId,
      workflow_run_id: workflowRunId,
      provider_id: providerId ?? null,
      kind,
      storage_path: storagePath,
      filename,
      mime_type: mimeType,
      size_bytes: buffer.length,
      sha256,
      uploaded_by: uploadedBy ?? 'unknown',
      uploaded_by_id: uploadedById ?? null,
      version,
      previous_version_id: previousVersionId ?? null,
      draft_status: 'active',
    })
    .select()
    .single();

  if (error) {
    await sb.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`db.insert: ${error.message}`);
  }

  await logAudit(workflowRunId, uploadedBy ?? 'system', 'file.uploaded', 'contract_file', fileId, {
    kind, filename, size_bytes: buffer.length, mime_type: mimeType,
  });
  return data;
}

export async function listFiles(workflowRunId) {
  const { data, error } = await sb
    .from('contract_files')
    .select('id, kind, filename, mime_type, size_bytes, uploaded_by, ai_review_status, created_at, sha256')
    .eq('workflow_run_id', workflowRunId)
    .order('kind', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getSignedUrl(fileId, { download = false } = {}) {
  const { data: file, error } = await sb
    .from('contract_files')
    .select('storage_path, filename, mime_type')
    .eq('id', fileId)
    .single();
  if (error || !file) throw new Error('file not found');

  const opts = {};
  if (download) opts.download = file.filename;

  const { data, error: signErr } = await sb.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL, opts);
  if (signErr) throw new Error(signErr.message);
  return { url: data.signedUrl, filename: file.filename, mime_type: file.mime_type };
}

export async function deleteFile(fileId, { by }) {
  const { data: file, error } = await sb
    .from('contract_files')
    .select('storage_path, workflow_run_id, kind, filename')
    .eq('id', fileId)
    .single();
  if (error || !file) throw new Error('file not found');

  await sb.storage.from(BUCKET).remove([file.storage_path]).catch(() => {});
  const del = await sb.from('contract_files').delete().eq('id', fileId);
  if (del.error) throw new Error(del.error.message);
  await logAudit(file.workflow_run_id, by ?? 'system', 'file.deleted', 'contract_file', fileId, {
    kind: file.kind, filename: file.filename,
  });
}

export function isAllowedMime(mimeType) {
  return ALLOWED_MIME.has(mimeType);
}

export const FILE_BUCKET = BUCKET;
