'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { submitRegcheqManual } from '@/app/(admin)/admin/workflows/[id]/actions';

const DECISION_PILL: Record<string, string> = {
  block: 'pill-red', review: 'pill-yellow', approve_flag: 'pill-yellow',
  approve: 'pill-green', unknown: 'pill-gray', skip: 'pill-gray',
};
const DECISION_LABEL: Record<string, string> = {
  block: '⛔ Bloquear', review: '⚠️ Revisión manual', approve_flag: '⚑ Aprobar con flag',
  approve: '✓ Aprobar', unknown: 'Sin datos', skip: 'Omitido',
};

export interface RegcheqLatest {
  decision: string;
  reason: string | null;
  manual: boolean;
  reportUploadId: string | null;
  createdAt: string | null;
}

interface Props {
  runId: string;
  providerId: string | null;
  latest: RegcheqLatest | null;
}

export function RegcheqManualCard({ runId, providerId, latest }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function submit() {
    setError(null);
    setOk(null);
    if (!providerId) { setError('No se pudo resolver el proveedor de esta solicitud.'); return; }
    if (!decision) { setError('Elegí una decisión (bloquear / revisión / aprobar).'); return; }
    const fd = new FormData();
    fd.set('provider_id', providerId);
    fd.set('run_id', runId);
    fd.set('decision', decision);
    if (reason.trim()) fd.set('reason', reason.trim());
    if (file) fd.set('file', file, file.name);
    startTransition(async () => {
      try {
        const r = await submitRegcheqManual(fd);
        setOk(`✓ Decisión "${r.decision}" guardada${r.report_filename ? ` + informe ${r.report_filename}` : ' (sin informe adjunto)'}.`);
        setReason('');
        setFile(null);
        setDecision('');
        router.refresh();
      } catch (e: any) {
        setError(e.message);
      }
    });
  }

  return (
    <div className="card">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-display font-bold">
          Validación PEP/AML (RegCheq)
          {latest?.manual && <span className="text-muted text-xs font-normal"> · manual</span>}
        </h3>
        {latest && (
          <span className={`pill ${DECISION_PILL[latest.decision] ?? 'pill-gray'}`}>
            {DECISION_LABEL[latest.decision] ?? latest.decision}
          </span>
        )}
      </div>

      {latest ? (
        <div className="text-sm space-y-1 mb-4">
          <div><b>Decisión:</b> {DECISION_LABEL[latest.decision] ?? latest.decision} <span className="text-muted">({latest.reason ?? '—'})</span></div>
          {latest.reportUploadId && (
            <div>
              <a href={`/api/provider-uploads/url?id=${latest.reportUploadId}`} target="_blank" rel="noreferrer" className="text-brand-500 hover:underline font-semibold">⬇ Descargar informe RegCheq</a>
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted text-sm mb-4">Sin chequeo RegCheq registrado. La API automática no está disponible — cargá el informe manual abajo.</p>
      )}

      <div className="border-t border-border pt-4">
        <div className="text-[12px] uppercase tracking-wider text-muted font-semibold mb-2">Informe RegCheq manual</div>
        <p className="text-muted text-xs mb-3">Corré el chequeo en la web de RegCheq, descargá el informe y subilo acá con la decisión. Queda descargable en la solicitud y el perfil del proveedor.</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
          <label className="block">
            <span className="label">Decisión</span>
            <select className="input" value={decision} onChange={(e) => setDecision(e.target.value)} disabled={pending}>
              <option value="">— Elegí —</option>
              <option value="block">⛔ Bloquear</option>
              <option value="review">⚠️ Revisión manual</option>
              <option value="approve_flag">⚑ Aprobar con flag</option>
              <option value="approve">✓ Aprobar</option>
            </select>
          </label>
          <label className="block">
            <span className="label">Informe (PDF/imagen, opcional)</span>
            <input className="input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={pending} />
          </label>
        </div>
        <label className="block mt-3">
          <span className="label">Motivo / notas</span>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej: coincidencia en lista de interés / PEP / sin observaciones" disabled={pending} />
        </label>
        {error && <div className="text-danger text-sm mt-2">{error}</div>}
        {ok && <div className="text-ok text-sm mt-2">{ok}</div>}
        <div className="flex justify-end mt-3">
          <button type="button" className="btn-primary" onClick={submit} disabled={pending || !providerId}>
            {pending ? 'Guardando…' : 'Guardar decisión + informe'}
          </button>
        </div>
      </div>
    </div>
  );
}
