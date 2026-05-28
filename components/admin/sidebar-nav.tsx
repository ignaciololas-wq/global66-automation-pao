'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/admin', label: 'Dashboard', icon: 'grid' },
  { href: '/admin/intake/new', label: 'Nueva solicitud', icon: 'plus' },
  { href: '/admin/workflows', label: 'Solicitudes', icon: 'list' },
  { href: '/admin/providers', label: 'Proveedores', icon: 'users' },
  { href: '/admin/contracts', label: 'Contratos', icon: 'file' },
  { href: '/admin/matriz', label: 'Matriz', icon: 'grid' },
];

const Icons: Record<string, React.ReactNode> = {
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-85">
      <rect x="3" y="3" width="7" height="9" /><rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" /><rect x="3" y="16" width="7" height="5" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-85">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  list: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-85">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-85">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
    </svg>
  ),
  file: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 opacity-85">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  ),
};

export function SidebarNav() {
  const pathname = usePathname();
  return (
    <>
      <div className="text-[11px] uppercase tracking-wider text-brand-200 font-semibold px-3 pt-4 pb-1.5">
        Gestión
      </div>
      <nav className="flex flex-col gap-1">
        {navItems.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== '/admin' && pathname?.startsWith(item.href + '/')) ||
            (item.href === '/admin' && pathname === '/admin');
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
              {Icons[item.icon]}
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
