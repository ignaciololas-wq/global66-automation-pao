'use client';

import { useState, useTransition, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createIntake, lookupProviderByTaxId, type IntakeInput } from './actions';

const SOCIEDADES_BY_COUNTRY: Record<string, string[]> = {
  'Chile':          ['Global 81 SpA (Chile)', 'Global Card S.A. (Chile)'],
  'Colombia':       ['Global Colombia 81 (Colombia)'],
  'Argentina':      ['ArgPagos (Argentina)'],
  'Perú':           ['Andes Latam (Perú)'],
  'Estados Unidos': ['100x Corp'],
  'México':         ['100x Corp'],
  'Panamá':         ['100x Corp'],
  'Brasil':         ['100x Corp'],
  'Ecuador':        ['100x Corp'],
  'Uruguay':        ['100x Corp'],
  'Otro':           ['100x Corp'],
};

const TIPOS_PROVEEDOR = ['Servicios profesionales', 'Plataformas SaaS', 'Marketing y Publicidad', 'Consultoría/Asesoría', 'Otro'];
const MONEDAS = ['USD', 'CLP', 'PEN', 'MXN', 'COP', 'ARS', 'BRL', 'EUR', 'UF', 'PAB'];
const STEPS = ['Quién solicita', 'Proveedor', 'Contrato', 'Revisar'];

export function IntakeForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Partial<IntakeInput>>({
    owner_es_solicitante: true,
    proveedor_existente: false,
  });
  const [lookupMsg, setLookupMsg] = useState<{ kind: 'ok' | 'info' | 'warn'; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ run_id: string; provider_new: boolean } | null>(null);

  function update<K extends keyof IntakeInput>(key: K, value: IntakeInput[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  const sociedades = data.pais ? SOCIEDADES_BY_COUNTRY[data.pais] ?? ['100x Corp'] : [];

  async function onLookupRut() {
    if (!data.rut?.trim()) return;
    setLookupMsg({ kind: 'info', text: 'Buscando…' });
    try {
      const p = await lookupProviderByTaxId(data.rut.trim());
      if (!p) {
        setLookupMsg({ kind: 'info', text: '🆕 Proveedor nuevo. Completa los datos abajo.' });
        return;
      }
      setData((d) => ({
        ...d,
        razon_social: (p as any).razon_social ?? d.razon_social,
        pais: (p as any).pais ?? d.pais,
        tipo_proveedor: (p as any).tipo_proveedor ?? d.tipo_proveedor,
        representante_legal: (p as any).representante_legal ?? d.representante_legal,
        email_contacto: (p as any).email_contacto ?? d.email_contacto,
        email_facturacion: (p as any).email_facturacion ?? d.email_facturacion,
        proveedor_existente: true,
      }));
      setLookupMsg({ kind: 'ok', text: `✓ ${(p as any).razon_social} ya registrado. Campos autocompletados.` });
    } catch (e: any) {
      setLookupMsg({ kind: 'warn', text: 'Error: ' + e.message });
    }
  }

  function next() {
    setErr(null);
    if (!validate()) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() { setStep((s) => Math.max(0, s - 1)); }

  function validate(): boolean {
    if (step === 0) {
      const f = ['solicitante_nombre', 'solicitante_email', 'solicitante_area', 'owner_email', 'responsable_backup_email'];
      const missing = f.filter((k) => !((data as any)[k] ?? '').toString().trim());
      if (missing.length) { setErr('Completa: ' + missing.join(', ')); return false; }
    }
    if (step === 1) {
      const f = ['razon_social', 'rut', 'pais', 'representante_legal', 'email_contacto', 'email_facturacion', 'tipo_proveedor', 'sociedad_contratante'];
      const missing = f.filter((k) => !((data as any)[k] ?? '').toString().trim());
      if (missing.length) { setErr('Completa: ' + missing.join(', ')); return false; }
    }
    if (step === 2) {
      const f = ['servicio_descripcion', 'periodicidad', 'monto', 'moneda', 'tipo_duracion'];
      const missing = f.filter((k) => !((data as any)[k] ?? '').toString().trim() && (data as any)[k] !== 0);
      if (missing.length) { setErr('Completa: ' + missing.join(', ')); return false; }
      if (data.tipo_duracion && !data.fecha_inicio) { setErr('Fecha de inicio requerida'); return false; }
      if (data.tipo_duracion === 'plazo_fijo' && !data.fecha_fin) { setErr('Fecha de fin requerida en plazo fijo'); return false; }
    }
    return true;
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      try {
        const result = await createIntake({ ...(data as IntakeInput), monto: Number(data.monto) });
        setDone(result);
      } catch (e: any) {
        setErr(e.message);
      }
    });
  }

  if (done) {
    return (
      <div className="card text-center py-10">
        <div className="text-emerald-600 text-3xl mb-2">✓</div>
        <h3 className="text-xl font-display font-bold mb-2">Solicitud creada</h3>
        <p className="text-muted mb-4">
          <code>{done.run_id.slice(0, 8)}</code> · {done.provider_new ? '📨 Email al proveedor enviado' : '📂 Proveedor reusado'}
        </p>
        <div className="flex gap-2 justify-center">
          <button className="btn-primary" onClick={() => router.push(`/admin/workflows/${done.run_id}`)}>Ver detalle →</button>
          <button className="btn-secondary" onClick={() => { setDone(null); setData({ owner_es_solicitante: true, proveedor_existente: false }); setStep(0); }}>Crear otra</button>
        </div>
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
          <div><h3 className="font-display font-bold text-lg">1. Quién solicita</h3></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tu nombre completo *" value={data.solicitante_nombre ?? ''} onChange={(v) => update('solicitante_nombre', v)} />
            <Field label="Tu email *" type="email" value={data.solicitante_email ?? ''} onChange={(v) => update('solicitante_email', v)} />
            <Field label="Tu área *" value={data.solicitante_area ?? ''} onChange={(v) => update('solicitante_area', v)} />
            <div>
              <label className="label">¿Serás el Owner? *</label>
              <select className="input" value={data.owner_es_solicitante ? 'true' : 'false'} onChange={(e) => update('owner_es_solicitante', e.target.value === 'true')}>
                <option value="true">Sí</option><option value="false">No, otro responsable</option>
              </select>
            </div>
            {!data.owner_es_solicitante && <Field label="Nombre del Owner" value={data.owner_nombre ?? ''} onChange={(v) => update('owner_nombre', v)} />}
            <Field label="Email del Owner *" type="email" value={data.owner_email ?? ''} onChange={(v) => update('owner_email', v)} />
            <Field label="Email backup *" type="email" value={data.responsable_backup_email ?? ''} onChange={(v) => update('responsable_backup_email', v)} />
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">2. Proveedor</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Razón social *" value={data.razon_social ?? ''} onChange={(v) => update('razon_social', v)} />
            <div>
              <label className="label">RUT / Tax ID *</label>
              <input className="input" value={data.rut ?? ''} onChange={(e) => update('rut', e.target.value)} onBlur={onLookupRut} />
              {lookupMsg && (
                <div className={`mt-1.5 px-2.5 py-1.5 rounded-lg text-xs ${
                  lookupMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700' :
                  lookupMsg.kind === 'warn' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-700'
                }`}>{lookupMsg.text}</div>
              )}
            </div>
            <div>
              <label className="label">País de constitución *</label>
              <select className="input" value={data.pais ?? ''} onChange={(e) => { update('pais', e.target.value); update('sociedad_contratante', SOCIEDADES_BY_COUNTRY[e.target.value]?.[0] ?? '100x Corp'); }}>
                <option value="">—</option>
                {Object.keys(SOCIEDADES_BY_COUNTRY).map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            {data.pais && (
              <div>
                <label className="label">Sociedad contratante *</label>
                <select className="input" value={data.sociedad_contratante ?? ''} onChange={(e) => update('sociedad_contratante', e.target.value)}>
                  {sociedades.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            <Field label="Representante legal *" value={data.representante_legal ?? ''} onChange={(v) => update('representante_legal', v)} />
            <Field label="Email contacto *" type="email" value={data.email_contacto ?? ''} onChange={(v) => update('email_contacto', v)} />
            <Field label="Email facturación *" type="email" value={data.email_facturacion ?? ''} onChange={(v) => update('email_facturacion', v)} />
            <div>
              <label className="label">Tipo de proveedor *</label>
              <select className="input" value={data.tipo_proveedor ?? ''} onChange={(e) => update('tipo_proveedor', e.target.value)}>
                <option value="">—</option>
                {TIPOS_PROVEEDOR.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">3. Contrato</h3>
          <div>
            <label className="label">Descripción del servicio *</label>
            <textarea className="input min-h-[80px] resize-y" value={data.servicio_descripcion ?? ''} onChange={(e) => update('servicio_descripcion', e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Periodicidad *</label>
              <select className="input" value={data.periodicidad ?? ''} onChange={(e) => update('periodicidad', e.target.value)}>
                <option value="">—</option><option value="unico">Único</option><option value="mensual">Mensual</option><option value="anual">Anual</option><option value="otro">Otro</option>
              </select>
            </div>
            <Field label="Monto *" type="number" value={(data.monto ?? '') as any} onChange={(v) => update('monto', Number(v))} />
            <div>
              <label className="label">Moneda *</label>
              <select className="input" value={data.moneda ?? ''} onChange={(e) => update('moneda', e.target.value)}>
                <option value="">—</option>
                {MONEDAS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Duración *</label>
              <select className="input" value={data.tipo_duracion ?? ''} onChange={(e) => update('tipo_duracion', e.target.value)}>
                <option value="">—</option><option value="indefinido">Indefinido</option><option value="plazo_fijo">Plazo fijo</option><option value="por_proyecto">Por proyecto o entregable</option>
              </select>
            </div>
            {data.tipo_duracion && <Field label="Fecha de inicio *" type="date" value={data.fecha_inicio ?? ''} onChange={(v) => update('fecha_inicio', v)} />}
            {data.tipo_duracion === 'plazo_fijo' && <Field label="Fecha de fin *" type="date" value={data.fecha_fin ?? ''} onChange={(v) => update('fecha_fin', v)} />}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card space-y-4 animate-slide-up">
          <h3 className="font-display font-bold text-lg">4. Revisar y enviar</h3>
          <div className="bg-brand-50 border border-border rounded-xl divide-y divide-border">
            {[
              ['Solicitante', `${data.solicitante_nombre} · ${data.solicitante_email}`],
              ['Owner', data.owner_es_solicitante ? 'Mismo solicitante' : `${data.owner_nombre ?? ''} · ${data.owner_email}`],
              ['Proveedor', `${data.razon_social} · ${data.rut} · ${data.pais}`],
              ['Sociedad', data.sociedad_contratante],
              ['Servicio', data.servicio_descripcion],
              ['Monto', `${data.monto} ${data.moneda} · ${data.periodicidad}`],
              ['Duración', `${data.tipo_duracion}${data.fecha_inicio ? ` · desde ${data.fecha_inicio}` : ''}${data.fecha_fin ? ` hasta ${data.fecha_fin}` : ''}`],
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
        <button type="button" className="btn-ghost ml-auto" onClick={() => router.push('/admin/workflows')}>Cancelar</button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="btn-primary" onClick={next}>Continuar →</button>
        ) : (
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Creando…' : 'Crear solicitud →'}</button>
        )}
      </div>
    </form>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input type={type} className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
