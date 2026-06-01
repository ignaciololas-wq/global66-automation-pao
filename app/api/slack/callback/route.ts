import { NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifySlackSignature } from '@/lib/slack/verify';
import { recordApproval, getApprovals, setSemaforo, setPhase } from '@/lib/data/approvals';
import { computeSemaphore } from '@/lib/hito1';
import { requiredApprovalTeams, markInternalApprovalsDone } from '@/lib/slack/dispatch';

export const dynamic = 'force-dynamic';

// Procesa la decisión (DB + semáforo). Corre DESPUÉS de responder a Slack.
async function processDecision(run_id: string, team: string, decision: string, user: { id?: string; email?: string; name?: string }) {
  try {
    await recordApproval({ runId: run_id, team, decision, slackUserId: user.id ?? null, email: user.email ?? user.name ?? null });
    const approvals = await getApprovals(run_id);
    const sb = createAdminClient();
    const { data: run } = await sb.from('workflow_runs').select('pais').eq('id', run_id).maybeSingle();
    const requiredTeams = await requiredApprovalTeams((run as any)?.pais);
    if (requiredTeams.every((t) => approvals[t])) {
      const result = computeSemaphore({ approvals: approvals as Record<string, any>, requiredTeams });
      await setSemaforo(run_id, result.color, result.reason);
      if (result.color === 'red') await setPhase(run_id, 'rejected');
      else await markInternalApprovalsDone(run_id, result.color, result.reason);
    }
  } catch (e) {
    console.error('[slack-callback] proceso async falló:', e);
  }
}

// Slack Interactivity Request URL. Slack exige ACK en < 3s, por eso verificamos
// firma + parseamos rápido, respondemos 200 YA, y el trabajo pesado (DB, semáforo,
// emails) corre en after() una vez enviada la respuesta.
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

  // Defer: Slack recibe el 200 al toque; la decisión se procesa después.
  after(() => processDecision(run_id, team, decision, payload.user ?? {}));

  return NextResponse.json({ text: `Decisión recibida: *${decision}* (${team})` });
}
