// Adaptador payload Tally → formato startRun.
// Tally manda: { eventId, eventType, createdAt, data: { responseId, submissionId, fields: [{key, label, type, value, ...}] } }
// Nuestro startRun espera: { id, owner_email, razon_social, rut, pais, ... }

const FIELD_MAP = {
  // Label exacto del form Tally (case-insensitive) → key interno
  'razón social del proveedor': 'razon_social',
  'razon social del proveedor': 'razon_social',
  'rut / tax id': 'rut',
  'tax id': 'rut',
  'rut': 'rut',
  'país del proveedor': 'pais',
  'pais del proveedor': 'pais',
  'tipo de proveedor': 'tipo_proveedor',
  'nivel de acceso a datos/sistemas': 'nivel_acceso',
  'nivel de acceso': 'nivel_acceso',
  'criticidad': 'criticidad',
  'criticidad para la operación': 'criticidad',
  'tipo de contrato': 'tipo_contrato',
  'monto estimado anual': 'monto',
  'monto': 'monto',
  'moneda': 'moneda',
  'vigencia del contrato (meses)': 'vigencia',
  'vigencia (meses)': 'vigencia',
  'email del contacto del proveedor': 'email_contacto',
  'email contacto proveedor': 'email_contacto',
  'email de facturación del proveedor': 'email_facturacion',
  'email facturación proveedor': 'email_facturacion',
  '¿es contrato de adhesión?': 'adhesion',
  '¿adhesión?': 'adhesion',
  'adhesion': 'adhesion',
  'justificación de negocio': 'justificacion',
  'justificacion de negocio': 'justificacion',
  'borrador del contrato (pdf)': 'link_drive',
  'borrador del contrato': 'link_drive',
  'link al borrador del contrato': 'link_drive',
  'responsable backup (email)': 'responsable_backup',
  'responsable backup': 'responsable_backup',
  'notas adicionales (opcional)': 'notas',
  'notas adicionales': 'notas',
};

export function isTallyPayload(body) {
  return body?.eventType === 'FORM_RESPONSE' || Array.isArray(body?.data?.fields);
}

export function adaptTally(body) {
  const fields = body.data?.fields ?? [];
  const out = {
    id: body.data?.responseId ?? body.data?.submissionId ?? `tally-${Date.now()}`,
    submitted_at: body.createdAt ?? new Date().toISOString(),
  };

  for (const f of fields) {
    const key = FIELD_MAP[f.label?.toLowerCase().trim()];
    if (!key) continue;

    let value = f.value;
    if (Array.isArray(value)) {
      if (f.type === 'FILE_UPLOAD' && value[0]?.url) value = value[0].url;
      else if (f.type === 'MULTIPLE_CHOICE' || f.type === 'DROPDOWN') value = value[0];
      else value = value.join(', ');
    }

    if (key === 'monto' && value != null) value = Number(value);
    if (key === 'vigencia' && value != null) {
      const n = Number(value);
      value = isNaN(n) ? value : n;
    }

    out[key] = value;
  }

  out.owner_email = out.owner_email ?? body.data?.respondent?.email ?? null;
  return out;
}
