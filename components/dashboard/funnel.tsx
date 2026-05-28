import Link from 'next/link';
import type { PhaseCount } from '@/lib/types';

const FUNNEL_ORDER: { phase: string; label: string; icon: string; color: string }[] = [
  { phase: 'fase1',  label: 'Solicitud',          icon: '📝', color: '#3F5EDF' },
  { phase: 'hito1',  label: 'Aprobación interna', icon: '✅', color: '#1F49B6' },
  { phase: 'fase2',  label: 'Datos proveedor',    icon: '🏢', color: '#0b6bc4' },
  { phase: 'fase3',  label: 'Validación docs',    icon: '🔍', color: '#02A757' },
  { phase: 'signed', label: 'Firmado',            icon: '✍️', color: '#1c8a4a' },
];

export function PipelineFunnel({ phases }: { phases: PhaseCount[] }) {
  const byPhase: Record<string, PhaseCount> = Object.fromEntries(
    (phases ?? []).map((r) => [r.current_phase, r]),
  );
  const rejected = byPhase['rejected']?.total ?? 0;
  const totalIn = FUNNEL_ORDER.reduce((a, p) => a + (byPhase[p.phase]?.total ?? 0), 0);

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-3.5">
        <h3 className="font-display font-bold text-base">Pipeline de solicitudes</h3>
        <Link href="/admin/workflows" className="text-xs font-semibold text-brand-500">
          Ver todas →
        </Link>
      </div>
      <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
        {FUNNEL_ORDER.map((stage, i) => {
          const row = byPhase[stage.phase];
          const total = row?.total ?? 0;
          const greenC = row?.green ?? 0;
          const yellowC = row?.yellow ?? 0;
          const redC = row?.red ?? 0;
          const pct = totalIn ? Math.round((total / totalIn) * 100) : 0;
          return (
            <div key={stage.phase} className="contents">
              <div
                className="flex-1 min-w-[140px] text-center p-3.5 rounded-xl border bg-gradient-to-b from-white shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
                style={{
                  borderColor: `${stage.color}33`,
                  // @ts-expect-error custom CSS var
                  '--clr': stage.color,
                  background: `linear-gradient(180deg, white, ${stage.color}0a)`,
                }}
              >
                <div className="text-[22px] mb-1">{stage.icon}</div>
                <div className="text-[11px] uppercase tracking-wider text-muted font-semibold mb-1.5">
                  {i + 1}. {stage.label}
                </div>
                <div
                  className="font-display text-[28px] font-bold leading-none mb-2"
                  style={{ color: stage.color, letterSpacing: '-0.02em' }}
                >
                  {total}
                </div>
                <div className="h-1 bg-border rounded-pill overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-pill transition-all duration-700"
                    style={{ width: `${pct}%`, background: stage.color }}
                  />
                </div>
                <div className="text-[10.5px] text-muted flex gap-1.5 justify-center min-h-[14px]">
                  {greenC ? <span>🟢 {greenC}</span> : null}
                  {yellowC ? <span>🟡 {yellowC}</span> : null}
                  {redC ? <span>🔴 {redC}</span> : null}
                </div>
              </div>
              {i < FUNNEL_ORDER.length - 1 && (
                <div className="flex items-center text-brand-200 opacity-50 px-0.5">→</div>
              )}
            </div>
          );
        })}
      </div>
      {rejected > 0 && (
        <div className="mt-3 px-3.5 py-2.5 bg-red-50 text-danger text-sm rounded-xl">
          ⊘ {rejected} solicitud{rejected > 1 ? 'es' : ''} rechazada
          {rejected > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
