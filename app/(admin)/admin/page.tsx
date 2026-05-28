import { getDashboardStats } from '@/lib/data/workflows';
import { StatCard } from '@/components/dashboard/stat-card';
import { PipelineFunnel } from '@/components/dashboard/funnel';
import { RecentRuns } from '@/components/dashboard/recent-runs';
import { ApprovalCards } from '@/components/dashboard/approval-cards';

export const dynamic = 'force-dynamic';
export const revalidate = 60;

export default async function AdminDashboard() {
  const stats = await getDashboardStats().catch(() => ({
    totalRuns: 0,
    totalProviders: 0,
    totalContracts: 0,
    totalCostUsd: '0.00',
    phases: [],
    recentRuns: [],
    approvalsByTeam: [],
  }));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-3xl font-display font-bold mb-1" style={{ letterSpacing: '-0.02em' }}>
          Buen día 👋
        </h2>
        <p className="text-muted text-sm">
          Resumen del estado de contratos y proveedores
        </p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <StatCard label="Solicitudes" value={stats.totalRuns} delta="workflow_runs totales" />
        <StatCard label="Proveedores" value={stats.totalProviders} />
        <StatCard label="Contratos" value={stats.totalContracts} />
        <StatCard label="Costo IA (7d)" value={`$${stats.totalCostUsd}`} small="USD" />
      </div>

      <PipelineFunnel phases={stats.phases} />

      <ApprovalCards approvals={stats.approvalsByTeam} />

      <RecentRuns runs={stats.recentRuns} />
    </div>
  );
}
