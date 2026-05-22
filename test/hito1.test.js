import { test } from 'node:test';
import assert from 'node:assert';
import { computeSemaphore } from '../src/hito1_semaforo.js';

test('red on sanctions hit', () => {
  const r = computeSemaphore({
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
    sanctions: { hit: true, matches: [{ id: 'X' }] },
    representatives: { recomendacion: 'aprobar' },
    extraction: { riesgos_detectados: [] },
  });
  assert.equal(r.color, 'red');
});

test('green when all approved + no risks', () => {
  const r = computeSemaphore({
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
    sanctions: { hit: false },
    representatives: { recomendacion: 'aprobar' },
    extraction: { riesgos_detectados: [] },
  });
  assert.equal(r.color, 'green');
});

test('red on any rejection', () => {
  const r = computeSemaphore({
    approvals: { compliance: 'approved', legal: 'rejected', admin: 'approved' },
    sanctions: { hit: false },
    representatives: { recomendacion: 'aprobar' },
    extraction: { riesgos_detectados: [] },
  });
  assert.equal(r.color, 'red');
});

test('yellow on high risk extraction', () => {
  const r = computeSemaphore({
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
    sanctions: { hit: false },
    representatives: { recomendacion: 'aprobar' },
    extraction: { riesgos_detectados: [{ tipo: 'X', descripcion: 'Y', severidad: 'alta' }] },
  });
  assert.equal(r.color, 'yellow');
});

test('yellow when representatives need additional docs', () => {
  const r = computeSemaphore({
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
    sanctions: { hit: false },
    representatives: { recomendacion: 'requerir_documento_adicional' },
    extraction: { riesgos_detectados: [] },
  });
  assert.equal(r.color, 'yellow');
});
