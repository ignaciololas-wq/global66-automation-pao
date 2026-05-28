// Fase 3 — SignNow integración.
// OAuth password grant, envío contrato a firma, callback estado.

import axios from 'axios';

const BASE = 'https://api.signnow.com';

let cachedToken = null;
let tokenExpiry = 0;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken;

  const auth = Buffer.from(
    `${process.env.SIGNNOW_CLIENT_ID}:${process.env.SIGNNOW_CLIENT_SECRET}`,
  ).toString('base64');

  const { data } = await axios.post(
    `${BASE}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'password',
      username: process.env.SIGNNOW_USERNAME,
      password: process.env.SIGNNOW_PASSWORD,
      scope: '*',
    }),
    { headers: { Authorization: `Basic ${auth}` } },
  );

  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function api(method, url, body, extra = {}) {
  const token = await getToken();
  return axios({
    method,
    url: `${BASE}${url}`,
    data: body,
    headers: { Authorization: `Bearer ${token}` },
    ...extra,
  });
}

export async function uploadDocument(pdfBuffer, filename) {
  const token = await getToken();
  const form = new FormData();
  form.append('file', new Blob([pdfBuffer], { type: 'application/pdf' }), filename);

  const { data } = await axios.post(`${BASE}/document`, form, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data.id;
}

export async function createFromTemplate(templateId, fieldValues) {
  const { data } = await api('POST', `/template/${templateId}/copy`, {
    document_name: fieldValues.document_name,
  });
  const documentId = data.id;

  if (Object.keys(fieldValues.fields ?? {}).length > 0) {
    await api('PUT', `/document/${documentId}`, {
      fields: Object.entries(fieldValues.fields).map(([name, value]) => ({
        field_name: name,
        prefilled_text: String(value),
      })),
    });
  }
  return documentId;
}

export async function sendInvite(documentId, signers, redirectUrl) {
  const { data } = await api('POST', `/document/${documentId}/invite`, {
    to: signers.map((s, i) => ({
      email: s.email,
      role: s.role ?? 'Signer',
      role_id: s.role_id,
      order: i + 1,
      subject: `Firma — ${s.subject}`,
      message: s.message ?? 'Por favor firma el documento adjunto.',
    })),
    from: process.env.SIGNNOW_USERNAME,
    cc: [],
    subject: 'Contrato Global66 pendiente de firma',
    message: 'Recibís este contrato para firma electrónica.',
    redirect_uri: redirectUrl,
  });
  return data;
}

export async function getStatus(documentId) {
  const { data } = await api('GET', `/document/${documentId}`);
  return {
    id: data.id,
    name: data.document_name,
    signers: (data.field_invites ?? []).map((i) => ({
      email: i.email,
      status: i.status,
      signed_at: i.signed_timestamp ? new Date(i.signed_timestamp * 1000).toISOString() : null,
    })),
    fully_signed: (data.field_invites ?? []).every((i) => i.status === 'fulfilled'),
  };
}

export async function downloadSigned(documentId) {
  const { data } = await api('GET', `/document/${documentId}/download?type=collapsed`, null, {
    responseType: 'arraybuffer',
  });
  return Buffer.from(data);
}
