// Lista negra + validación apoderados.
// Fuentes: OpenSanctions (OFAC/EU/UN/HMT consolidado) + IA validación poderes.

import axios from 'axios';
import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import path from 'node:path';
import { recordSanctionsCheck } from './supabase_audit.js';
import { MOCK, mockSanctions } from './mock_mode.js';

const OS_BASE = 'https://api.opensanctions.org';
const OS_KEY = process.env.OPENSANCTIONS_API_KEY;

const API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';
const ai = MOCK ? null : new GoogleGenAI({ apiKey: API_KEY });

export async function checkSanctions({ razon_social, tax_id, pais }) {
  if (MOCK) return mockSanctions({ razon_social, tax_id, pais });

  if (!OS_KEY) {
    const { checkOfacOffline } = await import('./ofac_offline.js');
    return checkOfacOffline({ razon_social });
  }

  const { data } = await axios.post(
    `${OS_BASE}/match/sanctions`,
    {
      queries: {
        q1: {
          schema: 'Organization',
          properties: {
            name: [razon_social],
            ...(tax_id ? { taxNumber: [tax_id] } : {}),
            ...(pais ? { country: [pais.toLowerCase().slice(0, 2)] } : {}),
          },
        },
      },
    },
    { headers: { Authorization: `ApiKey ${OS_KEY}` }, timeout: 10000 },
  );

  const hits = data?.responses?.q1?.results ?? [];
  const positives = hits.filter((h) => h.score >= 0.7);
  return {
    hit: positives.length > 0,
    matches: positives.map((h) => ({
      id: h.id,
      score: h.score,
      caption: h.caption,
      datasets: h.datasets,
      topics: h.topics,
    })),
  };
}

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const TEMPLATE = await fs.readFile(
  path.resolve(__dirname, '../prompts/validacion_apoderados.md'),
  'utf-8',
);

export async function validateRepresentatives({ razon_social, tax_id, pais, representantes, texto_poderes }) {
  const prompt = TEMPLATE.split('## User (template)')[1]
    .replace('{{razon_social}}', razon_social)
    .replace('{{tax_id}}', tax_id ?? 'N/A')
    .replace('{{pais}}', pais ?? 'N/A')
    .replace('{{representantes}}', representantes.map((r) => `- ${r.nombre} (${r.rut ?? 'sin RUT'})`).join('\n'))
    .replace('{{texto_poderes}}', texto_poderes.slice(0, 900_000));

  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: TEMPLATE.split('## System')[1].split('## User (template)')[0].trim(),
      maxOutputTokens: 4000,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const raw = (resp.text ?? '').trim();
  return JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));
}

export async function runFullCheck(supplier, representantes, textoPoderes, { runId } = {}) {
  const [sanctions, repValidation] = await Promise.all([
    checkSanctions(supplier),
    validateRepresentatives({ ...supplier, representantes, texto_poderes: textoPoderes }),
  ]);

  if (runId) await recordSanctionsCheck(runId, sanctions).catch((e) => console.error('record sanctions failed', e));

  const recommend =
    sanctions.hit
      ? 'rechazar'
      : repValidation.recomendacion;

  return {
    sanctions,
    representatives: repValidation,
    final_recommendation: recommend,
    timestamp: new Date().toISOString(),
  };
}
