-- PR-RLS-REGCHEQ-READ: permitir SELECT a usuarios autenticados (admin UI consume directo)
-- Antes: solo service_role accedía. Front pasaba todo por /api lo que requería server roundtrip.
-- Ahora: admin UI puede leer directo via supabase-js cliente sin proxy backend.
create policy auth_read_regcheq on public.regcheq_checks
  for select to authenticated
  using (true);
