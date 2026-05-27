-- PR10: persistir lista de apoderados que firmarán el contrato.
ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS apoderados_firmantes JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.workflow_runs.apoderados_firmantes IS
  'Array de apoderados que firmaron/firmarán [{ apoderado_id, name, email, role: siempre|secundario, status: pending|sent|signed, signed_at }]';
