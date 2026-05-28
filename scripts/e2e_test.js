// E2E test script — simula todo el flujo programáticamente.
// Uso: node --env-file=.env scripts/e2e_test.js
//
// Requiere:
//  - Server corriendo en localhost:3000 (npm run dev)
//  - MOCK_MODE=true (skips real Slack/mail/SignNow)
//  - AUTH_ENABLED=false (bypass admin auth)

const SERVER = 'http://localhost:3000';
const TS = Date.now();

const log = (step, data) => {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`\n[${t}] ${step}`);
  if (data) console.log('  →', typeof data === 'string' ? data.slice(0, 250) : JSON.stringify(data).slice(0, 250));
};

async function call(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SERVER}${path}`, opts);
  const txt = await r.text();
  let data; try { data = JSON.parse(txt); } catch { data = txt; }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}: ${txt}`);
  return data;
}

// Acceso directo Supabase (saltea auth proxy). Requiere SUPABASE_URL + SERVICE_ROLE_KEY en env.
async function db(query) {
  const [table, ...rest] = query.split('&');
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}?${rest.join('&')}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`db ${query}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  log('STEP 0: health');
  const h = await fetch(`${SERVER}/health`).then(r => r.json());
  if (!h.ok) throw new Error('server down');

  log('STEP 1: POST /api/intake (crear solicitud)');
  const intake = {
    id: `e2e-${TS}`,
    razon_social: `E2E Test ${TS}`,
    rut: `76-${TS}-0`,
    pais: 'Chile',
    tipo_proveedor: 'servicios',
    nivel_acceso: 'PII no sensible',
    criticidad: 'Media',
    tipo_contrato: 'servicios',
    monto: 5000,
    moneda: 'USD',
    vigencia: 12,
    email_contacto: `proveedor.e2e+${TS}@global66.test`,
    email_facturacion: `billing.e2e+${TS}@global66.test`,
    representante_legal: 'Pedro Test',
    servicio_descripcion: 'Test E2E automatizado',
    solicitante_email: 'julio.lolas@global66.com',
    solicitante_nombre: 'Julio (E2E)',
    owner_email: 'julio.lolas@global66.com',
    justificacion: 'E2E test run',
  };
  const intakeResp = await call('POST', '/api/intake', intake);
  log('   intake creada', intakeResp);
  const runId = intakeResp.run_id;
  const providerId = intakeResp.provider_id;

  log('STEP 2: POST /api/intake/approve (aprobar intake)');
  const approveResp = await call('POST', '/api/intake/approve', {
    run_id: runId,
    decision: 'approved',
    sociedad_contratante: intakeResp.sociedad_sugerida || 'Global 81 SpA (Chile)',
    approver_email: 'julio.lolas@global66.com',
    comment: 'Aprobado en E2E test',
  });
  log('   intake approved', approveResp);

  log('STEP 3: verificar workflow_runs en DB');
  await new Promise(r => setTimeout(r, 800));
  const runsRows = await db(`workflow_runs&id=eq.${runId}`);
  const run = runsRows[0];
  log('   estado post-approve', {
    current_phase: run.current_phase,
    active_phases: run.active_phases,
    internal_approval_status: run.internal_approval_status,
    provider_data_completed_at: run.provider_data_completed_at,
    internal_approvals_completed_at: run.internal_approvals_completed_at,
  });

  if (run.current_phase !== 'parallel') throw new Error(`expected current_phase=parallel, got ${run.current_phase}`);
  if (!Array.isArray(run.active_phases) || run.active_phases.length !== 2) {
    throw new Error(`expected 2 active_phases, got ${JSON.stringify(run.active_phases)}`);
  }

  log('STEP 4: obtener public_token del proveedor');
  const provRows = await db(`providers&id=eq.${providerId}`);
  const provider = provRows[0];
  const token = provider.public_token;

  log('STEP 5: POST /api/provider/fill (simular proveedor llenó form)');
  const fillResp = await call('POST', '/api/provider/fill', {
    token,
    by_email: provider.email_contacto,
    profile_data: {
      domicilio: 'Av. Test 123, Santiago',
      website: 'https://acme.cl',
      representante_legal: 'Pedro Test Modificado',
      representante_doc: '12345678-9',
      representante_email: 'pedro@acme.cl',
      representante_tel: '+56912345678',
      contacto_comercial_nombre: 'Maria Comercial',
      contacto_comercial_email: 'maria@acme.cl',
      contacto_comercial_tel: '+56987654321',
      email_facturacion: 'billing@acme.cl',
      datos_bancarios: 'Banco Test\nCta corriente 12345',
      certificaciones: 'ISO 27001',
      anticorrupcion: 'si',
      // Campos intake editables (PR-D)
      razon_social: `E2E Test ${TS} CORREGIDO`,
      tax_id: `76-${TS}-0`,
      pais: 'Chile',
      tipo_proveedor: 'servicios',
    },
  });
  log('   provider filled', fillResp);

  log('STEP 6: verificar branch proveedor cerrado');
  await new Promise(r => setTimeout(r, 800));
  const r6 = (await db(`workflow_runs&id=eq.${runId}`))[0];
  log('   estado post-fill', {
    current_phase: r6.current_phase,
    active_phases: r6.active_phases,
    provider_data_completed_at: r6.provider_data_completed_at,
    internal_approvals_completed_at: r6.internal_approvals_completed_at,
  });

  if (!r6.provider_data_completed_at) throw new Error('provider_data_completed_at no se seteó');

  log('STEP 7: POST /hito1-semaforo (simular 3 aprobaciones internas GREEN)');
  const sem = await call('POST', '/hito1-semaforo', {
    run_id: runId,
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
  });
  log('   semaforo', sem);

  log('STEP 8: verificar branch aprobaciones cerrado + advance a fase3');
  await new Promise(r => setTimeout(r, 800));
  const r8 = (await db(`workflow_runs&id=eq.${runId}`))[0];
  log('   estado final', {
    current_phase: r8.current_phase,
    active_phases: r8.active_phases,
    provider_data_completed_at: r8.provider_data_completed_at,
    internal_approvals_completed_at: r8.internal_approvals_completed_at,
    semaforo: r8.semaforo,
  });

  if (r8.current_phase !== 'fase3') throw new Error(`expected current_phase=fase3, got ${r8.current_phase}`);
  if (!r8.internal_approvals_completed_at) throw new Error('internal_approvals_completed_at no se seteó');

  log('STEP 9: RegCheq check (mock)');
  const rcq = await call('POST', '/regcheq', {
    run_id: runId,
    provider_id: providerId,
    supplier: { razon_social: intake.razon_social, tax_id: intake.rut, pais: intake.pais, email_contacto: intake.email_contacto },
    relations: [{ dni: '12345678-9', name: 'Pedro Test', type: 'representant' }],
  });
  log('   regcheq', rcq);

  log('STEP 10: audit log');
  const auds = await db(`audit_log&workflow_run_id=eq.${runId}&order=created_at.asc`);
  log(`   ${auds.length} events`);
  for (const a of auds) console.log(`     · ${a.action} by ${a.actor}`);

  console.log('\n\n✅ E2E TEST PASSED');
  console.log(`   run_id: ${runId}`);
  console.log(`   provider_id: ${providerId}`);
  console.log(`   final_phase: ${r8.current_phase}`);
  console.log(`   regcheq_decision: ${rcq.decision}`);
}

main().catch((e) => {
  console.error('\n\n❌ E2E TEST FAILED');
  console.error(e.message);
  process.exit(1);
});
