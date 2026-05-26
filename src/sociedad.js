// Catálogo de sociedades + helpers para checklist por sociedad.

import fs from 'node:fs/promises';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CHECKLISTS = JSON.parse(
  await fs.readFile(path.resolve(__dirname, '../checklists/docs_por_sociedad.json'), 'utf-8'),
);

export const SOCIEDADES = Object.keys(CHECKLISTS);

export function getDocsForSociedad(sociedad) {
  return CHECKLISTS[sociedad] ?? null;
}

export function getRequiredDocIds(sociedad) {
  const cfg = CHECKLISTS[sociedad];
  if (!cfg) return [];
  return [
    ...cfg.base_docs.filter((d) => d.required).map((d) => d.id),
    ...cfg.documents_to_sign.map((d) => d.id),
  ];
}

export function validateUploads(sociedad, uploadedDocIds) {
  const cfg = CHECKLISTS[sociedad];
  if (!cfg) return { valid: false, missing: [], unknown_sociedad: true };
  const uploaded = new Set(uploadedDocIds);
  const allRequired = [
    ...cfg.base_docs.filter((d) => d.required),
    ...cfg.documents_to_sign,
  ];
  const missing = allRequired.filter((d) => !uploaded.has(d.id));
  return {
    valid: missing.length === 0,
    missing: missing.map((d) => ({ id: d.id, name: d.name })),
    sociedad: cfg.name,
    country: cfg.country,
  };
}

// Asignación sociedad automática (placeholder hasta que lleguen las reglas).
// Cuando lleguen, esto pasa a leer una tabla / config.
export function suggestSociedad({ pais }) {
  if (pais === 'Chile') return 'Global 81 SpA (Chile)';
  if (pais === 'Colombia') return 'Global Colombia 81 (Colombia)';
  if (pais === 'Panamá' || pais === 'Panama') return '100X (Panamá)';
  return null;
}
