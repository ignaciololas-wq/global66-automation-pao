// Crea/recrea form Tally con campos unificados (Pao + compliance interno).
// Uso: node --env-file=.env scripts/create_tally_form.js [webhook_url]

import 'dotenv/config';
import crypto from 'node:crypto';

const TALLY_KEY = process.env.TALLY_API_KEY;
const WEBHOOK_URL = process.argv[2] ?? process.env.TALLY_WEBHOOK_URL;
if (!TALLY_KEY) { console.error('Missing TALLY_API_KEY'); process.exit(1); }

const uuid = () => crypto.randomUUID();

const sections = [
  { heading: '1. ¿Quién solicita el contrato?' },
  { type: 'INPUT_TEXT', label: 'Tu nombre completo', required: true, placeholder: 'Ej: Juan Pérez' },
  { type: 'INPUT_EMAIL', label: 'Tu email', required: true, placeholder: 'juan@global66.com' },
  { type: 'INPUT_TEXT', label: 'Tu área o equipo', required: true, placeholder: 'Ej: Finanzas, Tecnología, Marketing' },
  { type: 'MULTIPLE_CHOICE', label: '¿Serás el Owner del contrato?', required: true, help: 'El Owner administra el contrato, aprueba facturas y mantiene la relación con el proveedor.', options: ['Sí, seré el responsable', 'No, otro responsable'] },
  { type: 'INPUT_TEXT', label: 'Nombre del Owner (solo si no eres tú)', required: false, placeholder: 'Nombre completo del responsable' },
  { type: 'INPUT_EMAIL', label: 'Email del Owner', required: true, placeholder: 'owner@global66.com' },
  { type: 'INPUT_EMAIL', label: 'Email del responsable backup', required: true, placeholder: 'Persona que decide si el owner no está' },

  { heading: '2. ¿Con qué proveedor?' },
  { type: 'INPUT_TEXT', label: 'Razón social del proveedor', required: true, placeholder: 'Nombre legal completo' },
  { type: 'INPUT_TEXT', label: 'RUT / Tax ID del proveedor', required: true, placeholder: 'Sin puntos. Ej: 76.000.000-K' },
  { type: 'DROPDOWN', label: 'País donde está constituido el proveedor', required: true, options: ['Chile','Perú','México','Colombia','Argentina','Panamá','Ecuador','Brasil','Uruguay','Estados Unidos','Otro'] },
  { type: 'INPUT_TEXT', label: 'Representante legal o contacto principal', required: true, placeholder: 'Nombre completo' },
  { type: 'INPUT_EMAIL', label: 'Email de contacto del proveedor', required: true, placeholder: 'contacto@proveedor.com' },
  { type: 'INPUT_EMAIL', label: 'Email de facturación del proveedor', required: true, placeholder: 'billing@proveedor.com' },
  { type: 'MULTIPLE_CHOICE', label: '¿Proveedor nuevo o ya existe en el sistema?', required: true, options: ['Proveedor nuevo','Ya existe — renovación o contrato adicional'] },
  { type: 'DROPDOWN', label: 'Tipo de proveedor', required: true, options: ['Servicios profesionales','Plataformas SaaS','Marketing y Publicidad','Consultoría/Asesoría','Otro'] },

  { heading: '3. Datos del contrato' },
  { type: 'TEXTAREA', label: 'Descripción del servicio', required: true, placeholder: 'Ej: Desarrollo de software, consultoría legal, hosting...' },
  { type: 'MULTIPLE_CHOICE', label: 'Periodicidad', required: true, options: ['Único','Mensual','Anual','Otro'] },
  { type: 'INPUT_NUMBER', label: 'Monto estimado', required: true, help: 'Indica el valor según la periodicidad elegida (ej: si es mensual, el monto mensual; si es anual, el monto anual; si es único, el total).', placeholder: 'Solo número, ej: 12000' },
  { type: 'DROPDOWN', label: 'Moneda', required: true, options: ['USD','CLP','PEN','MXN','COP','ARS','BRL','EUR','UF','PAB','Otra'] },
  { type: 'MULTIPLE_CHOICE', label: 'Duración del contrato', required: true, options: ['Indefinido','Plazo fijo','Por proyecto o entregable'] },
  { type: 'INPUT_TEXT', label: 'Fecha inicio (solo si plazo fijo)', required: false, placeholder: 'DD/MM/AAAA' },
  { type: 'INPUT_TEXT', label: 'Fecha fin (solo si plazo fijo)', required: false, placeholder: 'DD/MM/AAAA' },

  { heading: '4. Adjuntos' },
  { type: 'FILE_UPLOAD', label: 'Borrador del contrato (PDF)', required: true, help: 'Documento del proveedor o borrador interno.' },
  { type: 'FILE_UPLOAD', label: 'Archivos adicionales (opcional)', required: false, help: 'Cualquier otro documento relevante: cotizaciones, NDAs previos, presentaciones, etc.' },
  { type: 'TEXTAREA', label: 'Notas adicionales (opcional)', required: false },
];

function buildBlocks() {
  const blocks = [];

  const titleUuid = uuid();
  blocks.push({
    uuid: titleUuid, type: 'FORM_TITLE',
    groupUuid: titleUuid, groupType: 'FORM_TITLE',
    payload: { html: 'Registro de contrato con proveedor — Global66' },
  });

  const subtitleUuid = uuid();
  blocks.push({
    uuid: subtitleUuid, type: 'TEXT',
    groupUuid: subtitleUuid, groupType: 'TEXT',
    payload: { html: '⚠️ Recuerda: no se debe firmar ningún acuerdo antes de que Legal Lead, Administración y Control de Gestión hayan completado su revisión. Procedimiento G81-PRO-005.' },
  });

  for (const f of sections) {
    if (f.heading) {
      const u = uuid();
      blocks.push({
        uuid: u, type: 'TITLE',
        groupUuid: u, groupType: 'TITLE',
        payload: { html: f.heading },
      });
      continue;
    }

    // Question label
    const tU = uuid();
    blocks.push({
      uuid: tU, type: 'TITLE',
      groupUuid: tU, groupType: 'TITLE',
      payload: { html: f.label + (f.help ? ` <small style="color:#888">${f.help}</small>` : '') },
    });

    if (f.type === 'DROPDOWN' || f.type === 'MULTIPLE_CHOICE') {
      const optType = f.type === 'DROPDOWN' ? 'DROPDOWN_OPTION' : 'MULTIPLE_CHOICE_OPTION';
      const groupU = uuid();
      f.options.forEach((opt, idx) => {
        blocks.push({
          uuid: uuid(), type: optType,
          groupUuid: groupU, groupType: f.type,
          payload: {
            text: opt, index: idx,
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
console.log(`Building form with ${blocks.length} blocks (${sections.filter(s => !s.heading).length} preguntas, ${sections.filter(s => s.heading).length} secciones)...`);

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
}
