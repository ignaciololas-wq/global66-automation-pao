'use client';

import { useEffect, useRef, useState } from 'react';
import { initials } from '@/lib/format';

interface Me {
  email: string;
  display_name?: string | null;
  avatar_url?: string | null;
  roles: string[];
  bypass: boolean;
}

export function ProfileTrigger() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMe(d?.ok ? d : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!me) {
    return (
      <button className="w-full p-2.5 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs">
        Cargando…
      </button>
    );
  }

  const name =
    me.display_name ||
    me.email
      .split('@')[0]
      .replace(/\./g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  const primaryRole = me.roles?.includes('admin')
    ? 'Admin'
    : me.roles?.includes('aprobador')
      ? 'Aprobador'
      : 'Solicitante';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center gap-3 p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition text-left ${
          open ? 'bg-white/10 border-white/20' : ''
        }`}
      >
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-mint grid place-items-center font-display font-bold text-white text-sm shadow flex-shrink-0 overflow-hidden">
          {me.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={me.avatar_url} alt="" className="w-full h-full object-cover" />
          ) : (
            initials(name)
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-white truncate">{name}</div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-mint bg-mint/10 px-2 py-0.5 rounded-pill inline-block mt-0.5">
            {primaryRole}
            {me.bypass ? ' · DEV' : ''}
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`w-3.5 h-3.5 text-brand-200 flex-shrink-0 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && <ProfilePopup me={me} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ProfilePopup({ me, onClose }: { me: Me; onClose: () => void }) {
  const isAdmin = me.roles?.includes('admin');

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 bg-brand-900 border border-white/10 rounded-2xl shadow-2xl p-1.5 z-50 animate-fade-in">
      <div className="px-3 py-2.5 border-b border-white/10 mb-1">
        <div className="font-semibold text-white text-[13px]">
          {me.display_name ?? me.email.split('@')[0]}
        </div>
        <div className="text-[11px] text-brand-200 break-all mt-0.5">{me.email}</div>
      </div>
      {isAdmin && (
        <>
          <a
            href="/admin/matriz"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white hover:bg-white/10 transition"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-70">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 10v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m10 0h6M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24" />
            </svg>
            Configuración (matriz + branding)
          </a>
          <a
            href="/admin/users"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-white hover:bg-white/10 transition"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-70">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            Gestión usuarios
          </a>
        </>
      )}
      <div className="h-px bg-white/10 my-1 mx-1.5" />
      <a
        href="/api/auth/logout?next=/login"
        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-red-300 hover:bg-red-500/15 transition"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-70">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        Cerrar sesión
      </a>
    </div>
  );
}
