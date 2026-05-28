-- PR-B fix: agregar 'parallel' al CHECK constraint de current_phase para que /api/intake/approve
-- pueda setear current_phase='parallel' cuando arrancan branches paralelos (datos proveedor || aprobaciones internas).
alter table public.workflow_runs drop constraint if exists workflow_runs_current_phase_check;
alter table public.workflow_runs add constraint workflow_runs_current_phase_check
  check (current_phase = any (array['fase1', 'hito1', 'fase2', 'fase3', 'signed', 'rejected', 'cancelled', 'parallel']));
