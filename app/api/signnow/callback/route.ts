import { NextResponse, after } from 'next/server';
import { processSignedByDocumentId } from '@/lib/signing';

export const dynamic = 'force-dynamic';

// Webhook de SignNow (event subscription document.complete). Seguridad: secret en
// query (?secret=) que matchea SIGNNOW_WEBHOOK_SECRET. Extrae el document_id del
// payload (varias formas posibles) y finaliza la firma en after().
export async function POST(req: Request) {
  const url = new URL(req.url);
  const secret = process.env.SIGNNOW_WEBHOOK_SECRET;
  if (secret && url.searchParams.get('secret') !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* puede venir vacío */ }

  const docId = body?.document_id ?? body?.content?.document_id ?? body?.meta?.document_id ?? body?.document?.id ?? body?.id ?? null;
  if (!docId) return NextResponse.json({ ok: true, note: 'sin document_id' });

  after(() => processSignedByDocumentId(String(docId)).catch((e) => console.error('[signnow-webhook] error:', e)));
  return NextResponse.json({ ok: true });
}
