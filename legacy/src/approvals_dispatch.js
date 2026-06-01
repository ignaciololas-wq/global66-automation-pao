// PR-B: dispatcher de aprobaciones internas (compliance/legal/admin) en paralelo a datos proveedor.

import { sb, logAudit } from './supabase_audit.js';
import { approvalBlocks, riskSummaryFromExtraction } from './slack_blocks.js';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SITE_URL = (process.env.SITE_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');

const DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL ?? process.env.SLACK_COMPLIANCE_CHANNEL;
const CHANNELS = {
  compliance: process.env.SLACK_COMPLIANCE_CHANNEL || DEFAULT_CHANNEL,
  legal: process.env.SLACK_LEGAL_CHANNEL || DEFAULT_CHANNEL,
  admin: process.env.SLACK_ADMIN_CHANNEL || DEFAULT_CHANNEL,
};

// Emails de aprobadores por equipo (coma-separados). Si están seteados, las
// aprobaciones van por DM directo a cada persona en vez de a un canal.
const parseEmails = (v) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TEAM_EMAILS = {
  compliance: parseEmails(process.env.SLACK_COMPLIANCE_EMAILS),
  legal: parseEmails(process.env.SLACK_LEGAL_EMAILS),
  admin: parseEmails(process.env.SLACK_ADMIN_EMAILS),
};

const SLACK_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${SLACK_TOKEN}` };

async function postBlocks(channel, blocks, text, team) {
  if (!SLACK_TOKEN) {
    console.warn(`[slack] SLACK_BOT_TOKEN missing — skipping ${team} approval message`);
    return { ok: false, error: 'slack_not_configured' };
  }
  if (!channel) {
    console.warn(`[slack] SLACK_${team.toUpperCase()}_CHANNEL not set + no SLACK_DEFAULT_CHANNEL fallback — skipping ${team}`);
    return { ok: false, error: 'channel_not_configured' };
  }
  const r = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: SLACK_HEADERS,
    body: JSON.stringify({ channel, text, blocks }),
  });
  const result = await r.json();
  if (!result.ok) console.warn(`[slack] ${team} → channel ${channel} failed:`, result.error);
  return result;
}

// DM directo a un aprobador por email: lookupByEmail → conversations.open → postMessage.
// No requiere invitar al bot a ningún canal (a diferencia de postBlocks a canal privado).
async function dmApprover(email, blocks, text, team) {
  if (!SLACK_TOKEN) return { ok: false, error: 'slack_not_configured', email };
  const lk = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${SLACK_TOKEN}` },
  }).then((r) => r.json());
  if (!lk.ok || !lk.user?.id) {
    console.warn(`[slack] ${team} DM: usuario no encontrado para ${email}:`, lk.error);
    return { ok: false, error: lk.error ?? 'user_not_found', email };
  }
  const open = await fetch('https://slack.com/api/conversations.open', {
    method: 'POST', headers: SLACK_HEADERS, body: JSON.stringify({ users: lk.user.id }),
  }).then((r) => r.json());
  if (!open.ok || !open.channel?.id) {
    console.warn(`[slack] ${team} DM: conversations.open falló para ${email}:`, open.error);
    return { ok: false, error: open.error ?? 'open_failed', email };
  }
  const result = await postBlocks(open.channel.id, blocks, text, team);
  return { ...result, email };
}

// Manda los bloques de aprobación de un equipo: DM a cada aprobador si hay emails
// configurados; si no, cae al canal (retrocompatible).
async function sendTeamApproval(team, blocks, fallback) {
  const emails = TEAM_EMAILS[team];
  if (emails.length) {
    const dms = await Promise.all(emails.map((e) => dmApprover(e, blocks, fallback, team)));
    return { ok: dms.some((d) => d.ok), mode: 'dm', recipients: dms };
  }
  const r = await postBlocks(CHANNELS[team], blocks, fallback, team);
  return { ok: r.ok, mode: 'channel', ts: r.ts, error: r.error };
}

// Dispara mensajes Slack a los 3 equipos en paralelo.
// Devuelve resumen { team: {ok, error?} }.
export async function dispatchApprovalRequests(runId) {
  const { data: run, error: runErr } = await sb
    .from('workflow_runs')
    .select('*')
    .eq('id', runId)
    .single();
  if (runErr || !run) throw new Error(`run not found: ${runId}`);

  const { data: ext } = await sb
    .from('extractions')
    .select('extracted_json')
    .eq('workflow_run_id', runId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const supplier = {
    razon_social: run.razon_social,
    tax_id: run.tax_id,
    pais: run.pais,
  };
  const contract = {
    tipo_contrato: run.tipo_contrato,
    monto: run.monto,
    moneda: run.moneda,
    vigencia_meses: run.vigencia_meses,
  };
  const riskSummary = riskSummaryFromExtraction(ext?.extracted_json);
  const draftUrl = `${SITE_URL}/admin#workflows/${runId}`;

  const teams = ['compliance', 'legal', 'admin'];
  const results = await Promise.all(
    teams.map(async (team) => {
      try {
        const blocks = approvalBlocks({ team, runId, supplier, contract, riskSummary, draftUrl });
        const fallback = `Nuevo contrato para revisión ${team}: ${supplier.razon_social} (${supplier.tax_id})`;
        const r = await sendTeamApproval(team, blocks, fallback);
        return [team, r];
      } catch (e) {
        return [team, { ok: false, error: e.message }];
      }
    }),
  );
  const summary = Object.fromEntries(results);
  await logAudit(runId, 'system', 'approvals.dispatched', 'workflow_run', runId, summary);
  return summary;
}

// Chequea si ambos branches (datos proveedor + aprobaciones internas) están completos.
// Si sí, avanza a fase3 (validación docs). Idempotente.
export async function maybeAdvanceToFase3(runId) {
  const { data: run } = await sb.from('workflow_runs').select('*').eq('id', runId).single();
  if (!run) return { advanced: false, reason: 'run_not_found' };
  if (['rejected', 'cancelled', 'signed', 'fase3'].includes(run.current_phase)) {
    return { advanced: false, reason: `already_${run.current_phase}` };
  }

  const providerDone = !!run.provider_data_completed_at;
  const approvalsDone = !!run.internal_approvals_completed_at;

  if (!providerDone || !approvalsDone) {
    return { advanced: false, reason: 'pending', providerDone, approvalsDone };
  }

  await sb
    .from('workflow_runs')
    .update({ current_phase: 'fase3', active_phases: ['fase3_validation'] })
    .eq('id', runId);
  await logAudit(runId, 'system', 'phase.advanced_to_fase3', 'workflow_run', runId, {
    from_active: run.active_phases,
  });

  // Notificar al proveedor que su parte + aprobaciones internas pasaron OK.
  try {
    const { data: provider } = await sb.from('providers').select('email_contacto, razon_social, representante_legal').eq('tax_id', run.tax_id).maybeSingle();
    if (provider?.email_contacto) {
      const { sendEmail, providerProgressNotification } = await import('./email.js');
      const tpl = providerProgressNotification({
        providerName: provider.representante_legal ?? provider.razon_social,
        razonSocial: provider.razon_social,
        event: 'advanced_to_validation',
      });
      sendEmail({ to: provider.email_contacto, ...tpl }).catch((e) => console.error('Provider fase3 notify failed:', e.message));
    }
  } catch (e) {
    console.error('Provider notification on fase3 advance failed:', e.message);
  }

  return { advanced: true };
}

export async function markProviderDataDone(runId) {
  const { data: run } = await sb.from('workflow_runs').select('provider_data_completed_at, active_phases').eq('id', runId).single();
  if (!run || run.provider_data_completed_at) return;
  const newActive = (run.active_phases ?? []).filter((p) => p !== 'fase2_provider_data');
  await sb
    .from('workflow_runs')
    .update({
      provider_data_completed_at: new Date().toISOString(),
      active_phases: newActive,
    })
    .eq('id', runId);
  await logAudit(runId, 'system', 'provider_data.completed', 'workflow_run', runId, {});
  await maybeAdvanceToFase3(runId);
}

export async function markInternalApprovalsDone(runId, color, reason) {
  const { data: run } = await sb.from('workflow_runs').select('internal_approvals_completed_at, active_phases').eq('id', runId).single();
  if (!run || run.internal_approvals_completed_at) return;
  const newActive = (run.active_phases ?? []).filter((p) => p !== 'hito1_approvals');
  await sb
    .from('workflow_runs')
    .update({
      internal_approvals_completed_at: new Date().toISOString(),
      active_phases: newActive,
    })
    .eq('id', runId);
  await logAudit(runId, 'system', 'internal_approvals.completed', 'workflow_run', runId, { color, reason });
  if (color !== 'red') await maybeAdvanceToFase3(runId);
}
