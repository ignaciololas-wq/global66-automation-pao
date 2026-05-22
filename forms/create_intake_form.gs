/**
 * Google Apps Script — Crea Google Form "Intake Contratos Proveedores"
 * Proyecto: Pao P2 — Alta de contratos con proveedores
 * Stack: n8n + Claude API + Google Workspace + Finnecto + SignNow
 *
 * Uso:
 *   1. script.google.com → New Project → Pegar este código
 *   2. Run > createIntakeForm
 *   3. Autorizar permisos (Forms + Drive)
 *   4. Copiar URL del log (form publicado + sheet de respuestas)
 *   5. Compartir URL con Legal Lead para validar campos
 */

function createIntakeForm() {
  const form = FormApp.create('Intake — Alta de contrato proveedor');
  form.setDescription(
    'Formulario para iniciar el proceso de alta de un nuevo proveedor/contrato. ' +
    'Las respuestas disparan el flujo automatizado de revisión Compliance/Legal/Admin. ' +
    'Procedimiento: G81-PRO-005.'
  );
  form.setCollectEmail(true);
  form.setRequireLogin(true);
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);

  // 1. Razón social
  form.addTextItem()
    .setTitle('Razón social del proveedor')
    .setHelpText('Nombre legal completo según documentos.')
    .setRequired(true);

  // 2. RUT / Tax ID
  form.addTextItem()
    .setTitle('RUT / Tax ID')
    .setHelpText('Sin puntos. Con guion y dígito verificador si aplica (ej: 76.xxx.xxx-K).')
    .setRequired(true);

  // 3. País
  form.addListItem()
    .setTitle('País del proveedor')
    .setChoiceValues(['Chile', 'Perú', 'México', 'Colombia', 'Argentina', 'Ecuador', 'Brasil', 'Uruguay', 'Estados Unidos', 'Otro'])
    .setRequired(true);

  // 4. Tipo de proveedor
  form.addListItem()
    .setTitle('Tipo de proveedor')
    .setChoiceValues(['Servicios profesionales', 'Software/SaaS', 'Infraestructura cloud', 'Marketing/Publicidad', 'Logística', 'Insumos físicos', 'Consultoría', 'Otro'])
    .setRequired(true);

  // 5. Nivel de acceso a datos/sistemas
  form.addMultipleChoiceItem()
    .setTitle('Nivel de acceso a datos/sistemas Global66')
    .setChoiceValues([
      'Ninguno',
      'Acceso público / sin PII',
      'PII no sensible',
      'PII sensible o financiera',
      'Acceso a producción / infraestructura crítica',
    ])
    .setRequired(true);

  // 6. Criticidad
  form.addMultipleChoiceItem()
    .setTitle('Criticidad para la operación')
    .setChoiceValues(['Baja', 'Media', 'Alta', 'Crítica (afecta core business)'])
    .setRequired(true);

  // 7. Tipo de contrato
  form.addListItem()
    .setTitle('Tipo de contrato')
    .setChoiceValues(['Prestación de servicios', 'Suscripción SaaS', 'NDA', 'Master Services Agreement (MSA)', 'Statement of Work (SOW)', 'Adhesión (términos del proveedor)', 'Otro'])
    .setRequired(true);

  // 8. Monto
  form.addTextItem()
    .setTitle('Monto estimado anual')
    .setHelpText('Solo número, sin símbolo de moneda. Ej: 12000')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation()
      .requireNumber()
      .build());

  // 9. Moneda
  form.addListItem()
    .setTitle('Moneda')
    .setChoiceValues(['USD', 'CLP', 'PEN', 'MXN', 'COP', 'ARS', 'BRL', 'EUR', 'UF', 'Otra'])
    .setRequired(true);

  // 10. Vigencia
  form.addTextItem()
    .setTitle('Vigencia del contrato (meses)')
    .setHelpText('Duración en meses. Si es indefinido, escribir "indefinido".')
    .setRequired(true);

  // 11. Email contacto proveedor
  form.addTextItem()
    .setTitle('Email del contacto del proveedor')
    .setHelpText('Persona que firmará / negociará.')
    .setRequired(true);

  // 12. Email facturación
  form.addTextItem()
    .setTitle('Email de facturación del proveedor')
    .setRequired(true);

  // 13. ¿Es contrato de adhesión?
  form.addMultipleChoiceItem()
    .setTitle('¿Es contrato de adhesión (términos del proveedor sin negociación)?')
    .setChoiceValues(['Sí', 'No'])
    .setRequired(true);

  // 14. Justificación de negocio
  form.addParagraphTextItem()
    .setTitle('Justificación de negocio')
    .setHelpText('¿Por qué necesitamos este proveedor? Impacto esperado.')
    .setRequired(true);

  // 15. Borrador contrato — link Drive
  // Apps Script no soporta addFileUploadItem. Workaround: pedir URL Drive.
  // Alternativa: agregar manualmente el File Upload item en la UI del form
  // después de ejecutar este script (Forms → Add question → File upload).
  form.addTextItem()
    .setTitle('Link al borrador del contrato (Google Drive)')
    .setHelpText('Subir PDF a Drive (carpeta compartida con Global66) y pegar el link aquí. ' +
      'Asegurate de que el permiso sea "Cualquiera con el link puede ver".')
    .setRequired(true)
    .setValidation(FormApp.createTextValidation()
      .requireTextIsUrl()
      .build());

  // 16. Responsable backup
  form.addTextItem()
    .setTitle('Responsable backup (email)')
    .setHelpText('Persona que toma decisiones si el owner no está disponible.')
    .setRequired(true);

  // 17. Notas adicionales
  form.addParagraphTextItem()
    .setTitle('Notas adicionales (opcional)')
    .setRequired(false);

  // Crear sheet de respuestas
  const ss = SpreadsheetApp.create('Intake Contratos Proveedores — Respuestas');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  Logger.log('Form URL (editor):     ' + form.getEditUrl());
  Logger.log('Form URL (publicado):  ' + form.getPublishedUrl());
  Logger.log('Sheet respuestas:      ' + ss.getUrl());
  Logger.log('Form ID:               ' + form.getId());
  Logger.log('Sheet ID:              ' + ss.getId());

  return {
    formEditUrl: form.getEditUrl(),
    formPublishedUrl: form.getPublishedUrl(),
    sheetUrl: ss.getUrl(),
    formId: form.getId(),
    sheetId: ss.getId(),
  };
}
