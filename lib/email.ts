import 'server-only';

// Email backends en orden de preferencia (mismo contrato que legacy):
//   1. N8N_EMAIL_WEBHOOK_URL (workflow Gmail centralizado)
//   2. RESEND_API_KEY (Resend SaaS)
//   3. MOCK → console.log
const N8N_WEBHOOK = process.env.N8N_EMAIL_WEBHOOK_URL;
const N8N_SECRET = process.env.N8N_EMAIL_WEBHOOK_SECRET;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM = process.env.EMAIL_FROM ?? process.env.RESEND_FROM ?? 'Global66 Contratos <onboarding@resend.dev>';
const DEFAULT_REPLY_TO = process.env.EMAIL_REPLY_TO;
const MOCK = process.env.MOCK_MODE === 'true';

export interface EmailTemplate { subject: string; html: string; text: string; }
interface SendEmailArgs { to: string | string[]; subject: string; html: string; text: string; replyTo?: string; tags?: string[]; }

export async function sendEmail({ to, subject, html, text, replyTo, tags }: SendEmailArgs): Promise<unknown> {
  const effectiveReplyTo = replyTo ?? DEFAULT_REPLY_TO;
  if (MOCK || (!N8N_WEBHOOK && !RESEND_KEY)) {
    console.log('📧 [MOCK email] to:', to, '| subject:', subject);
    return { id: 'mock-email-' + Date.now(), mocked: true };
  }

  if (N8N_WEBHOOK) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (N8N_SECRET) headers['X-Webhook-Secret'] = N8N_SECRET;
    const r = await fetch(N8N_WEBHOOK, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        to: Array.isArray(to) ? to : [to],
        from: FROM, subject, html, text,
        replyTo: effectiveReplyTo, tags,
        sentAt: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error(`n8n email webhook ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const body = await r.text();
    try { return JSON.parse(body); } catch { return { ok: true, body }; }
  }

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: Array.isArray(to) ? to : [to], subject, html, text, reply_to: effectiveReplyTo }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
  return r.json();
}

interface SociedadDocs {
  name?: string;
  base_docs?: { name: string; valid_months?: number | null }[];
  documents_to_sign?: { name: string; template_url?: string | null }[];
}

export function providerInvitation({ providerName, profileUrl, sociedadContratante, solicitanteNombre, sociedadDocs }: {
  providerName: string; profileUrl: string; sociedadContratante?: string | null; solicitanteNombre?: string | null; sociedadDocs?: SociedadDocs | null;
}): EmailTemplate {
  const subject = 'Completa tu perfil de proveedor — Global66';
  const baseList = (sociedadDocs?.base_docs ?? [])
    .map((d) => `<li style="margin:4px 0">${d.name}${d.valid_months ? ` <span style="color:#999;font-size:11px">(vigencia ${d.valid_months}m)</span>` : ''}</li>`).join('');
  const signList = (sociedadDocs?.documents_to_sign ?? [])
    .map((d) => `<li style="margin:8px 0;padding:10px 12px;background:#f5f7fe;border-radius:8px;border:1px solid #E9EDF8"><div style="font-weight:600;color:#132046;font-size:13.5px">${d.name}</div>${d.template_url ? `<a href="${d.template_url}" style="display:inline-block;margin-top:6px;padding:6px 14px;background:#1F49B6;color:white;text-decoration:none;border-radius:6px;font-size:12px;font-weight:600">⬇ Descargar plantilla</a>` : `<span style="color:#999;font-size:11px">Plantilla disponible en la plataforma</span>`}</li>`).join('');
  const docsSection = sociedadDocs ? `
    <h3 style="font-family:'Montserrat',sans-serif;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#565656;margin:28px 0 8px">📁 Documentos que vas a necesitar</h3>
    <p style="color:#132046;font-size:13px;margin:0 0 12px">Según la sociedad contratante (<b>${sociedadDocs.name}</b>):</p>
    ${baseList ? `<ul style="padding-left:20px;margin:0;color:#132046;font-size:14px">${baseList}</ul>` : ''}
    ${signList ? `<h4 style="font-size:13px;color:#132046;margin:18px 0 8px">Documentos para firmar — descarga, firma y sube</h4><ul style="padding:0;margin:0;list-style:none;color:#132046;font-size:14px">${signList}</ul>` : ''}` : '';
  const html = `<!doctype html><html><body style="font-family:'Inter',system-ui,Arial;background:#f5f7fe;margin:0;padding:0">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,32,70,0.06)">
  <div style="background:linear-gradient(135deg,#1F49B6,#3F5EDF);padding:32px;color:white">
    <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px">global66 · contratos</div>
    <h1 style="font-family:'Montserrat',sans-serif;font-size:24px;font-weight:700;margin:16px 0 6px">Hola ${providerName}</h1>
    <p style="margin:0;opacity:0.9;font-size:14px">Te invitamos a completar tu perfil como proveedor.</p>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 14px;color:#132046;font-size:15px;line-height:1.6">${solicitanteNombre ?? 'El equipo de Global66'} inició el proceso de alta para firmar un contrato con tu empresa.${sociedadContratante ? ' La sociedad contratante será <b>' + sociedadContratante + '</b>.' : ''}</p>
    <p style="margin:0 0 24px;color:#132046;font-size:15px;line-height:1.6">Para avanzar, completa tu perfil en este link (toma 5 minutos):</p>
    <div style="text-align:center;margin:28px 0"><a href="${profileUrl}" style="display:inline-block;background:#1F49B6;color:white;padding:14px 32px;border-radius:999px;text-decoration:none;font-weight:600">Completar perfil →</a></div>
    ${docsSection}
    <p style="margin:24px 0 0;color:#565656;font-size:12px;text-align:center;word-break:break-all">¿No funciona el botón? Copia este link:<br><span style="color:#1F49B6">${profileUrl}</span></p>
  </div>
  <div style="background:#f5f7fe;padding:16px 32px;text-align:center;color:#565656;font-size:12px">Global66 · Procedimiento G81-PRO-005</div>
</div></body></html>`;
  const docsText = sociedadDocs
    ? `\n\nDocumentos requeridos (${sociedadDocs.name}):\n` + (sociedadDocs.base_docs ?? []).map((d) => `  - ${d.name}`).join('\n') +
      ((sociedadDocs.documents_to_sign ?? []).length ? '\n\nPara firmar:\n' + (sociedadDocs.documents_to_sign ?? []).map((d) => `  - ${d.name}`).join('\n') : '')
    : '';
  const text = `Hola ${providerName},\n\nGlobal66 inició el proceso para firmar un contrato contigo.\nPara avanzar, completa tu perfil en: ${profileUrl}${docsText}\n\n— Global66`;
  return { subject, html, text };
}

export function providerProgressNotification({ providerName, razonSocial, event }: {
  providerName: string; razonSocial: string; event: string;
}): EmailTemplate {
  const events: Record<string, { subject: string; heading: string; message: string; next: string; color: string }> = {
    advanced_to_validation: { subject: '✓ Tu solicitud avanzó — Global66', heading: 'Estamos por terminar', message: 'Tus datos y documentos fueron recibidos. Las aprobaciones internas están OK. Tu solicitud entró a la validación final.', next: 'Si todo sale OK, en los próximos días vas a recibir el contrato para firmar por SignNow.', color: '#02A757' },
    contract_ready_to_sign: { subject: '✍️ Contrato listo para firmar — Global66', heading: 'Tu contrato te espera', message: 'El contrato fue revisado y aprobado internamente. Lo enviamos a tu correo desde SignNow.', next: 'Revisa tu inbox y busca el email de SignNow para firmar electrónicamente.', color: '#1F49B6' },
    contract_signed: { subject: '✓ Contrato firmado — Global66', heading: '¡Listo!', message: 'El contrato está firmado por ambas partes y archivado.', next: 'Vas a recibir una copia firmada por separado.', color: '#02A757' },
  };
  const ev = events[event] ?? events.advanced_to_validation;
  const html = `<!doctype html><html><body style="font-family:'Inter',system-ui,Arial;background:#f5f7fe;margin:0;padding:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,32,70,0.06)">
  <div style="background:linear-gradient(135deg,${ev.color},#3F5EDF);padding:32px;color:white">
    <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px">global66 · contratos</div>
    <h1 style="font-family:'Montserrat',sans-serif;font-size:22px;font-weight:700;margin:6px 0">${ev.heading}</h1>
    <p style="margin:6px 0 0;opacity:0.95;font-size:14px">Hola ${providerName}</p>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 16px;color:#132046;font-size:15px;line-height:1.6">${ev.message}</p>
    <div style="background:#f5f7fe;border-left:3px solid ${ev.color};padding:14px 18px;border-radius:8px;margin:18px 0;color:#132046;font-size:13.5px;line-height:1.5"><b style="display:block;margin-bottom:4px">Próximo paso:</b>${ev.next}</div>
    <p style="margin:24px 0 0;color:#565656;font-size:12px">Razón social: <b>${razonSocial}</b></p>
  </div>
  <div style="background:#f5f7fe;padding:14px;text-align:center;color:#565656;font-size:11px">Global66 · Procedimiento G81-PRO-005</div>
</div></body></html>`;
  const text = `Hola ${providerName},\n\n${ev.message}\n\nPróximo paso: ${ev.next}\n\nRazón social: ${razonSocial}\n\n— Global66`;
  return { subject: ev.subject, html, text };
}

export function intakeConfirmation({ runId, solicitanteNombre, razonSocial, taxId, pais, monto, moneda }: {
  runId: string; solicitanteNombre?: string | null; razonSocial: string; taxId?: string | null; pais?: string | null; monto?: number | null; moneda?: string | null;
}): EmailTemplate {
  const subject = `✓ Solicitud recibida: ${razonSocial}`;
  const html = `<!doctype html><html><body style="font-family:'Inter',system-ui,Arial;background:#f5f7fe;margin:0;padding:0">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(19,32,70,0.06)">
  <div style="background:linear-gradient(135deg,#1F49B6,#3F5EDF);padding:32px 32px 24px;color:white">
    <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:16px">global66 · contratos</div>
    <h1 style="font-family:'Montserrat',sans-serif;font-size:24px;font-weight:700;margin:16px 0 6px">Recibimos tu solicitud ✓</h1>
    <p style="margin:0;opacity:0.9;font-size:14px">${solicitanteNombre ? 'Hola ' + solicitanteNombre + ', g' : 'G'}racias por completar el formulario.</p>
  </div>
  <div style="padding:32px">
    <p style="margin:0 0 18px;color:#132046;font-size:15px;line-height:1.6">Tu solicitud de contrato fue registrada y entró al flujo de revisión.</p>
    <div style="background:#f5f7fe;border-radius:12px;padding:18px;margin:18px 0;font-size:14px"><table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:4px 0;color:#565656">Proveedor</td><td style="padding:4px 0;text-align:right;font-weight:600;color:#132046">${razonSocial}</td></tr>
      ${taxId ? `<tr><td style="padding:4px 0;color:#565656">Tax ID</td><td style="padding:4px 0;text-align:right;color:#132046">${taxId}</td></tr>` : ''}
      ${pais ? `<tr><td style="padding:4px 0;color:#565656">País</td><td style="padding:4px 0;text-align:right;color:#132046">${pais}</td></tr>` : ''}
      ${monto ? `<tr><td style="padding:4px 0;color:#565656">Monto</td><td style="padding:4px 0;text-align:right;color:#132046">${new Intl.NumberFormat('es-CL').format(monto)} ${moneda ?? ''}</td></tr>` : ''}
      <tr><td style="padding:4px 0;color:#565656">ID de solicitud</td><td style="padding:4px 0;text-align:right;font-family:monospace;font-size:12px;color:#565656">${runId.slice(0, 8)}</td></tr>
    </table></div>
    <h3 style="font-family:'Montserrat',sans-serif;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#565656;margin:24px 0 12px">Qué pasa ahora</h3>
    <ol style="margin:0;padding-left:18px;color:#132046;font-size:14px;line-height:1.7">
      <li>Nuestra IA analiza el borrador del contrato (riesgos, cláusulas, compliance)</li>
      <li>Compliance, Legal y Administración revisan en paralelo</li>
      <li>Si todo OK, te llega aviso para coordinar firma con el proveedor</li>
    </ol>
    <p style="margin:24px 0 0;color:#565656;font-size:13px;line-height:1.5">⚠️ <b>Importante:</b> no firmes ningún acuerdo antes de que las áreas hayan completado su revisión.</p>
  </div>
  <div style="background:#f5f7fe;padding:16px 32px;text-align:center;color:#565656;font-size:12px">Plataforma interna · Global66 · Procedimiento G81-PRO-005</div>
</div></body></html>`;
  const text = `Recibimos tu solicitud — Global66 Contratos\n\nProveedor: ${razonSocial}\n` +
    (taxId ? `Tax ID: ${taxId}\n` : '') + (pais ? `País: ${pais}\n` : '') + (monto ? `Monto: ${monto} ${moneda ?? ''}\n` : '') +
    `ID solicitud: ${runId.slice(0, 8)}\n\nQué pasa ahora:\n1. IA analiza el borrador\n2. Compliance, Legal y Administración revisan en paralelo\n3. Si todo OK, te avisamos para coordinar firma\n\n— Global66 · G81-PRO-005`;
  return { subject, html, text };
}
