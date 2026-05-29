-- 023_list_created_at_indexes.sql
-- Perf: índices created_at DESC para acelerar el ORDER BY de las vistas de
-- listado (workflows, providers, contracts). Las tablas hoy son chicas, pero
-- el ORDER BY sin índice fuerza un sort en cada SSR; defensivo para escala.
-- Aplicada vía MCP el 2026-05-29.

create index if not exists idx_workflow_runs_created_at on public.workflow_runs (created_at desc);
create index if not exists idx_providers_created_at on public.providers (created_at desc);
create index if not exists idx_contracts_created_at on public.contracts (created_at desc);

-- provider_uploads se filtra por provider_id y ordena por created_at desc.
create index if not exists idx_uploads_provider_created on public.provider_uploads (provider_id, created_at desc);
