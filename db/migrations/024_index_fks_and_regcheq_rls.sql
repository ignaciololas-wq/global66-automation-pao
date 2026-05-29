-- 024_index_fks_and_regcheq_rls.sql
-- Cierra advisors Supabase (security + performance). Aplicada vía MCP 2026-05-29.

-- Perf (advisor 0001 unindexed_foreign_keys): índices covering en FKs sin
-- índice. Aceleran JOINs, lookups por FK y chequeos ON DELETE/cascade.
create index if not exists idx_ai_edit_jobs_draft_file on public.ai_edit_jobs (draft_file_id);
create index if not exists idx_ai_edit_jobs_requested_by on public.ai_edit_jobs (requested_by_id);
create index if not exists idx_ai_edit_jobs_source_file on public.ai_edit_jobs (source_file_id);
create index if not exists idx_contract_files_prev_version on public.contract_files (previous_version_id);
create index if not exists idx_contract_files_provider on public.contract_files (provider_id);
create index if not exists idx_contract_files_uploaded_by on public.contract_files (uploaded_by_id);
create index if not exists idx_contracts_workflow_run on public.contracts (workflow_run_id);
create index if not exists idx_file_comments_author on public.file_comments (author_id);
create index if not exists idx_file_comments_run on public.file_comments (workflow_run_id);
create index if not exists idx_notifications_run on public.notifications (workflow_run_id);
create index if not exists idx_provider_uploads_run on public.provider_uploads (workflow_run_id);
create index if not exists idx_sanctions_checks_run on public.sanctions_checks (workflow_run_id);

-- Security (advisor 0008 rls_enabled_no_policy): regcheq_raw_callbacks tiene RLS
-- habilitado sin policy. Solo service_role la escribe (bypassa RLS). Policy de
-- deny explícito para authenticated → cierra el advisor manteniendo el lockdown.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'regcheq_raw_callbacks'
  ) then
    execute 'create policy "deny_authenticated_all" on public.regcheq_raw_callbacks for all to authenticated using (false) with check (false)';
  end if;
end $$;

-- PENDIENTE (diferido, requiere revisión con cuidado — toca policies RLS):
--   advisor 0003 auth_rls_initplan: varias policies re-evalúan auth.<fn>() por
--   fila. Fix = envolver en (select auth.fn()). Opt de perf a escala; tablas
--   chicas hoy. No aplicado en ventana desatendida por riesgo de lockout.
-- ACEPTADOS (tradeoff conocido):
--   0029 SECURITY DEFINER current_user_email/roles/sociedades — necesarias para
--     que las policies RLS resuelvan identidad; revocar EXECUTE rompe RLS.
--   auth_leaked_password_protection (HIBP) — requiere plan Pro; app usa magic-link.
