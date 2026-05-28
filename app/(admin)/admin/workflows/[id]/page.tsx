import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getWorkflow } from '@/lib/data/workflows';
import { FlowCanvas } from '@/components/workflow/flow-canvas';
import { phaseLabel, phaseKind, semKind, formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await getWorkflow(id);
  if (!r) notFound();
  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href="/admin/workflows" className="text-muted hover:text-brand-500">← Volver a solicitudes</Link>
      </div>
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-display font-bold">{r.razon_social}</h2>
          <p className="text-muted text-sm mt-1">{r.tax_id} · {r.pais} · {r.sociedad_contratante ?? 'sin sociedad'}</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`pill pill-${phaseKind(r.current_phase)}`}>{phaseLabel(r.current_phase)}</span>
          {r.semaforo && <span className={`pill pill-${semKind(r.semaforo)}`}>{r.semaforo}</span>}
        </div>
      </div>
      <FlowCanvas run={r} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
        <div className="card">
          <div className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-1.5">Monto</div>
          <div className="font-display text-2xl font-bold text-brand-800">{formatMoney(r.monto, r.moneda)}</div>
        </div>
        <div className="card">
          <div className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-1.5">Sociedad</div>
          <div className="font-semibold text-sm">{r.sociedad_contratante ?? '—'}</div>
        </div>
        <div className="card">
          <div className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-1.5">Periodicidad</div>
          <div className="font-display text-2xl font-bold text-brand-800 capitalize">{r.periodicidad ?? '—'}</div>
        </div>
        <div className="card">
          <div className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-1.5">Duración</div>
          <div className="font-semibold text-sm">
            {r.tipo_duracion ?? '—'}
            {r.fecha_inicio && <div className="text-xs text-muted mt-1">desde {r.fecha_inicio}</div>}
            {r.fecha_fin && <div className="text-xs text-muted">hasta {r.fecha_fin}</div>}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(360px,1fr))] gap-4">
        <div className="card">
          <h3 className="font-display font-bold mb-4">Solicitante & Owner</h3>
          <dl className="grid grid-cols-[minmax(120px,180px)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted">Solicitante</dt><dd className="font-medium break-words">{r.solicitante_nombre ?? '—'} {r.solicitante_email && <span className="text-muted text-xs">&lt;{r.solicitante_email}&gt;</span>}</dd>
            <dt className="text-muted">Área</dt><dd>{r.solicitante_area ?? '—'}</dd>
            <dt className="text-muted">Owner</dt><dd className="font-medium break-words">{r.owner_nombre ?? r.solicitante_nombre ?? '—'} {r.owner_email && <span className="text-muted text-xs">&lt;{r.owner_email}&gt;</span>}</dd>
            <dt className="text-muted">Backup</dt><dd>{r.responsable_backup_email ?? '—'}</dd>
          </dl>
        </div>
        <div className="card">
          <h3 className="font-display font-bold mb-4">Proveedor</h3>
          <dl className="grid grid-cols-[minmax(120px,180px)_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
            <dt className="text-muted">Razón social</dt><dd className="font-semibold">{r.razon_social}</dd>
            <dt className="text-muted">Tax ID</dt><dd>{r.tax_id}</dd>
            <dt className="text-muted">País</dt><dd>{r.pais}</dd>
            <dt className="text-muted">Tipo</dt><dd>{r.tipo_proveedor ?? '—'}</dd>
            <dt className="text-muted">Representante</dt><dd>{r.representante_legal ?? '—'}</dd>
            <dt className="text-muted">Servicio</dt><dd className="break-words">{r.servicio_descripcion ?? '—'}</dd>
          </dl>
        </div>
      </div>
      <div className="card">
        <h3 className="font-display font-bold mb-3">Doc viewer + Comentarios + IA</h3>
        <p className="text-muted text-sm">PR-NEXT8 (próximo).</p>
      </div>
    </div>
  );
}
