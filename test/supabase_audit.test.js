// Smoke test contra Supabase real. Skips si no hay SUPABASE_SERVICE_ROLE_KEY.

import { test } from 'node:test';
import assert from 'node:assert';

const skip = !process.env.SUPABASE_SERVICE_ROLE_KEY;

test('startRun + recordApproval + getApprovals round-trip', { skip }, async () => {
  const { startRun, recordApproval, getApprovals, sb } = await import('../src/supabase_audit.js');

  const fr = {
    id: `test-${Date.now()}`,
    owner_email: 'test@global66.com',
    razon_social: 'ACME SpA',
    rut: '76.000.000-K',
    pais: 'Chile',
    tipo_contrato: 'servicios',
    monto: 12000,
    moneda: 'USD',
    vigencia: 12,
    criticidad: 'Media',
    nivel_acceso: 'PII no sensible',
    link_drive: 'https://drive.google.com/x',
  };

  const run = await startRun(fr);
  assert.ok(run.id);

  await recordApproval({ runId: run.id, team: 'compliance', decision: 'approved', email: 'c@global66.com' });
  await recordApproval({ runId: run.id, team: 'legal', decision: 'approved', email: 'l@global66.com' });

  const a = await getApprovals(run.id);
  assert.equal(a.compliance, 'approved');
  assert.equal(a.legal, 'approved');

  await sb.from('workflow_runs').delete().eq('id', run.id);
});
