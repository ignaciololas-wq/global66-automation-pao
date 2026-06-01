'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { sendForSignature, checkSignatureStatus } from '@/app/(admin)/admin/workflows/[id]/actions';

export function SignaturePanel({ runId, phase, signnowDocumentId, hasMainFile }: {
  runId: string;
  phase: string;
  signnowDocumentId: string | null;
  hasMainFile: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  function send() {
    setErr(null); setMsg(null);
    start(async () => {
      try { const r = await sendForSignature(runId); setMsg(`Enviado a firma a ${r.signer}.`); router.refresh(); }
      catch (e: any) { setErr(e.message); }
    });
  }
  function check() {
    setErr(null); setMsg(null);
    start(async () => {
      try { const r = await checkSignatureStatus(runId); setMsg(r.signed ? '✅ Firmado.' : '⏳ Todavía pendiente de firma.'); router.refresh(); }
      catch (e: any) { setErr(e.message); }
    });
  }

  const signed = phase === 'signed';

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm">Firma electrónica (SignNow)</h3>
        {signed ? <span className="pill pill-green text-[11px]">✅ Firmado</span>
          : signnowDocumentId ? <span className="pill pill-yellow text-[11px]">⏳ En firma</span>
          : <span className="pill pill-gray text-[11px]">Sin enviar</span>}
      </div>

      {signed ? (
        <p className="text-muted text-xs">El contrato está firmado y archivado. El PDF firmado aparece arriba en el visor de documentos.</p>
      ) : signnowDocumentId ? (
        <div className="space-y-2">
          <p className="text-muted text-xs">Ya se envió la invitación de firma al apoderado. Cuando firme, se guarda solo (o actualizá el estado acá).</p>
          <button className="btn-ghost text-xs" disabled={pending} onClick={check}>🔄 Actualizar estado de firma</button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted text-xs">{hasMainFile ? 'Envía el contrato al apoderado para firma electrónica por email.' : 'Subí primero el PDF del contrato (visor de documentos) para poder enviarlo a firma.'}</p>
          <button className="btn-primary text-xs" disabled={pending || !hasMainFile} onClick={send}>📤 Enviar a firma</button>
        </div>
      )}

      {msg && <div className="text-green-600 text-[11px] mt-2">{msg}</div>}
      {err && <div className="bg-red-50 text-danger px-3 py-2 rounded-lg text-xs border border-red-200 mt-2">{err}</div>}
    </div>
  );
}
