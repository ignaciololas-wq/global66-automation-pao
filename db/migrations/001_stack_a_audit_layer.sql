-- Stack A audit layer — Pao P2 Alta contratos proveedores
-- Aplicada vía Supabase MCP el 2026-05-20

CREATE TABLE IF NOT EXISTS public.workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  form_response_id TEXT UNIQUE NOT NULL,
  owner_email     TEXT NOT NULL,
  razon_social    TEXT NOT NULL,
  tax_id          TEXT NOT NULL,
  pais            TEXT NOT NULL,
  tipo_contrato   TEXT,
  monto           NUMERIC,
  moneda          TEXT,
  vigencia_meses  INTEGER,
  is_adhesion     BOOLEAN DEFAULT FALSE,
  criticidad      TEXT,
  nivel_acceso    TEXT,
  draft_url       TEXT,
  current_phase   TEXT NOT NULL DEFAULT 'fase1' CHECK (current_phase IN ('fase1','hito1','fase2','fase3','signed','rejected','cancelled')),
  semaforo        TEXT CHECK (semaforo IN ('green','yellow','red')),
  finnecto_supplier_id TEXT,
  finnecto_contract_id TEXT,
  drive_folder_id TEXT,
  signnow_document_id TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_tax_id ON public.workflow_runs(tax_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_phase ON public.workflow_runs(current_phase);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_owner ON public.workflow_runs(owner_email);

CREATE TABLE IF NOT EXISTS public.approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  team            TEXT NOT NULL CHECK (team IN ('compliance','legal','admin')),
  decision        TEXT NOT NULL CHECK (decision IN ('approved','rejected','requested_changes')),
  approver_slack_id TEXT,
  approver_email  TEXT,
  comment         TEXT,
  decided_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_run_id, team)
);

CREATE INDEX IF NOT EXISTS idx_approvals_workflow ON public.approvals(workflow_run_id);

CREATE TABLE IF NOT EXISTS public.extractions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  source_pdf_hash TEXT NOT NULL,
  source_pdf_url  TEXT,
  model           TEXT NOT NULL,
  extracted_json  JSONB NOT NULL,
  risks_count     INTEGER GENERATED ALWAYS AS (jsonb_array_length(COALESCE(extracted_json->'riesgos_detectados','[]'::jsonb))) STORED,
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  cost_usd        NUMERIC(10,4)
);

CREATE INDEX IF NOT EXISTS idx_extractions_hash ON public.extractions(source_pdf_hash);
CREATE INDEX IF NOT EXISTS idx_extractions_workflow ON public.extractions(workflow_run_id);

CREATE TABLE IF NOT EXISTS public.audit_log (
  id              BIGSERIAL PRIMARY KEY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE SET NULL,
  actor           TEXT NOT NULL,
  action          TEXT NOT NULL,
  target_type     TEXT,
  target_id       TEXT,
  payload         JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_audit_workflow ON public.audit_log(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS public.sanctions_checks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  hit             BOOLEAN NOT NULL,
  matches         JSONB DEFAULT '[]'::jsonb,
  raw_response    JSONB
);

CREATE TABLE IF NOT EXISTS public.docs_checklist (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  doc_id          TEXT NOT NULL,
  doc_name        TEXT NOT NULL,
  uploaded        BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_at     TIMESTAMPTZ,
  drive_file_id   TEXT,
  expires_at      TIMESTAMPTZ,
  validated       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (workflow_run_id, doc_id)
);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sanctions_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all_workflow_runs ON public.workflow_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_approvals    ON public.approvals     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_extractions  ON public.extractions   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_audit        ON public.audit_log     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_sanctions    ON public.sanctions_checks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_docs         ON public.docs_checklist FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_workflow_runs_updated
BEFORE UPDATE ON public.workflow_runs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
