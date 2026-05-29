import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProvider, getRegcheqHistory, listProviderUploads, findRunsForProvider } from '@/lib/data/providers';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';

const DECISION_LABEL: Record<string, string> = {
  block: '⛔ Bloquear',
  review: '⚠️ Revisión',
  approve_flag: '⚑ Aprobar con flag',
  approve: '✓ Aprobar',
  unknown: 'Sin datos',
  skip: 'Omitido',
  error: 'Error',
};
const DECISION_PILL: Record<string, string> = {
  block: 'pill-red',
  review: 'pill-yellow',
  approve_flag: 'pill-yellow',
  approve: 'pill-green',
  unknown: 'pill-gray',
  skip: 'pill-gray',
  error: 'pill-red',
};

export default async function ProviderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const provider = await getProvider(id);
  if (!provider) notFound();

  const [regcheqHistory, uploads, runs] = await Promise.all([
    getRegcheqHistory(provider.id).catch(() => []),
    listProviderUploads(provider.id).catch(() => []),
    findRunsForProvider(provider.id).catch(() => []),
  ]);

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href="/admin/providers" className="text-brand-500 hover:underline">← Proveedores</Link>
      </div>

      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-display font-bold">{provider.razon_social}</h2>
          <p className="text-muted text-sm mt-1">
            {provider.tax_id} · {provider.pais}{provider.sociedad_contratante ? ' · ' + provider.sociedad_contratante : ''}
          </p>
        </div>
        <span className={`pill ${provider.status === 'aceptado' ? 'pill-green' : provider.status === 'rechazado' ? 'pill-red' : provider.status === 'pendiente_revision' ? 'pill-yellow' : 'pill-gray'}`}>
          {provider.status}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-display font-bold mb-3">Datos del proveedor</h3>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Razón social</dt><dd className="font-medium">{provider.razon_social}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tax ID</dt><dd>{provider.tax_id}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">País</dt><dd>{provider.pais}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tipo</dt><dd>{provider.tipo_proveedor ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Criticidad</dt><dd>{provider.criticidad ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Representante</dt><dd>{provider.representante_legal ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email contacto</dt><dd>{provider.email_contacto ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email facturación</dt><dd>{provider.email_facturacion ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Servicio</dt><dd className="text-right max-w-[60%]">{provider.servicio_descripcion ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Creado</dt><dd className="text-xs">{formatDateTime(provider.created_at)}</dd></div>
          </dl>
        </div>

        <div className="card">
          <h3 className="font-display font-bold mb-1">Validación PEP/AML (RegCheq)</h3>
          <p className="text-muted text-xs mb-3">Histórico completo de chequeos AML/PEP para este proveedor.</p>
          {regcheqHistory.length === 0 ? (
            <div className="text-muted text-sm">Sin chequeos RegCheq registrados todavía.</div>
          ) : (
            <ul className="space-y-2">
              {regcheqHistory.map((h) => {
                const cmatches: any[] = h.company?.matches ?? [];
                const relCount = (h.relations ?? []).length;
                const relAlerts = (h.relations ?? []).filter((r: any) => ['block', 'review'].includes(r.decision)).length;
                return (
                  <li key={h.id} className="border border-border rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-center gap-2">
                      <span className={`pill ${DECISION_PILL[h.decision] ?? 'pill-gray'}`}>{DECISION_LABEL[h.decision] ?? h.decision}</span>
                      <span className="text-muted text-xs">{formatDateTime(h.created_at)}</span>
                    </div>
                    <div className="mt-2 text-xs space-y-1">
                      <div><b>Razón:</b> <span className="text-muted">{h.reason ?? '—'}</span></div>
                      <div><b>Riesgo empresa:</b> {h.company?.effectiveRisk ?? '—'}</div>
                      {cmatches.length > 0 && (
                        <div><b>Listas con match:</b> <span className="text-muted">{cmatches.map((m) => m.list).join(', ')}</span></div>
                      )}
                      {relCount > 0 && <div><b>Relacionados:</b> {relCount} ({relAlerts} con alerta)</div>}
                      {h.workflow_run_id && (
                        <div><Link href={`/admin/workflows/${h.workflow_run_id}`} className="text-brand-500 hover:underline">Ver solicitud relacionada →</Link></div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="font-display font-bold mb-3">📁 Documentos subidos por el proveedor</h3>
        <p className="text-muted text-xs mb-3">Archivos que el proveedor subió desde su formulario (RUT cert, escritura, NDA firmado, etc.)</p>
        {uploads.length === 0 ? (
          <div className="text-muted text-sm">El proveedor aún no subió documentos.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left p-2">Tipo</th>
                <th className="text-left p-2">Archivo</th>
                <th className="text-left p-2">Tamaño</th>
                <th className="text-left p-2">Subido</th>
                <th className="text-right p-2"></th>
              </tr>
            </thead>
            <tbody>
              {uploads.map((u: any) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="p-2"><b>{u.doc_type}</b></td>
                  <td className="p-2 text-muted">{u.doc_filename ?? '—'}</td>
                  <td className="p-2 text-muted text-xs">{u.file_size ? `${Math.round(u.file_size / 1024)} KB` : '—'}</td>
                  <td className="p-2 text-muted text-xs">{formatDateTime(u.created_at)}</td>
                  <td className="p-2 text-right">
                    <a href={`/api/provider-uploads/url?id=${u.id}`} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline text-xs font-semibold">⬇ Descargar</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 className="font-display font-bold mb-3">Solicitudes asociadas ({runs.length})</h3>
        {runs.length === 0 ? (
          <div className="text-muted text-sm">Sin solicitudes asociadas a este proveedor.</div>
        ) : (
          <ul className="space-y-2">
            {runs.map((r: any) => (
              <li key={r.id} className="flex justify-between items-center border-t border-border pt-2 text-sm">
                <Link href={`/admin/workflows/${r.id}`} className="text-brand-500 hover:underline">
                  {r.razon_social} <span className="text-muted text-xs">({r.id.slice(0, 8)})</span>
                </Link>
                <span className="text-muted text-xs">{r.current_phase} · {formatDateTime(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
