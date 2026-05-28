// Extracción de campos contrato vía Gemini API + cache Supabase por hash PDF.

import { GoogleGenAI } from '@google/genai';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { findExtractionByHash, recordExtraction } from './supabase_audit.js';
import { MOCK, mockClaudeExtraction as mockExtraction } from './mock_mode.js';
import { retry } from './retry.js';

const API_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-2.5-pro';

const ai = MOCK ? null : new GoogleGenAI({ apiKey: API_KEY });

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// Resolver path relativo al archivo (funciona en Vercel + local).
const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const SYSTEM_FILE = await fs.readFile(
  path.resolve(__dirname, '../prompts/extraccion_contrato.md'),
  'utf-8',
);

const SYSTEM = SYSTEM_FILE.split('## System')[1].split('## User (template)')[0].trim();
const USER_TEMPLATE = SYSTEM_FILE.split('## User (template)')[1];

export async function extractFromPdfBuffer(pdfBuffer, { runId, pdfUrl, useCache = true } = {}) {
  if (MOCK) return { ...mockExtraction(), _mock: true };

  const pdfHash = hashBuffer(pdfBuffer);

  if (useCache) {
    const cached = await findExtractionByHash(pdfHash).catch(() => null);
    if (cached) return { ...cached.extracted_json, _cached: true, _extraction_id: cached.id };
  }

  const parsed = await pdfParse(pdfBuffer);
  const result = await extractFromText(parsed.text);

  if (runId !== undefined) {
    const rec = await recordExtraction({
      runId,
      pdfHash,
      pdfUrl,
      model: MODEL,
      json: result.json,
      tokensIn: result.usage.input_tokens,
      tokensOut: result.usage.output_tokens,
      costUsd: estimateCost(result.usage),
    }).catch((e) => { console.error('recordExtraction failed', e); return null; });
    return { ...result.json, _cached: false, _extraction_id: rec?.id };
  }
  return result.json;
}

function estimateCost(usage) {
  // gemini-2.5-pro: $1.25/1M in, $5/1M out (aprox).
  // gemini-2.5-flash: $0.075/1M in, $0.30/1M out.
  const isPro = MODEL.includes('pro');
  const inRate = isPro ? 0.00000125 : 0.000000075;
  const outRate = isPro ? 0.000005 : 0.0000003;
  return Number(((usage.input_tokens ?? 0) * inRate + (usage.output_tokens ?? 0) * outRate).toFixed(6));
}

export async function extractFromText(text) {
  const userPrompt = USER_TEMPLATE.replace('{{CONTRATO_PDF_TEXT}}', text.slice(0, 900_000));

  const resp = await retry(() => ai.models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: SYSTEM,
      maxOutputTokens: 8000,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  }), { retries: 3, minDelay: 1000 });

  const raw = (resp.text ?? '').trim();
  const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '');

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Gemini returned invalid JSON: ${e.message}\nRaw: ${raw.slice(0, 500)}`);
  }
  const u = resp.usageMetadata ?? {};
  return {
    json: parsed,
    usage: {
      input_tokens: u.promptTokenCount ?? 0,
      output_tokens: u.candidatesTokenCount ?? 0,
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node src/gemini_extract.js <path-to-pdf>');
    process.exit(1);
  }
  const buf = await fs.readFile(file);
  const out = await extractFromPdfBuffer(buf, { useCache: false });
  console.log(JSON.stringify(out, null, 2));
}
