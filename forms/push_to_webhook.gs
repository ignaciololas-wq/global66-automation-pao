/**
 * Apps Script — Trigger onFormSubmit que postea al webhook del server.
 * Reemplaza el polling de n8n por push instantáneo.
 *
 * Setup:
 *   1. En el form editor → ⋮ → Script editor → pegar este código
 *   2. Editar WEBHOOK_URL
 *   3. Triggers → Add trigger → onFormSubmit → From form → On form submit
 */

const WEBHOOK_URL = 'https://your-server.global66.com/form-webhook';

function onFormSubmit(e) {
  const itemResponses = e.response.getItemResponses();
  const payload = {
    id: e.response.getId(),
    owner_email: e.response.getRespondentEmail(),
    submitted_at: e.response.getTimestamp().toISOString(),
  };

  const map = {
    'Razón social del proveedor': 'razon_social',
    'RUT / Tax ID': 'rut',
    'País del proveedor': 'pais',
    'Tipo de proveedor': 'tipo_proveedor',
    'Nivel de acceso a datos/sistemas Global66': 'nivel_acceso',
    'Criticidad para la operación': 'criticidad',
    'Tipo de contrato': 'tipo_contrato',
    'Monto estimado anual': 'monto',
    'Moneda': 'moneda',
    'Vigencia del contrato (meses)': 'vigencia',
    'Email del contacto del proveedor': 'email_contacto',
    'Email de facturación del proveedor': 'email_facturacion',
    '¿Es contrato de adhesión (términos del proveedor sin negociación)?': 'adhesion',
    'Justificación de negocio': 'justificacion',
    'Link al borrador del contrato (Google Drive)': 'link_drive',
    'Responsable backup (email)': 'responsable_backup',
    'Notas adicionales (opcional)': 'notas',
  };

  itemResponses.forEach((r) => {
    const key = map[r.getItem().getTitle()];
    if (key) {
      let v = r.getResponse();
      if (key === 'monto') v = Number(v);
      if (key === 'vigencia') v = isNaN(Number(v)) ? v : Number(v);
      payload[key] = v;
    }
  });

  UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
}
