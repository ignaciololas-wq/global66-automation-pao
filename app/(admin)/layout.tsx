import { Sidebar } from '@/components/admin/sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[240px_minmax(0,1fr)] min-h-screen [body.sidebar-collapsed_&]:grid-cols-[0_minmax(0,1fr)]">
      <Sidebar />
      <main className="p-8 overflow-x-hidden">{children}</main>
    </div>
  );
}
