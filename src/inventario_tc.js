// Inventario suscripciones TC + dashboard básico.
// Lee movimientos TC (CSV o API), detecta recurrentes, sugiere consolidación.

import fs from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY });
// flash es suficiente para análisis transaccional (más barato).
const MODEL = process.env.GEMINI_MODEL_FLASH ?? 'gemini-2.5-flash';

const SYSTEM = `Sos analista financiero. Recibís transacciones de tarjeta corporativa y detectás:
1. Suscripciones recurrentes (≥3 cargos similares mismo merchant/monto en 6 meses).
2. Duplicados (mismo merchant en múltiples TCs).
3. Anomalías de monto.
4. Categoría sugerida.

Devolvés solo JSON.`;

const USER_TEMPLATE = `Analizá estas transacciones (CSV-like):

{{TRANSACTIONS}}

Devolvé JSON:
{
  "subscriptions": [
    {
      "merchant": "string",
      "monthly_amount_avg": "number",
      "currency": "string",
      "frequency": "monthly|annual|other",
      "first_seen": "YYYY-MM-DD",
      "last_seen": "YYYY-MM-DD",
      "count": "number",
      "category": "string",
      "duplicate_cards": ["last4"],
      "consolidation_suggestion": "string|null"
    }
  ],
  "total_monthly_subscriptions_usd": "number",
  "anomalies": [
    {"merchant": "string", "amount": "number", "reason": "string"}
  ]
}`;

export async function analyzeTransactions(transactions) {
  const csv = transactions
    .map((t) => `${t.date},${t.merchant},${t.amount},${t.currency},${t.card_last4}`)
    .join('\n');

  const resp = await ai.models.generateContent({
    model: MODEL,
    contents: USER_TEMPLATE.replace('{{TRANSACTIONS}}', csv),
    config: {
      systemInstruction: SYSTEM,
      maxOutputTokens: 8000,
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  });

  const raw = (resp.text ?? '').trim();
  return JSON.parse(raw.replace(/^```json\n?/, '').replace(/\n?```$/, ''));
}

export function renderDashboard(analysis) {
  const lines = [
    `# Dashboard Suscripciones TC — ${new Date().toISOString().slice(0, 10)}`,
    '',
    `**Gasto mensual total (USD):** $${analysis.total_monthly_subscriptions_usd.toFixed(2)}`,
    `**Suscripciones activas:** ${analysis.subscriptions.length}`,
    '',
    '## Top 10 por gasto',
    '',
    '| Merchant | $/mes | Moneda | Cat | Cards | Sugerencia |',
    '|----------|-------|--------|-----|-------|------------|',
    ...analysis.subscriptions
      .slice()
      .sort((a, b) => b.monthly_amount_avg - a.monthly_amount_avg)
      .slice(0, 10)
      .map(
        (s) =>
          `| ${s.merchant} | ${s.monthly_amount_avg} | ${s.currency} | ${s.category} | ${s.duplicate_cards.join(', ')} | ${s.consolidation_suggestion ?? '—'} |`,
      ),
    '',
    '## Anomalías',
    '',
    ...analysis.anomalies.map((a) => `- **${a.merchant}** $${a.amount} — ${a.reason}`),
  ];
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node src/inventario_tc.js <transactions.csv>');
    process.exit(1);
  }
  const raw = await fs.readFile(csvPath, 'utf-8');
  const txs = raw
    .split('\n')
    .filter((l) => l.trim())
    .slice(1)
    .map((l) => {
      const [date, merchant, amount, currency, card_last4] = l.split(',');
      return { date, merchant, amount: Number(amount), currency, card_last4 };
    });
  const analysis = await analyzeTransactions(txs);
  console.log(renderDashboard(analysis));
}
