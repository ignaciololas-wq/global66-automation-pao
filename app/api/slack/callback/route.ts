import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifySlackSignature } from '@/lib/slack/verify';
import { recordApproval, getApprovals, setSemaforo, setPhase } from '@/lib/data/approvals';
import { computeSemaphore } from '@/lib/hito1';
import { requiredApprovalTeams, markInternalApprovalsDone } from '@/lib/slack/dispatch';

export const dynamic = 'force-dynamic';

// Slack Interactivity Request URL. Recibe los clicks de Aprobar/Rechazar/Pedir
// cambios en los DM/mensajes de aprobación. Verifica firma HMAC, registra la
// decisión y, si todos los equipos requeridos decidieron, corre el semáforo hito1.
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

  await recordApproval({
    runId: run_id,
    team,
    decision,
    slackUserId: payload.user?.id ?? null,
    email: payload.user?.email ?? payload.user?.name ?? null,
  });

  const approvals = await getApprovals(run_id);
  const sb = createAdminClient();
  const { data: run } = await sb.from('workflow_runs').select('pais').eq('id', run_id).maybeSingle();
  const requiredTeams = await requiredApprovalTeams(run?.pais);
  const allDecided = requiredTeams.every((t) => approvals[t]);

  if (allDecided) {
    const result = computeSemaphore({ approvals: approvals as Record<string, any>, requiredTeams });
    await setSemaforo(run_id, result.color, result.reason);
    if (result.color === 'red') {
      await setPhase(run_id, 'rejected');
    } else {
      await markInternalApprovalsDone(run_id, result.color, result.reason);
    }
  }

  // Confirmación visible en el mensaje de Slack (block_actions ignora el body,
  // pero Slack muestra un toast con el text si está presente).
  return NextResponse.json({ text: `Decisión registrada: *${decision}* (${team})` });
}
