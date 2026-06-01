import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getWorkflow } from '@/lib/data/workflows';
import { listContractFiles, listComments, listProviderUploadsByProvider } from '@/lib/data/contracts';
import { createAdminClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { FlowCanvas } from '@/components/workflow/flow-canvas';
import { DocViewerPanel } from '@/components/workflow/doc-viewer-panel';
import { RegcheqManualCard, type RegcheqLatest } from '@/components/workflow/regcheq-manual-card';
import { phaseLabel, phaseKind, semKind, formatMoney, formatDateTime } from '@/lib/format';
import type { FileComment } from '@/lib/types';
import { ApprovalPanel } from '@/components/workflow/approval-panel';
import { getApprovals } from '@/lib/data/approvals';
import { requiredApprovalTeams } from '@/lib/slack/dispatch';

export const dynamic = 'force-dynamic';

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r, files, auth] = await Promise.all([getWorkflow(id), listContractFiles(id), getCurrentUser()]);
  if (!r) notFound();

  const commentsByFile: Record<string, FileComment[]> = {};
  await Promise.all(files.map(async (f) => { commentsByFile[f.id] = await listComments(f.id); }));
  const canRunAi = auth.ok && (auth.roles.includes('admin') || auth.roles.includes('aprobador'));
  const canApprove = canRunAi;
  const [approvals, requiredTeams] = await Promise.all([
    getApprovals(id).catch(() => ({} as Record<string, string>)),
    requiredApprovalTeams((r as any).pais).catch(() => ['compliance', 'legal', 'admin']),
  ]);

  // Provider uploads via tax_id → provider lookup
  const sb = createAdminClient();
  const { data: providerRow } = await sb.from('providers').select('id').eq('tax_id', r.tax_id).maybeSingle();
  const providerId = (providerRow as any)?.id ?? null;
  const providerUploads = providerId ? await listProviderUploadsByProvider(providerId).catch(() => []) : [];

  // Último chequeo RegCheq de esta solicitud (incluye decisiones manuales)
  let latestRegcheq: RegcheqLatest | null = null;
  {
    const { data: rc } = await sb
      .from('regcheq_checks')
      .select('decision, reason, company, created_at')
      .eq('workflow_run_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (rc) {
      const c = rc as any;
      latestRegcheq = {
        decision: c.decision,
        reason: c.reason ?? null,
        manual: !!c.company?.manual,
        reportUploadId: c.company?.report_upload_id ?? null,
        createdAt: c.created_at ?? null,
      };
    }
  }

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
      {canApprove && <ApprovalPanel runId={id} requiredTeams={requiredTeams} approvals={approvals} />}
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
      <div>
        <h3 className="font-display font-bold text-lg mb-3">Documento del contrato</h3>
        <DocViewerPanel workflowRunId={r.id} files={files} commentsByFile={commentsByFile} canRunAi={canRunAi} />
      </div>

      <RegcheqManualCard runId={r.id} providerId={providerId} latest={latestRegcheq} />

      <div className="card">
        <h3 className="font-display font-bold mb-1">📁 Documentos subidos por el proveedor</h3>
        <p className="text-muted text-xs mb-3">Archivos que el proveedor cargó desde su formulario (RUT cert, escritura, NDA firmado, etc.). Descargables desde acá o desde el perfil del proveedor.</p>
        {providerUploads.length === 0 ? (
          <div className="text-muted text-sm">El proveedor aún no subió documentos.</div>
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
