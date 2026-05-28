'use strict';
require('dotenv').config();
const { App } = require('@slack/bolt');
const { crearContrato, actualizarAprobacion, registrarEstado, obtenerContrato } = require('./supabase');
const { crearRegistroFinecto } = require('./playwright');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// ─────────────────────────────────────────────
// SLASH COMMAND: /nuevo-contrato
// ─────────────────────────────────────────────
app.command('/nuevo-contrato', async ({ command, ack, client, logger }) => {
  await ack();
  try {
    await client.views.open({
      trigger_id: command.trigger_id,
      view: construirModalContrato(command.user_id, command.channel_id),
    });
  } catch (err) {
    logger.error('[/nuevo-contrato]', err);
  }
});

function construirModalContrato(userId, channelId) {
  return {
    type: 'modal',
    callback_id: 'nuevo_contrato_modal',
    private_metadata: JSON.stringify({ solicitante_id: userId, canal_id: channelId }),
    title:  { type: 'plain_text', text: 'Nuevo Contrato' },
    submit: { type: 'plain_text', text: 'Enviar solicitud' },
    close:  { type: 'plain_text', text: 'Cancelar' },
    blocks: [
      {
        type: 'input',
        block_id: 'nombre_proveedor',
        label: { type: 'plain_text', text: 'Nombre del Proveedor' },
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'Ej: Empresa Tecnología S.A.' },
        },
      },
      {
        type: 'input',
        block_id: 'rut_proveedor',
        label: { type: 'plain_text', text: 'RUT del Proveedor' },
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'Ej: 12.345.678-9' },
        },
      },
      {
        type: 'input',
        block_id: 'tipo_contrato',
        label: { type: 'plain_text', text: 'Tipo de Contrato' },
        element: {
          type: 'static_select',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'Seleccionar tipo' },
          options: [
            { text: { type: 'plain_text', text: 'Servicio' },          value: 'servicio' },
            { text: { type: 'plain_text', text: 'Suministro' },        value: 'suministro' },
            { text: { type: 'plain_text', text: 'Arrendamiento' },     value: 'arrendamiento' },
            { text: { type: 'plain_text', text: 'Marco' },             value: 'marco' },
            { text: { type: 'plain_text', text: 'Confidencialidad (NDA)' }, value: 'nda' },
          ],
        },
      },
      {
        type: 'input',
        block_id: 'monto',
        label: { type: 'plain_text', text: 'Monto (CLP)' },
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'Ej: 1500000' },
        },
      },
      {
        type: 'input',
        block_id: 'vigencia',
        label: { type: 'plain_text', text: 'Vigencia del Contrato' },
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'Ej: 12 meses / hasta 31-12-2025' },
        },
      },
      {
        type: 'input',
        block_id: 'responsable_interno',
        label: { type: 'plain_text', text: 'Responsable Interno' },
        element: {
          type: 'users_select',
          action_id: 'value',
          placeholder: { type: 'plain_text', text: 'Seleccionar usuario de Slack' },
        },
      },
    ],
  };
}

// ─────────────────────────────────────────────
// SUBMIT MODAL: procesar formulario
// ─────────────────────────────────────────────
app.view('nuevo_contrato_modal', async ({ ack, view, client, logger }) => {
  await ack();

  const v   = view.state.values;
  const meta = JSON.parse(view.private_metadata);

  const datos = {
    nombre_proveedor:    v.nombre_proveedor.value.value,
    rut_proveedor:       v.rut_proveedor.value.value,
    tipo_contrato:       v.tipo_contrato.value.selected_option.value,
    monto:               parseFloat(v.monto.value.value),
    vigencia:            v.vigencia.value.value,
    responsable_interno: v.responsable_interno.value.selected_user,
    solicitante_slack_id: meta.solicitante_id,
    estado: 'pendiente',
  };

  // Simulación del webhook n8n — reemplazar por fetch() a la URL real de n8n
  console.log('[n8n webhook simulado]', JSON.stringify(datos, null, 2));

  try {
    const contrato = await crearContrato(datos);

    // Enviar solicitud de aprobación a los 3 equipos en paralelo
    const departamentos = [
      { nombre: 'Compliance',     canal: process.env.SLACK_COMPLIANCE_CHANNEL, key: 'compliance' },
      { nombre: 'Legal',          canal: process.env.SLACK_LEGAL_CHANNEL,       key: 'legal' },
      { nombre: 'Administración', canal: process.env.SLACK_ADMIN_CHANNEL,       key: 'administracion' },
    ];

    await Promise.all(
      departamentos.map(dep =>
        client.chat.postMessage({
          channel: dep.canal,
          text: `Solicitud de contrato para aprobación — ${dep.nombre}`,
          blocks: construirBloqueAprobacion(contrato, datos, dep),
        })
      )
    );

    await registrarEstado(contrato.id, null, 'pendiente', meta.solicitante_id);

    await client.chat.postMessage({
      channel: meta.solicitante_id,
      text: `Tu solicitud de contrato con *${datos.nombre_proveedor}* fue enviada correctamente. Esperando aprobación de Compliance, Legal y Administración. 🕐`,
    });

  } catch (err) {
    logger.error('[nuevo_contrato_modal submit]', err);
    await client.chat.postMessage({
      channel: meta.solicitante_id,
      text: `⚠️ Hubo un error al procesar tu solicitud. Por favor intenta nuevamente o contacta a TI.\n\nError: ${err.message}`,
    });
  }
});

// ─────────────────────────────────────────────
// BLOQUES DE MENSAJE DE APROBACIÓN
// ─────────────────────────────────────────────
function construirBloqueAprobacion(contrato, datos, departamento) {
  const monto = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(datos.monto);
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📋 Solicitud de Contrato — ${departamento.nombre}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Proveedor:*\n${datos.nombre_proveedor}` },
        { type: 'mrkdwn', text: `*RUT:*\n${datos.rut_proveedor}` },
        { type: 'mrkdwn', text: `*Tipo:*\n${datos.tipo_contrato}` },
        { type: 'mrkdwn', text: `*Monto:*\n${monto}` },
        { type: 'mrkdwn', text: `*Vigencia:*\n${datos.vigencia}` },
        { type: 'mrkdwn', text: `*Responsable:*\n<@${datos.responsable_interno}>` },
      ],
    },
    { type: 'divider' },
    {
      type: 'actions',
      block_id: `aprobacion_${departamento.key}`,
      elements: [
        {
          type: 'button',
          text:     { type: 'plain_text', text: 'Aprobar ✅' },
          style:    'primary',
          action_id: 'aprobar_contrato',
          value:    `${departamento.key}:${contrato.id}`,
        },
        {
          type: 'button',
          text:     { type: 'plain_text', text: 'Rechazar ❌' },
          style:    'danger',
          action_id: 'rechazar_contrato',
          value:    `${departamento.key}:${contrato.id}`,
        },
        {
          type: 'button',
          text:     { type: 'plain_text', text: 'Comentar 💬' },
          action_id: 'comentar_contrato',
          value:    `${departamento.key}:${contrato.id}`,
        },
      ],
    },
  ];
}

// ─────────────────────────────────────────────
// ACCIÓN: Aprobar contrato
// ─────────────────────────────────────────────
app.action('aprobar_contrato', async ({ ack, body, action, client, logger }) => {
  await ack();
  const [departamento, contratoId] = action.value.split(':');
  const aprobador = body.user.id;

  try {
    const contratoActualizado = await actualizarAprobacion(contratoId, departamento, 'aprobado', aprobador);
    await registrarEstado(contratoId, 'pendiente', `aprobado_${departamento}`, aprobador);

    // Reemplazar los botones por confirmación visual
    await client.chat.update({
      channel: body.channel.id,
      ts:      body.message.ts,
      text:    `✅ Aprobado por ${departamento}`,
      blocks: [
        ...body.message.blocks.slice(0, 3), // header + fields + divider
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `✅ *Aprobado* por <@${aprobador}>` },
        },
      ],
    });

    // Si todos aprobaron, iniciar registro en Finecto
    const { aprobaciones } = contratoActualizado;
    if (
      aprobaciones.compliance    === 'aprobado' &&
      aprobaciones.legal         === 'aprobado' &&
      aprobaciones.administracion === 'aprobado'
    ) {
      await finalizarAprobacion(client, contratoActualizado, logger);
    }

  } catch (err) {
    logger.error('[aprobar_contrato]', err);
  }
});

// ─────────────────────────────────────────────
// ACCIÓN: Rechazar contrato
// ─────────────────────────────────────────────
app.action('rechazar_contrato', async ({ ack, body, action, client, logger }) => {
  await ack();
  const [departamento, contratoId] = action.value.split(':');
  const rechazador = body.user.id;

  try {
    await actualizarAprobacion(contratoId, departamento, 'rechazado', rechazador);
    await registrarEstado(contratoId, 'pendiente', `rechazado_${departamento}`, rechazador);

    await client.chat.update({
      channel: body.channel.id,
      ts:      body.message.ts,
      text:    `❌ Rechazado por ${departamento}`,
      blocks: [
        ...body.message.blocks.slice(0, 3),
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `❌ *Rechazado* por <@${rechazador}>` },
        },
      ],
    });

    const contrato = await obtenerContrato(contratoId);
    await client.chat.postMessage({
      channel: contrato.solicitante_slack_id,
      text: `❌ Tu solicitud de contrato con *${contrato.nombre_proveedor}* fue *rechazada* por *${departamento}*. Por favor revisa los comentarios y contacta al equipo correspondiente.`,
    });

  } catch (err) {
    logger.error('[rechazar_contrato]', err);
  }
});

// ─────────────────────────────────────────────
// ACCIÓN: Abrir modal de comentario
// ─────────────────────────────────────────────
app.action('comentar_contrato', async ({ ack, body, action, client, logger }) => {
  await ack();
  const [departamento, contratoId] = action.value.split(':');

  try {
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'comentario_modal',
        private_metadata: JSON.stringify({
          departamento,
          contratoId,
          channel: body.channel.id,
          ts: body.message.ts,
        }),
        title:  { type: 'plain_text', text: 'Agregar Comentario' },
        submit: { type: 'plain_text', text: 'Enviar' },
        close:  { type: 'plain_text', text: 'Cancelar' },
        blocks: [
          {
            type: 'input',
            block_id: 'comentario',
            label: { type: 'plain_text', text: 'Comentario o solicitud de cambio' },
            element: {
              type: 'plain_text_input',
              action_id: 'value',
              multiline: true,
              placeholder: { type: 'plain_text', text: 'Escribe tu observación...' },
            },
          },
        ],
      },
    });
  } catch (err) {
    logger.error('[comentar_contrato]', err);
  }
});

// ─────────────────────────────────────────────
// SUBMIT MODAL: comentario
// ─────────────────────────────────────────────
app.view('comentario_modal', async ({ ack, view, body, client, logger }) => {
  await ack();
  const meta      = JSON.parse(view.private_metadata);
  const comentario = view.state.values.comentario.value.value;
  const autor      = body.user.id;

  try {
    await registrarEstado(meta.contratoId, 'pendiente', 'comentado', autor, comentario);

    const contrato = await obtenerContrato(meta.contratoId);
    await client.chat.postMessage({
      channel: contrato.solicitante_slack_id,
      text: `💬 *Comentario de ${meta.departamento}* sobre el contrato con *${contrato.nombre_proveedor}*:\n\n>${comentario}\n\n_— <@${autor}>_`,
    });
  } catch (err) {
    logger.error('[comentario_modal submit]', err);
  }
});

// ─────────────────────────────────────────────
// FLUJO FINAL: todos aprobaron → Finecto → notificar
// ─────────────────────────────────────────────
async function finalizarAprobacion(client, contrato, logger) {
  try {
    await client.chat.postMessage({
      channel: contrato.solicitante_slack_id,
      text: `✅ Todos los equipos aprobaron el contrato con *${contrato.nombre_proveedor}*. Registrando en Finecto... ⏳`,
    });

    await crearRegistroFinecto(contrato);

    await registrarEstado(contrato.id, 'aprobado', 'registrado_finecto', 'sistema');

    await client.chat.postMessage({
      channel: contrato.solicitante_slack_id,
      text: `🎉 ¡Listo! El contrato con *${contrato.nombre_proveedor}* fue aprobado por todos los equipos y registrado en Finecto exitosamente.`,
    });

  } catch (err) {
    logger.error('[finalizarAprobacion]', err);
    await client.chat.postMessage({
      channel: contrato.solicitante_slack_id,
      text: `⚠️ El contrato fue aprobado pero hubo un error al registrarlo en Finecto. Por favor contacta a TI.\n\nError: ${err.message}`,
    });
  }
}

// ─────────────────────────────────────────────
// INICIAR BOT
// ─────────────────────────────────────────────
async function iniciar() {
  await app.start();
  console.log('⚡ Bot de Global66 corriendo en modo Socket Mode');
}

module.exports = { app, iniciar };
