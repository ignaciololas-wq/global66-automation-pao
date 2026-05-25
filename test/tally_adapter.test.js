import { test } from 'node:test';
import assert from 'node:assert';
import { isTallyPayload, adaptTally } from '../src/tally_adapter.js';

test('isTallyPayload detects Tally events', () => {
  assert.equal(isTallyPayload({ eventType: 'FORM_RESPONSE', data: { fields: [] } }), true);
  assert.equal(isTallyPayload({ data: { fields: [{ label: 'x' }] } }), true);
  assert.equal(isTallyPayload({ rut: '76', razon_social: 'x' }), false);
});

test('adaptTally maps unified schema fields', () => {
  const payload = {
    eventType: 'FORM_RESPONSE',
    createdAt: '2026-05-25T12:00:00Z',
    data: {
      responseId: 'r-123',
      fields: [
        { label: 'Tu nombre completo', type: 'INPUT_TEXT', value: 'Juan Pérez' },
        { label: 'Tu email', type: 'INPUT_EMAIL', value: 'juan@global66.com' },
        { label: 'Tu área o equipo', type: 'INPUT_TEXT', value: 'Finanzas' },
        { label: '¿Serás el Owner del contrato?', type: 'MULTIPLE_CHOICE', value: ['Sí, seré el responsable'] },
        { label: 'Email del Owner', type: 'INPUT_EMAIL', value: 'owner@global66.com' },
        { label: 'Email del responsable backup', type: 'INPUT_EMAIL', value: 'backup@global66.com' },
        { label: 'Sociedad contratante', type: 'MULTIPLE_CHOICE', value: ['Global 81 SpA (Chile)'] },
        { label: 'Razón social del proveedor', type: 'INPUT_TEXT', value: 'ACME SpA' },
        { label: 'RUT / Tax ID del proveedor', type: 'INPUT_TEXT', value: '76.000.000-K' },
        { label: 'País donde está constituido el proveedor', type: 'DROPDOWN', value: ['Chile'] },
        { label: 'Monto estimado', type: 'INPUT_NUMBER', value: '12000' },
        { label: 'Moneda', type: 'DROPDOWN', value: ['USD'] },
        { label: 'Periodicidad', type: 'MULTIPLE_CHOICE', value: ['Anual'] },
        { label: 'Duración del contrato', type: 'MULTIPLE_CHOICE', value: ['Plazo fijo'] },
        { label: '¿Es contrato de adhesión (términos del proveedor sin negociación)?', type: 'MULTIPLE_CHOICE', value: ['No'] },
        { label: '¿Proveedor nuevo o ya existe en el sistema?', type: 'MULTIPLE_CHOICE', value: ['Proveedor nuevo'] },
        { label: 'Borrador del contrato (PDF)', type: 'FILE_UPLOAD', value: [{ url: 'https://files.tally.so/x.pdf' }] },
      ],
    },
  };

  const out = adaptTally(payload);
  assert.equal(out.id, 'r-123');
  assert.equal(out.solicitante_nombre, 'Juan Pérez');
  assert.equal(out.solicitante_email, 'juan@global66.com');
  assert.equal(out.solicitante_area, 'Finanzas');
  assert.equal(out.owner_es_solicitante, true);
  assert.equal(out.owner_email, 'owner@global66.com');
  assert.equal(out.responsable_backup_email, 'backup@global66.com');
  assert.equal(out.sociedad_contratante, 'Global 81 SpA (Chile)');
  assert.equal(out.razon_social, 'ACME SpA');
  assert.equal(out.rut, '76.000.000-K');
  assert.equal(out.pais, 'Chile');
  assert.equal(out.monto, 12000);
  assert.equal(typeof out.monto, 'number');
  assert.equal(out.moneda, 'USD');
  assert.equal(out.periodicidad, 'anual');
  assert.equal(out.tipo_duracion, 'plazo_fijo');
  assert.equal(out.adhesion, 'No');
  assert.equal(out.proveedor_existente, false);
  assert.equal(out.link_drive, 'https://files.tally.so/x.pdf');
});

test('adaptTally handles owner != solicitante', () => {
  const out = adaptTally({
    eventType: 'FORM_RESPONSE',
    data: {
      responseId: 'r-2',
      fields: [
        { label: 'Tu nombre completo', type: 'INPUT_TEXT', value: 'Solicitante' },
        { label: 'Tu email', type: 'INPUT_EMAIL', value: 'solic@global66.com' },
        { label: '¿Serás el Owner del contrato?', type: 'MULTIPLE_CHOICE', value: ['No, otro responsable'] },
        { label: 'Nombre del Owner (solo si no eres tú)', type: 'INPUT_TEXT', value: 'Otro Owner' },
        { label: 'Email del Owner', type: 'INPUT_EMAIL', value: 'owner@global66.com' },
      ],
    },
  });
  assert.equal(out.owner_es_solicitante, false);
  assert.equal(out.owner_nombre, 'Otro Owner');
  assert.equal(out.owner_email, 'owner@global66.com');
  assert.equal(out.solicitante_email, 'solic@global66.com');
});
