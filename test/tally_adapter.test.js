import { test } from 'node:test';
import assert from 'node:assert';
import { isTallyPayload, adaptTally } from '../src/tally_adapter.js';

test('isTallyPayload detects Tally events', () => {
  assert.equal(isTallyPayload({ eventType: 'FORM_RESPONSE', data: { fields: [] } }), true);
  assert.equal(isTallyPayload({ data: { fields: [{ label: 'x' }] } }), true);
  assert.equal(isTallyPayload({ rut: '76', razon_social: 'x' }), false);
});

test('adaptTally maps fields to internal keys', () => {
  const payload = {
    eventType: 'FORM_RESPONSE',
    createdAt: '2026-05-25T12:00:00Z',
    data: {
      responseId: 'r-123',
      respondent: { email: 'owner@global66.com' },
      fields: [
        { label: 'Razón social del proveedor', type: 'INPUT_TEXT', value: 'ACME SpA' },
        { label: 'RUT / Tax ID', type: 'INPUT_TEXT', value: '76.000.000-K' },
        { label: 'País del proveedor', type: 'DROPDOWN', value: ['Chile'] },
        { label: 'Monto estimado anual', type: 'INPUT_NUMBER', value: '12000' },
        { label: 'Moneda', type: 'DROPDOWN', value: ['USD'] },
        { label: 'Vigencia del contrato (meses)', type: 'INPUT_TEXT', value: '12' },
        { label: 'Email del contacto del proveedor', type: 'INPUT_EMAIL', value: 'contact@acme.cl' },
        { label: '¿Es contrato de adhesión?', type: 'MULTIPLE_CHOICE', value: ['No'] },
        { label: 'Borrador del contrato (PDF)', type: 'FILE_UPLOAD', value: [{ url: 'https://files.tally.so/x.pdf' }] },
      ],
    },
  };

  const out = adaptTally(payload);
  assert.equal(out.id, 'r-123');
  assert.equal(out.owner_email, 'owner@global66.com');
  assert.equal(out.razon_social, 'ACME SpA');
  assert.equal(out.rut, '76.000.000-K');
  assert.equal(out.pais, 'Chile');
  assert.equal(out.monto, 12000);
  assert.equal(typeof out.monto, 'number');
  assert.equal(out.moneda, 'USD');
  assert.equal(out.vigencia, 12);
  assert.equal(out.email_contacto, 'contact@acme.cl');
  assert.equal(out.adhesion, 'No');
  assert.equal(out.link_drive, 'https://files.tally.so/x.pdf');
});
