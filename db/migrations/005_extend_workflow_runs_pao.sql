-- Extensión schema Pao: solicitante separado del owner, sociedad contratante,
-- tipo duración, contacto principal, proveedor nuevo vs existente, descripción servicio.

ALTER TABLE public.workflow_runs
  ADD COLUMN IF NOT EXISTS solicitante_nombre TEXT,
  ADD COLUMN IF NOT EXISTS solicitante_email TEXT,
  ADD COLUMN IF NOT EXISTS solicitante_area TEXT,
  ADD COLUMN IF NOT EXISTS owner_es_solicitante BOOLEAN,
  ADD COLUMN IF NOT EXISTS owner_nombre TEXT,
  ADD COLUMN IF NOT EXISTS responsable_backup_email TEXT,
  ADD COLUMN IF NOT EXISTS sociedad_contratante TEXT
    CHECK (sociedad_contratante IN ('Global 81 SpA','Global Card S.A.','100X','Global Colombia 81') OR sociedad_contratante IS NULL),
  ADD COLUMN IF NOT EXISTS representante_legal TEXT,
  ADD COLUMN IF NOT EXISTS servicio_descripcion TEXT,
  ADD COLUMN IF NOT EXISTS proveedor_existente BOOLEAN,
  ADD COLUMN IF NOT EXISTS periodicidad TEXT
    CHECK (periodicidad IN ('unico','mensual','anual','otro') OR periodicidad IS NULL),
  ADD COLUMN IF NOT EXISTS tipo_duracion TEXT
    CHECK (tipo_duracion IN ('indefinido','plazo_fijo','por_proyecto') OR tipo_duracion IS NULL),
  ADD COLUMN IF NOT EXISTS fecha_inicio DATE,
  ADD COLUMN IF NOT EXISTS fecha_fin DATE,
  ADD COLUMN IF NOT EXISTS justificacion TEXT;

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS sociedad_contratante TEXT,
  ADD COLUMN IF NOT EXISTS servicio_descripcion TEXT;

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS sociedad_contratante TEXT,
  ADD COLUMN IF NOT EXISTS periodicidad TEXT,
  ADD COLUMN IF NOT EXISTS tipo_duracion TEXT;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_sociedad ON public.workflow_runs(sociedad_contratante);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_solicitante ON public.workflow_runs(solicitante_email);
