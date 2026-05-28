// Fallback offline OFAC SDN list.
// Descarga lista pública: https://www.treasury.gov/ofac/downloads/sdn.csv
// Cache local en data/ofac_sdn.csv (refresh semanal).

import fs from 'node:fs/promises';
import path from 'node:path';
import axios from 'axios';
import { retry } from './retry.js';

const URL = 'https://www.treasury.gov/ofac/downloads/sdn.csv';
const CACHE = path.resolve('data/ofac_sdn.csv');
const MAX_AGE_MS = 7 * 24 * 3600 * 1000; // 7 días

let names = null;
let lastLoad = 0;

async function ensureCache() {
  let needsDownload = true;
  try {
    const stat = await fs.stat(CACHE);
    if (Date.now() - stat.mtimeMs < MAX_AGE_MS) needsDownload = false;
  } catch {}

  if (needsDownload) {
    await fs.mkdir(path.dirname(CACHE), { recursive: true });
    const resp = await retry(() => axios.get(URL, { timeout: 30_000, responseType: 'text' }));
    await fs.writeFile(CACHE, resp.data, 'utf-8');
  }
}

async function loadNames() {
  if (names && Date.now() - lastLoad < MAX_AGE_MS) return names;
  await ensureCache();
  const csv = await fs.readFile(CACHE, 'utf-8');
  names = csv
    .split('\n')
    .map((l) => {
      const cols = l.split(',');
      return cols[1]?.replace(/^"|"$/g, '').toLowerCase().trim();
    })
    .filter(Boolean);
  lastLoad = Date.now();
  return names;
}

function normalize(s) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

export async function checkOfacOffline({ razon_social }) {
  if (!razon_social) return { hit: false, matches: [] };
  const target = normalize(razon_social);
  const list = await loadNames();
  const hits = list.filter((n) => {
    const norm = normalize(n);
    if (norm === target) return true;
    if (norm.length >= 5 && target.includes(norm)) return true;
    if (target.length >= 5 && norm.includes(target)) return true;
    return false;
  });
  return {
    hit: hits.length > 0,
    matches: hits.slice(0, 5).map((n) => ({ caption: n, source: 'OFAC-SDN-offline', score: 0.95 })),
  };
}
