// GET /api/provider-uploads/url?id={uuid} — devuelve signed URL 1h pa descargar.
// Bucket: contracts (privado). Path almacenado en provider_uploads.file_url.

import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: Request) {
  const auth = await getCurrentUser();
  if (!auth.ok) return NextResponse.json({ error: 'no autorizado' }, { status: 401 });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const sb = createAdminClient();
  const { data: row, error } = await sb
    .from('provider_uploads')
    .select('file_url, doc_filename')
    .eq('id', id)
    .maybeSingle();
  if (error || !row) return NextResponse.json({ error: 'upload no encontrado' }, { status: 404 });

  const { data: signed, error: e2 } = await sb.storage
    .from('contracts')
    .createSignedUrl((row as any).file_url, 3600, { download: (row as any).doc_filename ?? false });
  if (e2 || !signed) return NextResponse.json({ error: e2?.message ?? 'storage error' }, { status: 500 });

  // Redirect directo al signed URL pa descarga inline
  if (url.searchParams.get('redirect') !== '0') {
    return NextResponse.redirect(signed.signedUrl, { status: 302 });
  }
  return NextResponse.json({ url: signed.signedUrl, filename: (row as any).doc_filename });
}
