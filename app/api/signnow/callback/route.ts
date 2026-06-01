import { NextResponse, after } from 'next/server';
import { processSignedByDocumentId } from '@/lib/signing';

export const dynamic = 'force-dynamic';

// Webhook de SignNow (event subscription document.complete).
// El document_id puede venir en el body (varias formas) o en la query
// (?document_id=, por docid_queryparam). El secret en ?secret= es best-effort:
// SignNow puede no preservar la query, así que si no viene NO rechazamos — el
// finalize re-verifica contra la API que el doc esté realmente firmado y que
// pertenezca a un run, así que un POST espurio es inofensivo (no-op).
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.SIGNNOW_WEBHOOK_SECRET;
  const provided = url.searchParams.get('secret');
  if (secret && provided && provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* puede venir vacío */ }

  const docId = url.searchParams.get('document_id')
    ?? body?.document_id ?? body?.content?.document_id ?? body?.meta?.document_id
    ?? body?.document?.id ?? body?.id ?? null;
  if (!docId) return NextResponse.json({ ok: true, note: 'sin document_id' });

  after(() => processSignedByDocumentId(String(docId)).catch((e) => console.error('[signnow-webhook] error:', e)));
  return NextResponse.json({ ok: true });
}
