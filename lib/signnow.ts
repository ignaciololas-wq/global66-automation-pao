import 'server-only';

// Cliente SignNow (firma electrónica). Auth con Bearer token directo
// (SIGNNOW_API_TOKEN, generado en el dashboard de la cuenta). No usa OAuth.
const BASE = process.env.SIGNNOW_BASE_URL ?? 'https://api.signnow.com';
const TOKEN = process.env.SIGNNOW_API_TOKEN;
const FROM = process.env.SIGNNOW_FROM ?? process.env.SIGNNOW_USERNAME ?? 'paola.henriquez@global66.com';

function authHeaders(extra: Record<string, string> = {}) {
  return { Authorization: `Bearer ${TOKEN}`, ...extra };
}

function ensureToken() {
  if (!TOKEN) throw new Error('SIGNNOW_API_TOKEN no configurado');
}

// Sube un PDF a SignNow. Devuelve el document id.
export async function uploadDocument(pdf: ArrayBuffer | Buffer, filename: string): Promise<string> {
  ensureToken();
  const form = new FormData();
  const bytes = pdf instanceof ArrayBuffer ? new Uint8Array(pdf) : new Uint8Array(pdf);
  form.append('file', new Blob([bytes], { type: 'application/pdf' }), filename);
  const r = await fetch(`${BASE}/document`, { method: 'POST', headers: authHeaders(), body: form });
  const data = await r.json();
  if (!r.ok || !data.id) throw new Error(`signnow upload ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data.id as string;
}

// Invite free-form (firma libre, sin campos predefinidos) a un firmante.
// Nota: el plan de la cuenta NO permite subject/message custom (error 65582),
// así que mandamos invite mínimo y SignNow usa su asunto/mensaje por defecto.
export async function freeFormInvite(documentId: string, to: string) {
  ensureToken();
  const r = await fetch(`${BASE}/document/${documentId}/invite`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ to, from: FROM }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.result !== 'success') throw new Error(`signnow invite ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

export interface SignNowStatus {
  id: string;
  name: string;
  fully_signed: boolean;
  signers: { email: string; status: string; signed_at: string | null }[];
}

// Estado del documento + firmantes.
export async function getDocumentStatus(documentId: string): Promise<SignNowStatus> {
  ensureToken();
  const r = await fetch(`${BASE}/document/${documentId}`, { headers: authHeaders() });
  const data = await r.json();
  if (!r.ok) throw new Error(`signnow status ${r.status}: ${JSON.stringify(data).slice(0, 200)}`);
  // free-form → requests[] (sin status:fulfilled); field invites → field_invites[].
  const fieldInvites: any[] = data.field_invites ?? [];
  const requests: any[] = data.requests ?? [];
  const signatures: any[] = data.signatures ?? [];
  const signedEmails = new Set(signatures.map((s) => (s.email ?? s.user_id ?? '').toLowerCase()));

  let signers: { email: string; status: string; signed_at: string | null }[];
  let fully_signed: boolean;
  if (fieldInvites.length) {
    // Field invites traen status explícito.
    signers = fieldInvites.map((i) => ({ email: i.email, status: i.status, signed_at: i.status === 'fulfilled' ? new Date().toISOString() : null }));
    fully_signed = fieldInvites.every((i) => i.status === 'fulfilled');
  } else {
    // Free-form: cada request es un firmante; "firmado" = hay firmas que cubren los requests.
    signers = requests.map((i) => {
      const email = (i.signer_email ?? i.email ?? i.originator_email ?? '').toLowerCase();
      const done = signedEmails.has(email) || signatures.length > 0;
      return { email, status: done ? 'fulfilled' : 'pending', signed_at: done ? new Date().toISOString() : null };
    });
    fully_signed = requests.length > 0 ? signatures.length >= requests.length : signatures.length > 0;
  }
  return { id: data.id, name: data.document_name, fully_signed, signers };
}

// Descarga el PDF firmado (colapsado, con firmas).
export async function downloadSigned(documentId: string): Promise<Buffer> {
  ensureToken();
  const r = await fetch(`${BASE}/document/${documentId}/download?type=collapsed`, { headers: authHeaders() });
  if (!r.ok) throw new Error(`signnow download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Registra un webhook document.complete para ESTE documento (per-document event
// subscription; SignNow no soporta account-wide con este token). callbackUrl
// debe incluir el secret en query. Best-effort: si falla, queda el polling.
export async function subscribeDocumentComplete(documentId: string, callbackUrl: string): Promise<boolean> {
  ensureToken();
  const r = await fetch(`${BASE}/api/v2/events`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ event: 'document.complete', entity_id: documentId, action: 'callback', attributes: { callback: callbackUrl, use_tls_12: true } }),
  });
  if (r.ok || r.status === 201) return true;
  console.warn('[signnow] subscribe document.complete falló', r.status, (await r.text()).slice(0, 150));
  return false;
}

export async function deleteDocument(documentId: string): Promise<void> {
  ensureToken();
  await fetch(`${BASE}/document/${documentId}`, { method: 'DELETE', headers: authHeaders() });
}

// Cuenta asociada al token (para validar config).
export async function getAccount(): Promise<{ email: string; active: boolean } | null> {
  if (!TOKEN) return null;
  const r = await fetch(`${BASE}/user`, { headers: authHeaders() });
  if (!r.ok) return null;
  const d = await r.json();
  return { email: d.primary_email ?? d.email, active: !!d.active };
}
