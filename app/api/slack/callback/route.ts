import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifySlackSignature } from '@/lib/slack/verify';
import { recordApproval, getApprovals, setSemaforo, setPhase } from '@/lib/data/approvals';
import { computeSemaphore } from '@/lib/hito1';
import { requiredApprovalTeams, markInternalApprovalsDone } from '@/lib/slack/dispatch';

export const dynamic = 'force-dynamic';

const TEAM_LABEL: Record<string, string> = { compliance: 'Compliance', legal: 'Legal', admin: 'Administración' };
const DEC_LABEL: Record<string, string> = { approved: '✅ Aprobaste', rejected: '❌ Rechazaste', requested_changes: '💬 Pediste cambios' };

// Reemplaza el mensaje original en Slack para confirmar la decisión (saca botones).
async function updateSlackMessage(responseUrl: string | undefined, lines: string[]) {
  if (!responseUrl) return;
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text: lines.join(' '),
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }],
      }),
    });
  } catch (e) {
    console.error('[slack-callback] response_url update falló:', e);
  }
}

// Procesa la decisión (DB + semáforo) y actualiza el mensaje de Slack. Corre en after().
async function processDecision(run_id: string, team: string, decision: string, user: { id?: string; email?: string; name?: string }, responseUrl?: string) {
  const teamLabel = TEAM_LABEL[team] ?? team;
  const decLabel = DEC_LABEL[decision] ?? decision;
  try {
    await recordApproval({ runId: run_id, team, decision, slackUserId: user.id ?? null, email: user.email ?? user.name ?? null });
    const approvals = await getApprovals(run_id);
    const sb = createAdminClient();
    const { data: run } = await sb.from('workflow_runs').select('pais').eq('id', run_id).maybeSingle();
    const requiredTeams = await requiredApprovalTeams((run as any)?.pais);

    const decided = requiredTeams.filter((t) => approvals[t]).length;
    const lines = [`${decLabel} como *${teamLabel}*. ✔ Registrado.`];

    if (requiredTeams.every((t) => approvals[t])) {
      const result = computeSemaphore({ approvals: approvals as Record<string, any>, requiredTeams });
      await setSemaforo(run_id, result.color, result.reason);
      if (result.color === 'red') {
        await setPhase(run_id, 'rejected');
        lines.push('🔴 Solicitud *rechazada* (todas las decisiones tomadas).');
      } else {
        await markInternalApprovalsDone(run_id, result.color, result.reason);
        lines.push(`🟢 Aprobaciones internas *completas* (${decided}/${requiredTeams.length}). Avanza a validación.`);
      }
    } else {
      const faltan = requiredTeams.filter((t) => !approvals[t]).map((t) => TEAM_LABEL[t] ?? t);
      lines.push(`⏳ Faltan: ${faltan.join(', ')} (${decided}/${requiredTeams.length}).`);
    }
    await updateSlackMessage(responseUrl, lines);
  } catch (e) {
    console.error('[slack-callback] proceso async falló:', e);
    await updateSlackMessage(responseUrl, [`${decLabel} como *${teamLabel}*. ⚠️ Hubo un error registrando; avisá al equipo.`]);
  }
}

// Slack Interactivity Request URL. Slack exige ACK en < 3s: verificamos firma +
// parseamos rápido, respondemos 200 YA, y el trabajo (DB, semáforo, update del
// mensaje vía response_url) corre en after() tras enviar la respuesta.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifySlackSignature(raw, req.headers)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  const params = new URLSearchParams(raw);
  let payload: any;
  try { payload = JSON.parse(params.get('payload') ?? '{}'); } catch { return NextResponse.json({ error: 'bad payload' }, { status: 400 }); }
  const action = payload.actions?.[0];
  if (!action) return NextResponse.json({ error: 'no action' }, { status: 400 });
  if (action.action_id === 'view_draft') return NextResponse.json({ ok: true }); // botón link, no decisión

  let parsed: { run_id: string; team: string; decision: string };
  try { parsed = JSON.parse(action.value); } catch { return NextResponse.json({ error: 'bad action value' }, { status: 400 }); }
  const { run_id, team, decision } = parsed;

  after(() => processDecision(run_id, team, decision, payload.user ?? {}, payload.response_url));

  return NextResponse.json({ text: `Procesando ${decision}…` });
}
