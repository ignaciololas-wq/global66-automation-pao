import { test } from 'node:test';
import assert from 'node:assert';
import { approvalBlocks, riskSummaryFromExtraction, semaphoreSummaryBlocks } from '../src/slack_blocks.js';
import { verifySlackSignature } from '../src/slack_verify.js';

test('approvalBlocks contains 4 buttons', () => {
  const blocks = approvalBlocks({
    team: 'legal',
    runId: 'abc-123',
    supplier: { razon_social: 'ACME', tax_id: '76.000.000-K', pais: 'CL' },
    contract: { tipo_contrato: 'servicios', monto: 12000, moneda: 'USD', vigencia_meses: 12 },
    riskSummary: null,
    draftUrl: 'https://drive.google.com/x',
  });
  const actions = blocks.find((b) => b.type === 'actions');
  assert.equal(actions.elements.length, 4);
  assert.ok(actions.block_id.includes('abc-123'));
});

test('riskSummaryFromExtraction returns null when no risks', () => {
  assert.equal(riskSummaryFromExtraction({ riesgos_detectados: [] }), null);
});

test('riskSummaryFromExtraction caps at 5 risks', () => {
  const risks = Array.from({ length: 10 }, (_, i) => ({
    tipo: 't' + i,
    descripcion: 'd',
    severidad: 'media',
  }));
  const out = riskSummaryFromExtraction({ riesgos_detectados: risks });
  assert.equal(out.split('\n').length, 5);
});

test('semaphoreSummaryBlocks reflects color', () => {
  const blocks = semaphoreSummaryBlocks({
    runId: 'x',
    color: 'green',
    reason: 'all good',
    approvals: { compliance: 'approved', legal: 'approved', admin: 'approved' },
  });
  assert.ok(blocks[0].text.text.includes('🟢'));
});

test('verifySlackSignature rejects without env', () => {
  delete process.env.SLACK_SIGNING_SECRET;
  assert.equal(verifySlackSignature('body', {}), false);
});
