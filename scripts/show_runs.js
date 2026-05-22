// Muestra runs recientes desde Supabase.
// Uso: node scripts/show_runs.js [limit]

import 'dotenv/config';
import { sb, getApprovals } from '../src/supabase_audit.js';

const limit = Number(process.argv[2] ?? 10);

const { data: runs, error } = await sb
  .from('workflow_runs')
  .select('id, razon_social, tax_id, pais, current_phase, semaforo, monto, moneda, created_at')
  .order('created_at', { ascending: false })
  .limit(limit);

if (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

if (runs.length === 0) {
  console.log('No hay runs todavía.');
  process.exit(0);
}

const fase = { fase1: '📋', hito1: '⏳', fase2: '📁', fase3: '✍️', signed: '✅', rejected: '❌', cancelled: '🚫' };
const sem = { green: '🟢', yellow: '🟡', red: '🔴' };

console.log(`\nÚltimas ${runs.length} corridas:\n`);
for (const r of runs) {
  const when = r.created_at.slice(0, 19).replace('T', ' ');
  console.log(`${fase[r.current_phase] ?? '❓'} ${sem[r.semaforo] ?? '⚪'}  ${r.razon_social}`);
  console.log(`   ${r.tax_id}  ${r.pais}  ${r.monto ?? '-'} ${r.moneda ?? ''}  ${when}`);
  console.log(`   id: ${r.id}  phase: ${r.current_phase}`);
  console.log();
}

const { data: counts } = await sb
  .from('v_runs_by_phase')
  .select('*');

if (counts) {
  console.log('Resumen por fase:');
  for (const c of counts) {
    console.log(`   ${c.current_phase}: ${c.total}  (🟢${c.green} 🟡${c.yellow} 🔴${c.red})`);
  }
}
