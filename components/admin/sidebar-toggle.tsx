'use client';
import { useEffect, useState } from 'react';

export function SidebarToggle() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const init = localStorage.getItem('g66_sidebar_collapsed') === '1';
    setCollapsed(init);
    apply(init);
  }, []);

  function apply(v: boolean) {
    const aside = document.getElementById('g66-sidebar');
    const shell = document.body;
    if (aside) {
      aside.style.transform = v ? 'translateX(-100%)' : '';
      aside.style.pointerEvents = v ? 'none' : '';
    }
    if (shell) shell.classList.toggle('sidebar-collapsed', v);
  }

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem('g66_sidebar_collapsed', next ? '1' : '0');
      apply(next);
      return next;
    });
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle sidebar"
      title="Mostrar/ocultar barra lateral"
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
  );
}
