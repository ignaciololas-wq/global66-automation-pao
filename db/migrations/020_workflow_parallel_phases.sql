-- PR-B: tracking real de fases paralelas (datos proveedor || aprobaciones internas)
alter table public.workflow_runs add column if not exists active_phases jsonb default '[]'::jsonb;
alter table public.workflow_runs add column if not exists provider_data_completed_at timestamptz;
alter table public.workflow_runs add column if not exists internal_approvals_completed_at timestamptz;

create index if not exists workflow_runs_active_phases_idx on public.workflow_runs using gin (active_phases);
