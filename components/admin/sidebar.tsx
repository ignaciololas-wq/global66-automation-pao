'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/admin',           label: 'Dashboard',       icon: 'grid' },
  { href: '/admin/intake/new', label: 'Nueva solicitud', icon: 'plus' },
  { href: '/admin/workflows', label: 'Solicitudes',     icon: 'list' },
  { href: '/admin/providers', label: 'Proveedores',     icon: 'users' },
  { href: '/admin/contracts', label: 'Contratos',       icon: 'file' },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setCollapsed(localStorage.getItem('g66_sidebar_collapsed') === '1');
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('g66_sidebar_collapsed', next ? '1' : '0');
      return next;
    });
  }

  return (
    <>
      <aside
        className={`bg-brand-900 text-white flex flex-col gap-1 sticky top-0 h-screen overflow-y-auto p-4 transition-transform ${
          collapsed ? '-translate-x-full' : ''
        }`}
      >
        <div className="flex items-center gap-2.5 px-3 pt-2 pb-7">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-400 to-mint grid place-items-center font-display font-extrabold text-lg">
            G
          </div>
          <div className="font-display font-extrabold text-[15px] leading-tight">
            global66
            <small className="block text-brand-200 font-medium text-[11px]">contratos</small>
          </div>
        </div>

        <div className="text-[11px] uppercase tracking-wider text-brand-200 font-semibold px-3 pt-4 pb-1.5">
          Gestión
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname?.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13.5px] font-medium transition ${
                  active
                    ? 'bg-brand-500 text-white shadow'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t border-white/10">
          <a
            href="/api/auth/logout?next=/login"
            className="block px-3 py-2.5 rounded-lg text-[13.5px] font-medium text-white/70 hover:bg-white/10 hover:text-white transition"
          >
            ↩ Cerrar sesión
          </a>
        </div>
      </aside>

      <button
        onClick={toggle}
        aria-label="Toggle sidebar"
        className={`fixed top-1/2 -translate-y-1/2 z-50 w-[22px] h-16 bg-brand-900 text-white/75 border border-white/10 border-l-0 rounded-r-xl shadow-md hover:bg-brand-800 hover:text-white grid place-items-center transition-all ${
          collapsed ? 'left-0' : 'left-[240px]'
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-180'}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </>
  );
}
