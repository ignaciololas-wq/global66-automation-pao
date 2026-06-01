'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { recordManualApproval } from '@/app/(admin)/admin/workflows/[id]/actions';

const TEAM_LABEL: Record<string, string> = { compliance: 'Compliance', legal: 'Legal', admin: 'Administración' };
const DEC_PILL: Record<string, string> = { approved: 'pill-green', rejected: 'pill-red', requested_changes: 'pill-yellow' };
const DEC_LABEL: Record<string, string> = { approved: '✅ Aprobado', rejected: '❌ Rechazado', requested_changes: '💬 Cambios pedidos' };

export function ApprovalPanel({ runId, requiredTeams, approvals }: {
  runId: string;
  requiredTeams: string[];
  approvals: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function decide(team: string, decision: string) {
    setErr(null);
    start(async () => {
      try { await recordManualApproval(runId, team, decision); router.refresh(); }
      catch (e: any) { setErr(e.message); }
    });
  }

  return (
    <div className="card">
      <h3 className="font-semibold text-sm mb-1">Aprobaciones internas</h3>
      <p className="text-muted text-xs mb-3">Equipos requeridos para este país. También se puede decidir por DM de Slack.</p>
      {err && <div className="bg-red-50 text-danger px-3 py-2 rounded-lg text-xs border border-red-200 mb-3">{err}</div>}
      <div className="space-y-2">
        {requiredTeams.map((team) => {
          const dec = approvals[team];
          return (
            <div key={team} className="flex items-center gap-2 flex-wrap border-t border-border pt-2 first:border-0 first:pt-0">
              <span className="font-medium text-sm min-w-28">{TEAM_LABEL[team] ?? team}</span>
              {dec ? (
                <span className={`pill ${DEC_PILL[dec] ?? 'pill-gray'} text-[11px]`}>{DEC_LABEL[dec] ?? dec}</span>
              ) : (
                <span className="pill pill-gray text-[11px]">pendiente</span>
              )}
              <span className="ml-auto flex gap-1.5">
                <button className="btn-ghost text-xs px-2.5 py-1 text-green-700" disabled={pending} onClick={() => decide(team, 'approved')}>Aprobar</button>
                <button className="btn-ghost text-xs px-2.5 py-1 text-danger" disabled={pending} onClick={() => decide(team, 'rejected')}>Rechazar</button>
                <button className="btn-ghost text-xs px-2.5 py-1 text-muted" disabled={pending} onClick={() => decide(team, 'requested_changes')}>Pedir cambios</button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
