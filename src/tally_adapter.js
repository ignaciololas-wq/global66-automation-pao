// Adaptador payload Tally → formato startRun.
// Schema unificado (Pao + compliance interno).

const FIELD_MAP = {
  // Solicitante
  'tu nombre completo': 'solicitante_nombre',
  'tu email': 'solicitante_email',
  'tu área o equipo': 'solicitante_area',
  'tu area o equipo': 'solicitante_area',

  // Owner
  '¿serás el owner del contrato?': 'owner_es_solicitante_raw',
  '¿seras el owner del contrato?': 'owner_es_solicitante_raw',
  'nombre del owner (solo si no eres tú)': 'owner_nombre',
  'nombre del owner (solo si no eres tu)': 'owner_nombre',
  'email del owner': 'owner_email',
  'email del responsable backup': 'responsable_backup_email',

  // Sociedad
  'sociedad contratante': 'sociedad_contratante',

  // Proveedor
  'razón social del proveedor': 'razon_social',
  'razon social del proveedor': 'razon_social',
  'rut / tax id del proveedor': 'rut',
  'rut / tax id': 'rut',
  'tax id': 'rut',
  'país donde está constituido el proveedor': 'pais',
  'pais donde esta constituido el proveedor': 'pais',
  'país del proveedor': 'pais',
  'representante legal o contacto principal': 'representante_legal',
  'email de contacto del proveedor': 'email_contacto',
  'email del contacto del proveedor': 'email_contacto',
  'email de facturación del proveedor': 'email_facturacion',
  'email de facturacion del proveedor': 'email_facturacion',
  '¿proveedor nuevo o ya existe en el sistema?': 'proveedor_existente_raw',
  'tipo de proveedor': 'tipo_proveedor',

  // Contrato
  'descripción del servicio': 'servicio_descripcion',
  'descripcion del servicio': 'servicio_descripcion',
  'tipo de contrato': 'tipo_contrato',
  '¿es contrato de adhesión (términos del proveedor sin negociación)?': 'adhesion',
  '¿es contrato de adhesion (terminos del proveedor sin negociacion)?': 'adhesion',
  '¿adhesión?': 'adhesion',
  'monto estimado': 'monto',
  'monto estimado anual': 'monto',
  'monto': 'monto',
  'moneda': 'moneda',
  'periodicidad': 'periodicidad_raw',
  'duración del contrato': 'tipo_duracion_raw',
  'duracion del contrato': 'tipo_duracion_raw',
  'vigencia del contrato (meses)': 'vigencia',
  'fecha inicio (solo si plazo fijo)': 'fecha_inicio',
  'fecha fin (solo si plazo fijo)': 'fecha_fin',
  'justificación de negocio': 'justificacion',
  'justificacion de negocio': 'justificacion',

  // Compliance
  'nivel de acceso a datos/sistemas global66': 'nivel_acceso',
  'nivel de acceso a datos/sistemas': 'nivel_acceso',
  'criticidad para la operación': 'criticidad',
  'criticidad para la operacion': 'criticidad',

  // Adjuntos
  'borrador del contrato (pdf)': 'link_drive',
  'link al borrador del contrato (google drive)': 'link_drive',
  'notas adicionales (opcional)': 'notas',
  'notas adicionales': 'notas',
};

const PERIODICIDAD_MAP = { 'único': 'unico', 'unico': 'unico', 'mensual': 'mensual', 'anual': 'anual', 'otro': 'otro' };
const TIPO_DURACION_MAP = {
  'indefinido': 'indefinido',
  'plazo fijo': 'plazo_fijo',
  'por proyecto o entregable': 'por_proyecto',
  'por proyecto': 'por_proyecto',
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
    const key = FIELD_MAP[(f.label ?? '').toLowerCase().trim()];
    if (!key) continue;

    let value = f.value;
    if (Array.isArray(value)) {
      if (f.type === 'FILE_UPLOAD' && value[0]?.url) value = value[0].url;
      else if (f.type === 'MULTIPLE_CHOICE' || f.type === 'DROPDOWN') value = value[0];
      else value = value.join(', ');
    }

    out[key] = value;
  }

  // Post-process raw fields
  if (out.monto != null) out.monto = Number(out.monto);
  if (out.vigencia != null) {
    const n = Number(out.vigencia);
    out.vigencia = isNaN(n) ? out.vigencia : n;
  }
  if (out.owner_es_solicitante_raw) {
    out.owner_es_solicitante = /sí|si/i.test(out.owner_es_solicitante_raw);
    if (out.owner_es_solicitante) {
      out.owner_email = out.owner_email ?? out.solicitante_email;
      out.owner_nombre = out.owner_nombre ?? out.solicitante_nombre;
    }
  }
  if (out.proveedor_existente_raw) {
    out.proveedor_existente = /existe|renovaci/i.test(out.proveedor_existente_raw);
  }
  if (out.adhesion) {
    out.adhesion = /sí|si/i.test(out.adhesion) ? 'Sí' : 'No';
  }
  if (out.periodicidad_raw) {
    out.periodicidad = PERIODICIDAD_MAP[out.periodicidad_raw.toLowerCase().trim()] ?? 'otro';
  }
  if (out.tipo_duracion_raw) {
    out.tipo_duracion = TIPO_DURACION_MAP[out.tipo_duracion_raw.toLowerCase().trim()] ?? null;
    if (out.tipo_duracion === 'indefinido') out.vigencia = null;
  }

  // owner_email es el "owner real" → usar como key principal
  out.owner_email = out.owner_email ?? out.solicitante_email;
  out.email_contacto = out.email_contacto ?? null;

  delete out.owner_es_solicitante_raw;
  delete out.proveedor_existente_raw;
  delete out.periodicidad_raw;
  delete out.tipo_duracion_raw;

  return out;
}
