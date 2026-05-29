import { listProviders } from '@/lib/data/providers';
import { ClickableRow } from '@/components/admin/clickable-row';
import { formatDateTime } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

const STATUS_COLORS: Record<string, string> = {
  aceptado: 'pill-green',
  pendiente_revision: 'pill-yellow',
  rechazado: 'pill-red',
  inactivo: 'pill-gray',
};

export default async function ProvidersPage() {
  const providers = await listProviders({ limit: 300 }).catch(() => []);
  return (
    <div className="space-y-5">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-display font-bold">Proveedores</h2>
          <p className="text-muted text-sm mt-1">{providers.length} registrados</p>
        </div>
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left p-3.5">Razón social</th>
              <th className="text-left p-3.5">Tax ID</th>
              <th className="text-left p-3.5">País</th>
              <th className="text-left p-3.5">Tipo</th>
              <th className="text-left p-3.5">Status</th>
              <th className="text-left p-3.5">Criticidad</th>
              <th className="text-left p-3.5">Sociedad</th>
              <th className="text-left p-3.5">Creado</th>
            </tr>
          </thead>
          <tbody>
            {providers.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted p-8">
                  Sin proveedores todavía. Aparecerán cuando se aprueben solicitudes nuevas.
                </td>
              </tr>
            ) : (
              providers.map((p) => (
                <ClickableRow key={p.id} href={`/admin/providers/${p.id}`}>
                  <td className="p-3.5"><span className="font-semibold text-ink">{p.razon_social}</span></td>
                  <td className="p-3.5 text-muted">{p.tax_id}</td>
                  <td className="p-3.5">{p.pais}</td>
                  <td className="p-3.5 text-muted">{p.tipo_proveedor ?? '—'}</td>
                  <td className="p-3.5">
                    <span className={`pill ${STATUS_COLORS[p.status] ?? 'pill-gray'}`}>{p.status}</span>
                  </td>
                  <td className="p-3.5 text-muted">{p.criticidad ?? '—'}</td>
                  <td className="p-3.5 text-muted">{p.sociedad_contratante ?? '—'}</td>
                  <td className="p-3.5 text-muted text-xs">{formatDateTime(p.created_at)}</td>
                </ClickableRow>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
