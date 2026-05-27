-- PR3: versionado contract_files + ai_edit_jobs.

ALTER TABLE public.contract_files
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES public.contract_files(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draft_status TEXT
    CHECK (draft_status IN ('active','ai_draft','superseded') OR draft_status IS NULL);

UPDATE public.contract_files SET draft_status = 'active' WHERE draft_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_contract_files_version ON public.contract_files(workflow_run_id, version DESC) WHERE archived_at IS NULL;

DROP INDEX IF EXISTS uq_contract_files_one_main;
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_files_one_main_active
  ON public.contract_files(workflow_run_id)
  WHERE kind = 'main' AND draft_status = 'active' AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ai_edit_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  source_file_id  UUID NOT NULL REFERENCES public.contract_files(id) ON DELETE CASCADE,
  draft_file_id   UUID REFERENCES public.contract_files(id) ON DELETE SET NULL,
  requested_by    TEXT NOT NULL,
  requested_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  comments_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt          TEXT,
  diff_summary    TEXT,
  status          TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','ready_for_review','applied','discarded','failed')),
  error_message   TEXT,
  llm_cost_usd    NUMERIC(8,4)
);

CREATE INDEX IF NOT EXISTS idx_ai_edit_jobs_run ON public.ai_edit_jobs(workflow_run_id, created_at DESC);

ALTER TABLE public.ai_edit_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aej_read ON public.ai_edit_jobs;
CREATE POLICY aej_read ON public.ai_edit_jobs
  FOR SELECT USING (
    public.has_role('admin')
    OR public.has_role('aprobador')
    OR requested_by = public.current_user_email()
    OR EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = ai_edit_jobs.workflow_run_id
        AND (wr.solicitante_email = public.current_user_email() OR wr.owner_email = public.current_user_email())
    )
  );

DROP POLICY IF EXISTS aej_insert ON public.ai_edit_jobs;
CREATE POLICY aej_insert ON public.ai_edit_jobs
  FOR INSERT WITH CHECK (
    public.has_role('admin') OR public.has_role('aprobador')
  );
