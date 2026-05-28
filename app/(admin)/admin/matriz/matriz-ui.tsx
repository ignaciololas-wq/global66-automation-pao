'use client';

import { useState, useTransition } from 'react';
import type { Sociedad, Apoderado, SociedadDocument } from '@/lib/types';
import {
  createSociedad, updateSociedad, deleteSociedad,
  createApoderado, updateApoderado, deleteApoderado,
  createSociedadDoc, updateSociedadDoc, deleteSociedadDoc,
} from './actions';

type Tab = 'sociedades' | 'apoderados' | 'docs';

interface Props {
  sociedades: Sociedad[];
  apoderadosBySociedad: Record<string, Apoderado[]>;
  docsBySociedad: Record<string, SociedadDocument[]>;
}

export function MatrizUI({ sociedades, apoderadosBySociedad, docsBySociedad }: Props) {
  const [tab, setTab] = useState<Tab>('sociedades');
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>) {
    setErr(null);
    startTransition(async () => {
      try { await fn(); } catch (e: any) { setErr(e.message); }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border">
        {(['sociedades', 'apoderados', 'docs'] as Tab[]).map((t) => (
          <button
            key={t}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition ${tab === t ? 'border-brand-500 text-brand-700' : 'border-transparent text-muted hover:text-ink'}`}
            onClick={() => setTab(t)}
          >
            {t === 'sociedades' ? 'Sociedades' : t === 'apoderados' ? 'Apoderados' : 'Documentos'}
          </button>
        ))}
      </div>

      {err && <div className="bg-red-50 text-danger px-3.5 py-2.5 rounded-xl text-sm border border-red-200">{err}</div>}

      {tab === 'sociedades' && <SociedadesTab sociedades={sociedades} pending={pending} run={run} />}
      {tab === 'apoderados' && <ApoderadosTab sociedades={sociedades} apoderadosBySociedad={apoderadosBySociedad} pending={pending} run={run} />}
      {tab === 'docs' && <DocsTab sociedades={sociedades} docsBySociedad={docsBySociedad} pending={pending} run={run} />}
    </div>
  );
}

function SociedadesTab({ sociedades, pending, run }: { sociedades: Sociedad[]; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [draft, setDraft] = useState({ slug: '', name: '', country: 'Chile', active: true });
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-semibold mb-3 text-sm">Nueva sociedad</h3>
        <div className="grid grid-cols-[1fr_2fr_1fr_auto_auto] gap-2 items-end">
          <input className="input" placeholder="slug" value={draft.slug} onChange={(e) => setDraft({ ...draft, slug: e.target.value })} />
          <input className="input" placeholder="Nombre legal" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input" placeholder="País" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })} />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> activa</label>
          <button className="btn-primary text-sm" disabled={pending || !draft.slug || !draft.name} onClick={() => run(async () => { await createSociedad(draft); setDraft({ slug: '', name: '', country: 'Chile', active: true }); })}>+ Agregar</button>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
            <tr><th className="text-left p-3">Slug</th><th className="text-left p-3">Nombre</th><th className="text-left p-3">País</th><th className="text-left p-3">Activa</th><th className="text-right p-3"></th></tr>
          </thead>
          <tbody>
            {sociedades.map((s) => <SociedadRow key={s.id} s={s} pending={pending} run={run} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SociedadRow({ s, pending, run }: { s: Sociedad; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [edit, setEdit] = useState<Sociedad | null>(null);
  if (edit) {
    return (
      <tr className="border-t border-border bg-brand-50/30">
        <td className="p-2"><input className="input" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} /></td>
        <td className="p-2"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></td>
        <td className="p-2"><input className="input" value={edit.country} onChange={(e) => setEdit({ ...edit, country: e.target.value })} /></td>
        <td className="p-2"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /></td>
        <td className="p-2 text-right space-x-2">
          <button className="btn-primary text-xs" disabled={pending} onClick={() => run(async () => { await updateSociedad(edit.id, { slug: edit.slug, name: edit.name, country: edit.country, active: edit.active }); setEdit(null); })}>Guardar</button>
          <button className="btn-ghost text-xs" onClick={() => setEdit(null)}>Cancelar</button>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-border">
      <td className="p-3 text-muted">{s.slug}</td>
      <td className="p-3 font-medium">{s.name}</td>
      <td className="p-3">{s.country}</td>
      <td className="p-3">{s.active ? <span className="pill pill-green text-[10px]">activa</span> : <span className="pill pill-gray text-[10px]">inactiva</span>}</td>
      <td className="p-3 text-right space-x-2">
        <button className="text-xs text-brand-500 hover:underline" onClick={() => setEdit(s)}>editar</button>
        <button className="text-xs text-danger hover:underline" disabled={pending} onClick={() => { if (confirm(`Borrar ${s.name}?`)) run(() => deleteSociedad(s.id)); }}>borrar</button>
      </td>
    </tr>
  );
}

function ApoderadosTab({ sociedades, apoderadosBySociedad, pending, run }: { sociedades: Sociedad[]; apoderadosBySociedad: Record<string, Apoderado[]>; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [filterSoc, setFilterSoc] = useState<string>(sociedades[0]?.id ?? '');
  const list = apoderadosBySociedad[filterSoc] ?? [];
  const [draft, setDraft] = useState({ name: '', email: '', scope: 'general' as const, priority: 2 as 1 | 2, tipo_proveedor_match: [] as string[], notes: '', active: true });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-semibold">Sociedad</label>
        <select className="input max-w-xs" value={filterSoc} onChange={(e) => setFilterSoc(e.target.value)}>
          {sociedades.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="card">
        <h3 className="font-semibold mb-3 text-sm">Nuevo apoderado para {sociedades.find((s) => s.id === filterSoc)?.name ?? '—'}</h3>
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr_2fr_auto] gap-2 items-end">
          <input className="input" placeholder="Nombre" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <input className="input" placeholder="Email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
          <select className="input" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value as any })}>
            <option value="siempre">siempre</option><option value="saas">saas</option><option value="comercial">comercial</option><option value="general">general</option>
          </select>
          <select className="input" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) as 1 | 2 })}>
            <option value={1}>P1 (mandatorio)</option><option value={2}>P2 (secundario)</option>
          </select>
          <input className="input" placeholder="match tipos (csv)" value={draft.tipo_proveedor_match.join(',')} onChange={(e) => setDraft({ ...draft, tipo_proveedor_match: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          <button className="btn-primary text-sm" disabled={pending || !draft.name || !filterSoc} onClick={() => run(async () => { await createApoderado({ ...draft, sociedad_id: filterSoc }); setDraft({ name: '', email: '', scope: 'general', priority: 2, tipo_proveedor_match: [], notes: '', active: true }); })}>+ Agregar</button>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
            <tr><th className="text-left p-3">Nombre</th><th className="text-left p-3">Email</th><th className="text-left p-3">Scope</th><th className="text-left p-3">Prioridad</th><th className="text-left p-3">Match tipos</th><th className="text-left p-3">Activo</th><th className="text-right p-3"></th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="text-center text-muted p-8">Sin apoderados para esta sociedad.</td></tr>}
            {list.map((a) => <ApoderadoRow key={a.id} a={a} pending={pending} run={run} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ApoderadoRow({ a, pending, run }: { a: Apoderado; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  return (
    <tr className="border-t border-border">
      <td className="p-3 font-medium">{a.name}</td>
      <td className="p-3 text-muted">{a.email ?? '—'}</td>
      <td className="p-3">{a.scope}</td>
      <td className="p-3"><span className={`pill pill-${a.priority === 1 ? 'green' : 'yellow'} text-[10px]`}>P{a.priority}</span></td>
      <td className="p-3 text-xs text-muted">{a.tipo_proveedor_match?.join(', ') || '—'}</td>
      <td className="p-3"><input type="checkbox" checked={a.active} disabled={pending} onChange={(e) => run(() => updateApoderado(a.id, { active: e.target.checked }))} /></td>
      <td className="p-3 text-right">
        <button className="text-xs text-danger hover:underline" disabled={pending} onClick={() => { if (confirm(`Borrar ${a.name}?`)) run(() => deleteApoderado(a.id)); }}>borrar</button>
      </td>
    </tr>
  );
}

function DocsTab({ sociedades, docsBySociedad, pending, run }: { sociedades: Sociedad[]; docsBySociedad: Record<string, SociedadDocument[]>; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  const [filterSoc, setFilterSoc] = useState<string>(sociedades[0]?.id ?? '');
  const list = docsBySociedad[filterSoc] ?? [];
  const [draft, setDraft] = useState({ name: '', kind: 'base' as 'base' | 'sign', required: true, valid_months: '' as string | number, sort_order: list.length + 1, active: true });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label className="text-sm font-semibold">Sociedad</label>
        <select className="input max-w-xs" value={filterSoc} onChange={(e) => setFilterSoc(e.target.value)}>
          {sociedades.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="card">
        <h3 className="font-semibold mb-3 text-sm">Nuevo documento</h3>
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_auto] gap-2 items-end">
          <input className="input" placeholder="Nombre del doc" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          <select className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as any })}>
            <option value="base">base</option><option value="sign">sign</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={draft.required} onChange={(e) => setDraft({ ...draft, required: e.target.checked })} /> requerido</label>
          <input className="input" type="number" placeholder="meses validez" value={draft.valid_months as any} onChange={(e) => setDraft({ ...draft, valid_months: e.target.value })} />
          <input className="input" type="number" placeholder="orden" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} />
          <button className="btn-primary text-sm" disabled={pending || !draft.name || !filterSoc} onClick={() => run(async () => {
            await createSociedadDoc({
              sociedad_id: filterSoc, name: draft.name, kind: draft.kind, required: draft.required,
              valid_months: draft.valid_months === '' ? null : Number(draft.valid_months),
              sort_order: draft.sort_order, active: draft.active,
            });
            setDraft({ name: '', kind: 'base', required: true, valid_months: '', sort_order: list.length + 2, active: true });
          })}>+ Agregar</button>
        </div>
      </div>
      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
            <tr><th className="text-left p-3">#</th><th className="text-left p-3">Documento</th><th className="text-left p-3">Tipo</th><th className="text-left p-3">Requerido</th><th className="text-left p-3">Validez</th><th className="text-left p-3">Activo</th><th className="text-right p-3"></th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="text-center text-muted p-8">Sin documentos para esta sociedad.</td></tr>}
            {list.map((d) => <DocRow key={d.id} d={d} pending={pending} run={run} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DocRow({ d, pending, run }: { d: SociedadDocument; pending: boolean; run: (fn: () => Promise<unknown>) => void }) {
  return (
    <tr className="border-t border-border">
      <td className="p-3 text-muted">{d.sort_order}</td>
      <td className="p-3 font-medium">{d.name}</td>
      <td className="p-3">{d.kind}</td>
      <td className="p-3">{d.required ? '✓' : '—'}</td>
      <td className="p-3">{d.valid_months ? `${d.valid_months} meses` : '—'}</td>
      <td className="p-3"><input type="checkbox" checked={d.active} disabled={pending} onChange={(e) => run(() => updateSociedadDoc(d.id, { active: e.target.checked }))} /></td>
      <td className="p-3 text-right">
        <button className="text-xs text-danger hover:underline" disabled={pending} onClick={() => { if (confirm(`Borrar ${d.name}?`)) run(() => deleteSociedadDoc(d.id)); }}>borrar</button>
      </td>
    </tr>
  );
}
