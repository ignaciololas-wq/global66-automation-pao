// E2E pilot runner. Simula 1 contrato pasando por todo el server.
// Requiere server corriendo (npm run mock). Útil para validar pipeline completo.
//
// Uso: node src/run_pilot.js [--server http://localhost:3000] [--sancionado]

const args = process.argv.slice(2);
const SERVER = args.includes('--server') ? args[args.indexOf('--server') + 1] : 'http://localhost:3000';
const SANCIONADO = args.includes('--sancionado');

const log = (step, data) => {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${step}`);
  if (data) console.log('  ' + JSON.stringify(data).slice(0, 200));
};

async function post(path, body) {
  const r = await fetch(`${SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${txt}`);
  return data;
}

async function main() {
  log('Health check');
  const health = await fetch(`${SERVER}/health`).then(r => r.json());
  if (!health.ok) throw new Error('Server unhealthy');

  const formResponse = {
    id: `pilot-${Date.now()}`,
    owner_email: 'piloto@global66.com',
    submitted_at: new Date().toISOString(),
    razon_social: SANCIONADO ? 'Empresa sancionado SA' : 'ACME Servicios SpA',
    rut: `pilot-rut-${Date.now()}`,
    pais: 'CL',
    tipo_proveedor: 'Servicios profesionales',
    nivel_acceso: 'PII no sensible',
    criticidad: 'Media',
    tipo_contrato: 'servicios',
    monto: 12000,
    moneda: 'USD',
    vigencia: 12,
    email_contacto: 'contacto@acme.cl',
    email_facturacion: 'billing@acme.cl',
    adhesion: 'No',
    justificacion: 'Servicios de prueba para piloto',
    link_drive: 'https://drive.google.com/file/d/mockpdf',
    responsable_backup: 'backup@global66.com',
  };

  log('1. POST /form-webhook', { tax_id: formResponse.rut });
  const { run_id } = await post('/form-webhook', formResponse);
  log('   run_id', { run_id });

  log('2. POST /extract');
  const pdfBase64 = Buffer.from('FAKE PDF CONTENT').toString('base64');
  const extracted = await post('/extract', { run_id, pdf_base64: pdfBase64, pdf_url: formResponse.link_drive });
  log('   extracted.tipo_contrato', { v: extracted.tipo_contrato, riesgos: extracted.riesgos_detectados?.length });

  log('3. POST /sanctions');
  const sanctions = await post('/sanctions', { run_id, razon_social: formResponse.razon_social, tax_id: formResponse.rut, pais: formResponse.pais });
  log('   hit', { hit: sanctions.hit, matches: sanctions.matches?.length });

  log('4. Simulate Slack approvals (3 teams)');
  for (const team of ['compliance', 'legal', 'admin']) {
    // Acceso directo a Supabase via server no expuesto; usamos endpoint hito1 indirecto.
    // En real: cada team hace click → /slack-callback registra approval.
    // Aquí marcamos directo via /test-approve si existe, o vía Supabase (skip por mock).
    log(`   ${team} → approved (simulado)`);
  }

  log('5. POST /hito1-semaforo (sin approvals reales → solo computa lógica)');
  const semaforo = await post('/hito1-semaforo', {
    run_id,
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
    sanctions,
    extraction: extracted,
  });
  log('   color', { color: semaforo.color, reason: semaforo.reason });

  log('6. GET /run');
  const run = await fetch(`${SERVER}/run?id=${run_id}`).then(r => r.json());
  log('   estado actual', { phase: run.current_phase, semaforo: run.semaforo });

  console.log('\n✅ Pilot completado.');
  console.log(`   run_id: ${run_id}`);
  console.log(`   semaforo: ${semaforo.color}`);
  console.log(`   phase: ${run.current_phase}`);
  console.log(`   Supabase: SELECT * FROM workflow_runs WHERE id='${run_id}';`);
}

main().catch((e) => {
  console.error('\n❌ Pilot FAILED');
  console.error(e.message);
  process.exit(1);
});
