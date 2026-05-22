// Importa workflows a n8n cloud vía REST API.
// Uso: node scripts/import_n8n.js

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.N8N_BASE_URL ?? 'https://c204.app.n8n.cloud';
const KEY = process.env.N8N_API_KEY;

if (!KEY) {
  console.error('Missing N8N_API_KEY in .env');
  process.exit(1);
}

const headers = {
  'X-N8N-API-KEY': KEY,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

async function listWorkflows() {
  const r = await fetch(`${BASE}/api/v1/workflows?limit=100`, { headers });
  if (!r.ok) throw new Error(`list failed ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return d.data ?? [];
}

async function createWorkflow(spec) {
  // n8n API requires: name, nodes, connections, settings. Strips top-level fields it doesn't accept.
  const payload = {
    name: spec.name,
    nodes: spec.nodes,
    connections: spec.connections,
    settings: spec.settings ?? { executionOrder: 'v1' },
  };
  const r = await fetch(`${BASE}/api/v1/workflows`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`create failed ${r.status}: ${txt.slice(0, 400)}`);
  return JSON.parse(txt);
}

const dir = path.resolve('n8n');
const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json'));

console.log(`n8n: ${BASE}`);
console.log(`Found ${files.length} workflow files:\n`);

const existing = await listWorkflows();
const existingNames = new Set(existing.map((w) => w.name));
console.log(`Existing workflows in n8n: ${existing.length}`);
if (existing.length) existing.forEach((w) => console.log(`  - [${w.id}] ${w.name} (active: ${w.active})`));
console.log();

for (const file of files) {
  const raw = await fs.readFile(path.join(dir, file), 'utf-8');
  const spec = JSON.parse(raw);
  const name = spec.name ?? file;

  if (existingNames.has(name)) {
    console.log(`⏭  Skip ${file} (already exists: "${name}")`);
    continue;
  }

  try {
    const created = await createWorkflow(spec);
    console.log(`✅ ${file} → id=${created.id}  name="${created.name}"`);
  } catch (e) {
    console.error(`❌ ${file}: ${e.message}`);
  }
}

console.log('\nDone.');
