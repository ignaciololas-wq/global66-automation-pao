import { listContracts } from '@/lib/data/contracts';
import { listProviders } from '@/lib/data/providers';
import { ClickableRow } from '@/components/admin/clickable-row';
import { formatDateTime, formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

const STATUS_PILL: Record<string, string> = {
  signed: 'pill-green',
  active: 'pill-green',
  draft: 'pill-gray',
  cancelled: 'pill-red',
  rejected: 'pill-red',
};

export default async function ContractsPage() {
  const contracts = await listContracts({ limit: 300 }).catch(() => []);
  const providerIds = Array.from(new Set(contracts.map((c) => c.provider_id).filter(Boolean)));
  const providers = providerIds.length
    ? await listProviders({ limit: 300 }).catch(() => [])
    : [];
  const providersMap = Object.fromEntries(providers.map((p) => [p.id, p]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">Contratos</h2>
        <p className="text-muted text-sm mt-1">{contracts.length} contratos</p>
      </div>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left p-3.5">Proveedor</th>
              <th className="text-left p-3.5">Tipo</th>
              <th className="text-left p-3.5">Monto</th>
              <th className="text-left p-3.5">Periodicidad</th>
              <th className="text-left p-3.5">Vence</th>
              <th className="text-left p-3.5">Status</th>
              <th className="text-left p-3.5">Firmado</th>
            </tr>
          </thead>
          <tbody>
            {contracts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center text-muted p-8">
                  Sin contratos todavía. Aparecerán cuando se firmen vía SignNow.
                </td>
              </tr>
            ) : (
              contracts.map((c) => {
                const p = providersMap[c.provider_id];
                return (
                  <ClickableRow key={c.id} href={`/admin/contracts/${c.id}`}>
                    <td className="p-3.5"><b className="text-ink">{p?.razon_social ?? c.provider_id.slice(0, 8)}</b></td>
                    <td className="p-3.5 text-muted">{c.tipo_contrato ?? '—'}</td>
                    <td className="p-3.5">{formatMoney(c.monto, c.moneda)}</td>
                    <td className="p-3.5 text-muted">{c.periodicidad ?? '—'}</td>
                    <td className="p-3.5 text-muted">{c.end_date ?? '—'}</td>
                    <td className="p-3.5"><span className={`pill ${STATUS_PILL[c.status ?? ''] ?? 'pill-gray'}`}>{c.status ?? '—'}</span></td>
                    <td className="p-3.5 text-muted text-xs">{c.signed_at ? formatDateTime(c.signed_at) : '—'}</td>
                  </ClickableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
