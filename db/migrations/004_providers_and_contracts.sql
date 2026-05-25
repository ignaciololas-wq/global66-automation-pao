-- Stack B (reemplazo Finnecto): providers + contracts tables.
-- Pao confirmó 2026-05-25 que se reemplaza Finnecto. Supabase queda
-- como source of truth.

CREATE TABLE IF NOT EXISTS public.providers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  razon_social    TEXT NOT NULL,
  tax_id          TEXT UNIQUE NOT NULL,
  pais            TEXT NOT NULL,
  tipo_proveedor  TEXT,
  email_contacto  TEXT,
  email_facturacion TEXT,
  domicilio       TEXT,
  representante_legal TEXT,
  nivel_acceso    TEXT,
  criticidad      TEXT,
  status          TEXT NOT NULL DEFAULT 'pendiente_revision'
    CHECK (status IN ('pendiente_revision', 'aceptado', 'rechazado', 'inactivo')),
  drive_folder_id TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_providers_status ON public.providers(status);
CREATE INDEX IF NOT EXISTS idx_providers_pais ON public.providers(pais);

CREATE TABLE IF NOT EXISTS public.contracts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_id     UUID NOT NULL REFERENCES public.providers(id) ON DELETE RESTRICT,
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  tipo_contrato   TEXT,
  monto           NUMERIC,
  moneda          TEXT,
  vigencia_meses  INTEGER,
  start_date      DATE,
  end_date        DATE,
  is_adhesion     BOOLEAN DEFAULT FALSE,
  renovacion_automatica BOOLEAN DEFAULT FALSE,
  preaviso_dias   INTEGER,
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_signature', 'signed', 'active', 'expiring', 'expired', 'cancelled')),
  draft_pdf_url   TEXT,
  signed_pdf_url  TEXT,
  signnow_document_id TEXT,
  signed_at       TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  owner_email     TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_contracts_provider ON public.contracts(provider_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON public.contracts(end_date)
  WHERE status IN ('active', 'signed');

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_providers ON public.providers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_contracts ON public.contracts FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_providers_updated
BEFORE UPDATE ON public.providers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_contracts_updated
BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Vista contratos próximos a vencer (reemplaza listExpiringContracts de Finnecto)
CREATE OR REPLACE VIEW public.v_expiring_contracts AS
SELECT
  c.id,
  c.provider_id,
  p.razon_social AS provider_name,
  p.tax_id,
  c.tipo_contrato AS type,
  c.monto AS amount,
  c.moneda AS currency,
  c.end_date AS expires_at,
  c.owner_email,
  (c.end_date - CURRENT_DATE) AS days_until_expiry,
  c.status
FROM public.contracts c
JOIN public.providers p ON p.id = c.provider_id
WHERE c.status IN ('active', 'signed')
  AND c.end_date IS NOT NULL
  AND c.end_date >= CURRENT_DATE;

GRANT SELECT ON public.v_expiring_contracts TO service_role, authenticated;

-- KPI dashboard: providers por país
CREATE OR REPLACE VIEW public.v_providers_by_country AS
SELECT
  pais,
  COUNT(*) FILTER (WHERE status = 'aceptado') AS aceptados,
  COUNT(*) FILTER (WHERE status = 'pendiente_revision') AS pendientes,
  COUNT(*) FILTER (WHERE status = 'rechazado') AS rechazados,
  COUNT(*) AS total
FROM public.providers
GROUP BY pais
ORDER BY total DESC;

GRANT SELECT ON public.v_providers_by_country TO service_role, authenticated;

-- KPI: contratos por status
CREATE OR REPLACE VIEW public.v_contracts_by_status AS
SELECT
  status,
  COUNT(*) AS total,
  ROUND(SUM(monto)::numeric, 2) AS total_amount_sum,
  COUNT(DISTINCT provider_id) AS unique_providers
FROM public.contracts
GROUP BY status;

GRANT SELECT ON public.v_contracts_by_status TO service_role, authenticated;
