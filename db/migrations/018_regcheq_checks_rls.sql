-- Habilita RLS en regcheq_checks. Solo service_role (server) accede directo.
-- Front consume vía /api con cookie httpOnly que valida el server.
alter table public.regcheq_checks enable row level security;

create policy service_role_all_regcheq on public.regcheq_checks
  for all to service_role using (true) with check (true);
