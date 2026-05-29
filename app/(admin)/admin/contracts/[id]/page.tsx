import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContract, listContractFiles, listProviderUploadsByProvider } from '@/lib/data/contracts';
import { getProvider } from '@/lib/data/providers';
import { getWorkflow } from '@/lib/data/workflows';
import { formatDateTime, formatMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contract = await getContract(id);
  if (!contract) notFound();

  const [provider, run, contractFiles, providerUploads] = await Promise.all([
    getProvider(contract.provider_id),
    contract.workflow_run_id ? getWorkflow(contract.workflow_run_id) : Promise.resolve(null),
    contract.workflow_run_id ? listContractFiles(contract.workflow_run_id).catch(() => []) : Promise.resolve([]),
    listProviderUploadsByProvider(contract.provider_id).catch(() => []),
  ]);

  const main = contractFiles.filter((f) => f.kind === 'main');
  const anexos = contractFiles.filter((f) => f.kind === 'anexo');
  const papel = contractFiles.filter((f) => f.kind === 'papel_proveedor');

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link href="/admin/contracts" className="text-brand-500 hover:underline">← Contratos</Link>
      </div>

      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-display font-bold">{provider?.razon_social ?? 'Contrato'}</h2>
          <p className="text-muted text-sm mt-1">
            {contract.tipo_contrato ?? '—'} · {provider?.tax_id ?? ''} · {contract.sociedad_contratante ?? '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`pill ${contract.status === 'signed' ? 'pill-green' : contract.status === 'active' ? 'pill-green' : contract.status === 'cancelled' || contract.status === 'rejected' ? 'pill-red' : 'pill-gray'}`}>
            {contract.status ?? '—'}
          </span>
          {contract.signed_at && (
            <span className="text-muted text-xs">Firmado {formatDateTime(contract.signed_at)}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card">
          <div className="text-muted text-[11px] uppercase tracking-wider">Monto</div>
          <div className="text-lg font-bold">{formatMoney(contract.monto, contract.moneda)}</div>
        </div>
        <div className="card">
          <div className="text-muted text-[11px] uppercase tracking-wider">Vigencia</div>
          <div className="text-lg font-bold">{contract.vigencia_meses ?? '—'}<span className="text-xs text-muted ml-1">meses</span></div>
        </div>
        <div className="card">
          <div className="text-muted text-[11px] uppercase tracking-wider">Inicio</div>
          <div className="text-sm font-semibold">{contract.start_date ?? '—'}</div>
        </div>
        <div className="card">
          <div className="text-muted text-[11px] uppercase tracking-wider">Vence</div>
          <div className="text-sm font-semibold">{contract.end_date ?? '—'}</div>
        </div>
      </div>

      {contract.signed_pdf_url && (
        <div className="card border-l-4 border-emerald-500">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-display font-bold text-emerald-700">✓ Contrato firmado</h3>
              <p className="text-muted text-xs mt-1">
                Firmado el {contract.signed_at ? formatDateTime(contract.signed_at) : '—'}
                {contract.signnow_document_id && ` · SignNow ${contract.signnow_document_id.slice(0, 12)}`}
              </p>
            </div>
            <a href={contract.signed_pdf_url} target="_blank" rel="noreferrer" className="btn-primary text-sm">⬇ Descargar PDF firmado</a>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h3 className="font-display font-bold mb-3">Proveedor</h3>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between"><dt className="text-muted">Razón social</dt><dd className="font-medium">{provider?.razon_social ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tax ID</dt><dd>{provider?.tax_id ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">País</dt><dd>{provider?.pais ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Email</dt><dd>{provider?.email_contacto ?? '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Representante</dt><dd>{provider?.representante_legal ?? '—'}</dd></div>
          </dl>
          {provider && (
            <Link href={`/admin/providers/${provider.id}`} className="text-brand-500 hover:underline text-xs mt-3 inline-block font-semibold">Ver perfil proveedor →</Link>
          )}
        </div>

        <div className="card">
          <h3 className="font-display font-bold mb-3">Solicitud original</h3>
          {run ? (
            <>
              <dl className="text-sm space-y-2">
                <div className="flex justify-between"><dt className="text-muted">Solicitante</dt><dd>{run.solicitante_nombre ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Email</dt><dd className="text-xs">{run.solicitante_email ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Owner</dt><dd className="text-xs">{run.owner_email ?? '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Fase actual</dt><dd>{run.current_phase}</dd></div>
              </dl>
              <Link href={`/admin/workflows/${run.id}`} className="text-brand-500 hover:underline text-xs mt-3 inline-block font-semibold">Ver detalle solicitud →</Link>
            </>
          ) : (
            <div className="text-muted text-sm">Sin solicitud asociada</div>
          )}
        </div>
      </div>

      <div className="card">
        <h3 className="font-display font-bold mb-1">📄 Documentos del contrato</h3>
        <p className="text-muted text-xs mb-3">Borrador, anexos y papel del proveedor cargados por el equipo interno.</p>
        {main.length + anexos.length + papel.length === 0 ? (
          <div className="text-muted text-sm">Sin documentos del contrato cargados todavía</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-[11px] uppercase tracking-wider">
              <tr><th className="text-left p-2">Tipo</th><th className="text-left p-2">Archivo</th><th className="text-left p-2">Versión</th><th className="text-left p-2">Subido</th><th className="text-right p-2"></th></tr>
            </thead>
            <tbody>
              {[...main, ...anexos, ...papel].map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="p-2"><b>{f.kind}</b></td>
                  <td className="p-2 text-muted">{f.filename}</td>
                  <td className="p-2 text-muted">v{f.version}</td>
                  <td className="p-2 text-muted text-xs">{formatDateTime(f.created_at)}</td>
                  <td className="p-2 text-right">
                    <a href={`/api/files/url?id=${f.id}&download=1`} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline text-xs font-semibold">⬇ Descargar</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3 className="font-display font-bold mb-1">📁 Documentos del proveedor</h3>
        <p className="text-muted text-xs mb-3">Archivos que el proveedor subió en su formulario (RUT cert, escritura, NDA firmado, etc.)</p>
        {providerUploads.length === 0 ? (
          <div className="text-muted text-sm">El proveedor aún no subió documentos</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted text-[11px] uppercase tracking-wider">
              <tr><th className="text-left p-2">Tipo</th><th className="text-left p-2">Archivo</th><th className="text-left p-2">Tamaño</th><th className="text-left p-2">Subido</th><th className="text-right p-2"></th></tr>
            </thead>
            <tbody>
              {providerUploads.map((u: any) => (
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
    </div>
  );
}
