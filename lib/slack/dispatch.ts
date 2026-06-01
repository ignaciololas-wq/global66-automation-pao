import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/data/approvals';
import { approvalBlocks, riskSummaryFromExtraction, type Team } from '@/lib/slack/blocks';
import { sendEmail, providerProgressNotification } from '@/lib/email';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const SITE_URL = (process.env.SITE_URL ?? 'https://global66-automation-pao.vercel.app').replace(/\/$/, '');

const DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL ?? process.env.SLACK_COMPLIANCE_CHANNEL;
const CHANNELS: Record<Team, string | undefined> = {
  compliance: process.env.SLACK_COMPLIANCE_CHANNEL || DEFAULT_CHANNEL,
  legal: process.env.SLACK_LEGAL_CHANNEL || DEFAULT_CHANNEL,
  admin: process.env.SLACK_ADMIN_CHANNEL || DEFAULT_CHANNEL,
};

const parseEmails = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const TEAM_EMAILS: Record<Team, string[]> = {
  compliance: parseEmails(process.env.SLACK_COMPLIANCE_EMAILS),
  legal: parseEmails(process.env.SLACK_LEGAL_EMAILS),
  admin: parseEmails(process.env.SLACK_ADMIN_EMAILS),
};

const SLACK_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${SLACK_TOKEN}` };
const ALL_TEAMS: Team[] = ['compliance', 'legal', 'admin'];

async function postBlocks(channel: string | undefined, blocks: unknown[], text: string, team: string) {
  if (!SLACK_TOKEN) { console.warn(`[slack] SLACK_BOT_TOKEN missing — skipping ${team}`); return { ok: false, error: 'slack_not_configured' }; }
  if (!channel) { console.warn(`[slack] no channel for ${team} (sin SLACK_DEFAULT_CHANNEL)`); return { ok: false, error: 'channel_not_configured' }; }
  const r = await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: SLACK_HEADERS, body: JSON.stringify({ channel, text, blocks }) });
  const result = await r.json();
  if (!result.ok) console.warn(`[slack] ${team} → channel ${channel} failed:`, result.error);
  return result;
}

// DM directo por email: lookupByEmail → conversations.open → postMessage.
async function dmApprover(email: string, blocks: unknown[], text: string, team: string) {
  if (!SLACK_TOKEN) return { ok: false, error: 'slack_not_configured', email };
  const lk = await fetch(`https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(email)}`, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }).then((r) => r.json());
  if (!lk.ok || !lk.user?.id) { console.warn(`[slack] ${team} DM: user not found ${email}:`, lk.error); return { ok: false, error: lk.error ?? 'user_not_found', email }; }
  const open = await fetch('https://slack.com/api/conversations.open', { method: 'POST', headers: SLACK_HEADERS, body: JSON.stringify({ users: lk.user.id }) }).then((r) => r.json());
  if (!open.ok || !open.channel?.id) { console.warn(`[slack] ${team} DM: open failed ${email}:`, open.error); return { ok: false, error: open.error ?? 'open_failed', email }; }
  const result = await postBlocks(open.channel.id, blocks, text, team);
  return { ...result, email };
}

// Normaliza país: minúsculas, sin tildes, códigos → nombre. run.pais llega sucio.
const COUNTRY_ALIASES: Record<string, string> = { cl: 'chile', co: 'colombia', ar: 'argentina', pe: 'peru', us: 'estados unidos', usa: 'estados unidos', mx: 'mexico', pa: 'panama' };
function canonCountry(s?: string | null): string {
  const t = String(s ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return COUNTRY_ALIASES[t] ?? t;
}

// Equipos requeridos para un país = los que tienen ≥1 aprobador. Sin config → los 3 clásicos.
export async function requiredApprovalTeams(pais?: string | null): Promise<Team[]> {
  if (!pais) return ALL_TEAMS;
  const sb = createAdminClient();
  const { data, error } = await sb.from('approval_assignments').select('team, country').eq('active', true);
  if (error) { console.warn('[approvals] requiredApprovalTeams failed:', error.message); return ALL_TEAMS; }
  const want = canonCountry(pais);
  const teams = new Set((data ?? []).filter((r: { country: string }) => canonCountry(r.country) === want).map((r: { team: string }) => r.team));
  return teams.size ? ALL_TEAMS.filter((t) => teams.has(t)) : ALL_TEAMS;
}

async function resolveDbApprovers(team: string, pais?: string | null): Promise<string[]> {
  if (!pais) return [];
  const sb = createAdminClient();
  const { data, error } = await sb.from('approval_assignments').select('email, country').eq('team', team).eq('active', true);
  if (error) { console.warn('[approvals] resolveDbApprovers failed:', error.message); return []; }
  const want = canonCountry(pais);
  return (data ?? []).filter((r: { country: string }) => canonCountry(r.country) === want).map((r: { email: string }) => r.email);
}

// Destinatarios: 1) aprobadores plataforma por país (DM) → 2) env (DM) → 3) canal.
async function sendTeamApproval(team: Team, blocks: unknown[], fallback: string, pais?: string | null) {
  const dbEmails = await resolveDbApprovers(team, pais);
  const emails = dbEmails.length ? dbEmails : TEAM_EMAILS[team];
  if (emails.length) {
    const dms = await Promise.all(emails.map((e) => dmApprover(e, blocks, fallback, team)));
    return { ok: dms.some((d) => d.ok), mode: dbEmails.length ? 'dm-db' : 'dm-env', recipients: dms };
  }
  const r = await postBlocks(CHANNELS[team], blocks, fallback, team);
  return { ok: r.ok, mode: 'channel', ts: r.ts, error: r.error };
}

// Dispara mensajes Slack a los equipos requeridos del país, en paralelo.
export async function dispatchApprovalRequests(runId: string): Promise<Record<string, unknown>> {
  const sb = createAdminClient();
  const { data: run, error: runErr } = await sb.from('workflow_runs').select('*').eq('id', runId).single();
  if (runErr || !run) throw new Error(`run not found: ${runId}`);

  const { data: ext } = await sb.from('extractions').select('extracted_json').eq('workflow_run_id', runId).order('created_at', { ascending: false }).limit(1).maybeSingle();

  const riskSummary = riskSummaryFromExtraction(ext?.extracted_json);
  const draftUrl = `${SITE_URL}/admin/workflows/${runId}`;

  const teams = await requiredApprovalTeams(run.pais);
  const results = await Promise.all(teams.map(async (team) => {
    try {
      const blocks = approvalBlocks({ team, runId, run, riskSummary, draftUrl });
      const fallback = `Nuevo contrato para revisión ${team}: ${run.razon_social} (${run.tax_id})`;
      return [team, await sendTeamApproval(team, blocks, fallback, run.pais)] as const;
    } catch (e: any) {
      return [team, { ok: false, error: e.message }] as const;
    }
  }));
  const summary = Object.fromEntries(results);
  await logAudit(runId, 'system', 'approvals.dispatched', 'workflow_run', runId, summary);
  return summary;
}

// Avanza a fase3 si datos proveedor + aprobaciones internas están done. Idempotente.
export async function maybeAdvanceToFase3(runId: string): Promise<{ advanced: boolean; reason?: string }> {
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('*').eq('id', runId).single();
  if (!run) return { advanced: false, reason: 'run_not_found' };
  if (['rejected', 'cancelled', 'signed', 'fase3'].includes(run.current_phase)) return { advanced: false, reason: `already_${run.current_phase}` };

  const providerDone = !!run.provider_data_completed_at;
  const approvalsDone = !!run.internal_approvals_completed_at;
  if (!providerDone || !approvalsDone) return { advanced: false, reason: 'pending' };

  await sb.from('workflow_runs').update({ current_phase: 'fase3', active_phases: ['fase3_validation'] }).eq('id', runId);
  await logAudit(runId, 'system', 'phase.advanced_to_fase3', 'workflow_run', runId, { from_active: run.active_phases });

  try {
    const { data: provider } = await sb.from('providers').select('email_contacto, razon_social, representante_legal').eq('tax_id', run.tax_id).maybeSingle();
    if (provider?.email_contacto) {
      const tpl = providerProgressNotification({ providerName: provider.representante_legal ?? provider.razon_social, razonSocial: provider.razon_social, event: 'advanced_to_validation' });
      sendEmail({ to: provider.email_contacto, ...tpl }).catch((e) => console.error('Provider fase3 notify failed:', e.message));
    }
  } catch (e: any) {
    console.error('Provider notification on fase3 advance failed:', e.message);
  }
  return { advanced: true };
}

export async function markProviderDataDone(runId: string) {
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('provider_data_completed_at, active_phases').eq('id', runId).single();
  if (!run || run.provider_data_completed_at) return;
  const newActive = (run.active_phases ?? []).filter((p: string) => p !== 'fase2_provider_data');
  await sb.from('workflow_runs').update({ provider_data_completed_at: new Date().toISOString(), active_phases: newActive }).eq('id', runId);
  await logAudit(runId, 'system', 'provider_data.completed', 'workflow_run', runId, {});
  await maybeAdvanceToFase3(runId);
}

export async function markInternalApprovalsDone(runId: string, color: string, reason: string) {
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('internal_approvals_completed_at, active_phases').eq('id', runId).single();
  if (!run || run.internal_approvals_completed_at) return;
  const newActive = (run.active_phases ?? []).filter((p: string) => p !== 'hito1_approvals');
  await sb.from('workflow_runs').update({ internal_approvals_completed_at: new Date().toISOString(), active_phases: newActive }).eq('id', runId);
  await logAudit(runId, 'system', 'internal_approvals.completed', 'workflow_run', runId, { color, reason });
  if (color !== 'red') await maybeAdvanceToFase3(runId);
}
