-- Faltantes: tipo_proveedor y nivel_acceso (el form los captura pero workflow_runs no los tenía).
ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS tipo_proveedor TEXT,
  ADD COLUMN IF NOT EXISTS nivel_acceso TEXT;
