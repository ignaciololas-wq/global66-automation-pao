import 'server-only';
import { createAdminClient } from '@/lib/supabase/server';
import type { WorkflowRun, PhaseCount } from '@/lib/types';

// Server-side data fetchers para Server Components.
// Bypass RLS con service_role; filtros aplicados en código (visibility ya
// chequeada por middleware/auth en page handlers).

// Columnas de la tabla de listado — excluye jsonb (metadata, active_phases,
// apoderados_firmantes) y campos largos. getWorkflow (detalle) usa select *.
const WORKFLOW_LIST_COLS =
  'id, created_at, current_phase, semaforo, razon_social, tax_id, pais, sociedad_contratante, monto, moneda, solicitante_email, owner_email';

export async function listWorkflows({
  limit = 50,
  email,
  phase,
}: {
  limit?: number;
  email?: string;
  phase?: string;
} = {}): Promise<WorkflowRun[]> {
  const sb = createAdminClient();
  let q = sb.from('workflow_runs').select(WORKFLOW_LIST_COLS).order('created_at', { ascending: false }).limit(limit);
  if (phase) q = q.eq('current_phase', phase);
  if (email) q = q.or(`solicitante_email.eq.${email},owner_email.eq.${email}`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as WorkflowRun[];
}

export async function getWorkflow(id: string): Promise<WorkflowRun | null> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('workflow_runs').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as WorkflowRun | null;
}

export async function getPhaseStats(): Promise<PhaseCount[]> {
  const sb = createAdminClient();
  const { data, error } = await sb.from('v_runs_by_phase').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as PhaseCount[];
}

export interface DashboardStats {
  totalRuns: number;
  totalProviders: number;
  totalContracts: number;
  totalCostUsd: string;
  phases: PhaseCount[];
  recentRuns: WorkflowRun[];
  approvalsByTeam: { team: string; avg_hours_to_decide: number | null; approved: number; rejected: number }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const sb = createAdminClient();
  const [phases, approvals, costs, runs, providers, contracts] = await Promise.all([
    sb.from('v_runs_by_phase').select('*').then((r) => r.data ?? []),
    sb.from('v_avg_approval_time').select('*').then((r) => r.data ?? []),
    sb.from('v_extraction_costs').select('*').limit(7).then((r) => r.data ?? []),
    sb.from('workflow_runs').select('*').order('created_at', { ascending: false }).limit(10),
    sb.from('v_providers_by_country').select('*').then((r) => r.data ?? []),
    sb.from('v_contracts_by_status').select('*').then((r) => r.data ?? []),
  ]);

  const totalRuns = (phases as PhaseCount[]).reduce((a, p) => a + (p.total ?? 0), 0);
  const totalProviders = (providers as any[]).reduce((a, p) => a + (p.total ?? 0), 0);
  const totalContracts = (contracts as any[]).reduce((a, c) => a + (c.total ?? 0), 0);
  const totalCostUsd = (costs as any[])
    .reduce((a, c) => a + Number(c.cost_usd_total ?? 0), 0)
    .toFixed(2);

  return {
    totalRuns,
    totalProviders,
    totalContracts,
    totalCostUsd,
    phases: phases as PhaseCount[],
    recentRuns: (runs.data ?? []) as WorkflowRun[],
    approvalsByTeam: approvals as any,
  };
}
