'use client';
import { useState, useTransition } from 'react';
import { saveUserRolesAction, inviteUserAction } from './actions';
import { formatDateTime } from '@/lib/format';
import type { AdminUser } from '@/lib/data/users';

const ROLE_OPTIONS = ['admin', 'aprobador', 'solicitante', 'proveedor'] as const;

export function UsersTable({ users }: { users: AdminUser[] }) {
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState('');

  const filtered = users.filter((u) => !filter || u.email.toLowerCase().includes(filter.toLowerCase()) || (u.display_name ?? '').toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <div className="flex gap-3 items-center">
        <input
          type="search"
          placeholder="🔍 Buscar por email o nombre…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-sm"
        />
        <InviteForm pending={pending} startTransition={startTransition} />
      </div>

      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-brand-50 text-muted text-[11px] uppercase tracking-wider">
            <tr>
              <th className="text-left p-3.5">Usuario</th>
              <th className="text-left p-3.5">Roles</th>
              <th className="text-left p-3.5">Último login</th>
              <th className="text-left p-3.5">Creado</th>
              <th className="text-right p-3.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center text-muted p-8">Sin usuarios{filter ? ' que matcheen' : ''}</td></tr>
            ) : (
              filtered.map((u) => (
                <UserRow key={u.id} user={u} pending={pending} startTransition={startTransition} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function UserRow({ user, pending, startTransition }: { user: AdminUser; pending: boolean; startTransition: (fn: () => void) => void }) {
  const [editing, setEditing] = useState(false);
  const [roles, setRoles] = useState<string[]>(user.roles);
  const [saved, setSaved] = useState(false);

  function toggle(r: string) {
    setRoles((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  }

  function save() {
    const fd = new FormData();
    fd.set('user_id', user.id);
    roles.forEach((r) => fd.append('roles', r));
    startTransition(async () => {
      try {
        await saveUserRolesAction(fd);
        setSaved(true);
        setEditing(false);
        setTimeout(() => setSaved(false), 2000);
      } catch (e: any) {
        alert('Error: ' + e.message);
      }
    });
  }

  return (
    <tr className="border-t border-border hover:bg-brand-50/30">
      <td className="p-3.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[10px] font-semibold text-brand-700">{(user.display_name ?? user.email).split(/[\s.]+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
            )}
          </div>
          <div>
            <div className="font-semibold text-ink">{user.display_name ?? user.email.split('@')[0]}</div>
            <div className="text-muted text-xs">{user.email}</div>
          </div>
          {user.is_admin_allowlisted && <span className="pill pill-green text-[9px]">ADMIN_EMAILS</span>}
        </div>
      </td>
      <td className="p-3.5">
        {editing ? (
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((r) => (
              <label key={r} className="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} disabled={pending} />
                {r}
              </label>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {user.roles.map((r) => <span key={r} className="pill pill-blue text-[10px]">{r}</span>)}
          </div>
        )}
      </td>
      <td className="p-3.5 text-muted text-xs">{user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : '—'}</td>
      <td className="p-3.5 text-muted text-xs">{formatDateTime(user.created_at)}</td>
      <td className="p-3.5 text-right">
        {editing ? (
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => { setEditing(false); setRoles(user.roles); }} className="text-xs text-muted hover:text-ink" disabled={pending}>Cancelar</button>
            <button type="button" onClick={save} disabled={pending} className="text-xs font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50">Guardar</button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-500 hover:underline">
            {saved ? '✓ guardado' : 'Editar roles'}
          </button>
        )}
      </td>
    </tr>
  );
}

function InviteForm({ pending, startTransition }: { pending: boolean; startTransition: (fn: () => void) => void }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(['solicitante']);

  function submit() {
    const fd = new FormData();
    fd.set('email', email);
    roles.forEach((r) => fd.append('roles', r));
    startTransition(async () => {
      try {
        await inviteUserAction(fd);
        setEmail('');
        setRoles(['solicitante']);
        setOpen(false);
      } catch (e: any) {
        alert('Error: ' + e.message);
      }
    });
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="btn-primary text-sm whitespace-nowrap">+ Invitar usuario</button>;

  return (
    <div className="flex gap-2 items-center bg-brand-50 p-2 rounded-lg border border-brand-200">
      <input
        type="email"
        placeholder="email@global66.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 px-2 py-1 border border-border rounded text-sm"
        disabled={pending}
      />
      <select
        multiple
        size={1}
        value={roles}
        onChange={(e) => setRoles(Array.from(e.target.selectedOptions, (o) => o.value))}
        className="px-2 py-1 border border-border rounded text-xs"
        disabled={pending}
      >
        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <button type="button" onClick={submit} disabled={pending || !email} className="btn-primary text-xs">Invitar</button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted">✕</button>
    </div>
  );
}
