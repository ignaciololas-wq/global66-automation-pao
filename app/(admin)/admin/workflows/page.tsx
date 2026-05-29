import Link from 'next/link';
import { listWorkflows } from '@/lib/data/workflows';
import { phaseLabel, phaseKind, semKind, formatMoney, formatDateTime } from '@/lib/format';
import { ClickableRow } from '@/components/admin/clickable-row';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

export default async function WorkflowsPage() {
  const runs = await listWorkflows({ limit: 200 }).catch(() => []);
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-display font-bold">Solicitudes</h2>
          <p className="text-muted text-sm mt-1">{runs.length} flujos registrados</p>
        </div>
        <Link href="/admin/intake/new" className="btn-primary">+ Nueva solicitud</Link>
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left p-3.5">Proveedor</th>
              <th className="text-left p-3.5">Tax ID</th>
              <th className="text-left p-3.5">País</th>
              <th className="text-left p-3.5">Sociedad</th>
              <th className="text-left p-3.5">Monto</th>
              <th className="text-left p-3.5">Fase</th>
              <th className="text-left p-3.5">Semáforo</th>
              <th className="text-left p-3.5">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr><td colSpan={8} className="text-center text-muted p-8">Sin solicitudes todavía. <Link href="/admin/intake/new" className="text-brand-500 font-semibold">Crear la primera →</Link></td></tr>
            ) : (
              runs.map((r) => (
                <ClickableRow key={r.id} href={`/admin/workflows/${r.id}`}>
                  <td className="p-3.5"><span className="font-semibold text-ink">{r.razon_social}</span></td>
                  <td className="p-3.5 text-muted">{r.tax_id}</td>
                  <td className="p-3.5">{r.pais}</td>
                  <td className="p-3.5 text-muted">{r.sociedad_contratante ?? '—'}</td>
                  <td className="p-3.5">{formatMoney(r.monto, r.moneda)}</td>
                  <td className="p-3.5"><span className={`pill pill-${phaseKind(r.current_phase)}`}>{phaseLabel(r.current_phase)}</span></td>
                  <td className="p-3.5">{r.semaforo ? <span className={`pill pill-${semKind(r.semaforo)}`}>{r.semaforo}</span> : '—'}</td>
                  <td className="p-3.5 text-muted text-xs">{formatDateTime(r.created_at)}</td>
                </ClickableRow>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
