// Email vía Resend (https://resend.com). Free tier 3k/mes.
// Fallback: console.log si MOCK_MODE o sin RESEND_API_KEY.

import { MOCK } from './mock_mode.js';

const KEY = process.env.RESEND_API_KEY;
const FROM = process.env.RESEND_FROM ?? 'Global66 Contratos <contratos@global66.com>';

export async function sendEmail({ to, subject, html, text, replyTo }) {
  if (MOCK || !KEY) {
    console.log('\n📧 [MOCK email]');
    console.log('  to:', to);
    console.log('  subject:', subject);
    console.log('  body (preview):', (text ?? html ?? '').slice(0, 200), '...\n');
    return { id: 'mock-email-' + Date.now(), mocked: true };
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo,
    }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
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
