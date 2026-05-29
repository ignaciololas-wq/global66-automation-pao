// FlowCanvas Lever-style. Nodos 2 (Aprobaciones internas Slack) y 3 (Datos proveedor) corren EN PARALELO real.
import type { WorkflowRun } from '@/lib/types';
import { formatDateShort, initials } from '@/lib/format';
import { createAdminClient } from '@/lib/supabase/server';

type State = 'done' | 'active' | 'rejected' | 'pending';

interface Stage {
  num: number;
  label: string;
  who: string;
  assignee: string | null | undefined;
  date: string | null | undefined;
}

async function loadAvatars(emails: string[]): Promise<Record<string, { display_name: string | null; avatar_url: string | null }>> {
  const clean = Array.from(new Set(emails.filter((e) => e && e.includes('@')).map((e) => e.toLowerCase())));
  if (!clean.length) return {};
  const sb = createAdminClient();
  const { data } = await sb
    .from('user_profiles')
    .select('email, display_name, avatar_url')
    .in('email', clean);
  const out: Record<string, { display_name: string | null; avatar_url: string | null }> = {};
  for (const p of (data ?? []) as any[]) {
    if (p.email) out[(p.email as string).toLowerCase()] = { display_name: p.display_name, avatar_url: p.avatar_url };
  }
  return out;
}

export async function FlowCanvas({ run }: { run: WorkflowRun }) {
  const phase = run.current_phase;
  const intRejected = run.internal_approval_status === 'rejected';
  const providerDone = run.provider_data_completed_at != null;
  const approvalsDone = run.internal_approvals_completed_at != null;
  const parallelStarted =
    phase === 'parallel' || phase === 'fase2' || phase === 'fase3' || phase === 'signed';

  function stateOf(num: number): State {
    if (intRejected || phase === 'rejected') return num === 1 ? 'done' : 'rejected';
    if (num === 1) return 'done';
    if (num === 2) {
      if (approvalsDone) return 'done';
      if (parallelStarted) return 'active';
      return 'pending';
    }
    if (num === 3) {
      if (providerDone) return 'done';
      if (parallelStarted) return 'active';
      return 'pending';
    }
    if (num === 4) {
      if (phase === 'signed') return 'done';
      if (phase === 'fase3') return 'active';
      return 'pending';
    }
    if (num === 5) {
      if (phase === 'signed') return 'done';
      if (phase === 'fase3' && approvalsDone && providerDone) return 'active';
      return 'pending';
    }
    if (num === 6) return phase === 'signed' ? 'done' : 'pending';
    return 'pending';
  }

  const stages: Record<number, Stage> = {
    1: { num: 1, label: 'Solicitud',          who: 'Solicitante',                assignee: run.solicitante_email,                                      date: run.created_at },
    2: { num: 2, label: 'Aprobación interna', who: 'Compliance + Legal + Admin', assignee: run.internal_approver_email ?? 'Slack 3 equipos',           date: run.internal_approvals_completed_at },
    3: { num: 3, label: 'Datos proveedor',    who: 'Proveedor',                  assignee: null,                                                       date: run.provider_data_completed_at },
    4: { num: 4, label: 'Validación docs',    who: 'IA + Compliance',            assignee: 'compliance@global66.com',                                  date: phase === 'fase3' || phase === 'signed' ? run.updated_at : null },
    5: { num: 5, label: 'Firma',              who: 'Apoderado',                  assignee: run.sociedad_apoderado_email ?? 'Pendiente',                date: phase === 'signed' ? run.updated_at : null },
    6: { num: 6, label: 'Cerrado',            who: 'Sistema',                    assignee: null,                                                       date: phase === 'signed' ? run.updated_at : null },
  };

  const allEmails = Object.values(stages)
    .map((s) => s.assignee ?? '')
    .filter((e) => e.includes('@'));
  const profiles = await loadAvatars(allEmails).catch(() => ({}));

  function nodeHtml(s: Stage, st: State) {
    const pillCls =
      st === 'done' ? 'bg-emerald-100 text-emerald-700' :
      st === 'active' ? 'bg-blue-100 text-blue-700' :
      st === 'rejected' ? 'bg-red-100 text-red-700' :
      'bg-slate-100 text-slate-500';
    const pillLabel =
      st === 'done' ? 'Aprobado' :
      st === 'active' ? 'En curso' :
      st === 'rejected' ? 'Rechazado' :
      'Pendiente';
    const borderCls =
      st === 'done' ? 'border-emerald-300' :
      st === 'active' ? 'border-brand-500 border-2 shadow-md' :
      st === 'rejected' ? 'border-red-300' :
      'opacity-60 border-border';

    const email = (s.assignee ?? '').toLowerCase();
    const profile = (profiles as Record<string, { display_name: string | null; avatar_url: string | null }>)[email];
    const hasReal =
      !!s.assignee &&
      s.assignee.includes('@') &&
      !s.assignee.startsWith('compliance@') &&
      !s.assignee.startsWith('Slack');
    const displayName = profile?.display_name ||
      (hasReal ? s.assignee!.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : (s.assignee ?? '—'));
    const dateStr = formatDateShort(s.date);

    return (
      <div key={s.num} className={`relative bg-white border rounded-lg shadow-sm w-[170px] flex-shrink-0 p-2.5 hover:shadow-md transition-all ${borderCls}`}>
        <div className="flex justify-between items-center mb-1.5 gap-1.5">
          <span className={`text-[9.5px] font-semibold px-2 py-0.5 rounded-full ${pillCls}`}>{pillLabel}</span>
          {dateStr && <span className="text-[9.5px] text-slate-400 tabular-nums">{dateStr}</span>}
        </div>
        <div className="font-bold text-[12px] text-slate-900 mb-2 leading-tight">{s.label}</div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-full bg-slate-200 grid place-items-center flex-shrink-0 overflow-hidden text-slate-500">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : hasReal ? (
              <span className="text-[9px] font-semibold text-slate-600">{initials(displayName)}</span>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 12a4 4 0 100-8 4 4 0 000 8zm0 2c-3 0-9 1.5-9 5v1h18v-1c0-3.5-6-5-9-5z" /></svg>
            )}
          </div>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-slate-800 truncate leading-tight">{displayName}</div>
            <div className="text-[9.5px] text-slate-400 truncate">{s.who}</div>
          </div>
        </div>
        {st === 'active' && (
          <div className="absolute -inset-[3px] rounded-[12px] border-2 border-brand-500 opacity-0 animate-[pulse_2s_ease-in-out_infinite] pointer-events-none" />
        )}
      </div>
    );
  }

  return (
    <div
      className="bg-[#fafbff] border border-border rounded-xl overflow-x-auto py-5 px-4"
      style={{ backgroundImage: 'radial-gradient(circle, rgba(19,32,70,0.06) 1px, transparent 1px)', backgroundSize: '14px 14px' }}
    >
      <div className="flex items-center gap-0 min-w-max">
        {nodeHtml(stages[1], stateOf(1))}
        <SplitMerge dir="split" />
        <div className="flex flex-col gap-1.5 items-stretch">
          <div className="text-[8.5px] uppercase tracking-widest text-muted font-bold text-center">paralelo</div>
          <div className="flex flex-col gap-1.5">
            {nodeHtml(stages[2], stateOf(2))}
            {nodeHtml(stages[3], stateOf(3))}
          </div>
        </div>
        <SplitMerge dir="merge" />
        {nodeHtml(stages[4], stateOf(4))}
        <Arrow />
        {nodeHtml(stages[5], stateOf(5))}
        <Arrow />
        {nodeHtml(stages[6], stateOf(6))}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex items-center text-brand-200 px-0">
      <div className="w-4 h-[1.5px] bg-current" />
      <div className="w-1 h-1 rounded-full bg-current -ml-0.5" />
    </div>
  );
}

function SplitMerge({ dir: _ }: { dir: 'split' | 'merge' }) {
  return (
    <div className="w-4 self-stretch relative text-brand-200">
      <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-current -translate-y-1/2" />
      <div className="absolute left-1/2 top-[30%] bottom-[30%] w-[1.5px] bg-current -translate-x-1/2" />
    </div>
  );
}
