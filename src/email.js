// Email vía Resend (https://resend.com). Free tier 3k/mes.
// Fallback: console.log si MOCK_MODE o sin RESEND_API_KEY.

import { MOCK } from './mock_mode.js';

// Email backends, en orden de preferencia:
// 1. N8N_EMAIL_WEBHOOK_URL (workflow Gmail centralizado)
// 2. RESEND_API_KEY (Resend SaaS)
// 3. MOCK → console.log

const N8N_WEBHOOK = process.env.N8N_EMAIL_WEBHOOK_URL;
const N8N_SECRET = process.env.N8N_EMAIL_WEBHOOK_SECRET; // header opcional
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? 'Global66 Contratos <onboarding@resend.dev>';
// Reply-To por default (si no se pasa explícito por call). Mientras dominio no esté verificado,
// usar EMAIL_REPLY_TO para que destinatarios respondan a humano real, no a onboarding@resend.dev.
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO;

export async function sendEmail({ to, subject, html, text, replyTo, tags }) {
  const effectiveReplyTo = replyTo ?? DEFAULT_REPLY_TO;
  if (MOCK || (!N8N_WEBHOOK && !RESEND_KEY)) {
    console.log('\n📧 [MOCK email]');
    console.log('  to:', to);
    console.log('  subject:', subject);
    console.log('  body (preview):', (text ?? html ?? '').slice(0, 200), '...\n');
    return { id: 'mock-email-' + Date.now(), mocked: true };
  }

  if (N8N_WEBHOOK) {
    const headers = { 'Content-Type': 'application/json' };
    if (N8N_SECRET) headers['X-Webhook-Secret'] = N8N_SECRET;
    const r = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: Array.isArray(to) ? to : [to],
        from: FROM,
        subject,
        html,
        text,
        replyTo: effectiveReplyTo,
        tags,
        sentAt: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error(`n8n email webhook ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const body = await r.text();
    try { return JSON.parse(body); } catch { return { ok: true, body }; }
  }

  // Resend fallback
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: effectiveReplyTo,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

export function magicLinkEmail({ email, magicLink, role }) {
  const subject = `Tu acceso a la plataforma Global66 Contratos`;
  const html = `<!doctype html>
<html><body style="font-family:'Inter',system-ui,Arial;background:#f5f7fe;margin:0;padding:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,32,70,0.06)">
  <div style="background:linear-gradient(135deg,#1F49B6,#3F5EDF);padding:32px;color:white;text-align:center">
    <div style="display:inline-flex;align-items:center;gap:10px;margin-bottom:14px">
      <div style="width:38px;height:38px;border-radius:9px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-family:'Montserrat',sans-serif;font-size:20px">G</div>
      <div style="font-family:'Montserrat',sans-serif;font-weight:800;font-size:18px;letter-spacing:-0.02em">global66 · contratos</div>
    </div>
    <h1 style="font-family:'Montserrat',sans-serif;font-size:24px;font-weight:700;margin:6px 0;letter-spacing:-0.02em">Tu link de acceso</h1>
  </div>
  <div style="padding:32px;text-align:center">
    <p style="margin:0 0 20px;color:#132046;font-size:15px;line-height:1.6">
      Click el botón para entrar a la plataforma. Link válido por 1 hora.
    </p>
    <a href="${magicLink}" style="display:inline-block;background:#1F49B6;color:white;padding:14px 40px;border-radius:999px;text-decoration:none;font-weight:600;box-shadow:0 4px 14px rgba(31,73,182,0.3)">Entrar →</a>
    <p style="margin:28px 0 0;color:#565656;font-size:11px;word-break:break-all">
      ¿No funciona? Copiá: <br><span style="color:#1F49B6">${magicLink}</span>
    </p>
    ${role === 'admin' ? '<div style="margin-top:24px;padding:12px;background:rgba(2,167,87,0.08);border-radius:8px;font-size:12px;color:#02A757"><b>Rol:</b> admin · podés gestionar usuarios</div>' : ''}
  </div>
  <div style="background:#f5f7fe;padding:14px;text-align:center;color:#565656;font-size:11px">Si no pediste este link, ignorá este mail. Global66</div>
</div>
</body></html>`;
  const text = `Link de acceso Global66 Contratos:\n${magicLink}\n\nVálido por 1 hora.`;
  return { subject, html, text };
}

export function providerInvitation({ providerName, profileUrl, sociedadContratante, solicitanteNombre, sociedadDocs }) {
  const subject = `Completá tu perfil de proveedor — Global66`;

  const baseList = (sociedadDocs?.base_docs ?? [])
    .map((d) => `<li style="margin:4px 0">${d.name}${d.valid_months ? ` <span style="color:#999;font-size:11px">(vigencia ${d.valid_months}m)</span>` : ''}</li>`)
    .join('');
  const signList = (sociedadDocs?.documents_to_sign ?? [])
    .map((d) => `<li style="margin:8px 0;padding:10px 12px;background:#f5f7fe;border-radius:8px;border:1px solid #E9EDF8">
      <div style="font-weight:600;color:#132046;font-size:13.5px">${d.name}</div>
      ${d.template_url ? `<a href="${d.template_url}" style="display:inline-block;margin-top:6px;padding:6px 14px;background:#1F49B6;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600">⬇ Descargar plantilla</a>` : `<span style="color:#999;font-size:11px">Plantilla disponible en la plataforma</span>`}
    </li>`)
    .join('');

  const docsSection = sociedadDocs ? `
    <h3 style="font-family:'Montserrat',sans-serif;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#565656;margin:28px 0 8px">📁 Documentos que vas a necesitar</h3>
    <p style="color:#132046;font-size:13px;margin:0 0 12px">Según la sociedad contratante (<b>${sociedadDocs.name}</b>):</p>
    ${baseList ? `<ul style="padding-left:20px;margin:0;color:#132046;font-size:14px">${baseList}</ul>` : ''}
    ${signList ? `<h4 style="font-size:13px;color:#132046;margin:18px 0 8px">Documentos para firmar — descargá, firmá y subí</h4><ul style="padding:0;margin:0;list-style:none;color:#132046;font-size:14px">${signList}</ul>` : ''}
  ` : '';

  const html = `<!doctype html>
<html><body style="font-family:'Inter',system-ui,Arial;background:#f5f7fe;margin:0;padding:0">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,32,70,0.06)">
  <div style="background:linear-gradient(135deg,#1F49B6,#3F5EDF);padding:32px;color:white">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-family:'Montserrat',sans-serif;font-size:18px">G</div>
      <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px">global66 · contratos</div>
    </div>
    <h1 style="font-family:'Montserrat',sans-serif;font-size:24px;font-weight:700;margin:16px 0 6px;letter-spacing:-0.02em">Hola ${providerName}</h1>
    <p style="margin:0;opacity:0.9;font-size:14px">Te invitamos a completar tu perfil como proveedor.</p>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 14px;color:#132046;font-size:15px;line-height:1.6">
      ${solicitanteNombre ?? 'El equipo de Global66'} inició el proceso de alta para firmar un contrato con tu empresa.
      ${sociedadContratante ? 'La sociedad contratante será <b>' + sociedadContratante + '</b>.' : ''}
    </p>
    <p style="margin:0 0 24px;color:#132046;font-size:15px;line-height:1.6">
      Para avanzar, completá tu perfil en este link (toma 5 minutos):
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${profileUrl}" style="display:inline-block;background:#1F49B6;color:white;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;box-shadow:0 4px 14px rgba(31,73,182,0.3)">Completar perfil →</a>
    </div>

    ${docsSection}

    <p style="margin:24px 0 0;color:#565656;font-size:12px;text-align:center;word-break:break-all">
      ¿No funciona el botón? Copiá este link:<br>
      <span style="color:#1F49B6">${profileUrl}</span>
    </p>
    <hr style="border:none;border-top:1px solid #E9EDF8;margin:24px 0">
    <p style="margin:0;color:#565656;font-size:12px;line-height:1.5">
      Tu perfil queda guardado. Si en el futuro firmamos más contratos contigo, no vas a tener que volver a llenar todos los datos.
    </p>
  </div>
  <div style="background:#f5f7fe;padding:16px 32px;text-align:center;color:#565656;font-size:12px">Global66 · Procedimiento G81-PRO-005</div>
</div>
</body></html>`;
  const docsText = sociedadDocs
    ? `\n\nDocumentos requeridos (${sociedadDocs.name}):\n` +
      (sociedadDocs.base_docs ?? []).map((d) => `  - ${d.name}`).join('\n') +
      ((sociedadDocs.documents_to_sign ?? []).length ? '\n\nPara firmar:\n' + sociedadDocs.documents_to_sign.map((d) => `  - ${d.name}`).join('\n') : '')
    : '';
  const text = `Hola ${providerName},\n\nGlobal66 inició el proceso para firmar un contrato contigo.\nPara avanzar, completá tu perfil en: ${profileUrl}${docsText}\n\n— Global66`;
  return { subject, html, text };
}

export function providerRevisionRequest({ providerName, profileUrl, comment, solicitanteNombre, approverEmail }) {
  const subject = `📋 Revisión necesaria en tu información — Global66`;
  const commentBlock = comment
    ? `<div style="background:#FFF7E5;border-left:3px solid #E69A00;padding:14px 18px;border-radius:8px;margin:18px 0;color:#132046;font-size:14px;line-height:1.5"><b style="display:block;margin-bottom:4px">Comentario del revisor:</b>${comment}</div>`
    : '';
  const html = `<!doctype html>
<html><body style="font-family:'Inter',system-ui,Arial;background:#f5f7fe;margin:0;padding:0">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,32,70,0.06)">
  <div style="background:linear-gradient(135deg,#E69A00,#F0B040);padding:32px;color:white">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-family:'Montserrat',sans-serif;font-size:18px">G</div>
      <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px">global66 · contratos</div>
    </div>
    <h1 style="font-family:'Montserrat',sans-serif;font-size:22px;font-weight:700;margin:16px 0 6px;letter-spacing:-0.02em">Hola ${providerName}</h1>
    <p style="margin:0;opacity:0.95;font-size:14px">Necesitamos que revises algunos datos de tu perfil.</p>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 14px;color:#132046;font-size:15px;line-height:1.6">
      ${solicitanteNombre ?? 'El equipo de Global66'} revisó la información que enviaste y nos pidió que te contactemos para ajustar algunos puntos antes de continuar con el proceso de alta.
    </p>
    ${commentBlock}
    <p style="margin:0 0 24px;color:#132046;font-size:15px;line-height:1.6">
      Ingresá al link de tu perfil, corrige los datos indicados y volvé a guardar:
    </p>
    <div style="text-align:center;margin:28px 0">
      <a href="${profileUrl}" style="display:inline-block;background:#1F49B6;color:white;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600;box-shadow:0 4px 14px rgba(31,73,182,0.3)">Revisar mi perfil →</a>
    </div>
    <p style="margin:24px 0 0;color:#565656;font-size:12px;text-align:center;word-break:break-all">
      ¿No funciona el botón? Copiá este link:<br>
      <span style="color:#1F49B6">${profileUrl}</span>
    </p>
    <hr style="border:none;border-top:1px solid #E9EDF8;margin:24px 0">
    <p style="margin:0;color:#565656;font-size:12px;line-height:1.5">
      Si tenés dudas sobre qué corregir, respondé este correo${approverEmail ? ` o escribí directo a <a href="mailto:${approverEmail}" style="color:#1F49B6">${approverEmail}</a>` : ''}.
    </p>
  </div>
  <div style="background:#f5f7fe;padding:16px 32px;text-align:center;color:#565656;font-size:12px">Global66 · Procedimiento G81-PRO-005</div>
</div>
</body></html>`;
  const text = `Hola ${providerName},\n\nRevisamos la información de tu perfil y necesitamos algunos ajustes${comment ? `:\n\n${comment}\n` : '.\n'}\nIngresá a tu perfil para corregir: ${profileUrl}\n\n— Global66`;
  return { subject, html, text };
}

export function intakeConfirmation({ runId, solicitanteNombre, razonSocial, taxId, pais, monto, moneda }) {
  const subject = `✓ Solicitud recibida: ${razonSocial}`;

  const html = `<!doctype html>
<html><body style="font-family:'Inter',system-ui,Arial;background:#f5f7fe;margin:0;padding:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,32,70,0.06)">
  <div style="background:linear-gradient(135deg,#1F49B6,#3F5EDF);padding:32px 32px 24px;color:white">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.18);display:flex;align-items:center;justify-content:center;font-weight:800;font-family:'Montserrat',sans-serif;font-size:18px">G</div>
      <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px;letter-spacing:-0.02em">global66 · contratos</div>
    </div>
    <h1 style="font-family:'Montserrat',sans-serif;font-size:24px;font-weight:700;margin:16px 0 6px;letter-spacing:-0.02em">Recibimos tu solicitud ✓</h1>
    <p style="margin:0;opacity:0.9;font-size:14px">${solicitanteNombre ? 'Hola ' + solicitanteNombre + ', g' : 'G'}racias por completar el formulario.</p>
  </div>

  <div style="padding:32px">
    <p style="margin:0 0 18px;color:#132046;font-size:15px;line-height:1.6">
      Tu solicitud de contrato fue registrada y entró al flujo de revisión.
    </p>

    <div style="background:#f5f7fe;border-radius:12px;padding:18px;margin:18px 0;font-size:14px">
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#565656">Proveedor</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#132046">${razonSocial}</td></tr>
        ${taxId ? `<tr><td style="padding:4px 0;color:#565656">Tax ID</td><td style="padding:4px 0;text-align:right;color:#132046">${taxId}</td></tr>` : ''}
        ${pais ? `<tr><td style="padding:4px 0;color:#565656">País</td><td style="padding:4px 0;text-align:right;color:#132046">${pais}</td></tr>` : ''}
        ${monto ? `<tr><td style="padding:4px 0;color:#565656">Monto</td><td style="padding:4px 0;text-align:right;color:#132046">${new Intl.NumberFormat('es-CL').format(monto)} ${moneda ?? ''}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#565656">ID de solicitud</td><td style="padding:4px 0;text-align:right;font-family:monospace;font-size:12px;color:#565656">${runId.slice(0, 8)}</td></tr>
      </table>
    </div>

    <h3 style="font-family:'Montserrat',sans-serif;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#565656;margin:24px 0 12px">Qué pasa ahora</h3>
    <ol style="margin:0;padding-left:18px;color:#132046;font-size:14px;line-height:1.7">
      <li>Nuestra IA analiza el borrador del contrato (riesgos, cláusulas, compliance)</li>
      <li>Compliance, Legal y Administración revisan en paralelo</li>
      <li>Si todo OK, te llega aviso para coordinar firma con el proveedor</li>
    </ol>

    <p style="margin:24px 0 0;color:#565656;font-size:13px;line-height:1.5">
      ⚠️ <b>Importante:</b> no firmes ningún acuerdo antes de que Legal Lead, Administración y Control de Gestión hayan completado su revisión.
    </p>
  </div>

  <div style="background:#f5f7fe;padding:16px 32px;text-align:center;color:#565656;font-size:12px">
    Plataforma interna · Global66 · Procedimiento G81-PRO-005
  </div>
</div>
</body></html>`;

  const text = `Recibimos tu solicitud — Global66 Contratos\n\n` +
    `Proveedor: ${razonSocial}\n` +
    (taxId ? `Tax ID: ${taxId}\n` : '') +
    (pais ? `País: ${pais}\n` : '') +
    (monto ? `Monto: ${monto} ${moneda ?? ''}\n` : '') +
    `ID solicitud: ${runId.slice(0, 8)}\n\n` +
    `Qué pasa ahora:\n` +
    `1. IA analiza el borrador (riesgos, cláusulas, compliance)\n` +
    `2. Compliance, Legal y Administración revisan en paralelo\n` +
    `3. Si todo OK, te avisamos para coordinar firma\n\n` +
    `⚠️ No firmes ningún acuerdo antes de que las 3 áreas aprueben.\n\n` +
    `— Global66 · G81-PRO-005`;

  return { subject, html, text };
}
