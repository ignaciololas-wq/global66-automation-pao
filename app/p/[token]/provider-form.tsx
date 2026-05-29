'use client';

import { useState, useTransition, FormEvent } from 'react';
import { saveProviderProfile, uploadProviderDoc, deleteProviderUpload, type ProviderProfileInput } from './actions';
import type { Provider, SociedadDocument } from '@/lib/types';

interface Upload {
  id: string;
  doc_type: string;
  doc_filename: string;
  file_size: number;
  created_at: string;
}

interface Props {
  token: string;
  provider: Provider;
  requiredDocs: SociedadDocument[];
  uploads: Upload[];
}

const STEPS = ['Datos de la empresa', 'Cuenta bancaria', 'Contacto administrativo', 'Documentos', 'Confirmar'];

export function ProviderForm({ token, provider, requiredDocs, uploads }: Props) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<ProviderProfileInput>({
    razon_social: provider.razon_social,
    tax_id: provider.tax_id,
    pais: provider.pais,
    tipo_proveedor: provider.tipo_proveedor ?? '',
    representante_legal: provider.representante_legal ?? '',
    email_contacto: provider.email_contacto ?? '',
    email_facturacion: provider.email_facturacion ?? '',
    domicilio: (provider as any).domicilio ?? '',
    ...((provider as any).profile_data ?? {}),
  });
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState((provider as any).profile_completed_at ? true : false);

  function update<K extends keyof ProviderProfileInput>(key: K, value: ProviderProfileInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  const uploadsByKind = uploads.reduce<Record<string, Upload[]>>((acc, u) => {
    (acc[u.doc_type] ??= []).push(u);
    return acc;
  }, {});

  function next() { setErr(null); setStep((s) => Math.min(STEPS.length - 1, s + 1)); }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      try {
        await saveProviderProfile(token, data);
        setDone(true);
      } catch (e: any) { setErr(e.message); }
    });
  }

  async function onFileChange(docKind: string, file: File) {
    setErr(null);
    const fd = new FormData();
    fd.append('docKind', docKind);
    fd.append('file', file);
    startTransition(async () => {
      try { await uploadProviderDoc(token, fd); } catch (e: any) { setErr(e.message); }
    });
  }

  function onDelete(uploadId: string) {
    if (!confirm('¿Borrar este documento?')) return;
    startTransition(async () => {
      try { await deleteProviderUpload(token, uploadId); } catch (e: any) { setErr(e.message); }
    });
  }

  if (done && step !== STEPS.length - 1) {
    return (
      <div className="card text-center py-10">
        <div className="text-emerald-600 text-3xl mb-2">✓</div>
        <h3 className="text-xl font-display font-bold mb-2">¡Listo!</h3>
        <p className="text-muted mb-4">Recibimos tus datos y documentos. Te avisaremos por email cuando avancemos.</p>
        <button className="btn-secondary" onClick={() => setDone(false)}>Editar info</button>
      </div>
    );
  }

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <div className="h-1 bg-border rounded-pill overflow-hidden">
          <div className="h-full bg-gradient-to-r from-brand-500 to-mint transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <div className="flex justify-between text-xs font-semibold text-brand-700">
          <span>Paso {step + 1} de {STEPS.length}</span>
          <span className="text-muted font-medium">{STEPS[step]}</span>
        </div>
      </div>

      {step === 0 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">1. Datos de la empresa</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Razón social" value={data.razon_social ?? ''} onChange={(v) => update('razon_social', v)} />
            <Field label="RUT / Tax ID" value={data.tax_id ?? ''} onChange={(v) => update('tax_id', v)} />
            <Field label="País" value={data.pais ?? ''} onChange={(v) => update('pais', v)} />
            <Field label="Representante legal" value={data.representante_legal ?? ''} onChange={(v) => update('representante_legal', v)} />
            <Field label="Email contacto" type="email" value={data.email_contacto ?? ''} onChange={(v) => update('email_contacto', v)} />
            <Field label="Email facturación" type="email" value={data.email_facturacion ?? ''} onChange={(v) => update('email_facturacion', v)} />
            <Field label="Domicilio" value={data.domicilio ?? ''} onChange={(v) => update('domicilio', v)} />
            <Field label="Giro / Actividad" value={(data.giro as string) ?? ''} onChange={(v) => update('giro', v)} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">2. Cuenta bancaria</h3>
          <p className="text-muted text-sm">Para recibir pagos.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Banco" value={(data.banco_nombre as string) ?? ''} onChange={(v) => update('banco_nombre', v)} />
            <Field label="Titular" value={(data.banco_titular as string) ?? ''} onChange={(v) => update('banco_titular', v)} />
            <Field label="Tipo de cuenta" value={(data.banco_cuenta_tipo as string) ?? ''} onChange={(v) => update('banco_cuenta_tipo', v)} />
            <Field label="N° de cuenta" value={(data.banco_cuenta_numero as string) ?? ''} onChange={(v) => update('banco_cuenta_numero', v)} />
            <Field label="SWIFT (opcional)" value={(data.banco_swift as string) ?? ''} onChange={(v) => update('banco_swift', v)} />
            <Field label="IBAN (opcional)" value={(data.banco_iban as string) ?? ''} onChange={(v) => update('banco_iban', v)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">3. Contacto administrativo</h3>
          <p className="text-muted text-sm">Persona para temas operativos (facturación, pagos, dudas).</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nombre" value={(data.contacto_admin_nombre as string) ?? ''} onChange={(v) => update('contacto_admin_nombre', v)} />
            <Field label="Email" type="email" value={(data.contacto_admin_email as string) ?? ''} onChange={(v) => update('contacto_admin_email', v)} />
            <Field label="Teléfono" value={(data.contacto_admin_telefono as string) ?? ''} onChange={(v) => update('contacto_admin_telefono', v)} />
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">4. Documentos</h3>
          <p className="text-muted text-sm">Subí los documentos solicitados. Si alguno no aplica, podés saltarlo y nos contactamos.</p>
          {requiredDocs.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-sm">
              No tenemos lista de documentos para tu sociedad. Te enviaremos requerimientos por email.
            </div>
          )}
          <div className="space-y-3">
            {requiredDocs.map((doc) => {
              const list = uploadsByKind[doc.name] ?? [];
              return (
                <div key={doc.id} className="bg-brand-50/50 border border-border rounded-xl p-3.5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <div className="font-semibold text-sm">{doc.name} {doc.required && <span className="text-danger">*</span>}</div>
                      <div className="text-xs text-muted">{doc.kind === 'sign' ? 'Para firma' : 'Documento base'}</div>
                    </div>
                    <label className="btn-secondary cursor-pointer text-xs">
                      {pending ? 'Subiendo…' : '+ Adjuntar'}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.docx,.doc,image/png,image/jpeg"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) { onFileChange(doc.name, f); e.target.value = ''; } }}
                      />
                    </label>
                  </div>
                  {list.length > 0 && (
                    <ul className="space-y-1.5 mt-2">
                      {list.map((u) => (
                        <li key={u.id} className="flex items-center justify-between bg-white rounded-lg px-2.5 py-1.5 text-xs border border-border">
                          <span className="truncate flex-1">📎 {u.doc_filename} <span className="text-muted">({(u.file_size / 1024).toFixed(0)} KB)</span></span>
                          <button type="button" className="text-danger hover:underline" onClick={() => onDelete(u.id)} disabled={pending}>borrar</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">5. Confirmar</h3>
          <div className="bg-brand-50 border border-border rounded-xl divide-y divide-border">
            {[
              ['Razón social', data.razon_social],
              ['Tax ID', data.tax_id],
              ['País', data.pais],
              ['Representante', data.representante_legal],
              ['Email contacto', data.email_contacto],
              ['Email facturación', data.email_facturacion],
              ['Banco', data.banco_nombre],
              ['Cuenta', data.banco_cuenta_numero],
              ['Documentos subidos', uploads.length.toString()],
            ].map(([k, v]) => (
              <div key={k as string} className="grid grid-cols-[minmax(140px,200px)_1fr] gap-x-4 px-4 py-2.5 text-sm">
                <div className="text-[11px] uppercase tracking-wider text-muted font-semibold">{k as string}</div>
                <div className="font-medium break-words">{(v as string) || '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {err && <div className="bg-red-50 text-danger px-3.5 py-2.5 rounded-xl text-sm border border-red-200">{err}</div>}

      <div className="flex items-center gap-2 sticky bottom-4 bg-white/95 backdrop-blur p-2 rounded-2xl border border-border">
        {step > 0 && <button type="button" className="btn-ghost" onClick={back}>← Atrás</button>}
        <div className="ml-auto" />
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn-primary" onClick={next}>Continuar →</button>
        ) : (
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Enviando…' : 'Confirmar y enviar'}</button>
        )}
      </div>
    </form>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
