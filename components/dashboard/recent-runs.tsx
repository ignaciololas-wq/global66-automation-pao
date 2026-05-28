import Link from 'next/link';
import type { WorkflowRun } from '@/lib/types';
import { phaseLabel, phaseKind, formatMoney, formatDateTime } from '@/lib/format';

export function RecentRuns({ runs }: { runs: WorkflowRun[] }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="flex justify-between items-center p-4 border-b border-border">
        <h3 className="font-display font-bold text-base">Solicitudes recientes</h3>
        <Link href="/admin/workflows" className="text-xs font-semibold text-brand-500">
          Ver todas →
        </Link>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
          <tr>
            <th className="text-left p-3.5">Proveedor</th>
            <th className="text-left p-3.5">Tax ID</th>
            <th className="text-left p-3.5">País</th>
            <th className="text-left p-3.5">Sociedad</th>
            <th className="text-left p-3.5">Monto</th>
            <th className="text-left p-3.5">Fase</th>
            <th className="text-left p-3.5">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {runs.length === 0 ? (
            <tr>
              <td colSpan={7} className="text-center text-muted p-6">
                Sin solicitudes recientes
              </td>
            </tr>
          ) : (
            runs.map((r) => (
              <tr
                key={r.id}
                className="border-t border-border hover:bg-brand-50/50 cursor-pointer transition"
                onClick={undefined}
              >
                <td className="p-3.5">
                  <Link href={`/admin/workflows/${r.id}`} className="font-semibold text-ink">
                    {r.razon_social}
                  </Link>
                </td>
                <td className="p-3.5 text-muted">{r.tax_id}</td>
                <td className="p-3.5">{r.pais}</td>
                <td className="p-3.5 text-muted">{r.sociedad_contratante ?? '—'}</td>
                <td className="p-3.5">{formatMoney(r.monto, r.moneda)}</td>
                <td className="p-3.5">
                  <span className={`pill pill-${phaseKind(r.current_phase)}`}>
                    {phaseLabel(r.current_phase)}
                  </span>
                </td>
                <td className="p-3.5 text-muted text-xs">{formatDateTime(r.created_at)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
