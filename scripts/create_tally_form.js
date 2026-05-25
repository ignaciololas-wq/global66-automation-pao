// Crea form Tally con los 17 campos del intake + setup webhook.
// Uso: node --env-file=.env scripts/create_tally_form.js [webhook_url]

import 'dotenv/config';
import crypto from 'node:crypto';

const TALLY_KEY = process.env.TALLY_API_KEY;
const WEBHOOK_URL = process.argv[2] ?? process.env.TALLY_WEBHOOK_URL;

if (!TALLY_KEY) { console.error('Missing TALLY_API_KEY'); process.exit(1); }

const uuid = () => crypto.randomUUID();

const fields = [
  { type: 'INPUT_TEXT', label: 'Razón social del proveedor', placeholder: 'Nombre legal completo', required: true },
  { type: 'INPUT_TEXT', label: 'RUT / Tax ID', placeholder: 'Sin puntos. Ej: 76.000.000-K', required: true },
  { type: 'DROPDOWN', label: 'País del proveedor', required: true, options: ['Chile','Perú','México','Colombia','Argentina','Ecuador','Brasil','Uruguay','Estados Unidos','Otro'] },
  { type: 'DROPDOWN', label: 'Tipo de proveedor', required: true, options: ['Servicios profesionales','Software/SaaS','Infraestructura cloud','Marketing/Publicidad','Logística','Insumos físicos','Consultoría','Otro'] },
  { type: 'MULTIPLE_CHOICE', label: 'Nivel de acceso a datos/sistemas Global66', required: true, options: ['Ninguno','Acceso público / sin PII','PII no sensible','PII sensible o financiera','Acceso a producción / infraestructura crítica'] },
  { type: 'MULTIPLE_CHOICE', label: 'Criticidad para la operación', required: true, options: ['Baja','Media','Alta','Crítica (afecta core business)'] },
  { type: 'DROPDOWN', label: 'Tipo de contrato', required: true, options: ['Prestación de servicios','Suscripción SaaS','NDA','MSA','SOW','Adhesión','Otro'] },
  { type: 'INPUT_NUMBER', label: 'Monto estimado anual', placeholder: 'Solo número, ej: 12000', required: true },
  { type: 'DROPDOWN', label: 'Moneda', required: true, options: ['USD','CLP','PEN','MXN','COP','ARS','BRL','EUR','UF','Otra'] },
  { type: 'INPUT_TEXT', label: 'Vigencia del contrato (meses)', placeholder: 'Número o "indefinido"', required: true },
  { type: 'INPUT_EMAIL', label: 'Email del contacto del proveedor', required: true },
  { type: 'INPUT_EMAIL', label: 'Email de facturación del proveedor', required: true },
  { type: 'MULTIPLE_CHOICE', label: '¿Es contrato de adhesión?', required: true, options: ['Sí','No'] },
  { type: 'TEXTAREA', label: 'Justificación de negocio', placeholder: '¿Por qué necesitamos este proveedor?', required: true },
  { type: 'FILE_UPLOAD', label: 'Borrador del contrato (PDF)', required: true },
  { type: 'INPUT_EMAIL', label: 'Responsable backup (email)', required: true },
  { type: 'TEXTAREA', label: 'Notas adicionales (opcional)', required: false },
];

function buildBlocks() {
  const blocks = [];

  const titleUuid = uuid();
  blocks.push({
    uuid: titleUuid, type: 'FORM_TITLE',
    groupUuid: titleUuid, groupType: 'FORM_TITLE',
    payload: { html: 'Intake — Alta de contrato proveedor' },
  });

  const subtitleUuid = uuid();
  blocks.push({
    uuid: subtitleUuid, type: 'TEXT',
    groupUuid: subtitleUuid, groupType: 'TEXT',
    payload: { html: 'Para iniciar el proceso de alta de un nuevo proveedor. Procedimiento G81-PRO-005.' },
  });

  for (const f of fields) {
    // Question title (the label)
    const titleU = uuid();
    blocks.push({
      uuid: titleU, type: 'TITLE',
      groupUuid: titleU, groupType: 'TITLE',
      payload: { html: f.label },
    });

    if (f.type === 'DROPDOWN' || f.type === 'MULTIPLE_CHOICE') {
      const optType = f.type === 'DROPDOWN' ? 'DROPDOWN_OPTION' : 'MULTIPLE_CHOICE_OPTION';
      const groupU = uuid();
      f.options.forEach((opt, idx) => {
        blocks.push({
          uuid: uuid(), type: optType,
          groupUuid: groupU, groupType: f.type,
          payload: {
            text: opt,
            index: idx,
            isFirst: idx === 0,
            isLast: idx === f.options.length - 1,
            ...(idx === 0 ? { isRequired: f.required, isHidden: false } : {}),
          },
        });
      });
    } else {
      const blockU = uuid();
      const payload = { isRequired: f.required, isHidden: false };
      if (f.placeholder) payload.placeholder = f.placeholder;
      blocks.push({
        uuid: blockU, type: f.type,
        groupUuid: blockU, groupType: f.type,
        payload,
      });
    }
  }

  return blocks;
}

async function api(method, path, body) {
  const r = await fetch(`https://api.tally.so${path}`, {
    method, headers: { Authorization: `Bearer ${TALLY_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status}\n${txt.slice(0, 800)}`);
  return JSON.parse(txt);
}

const blocks = buildBlocks();
console.log(`Building form with ${blocks.length} blocks...`);

let form;
try {
  form = await api('POST', '/forms', { status: 'PUBLISHED', blocks });
} catch (e) {
  console.log('PUBLISHED falló, intento DRAFT...');
  console.log(e.message.slice(0, 300));
  form = await api('POST', '/forms', { status: 'DRAFT', blocks });
}

console.log('\n✅ Form created');
console.log('  ID:    ', form.id);
console.log('  Name:  ', form.name);
console.log('  Status:', form.status);
console.log('  URL:   ', `https://tally.so/r/${form.id}`);

if (WEBHOOK_URL) {
  console.log('\nSetting up webhook → ' + WEBHOOK_URL);
  const wh = await api('POST', '/webhooks', {
    formId: form.id, url: WEBHOOK_URL, eventTypes: ['FORM_RESPONSE'],
  });
  console.log('✅ Webhook ID:', wh.id);
} else {
  console.log('\nℹ️  Sin webhook URL. Para registrarlo pasá: node scripts/create_tally_form.js https://xxx.ngrok-free.app/form-webhook');
}
