import { Suspense } from 'react';
import { BrandLogo } from './brand-logo';
import { SidebarNav } from './sidebar-nav';
import { ProfileTrigger } from './profile-trigger';
import { SidebarToggle } from './sidebar-toggle';

// Server component shell; children client components manejan estado.
export function Sidebar() {
  return (
    <>
      <aside
        id="g66-sidebar"
        className="bg-brand-900 text-white flex flex-col gap-1 sticky top-0 h-screen overflow-y-auto p-4 transition-transform"
      >
        <Suspense fallback={<div className="px-3 pt-2 pb-7 text-brand-200 text-xs">…</div>}>
          <BrandLogo />
        </Suspense>
        <SidebarNav />
        <div className="mt-auto pt-3 border-t border-white/10">
          <ProfileTrigger />
        </div>
      </aside>
      <SidebarToggle />
    </>
  );
}
