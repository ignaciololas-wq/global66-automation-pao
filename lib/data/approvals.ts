import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';

// Audit log — source of truth de mutaciones. No lanza (best-effort).
export async function logAudit(
  runId: string | null,
  actor: string,
  action: string,
  targetType: string,
  targetId: string,
  payload: Record<string, unknown> = {},
) {
  const sb = createAdminClient();
  const { error } = await sb.from('audit_log').insert({
    workflow_run_id: runId,
    actor,
    action,
    target_type: targetType,
    target_id: String(targetId),
    payload,
  });
  if (error) console.error('audit_log insert failed', error.message);
}

export async function setPhase(runId: string, phase: string, extra: Record<string, unknown> = {}) {
  const sb = createAdminClient();
  const { error } = await sb.from('workflow_runs').update({ current_phase: phase, ...extra }).eq('id', runId);
  if (error) throw new Error(error.message);
  await logAudit(runId, 'system', 'workflow.phase_changed', 'workflow_run', runId, { phase, ...extra });
}

export async function recordApproval({ runId, team, decision, slackUserId, email, comment }: {
  runId: string;
  team: string;
  decision: string;
  slackUserId?: string | null;
  email?: string | null;
  comment?: string | null;
}) {
  const sb = createAdminClient();
  const { error } = await sb.from('approvals').upsert({
    workflow_run_id: runId,
    team,
    decision,
    approver_slack_id: slackUserId ?? null,
    approver_email: email ?? null,
    comment: comment ?? null,
    decided_at: new Date().toISOString(),
  }, { onConflict: 'workflow_run_id,team' });
  if (error) throw new Error(error.message);
  await logAudit(runId, email ?? slackUserId ?? 'unknown', `approval.${decision}`, 'approval', `${runId}:${team}`, { team, comment: comment ?? null });
}

export async function getApprovals(runId: string): Promise<Record<string, string>> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('approvals').select('team, decision, comment, decided_at').eq('workflow_run_id', runId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((acc: Record<string, string>, row: { team: string; decision: string }) => {
    acc[row.team] = row.decision;
    return acc;
  }, {});
}

export async function setSemaforo(runId: string, color: string, reason: string) {
  const sb = createAdminClient();
  const { error } = await sb.from('workflow_runs').update({ semaforo: color, metadata: { hito1_reason: reason } }).eq('id', runId);
  if (error) throw new Error(error.message);
  await logAudit(runId, 'system', `hito1.${color}`, 'workflow_run', runId, { reason });
}
