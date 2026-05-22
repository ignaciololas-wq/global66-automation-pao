// Notion reporter — actualiza página Notion con stats de Supabase.
// Uso: node src/notion_reporter.js [page_id]
// Default page: 3615d642-6290-8173-928c-da51c50ae73f (P2 Alta contratos)

import { sb } from './supabase_audit.js';

const NOTION_TOKEN = process.env.NOTION_API_KEY;
const PAGE_ID = process.argv[2] ?? process.env.NOTION_REPORT_PAGE ?? '3615d642-6290-8173-928c-da51c50ae73f';

if (!NOTION_TOKEN) {
  console.error('Missing NOTION_API_KEY in .env');
  console.error('Generar en https://www.notion.so/profile/integrations → New integration → copy token');
  console.error('Después compartir la página con la integración: page → ··· → Connections → Add → tu integration');
  process.exit(1);
}

async function notion(method, path, body) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`https://api.notion.com/v1${path}`, opts);
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${await r.text()}`);
  return r.json();
}

async function buildReport() {
  const [phases, approvalTimes, extractionCosts, sanctionsHits, lastRuns] = await Promise.all([
    sb.from('v_runs_by_phase').select('*'),
    sb.from('v_avg_approval_time').select('*'),
    sb.from('v_extraction_costs').select('*').limit(7),
    sb.from('v_sanctions_hits').select('*').limit(4),
    sb.from('workflow_runs').select('razon_social, tax_id, current_phase, semaforo, created_at').order('created_at', { ascending: false }).limit(5),
  ]);

  const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const lines = [
    `📊 Dashboard automatizado — actualizado ${ts} UTC`,
    '',
    'Runs por fase:',
    ...(phases.data ?? []).map((r) => `  ${r.current_phase}: ${r.total} (🟢${r.green} 🟡${r.yellow} 🔴${r.red})`),
    '',
    'Tiempo aprobación por equipo:',
    ...(approvalTimes.data ?? []).map((r) => `  ${r.team}: ${r.avg_hours_to_decide}h promedio (${r.approved}/${r.total_decisions} aprobados)`),
    '',
    'Costo Gemini últimos 7 días:',
    ...(extractionCosts.data ?? []).map((r) => `  ${r.day}: $${r.cost_usd_total} (${r.extractions} extracciones, ${r.model})`),
    '',
    'Hits sanciones últimas 4 semanas:',
    ...(sanctionsHits.data ?? []).map((r) => `  ${r.week}: ${r.hits}/${r.checks} (${r.hit_pct}%)`),
    '',
    'Últimas 5 corridas:',
    ...(lastRuns.data ?? []).map((r) => `  ${r.razon_social} (${r.tax_id}) → ${r.current_phase} ${r.semaforo ?? ''} ${r.created_at.slice(0, 10)}`),
  ];

  return lines.join('\n');
}

async function findOrCreateReportBlock(pageId) {
  const children = await notion('GET', `/blocks/${pageId}/children?page_size=100`);
  const existing = (children.results ?? []).find(
    (b) => b.type === 'callout' && b.callout?.rich_text?.[0]?.plain_text?.startsWith('📊 Dashboard automatizado'),
  );
  return existing?.id;
}

async function main() {
  const text = await buildReport();
  console.log(text);

  const existingId = await findOrCreateReportBlock(PAGE_ID);
  const blockBody = {
    callout: {
      icon: { type: 'emoji', emoji: '📊' },
      rich_text: [{ type: 'text', text: { content: text } }],
      color: 'blue_background',
    },
  };

  if (existingId) {
    await notion('PATCH', `/blocks/${existingId}`, blockBody);
    console.log(`\n✓ Updated existing block ${existingId}`);
  } else {
    await notion('PATCH', `/blocks/${PAGE_ID}/children`, {
      children: [{ object: 'block', type: 'callout', ...blockBody }],
    });
    console.log('\n✓ Created new dashboard block');
  }
}

main().catch((e) => {
  console.error('Reporter failed:', e.message);
  process.exit(1);
});
