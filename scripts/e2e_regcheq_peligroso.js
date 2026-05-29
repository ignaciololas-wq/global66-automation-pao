// E2E dedicado — caso "empresa peligrosa" GREXSA COMERCIAL SPA.
// Usuario interno = proveedor = julio.lolas@global66.com (a pedido).
// Uso:
//   Terminal 1 (server mock):
//     cd legacy && MOCK_MODE=true AUTH_ENABLED=false node --env-file=../.env src/server.js
//   Terminal 2 (test):
//     SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_KEY node --env-file=.env scripts/e2e_regcheq_peligroso.js
//
// NOTA RegCheq: la API real de RegCheq NO entrega resultados para el key actual
// (POST /record → 500; async sin callback). Por eso STEP 9 corre en MOCK (approve).
// La verificación real de "empresa peligrosa" se hace por: (a) API arreglada por
// RegCheq, o (b) plan B manual (subir el PDF del reporte web + decisión manual).

const SERVER = process.env.SERVER_BASE ?? 'http://localhost:3000';
const TS = Date.now();

// ── Datos GREXSA (empresa que se quiere validar como peligrosa) ──────────────
const EMPRESA = {
  razon_social: 'GREXSA COMERCIAL SPA',
  rut: '78259067-7',
  rep_legal_nombre: 'LORNA ODETT JARA RIQUELME',
  rep_legal_rut: '12928516-8',
};
const MAIL = 'julio.lolas@global66.com';

const log = (step, data) => {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`\n[${t}] ${step}`);
  if (data) console.log('  →', typeof data === 'string' ? data.slice(0, 280) : JSON.stringify(data).slice(0, 280));
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

async function db(query) {
  const [table, ...rest] = query.split('&');
  const url = `${process.env.SUPABASE_URL}/rest/v1/${table}?${rest.join('&')}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
  const r = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`db ${query}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function main() {
  log('STEP 0: health');
  const h = await fetch(`${SERVER}/health`).then((r) => r.json());
  if (!h.ok) throw new Error('server down');

  log('STEP 1: POST /api/intake (usuario interno = julio.lolas, empresa GREXSA)');
  const intake = {
    id: `e2e-grexsa-${TS}`,
    razon_social: EMPRESA.razon_social,
    rut: EMPRESA.rut,
    pais: 'Chile',
    tipo_proveedor: 'servicios',
    nivel_acceso: 'PII no sensible',
    criticidad: 'Alta',
    tipo_contrato: 'servicios',
    monto: 5000,
    moneda: 'USD',
    vigencia: 12,
    email_contacto: MAIL,            // proveedor = mismo mail (a pedido)
    email_facturacion: MAIL,
    representante_legal: EMPRESA.rep_legal_nombre,
    servicio_descripcion: 'E2E caso peligroso GREXSA',
    solicitante_email: MAIL,          // usuario interno = mismo mail
    solicitante_nombre: 'Julio Lolas (E2E)',
    owner_email: MAIL,
    justificacion: 'Prueba E2E validación RegCheq empresa peligrosa',
  };
  const intakeResp = await call('POST', '/api/intake', intake);
  log('   intake creada', intakeResp);
  const runId = intakeResp.run_id;
  const providerId = intakeResp.provider_id;

  log('STEP 2: verificar arranque AUTOMÁTICO del paralelo');
  await new Promise((r) => setTimeout(r, 800));
  const run = (await db(`workflow_runs&id=eq.${runId}`))[0];
  log('   estado post-intake', {
    current_phase: run.current_phase,
    active_phases: run.active_phases,
    internal_approval_status: run.internal_approval_status,
  });
  if (run.current_phase !== 'parallel') throw new Error(`expected parallel, got ${run.current_phase}`);
  if (!Array.isArray(run.active_phases) || run.active_phases.length !== 2) {
    throw new Error(`expected 2 active_phases, got ${JSON.stringify(run.active_phases)}`);
  }

  log('STEP 4: obtener public_token del proveedor');
  const provider = (await db(`providers&id=eq.${providerId}`))[0];
  const token = provider.public_token;

  log('STEP 5: POST /api/provider/fill (proveedor GREXSA llena form)');
  const fillResp = await call('POST', '/api/provider/fill', {
    token,
    by_email: MAIL,
    profile_data: {
      domicilio: 'Av. Providencia 1234, Santiago',
      website: 'https://grexsa.cl',
      representante_legal: EMPRESA.rep_legal_nombre,
      representante_doc: EMPRESA.rep_legal_rut,
      representante_email: MAIL,
      representante_tel: '+56912345678',
      contacto_comercial_nombre: EMPRESA.rep_legal_nombre,
      contacto_comercial_email: MAIL,
      contacto_comercial_tel: '+56987654321',
      email_facturacion: MAIL,
      datos_bancarios: 'Banco de Chile\nCta corriente 000123456',
      certificaciones: 'N/A',
      anticorrupcion: 'si',
      razon_social: EMPRESA.razon_social,
      tax_id: EMPRESA.rut,
      pais: 'Chile',
      tipo_proveedor: 'servicios',
    },
  });
  log('   provider filled', fillResp);

  log('STEP 6: verificar branch proveedor cerrado');
  await new Promise((r) => setTimeout(r, 800));
  const r6 = (await db(`workflow_runs&id=eq.${runId}`))[0];
  log('   estado post-fill', {
    current_phase: r6.current_phase,
    active_phases: r6.active_phases,
    provider_data_completed_at: r6.provider_data_completed_at,
  });
  if (!r6.provider_data_completed_at) throw new Error('provider_data_completed_at no se seteó');

  log('STEP 7: POST /hito1-semaforo (3 aprobaciones internas GREEN)');
  const sem = await call('POST', '/hito1-semaforo', {
    run_id: runId,
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
  });
  log('   semaforo', sem);

  log('STEP 8: verificar advance a fase3');
  await new Promise((r) => setTimeout(r, 800));
  const r8 = (await db(`workflow_runs&id=eq.${runId}`))[0];
  log('   estado final', {
    current_phase: r8.current_phase,
    internal_approvals_completed_at: r8.internal_approvals_completed_at,
    semaforo: r8.semaforo,
  });
  if (r8.current_phase !== 'fase3') throw new Error(`expected fase3, got ${r8.current_phase}`);

  log('STEP 9: RegCheq check (MOCK — API real no entrega para este key)');
  const rcq = await call('POST', '/regcheq', {
    run_id: runId,
    provider_id: providerId,
    supplier: { razon_social: EMPRESA.razon_social, tax_id: EMPRESA.rut, pais: 'Chile', email_contacto: MAIL },
    relations: [{ dni: EMPRESA.rep_legal_rut, name: EMPRESA.rep_legal_nombre, type: 'representant' }],
  });
  log('   regcheq', rcq);
  if (rcq.reason === 'mock_mode') {
    console.log('   ⚠️  RegCheq corrió en MOCK → decision=approve. Para verificar GREXSA real: API RegCheq (bloqueada) o plan B manual.');
  }

  log('STEP 10: audit log');
  const auds = await db(`audit_log&workflow_run_id=eq.${runId}&order=created_at.asc`);
  log(`   ${auds.length} events`);
  for (const a of auds) console.log(`     · ${a.action} by ${a.actor}`);

  console.log('\n\n✅ E2E PIPELINE PASSED (RegCheq en mock)');
  console.log(`   run_id: ${runId}`);
  console.log(`   provider_id: ${providerId}`);
  console.log(`   empresa: ${EMPRESA.razon_social} (${EMPRESA.rut})`);
  console.log(`   final_phase: ${r8.current_phase}`);
  console.log(`   regcheq_decision: ${rcq.decision} (${rcq.reason})`);
  console.log(`\n   provider_id para plan B (subir reporte RegCheq + decisión manual): ${providerId}`);
}

main().catch((e) => {
  console.error('\n\n❌ E2E FAILED');
  console.error(e.message);
  process.exit(1);
});
