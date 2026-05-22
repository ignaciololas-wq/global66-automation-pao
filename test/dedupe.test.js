// Test dedupe RUT contra Supabase real. Skip si no hay creds.

import { test } from 'node:test';
import assert from 'node:assert';

const skip = !(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY));

test('startRun blocks duplicate active tax_id', { skip }, async () => {
  const { startRun, sb } = await import('../src/supabase_audit.js');

  const taxId = `dup-test-${Date.now()}`;
  const fr = (id) => ({
    id,
    owner_email: 'test@global66.com',
    razon_social: 'DUP SA',
    rut: taxId,
    pais: 'CL',
    tipo_contrato: 'servicios',
    monto: 100,
    moneda: 'USD',
    vigencia: 12,
    criticidad: 'Baja',
    nivel_acceso: 'Ninguno',
    link_drive: 'https://drive.google.com/x',
  });

  const r1 = await startRun(fr(`t1-${Date.now()}`));
  assert.ok(r1.id);

  let blocked = false;
  try {
    await startRun(fr(`t2-${Date.now()}`));
  } catch (e) {
    blocked = e.code === 'DUPLICATE_ACTIVE_RUN';
  }
  assert.equal(blocked, true);

  const r3 = await startRun(fr(`t3-${Date.now()}`), { allowDuplicate: true });
  assert.ok(r3.id);

  await sb.from('workflow_runs').delete().eq('tax_id', taxId);
});
