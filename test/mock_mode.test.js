import { test } from 'node:test';
import assert from 'node:assert';

process.env.MOCK_MODE = 'true';
process.env.SUPABASE_URL = 'http://mock';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock';

const { createProviderForm, listExpiringContracts } = await import('../src/finnecto.js');
const { checkSanctions } = await import('../src/lista_negra.js');
const { extractFromPdfBuffer } = await import('../src/gemini_extract.js');

test('finnecto.createProviderForm returns mock data when MOCK', async () => {
  const r = await createProviderForm({ form_id: 'f1', responses: { x: 1 } });
  assert.ok(r.id.startsWith('mock-form-resp-'));
  assert.equal(r.form_id, 'f1');
});

test('listExpiringContracts returns mock contracts within window', async () => {
  const r = await listExpiringContracts(180);
  assert.ok(Array.isArray(r));
  assert.ok(r.length >= 1);
});

test('checkSanctions returns no hit for clean name', async () => {
  const r = await checkSanctions({ razon_social: 'ACME SpA', tax_id: '76', pais: 'CL' });
  assert.equal(r.hit, false);
});

test('checkSanctions flags name with "sancionado"', async () => {
  const r = await checkSanctions({ razon_social: 'Empresa sancionado', tax_id: '76', pais: 'CL' });
  assert.equal(r.hit, true);
});

test('extractFromPdfBuffer returns mock JSON', async () => {
  const out = await extractFromPdfBuffer(Buffer.from('fake'), { useCache: false });
  assert.ok(out._mock);
  assert.equal(out.tipo_contrato, 'servicios');
});
