// Fase 2 — Docs proveedor + Drive.
// Crea carpeta por proveedor en Drive, valida checklist país.

import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CHECKLISTS = JSON.parse(
  await fs.readFile(path.resolve(__dirname, '../checklists/docs_por_pais.json'), 'utf-8'),
);

function authClient() {
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
}

export async function createSupplierFolder(supplier) {
  const auth = authClient();
  const drive = google.drive({ version: 'v3', auth });
  const safe = supplier.razon_social.replace(/[^\w\s-]/g, '').trim();
  const name = `${safe} — ${supplier.tax_id}`;

  const { data } = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [process.env.GOOGLE_DRIVE_ROOT_FOLDER],
    },
    fields: 'id, webViewLink',
  });
  return { id: data.id, url: data.webViewLink };
}

export function getRequiredDocs(countryCode) {
  return CHECKLISTS[countryCode] ?? null;
}

export function validateChecklist(countryCode, uploadedDocs) {
  const cfg = CHECKLISTS[countryCode];
  if (!cfg) return { valid: false, missing: [], unknown_country: true };

  const uploaded = new Set(uploadedDocs.map((d) => d.id));
  const missing = cfg.required.filter((req) => !uploaded.has(req.id));

  const now = Date.now();
  const expired = uploadedDocs.filter((d) => {
    const req = cfg.required.find((r) => r.id === d.id);
    if (!req?.valid_months) return false;
    const issued = new Date(d.issued_at).getTime();
    return now - issued > req.valid_months * 30 * 24 * 3600 * 1000;
  });

  return {
    valid: missing.length === 0 && expired.length === 0,
    missing: missing.map((m) => m.name),
    expired: expired.map((e) => e.id),
  };
}

export async function listFolderFiles(folderId) {
  const auth = authClient();
  const drive = google.drive({ version: 'v3', auth });
  const { data } = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, createdTime, webViewLink)',
  });
  return data.files;
}
