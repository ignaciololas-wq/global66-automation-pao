// Email digest diario. Resumen de runs últimas 24h + alertas próximas.
// Uso vía endpoint /digest (n8n cron) o `node src/digest.js`.

import { sb } from './supabase_audit.js';
import { listExpiringContracts } from './finnecto.js';

export async function buildDigest() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const [
    { data: newRuns },
    { data: completed },
    { data: rejected },
    { data: phases },
    { data: pendingApprovals },
  ] = await Promise.all([
    sb.from('workflow_runs').select('id, razon_social, tax_id, current_phase').gte('created_at', since),
    sb.from('workflow_runs').select('id, razon_social').eq('current_phase', 'signed').gte('updated_at', since),
    sb.from('workflow_runs').select('id, razon_social, metadata').eq('current_phase', 'rejected').gte('updated_at', since),
    sb.from('v_runs_by_phase').select('*'),
    sb.from('workflow_runs').select('id, razon_social, created_at').eq('current_phase', 'fase1').order('created_at'),
  ]);

  let expiring = [];
  try {
    expiring = await listExpiringContracts(30);
  } catch {}

  const html = renderHtml({
    newRuns: newRuns ?? [],
    completed: completed ?? [],
    rejected: rejected ?? [],
    phases: phases ?? [],
    pendingApprovals: pendingApprovals ?? [],
    expiring: expiring ?? [],
  });

  return { html, text: htmlToText(html) };
}

function renderHtml({ newRuns, completed, rejected, phases, pendingApprovals, expiring }) {
  const row = (l, v) => `<tr><td style="padding:4px 12px">${l}</td><td style="padding:4px 12px"><b>${v}</b></td></tr>`;

  const phasesTable = phases
    .map((p) => `<tr><td>${p.current_phase}</td><td>${p.total}</td><td>🟢${p.green}</td><td>🟡${p.yellow}</td><td>🔴${p.red}</td></tr>`)
    .join('');

  const pendingList = pendingApprovals
    .map((p) => `<li>${p.razon_social} <span style="color:#888">— hace ${hoursAgo(p.created_at)}h</span></li>`)
    .join('');

  const expList = expiring
    .slice(0, 10)
    .map((c) => `<li>${c.supplier_name ?? c.provider_name ?? c.id} — vence ${c.end_date ?? c.expires_at}</li>`)
    .join('');

  return `<!doctype html><html><body style="font-family:system-ui,Arial;color:#222">
  <h2>📊 Digest Pao P2 — ${new Date().toISOString().slice(0, 10)}</h2>

  <h3>Últimas 24h</h3>
  <table style="border-collapse:collapse">
    ${row('Nuevas solicitudes', newRuns.length)}
    ${row('Contratos firmados', completed.length)}
    ${row('Rechazados', rejected.length)}
  </table>

  <h3>Estado actual</h3>
  <table style="border-collapse:collapse;border:1px solid #ddd">
    <tr style="background:#f5f5f5"><th>Fase</th><th>Total</th><th>Verde</th><th>Amarillo</th><th>Rojo</th></tr>
    ${phasesTable}
  </table>

  <h3>⏳ Pendientes en Fase 1 (esperando 3 aprobaciones)</h3>
  <ul>${pendingList || '<li>(ninguno)</li>'}</ul>

  <h3>⚠️ Vencen en 30 días</h3>
  <ul>${expList || '<li>(ninguno)</li>'}</ul>

  <hr>
  <p style="color:#888;font-size:12px">Generado automáticamente. Ver detalle en Supabase o Notion.</p>
  </body></html>`;
}

function htmlToText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function hoursAgo(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3600_000);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { text, html } = await buildDigest();
  console.log(text);
  if (process.argv[2] === '--html') console.log('\n---HTML---\n' + html);
}
