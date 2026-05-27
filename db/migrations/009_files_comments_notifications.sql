-- PR2: storage in-app + preview + comentarios + menciones + notificaciones.
-- contract_files: archivos por workflow_run (1 principal + N anexos).
-- file_comments: hilo lateral por archivo, página opcional, threads via parent_id.
-- file_comment_mentions: @user en comentario → fanout notif.
-- notifications: bandeja in-app + tracking lectura.

CREATE TABLE IF NOT EXISTS public.contract_files (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  provider_id     UUID REFERENCES public.providers(id) ON DELETE SET NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('main', 'anexo', 'papel_proveedor')),
  storage_path    TEXT NOT NULL UNIQUE,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  size_bytes      BIGINT NOT NULL,
  sha256          TEXT,
  uploaded_by     TEXT NOT NULL,
  uploaded_by_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ai_review_status TEXT DEFAULT 'pending'
    CHECK (ai_review_status IN ('pending','running','done','failed','skipped')),
  metadata        JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_contract_files_run ON public.contract_files(workflow_run_id);
CREATE INDEX IF NOT EXISTS idx_contract_files_kind ON public.contract_files(workflow_run_id, kind);

-- Solo un "main" por workflow_run.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_files_one_main
  ON public.contract_files(workflow_run_id)
  WHERE kind = 'main';

CREATE TABLE IF NOT EXISTS public.file_comments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_id         UUID NOT NULL REFERENCES public.contract_files(id) ON DELETE CASCADE,
  workflow_run_id UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  parent_id       UUID REFERENCES public.file_comments(id) ON DELETE CASCADE,
  author_email    TEXT NOT NULL,
  author_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body            TEXT NOT NULL,
  page_number     INTEGER,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_file_comments_file ON public.file_comments(file_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_file_comments_thread ON public.file_comments(parent_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.file_comment_mentions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id      UUID NOT NULL REFERENCES public.file_comments(id) ON DELETE CASCADE,
  mentioned_email TEXT NOT NULL,
  mentioned_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at         TIMESTAMPTZ,
  UNIQUE (comment_id, mentioned_email)
);

CREATE INDEX IF NOT EXISTS idx_mentions_user ON public.file_comment_mentions(mentioned_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mentions_email ON public.file_comment_mentions(mentioned_email) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient_email TEXT NOT NULL,
  recipient_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL CHECK (kind IN ('mention','comment_reply','approval_needed','status_change','assignment')),
  workflow_run_id UUID REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivered_slack BOOLEAN DEFAULT FALSE,
  delivered_email BOOLEAN DEFAULT FALSE,
  read_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_email ON public.notifications(recipient_email, created_at DESC);

-- updated_at trigger reutiliza set_updated_at existente.
DROP TRIGGER IF EXISTS trg_file_comments_updated ON public.file_comments;
CREATE TRIGGER trg_file_comments_updated
  BEFORE UPDATE ON public.file_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.contract_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cf_read ON public.contract_files;
CREATE POLICY cf_read ON public.contract_files
  FOR SELECT USING (
    public.has_role('admin')
    OR EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = contract_files.workflow_run_id
        AND (
          wr.solicitante_email = public.current_user_email()
          OR wr.owner_email = public.current_user_email()
          OR (
            public.has_role('aprobador')
            AND (
              wr.sociedad_contratante IS NULL
              OR wr.sociedad_contratante = ANY(public.current_user_sociedades())
              OR array_length(public.current_user_sociedades(), 1) IS NULL
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS cf_insert ON public.contract_files;
CREATE POLICY cf_insert ON public.contract_files
  FOR INSERT WITH CHECK (
    public.has_role('admin') OR public.has_role('solicitante') OR public.has_role('aprobador')
  );

DROP POLICY IF EXISTS cf_delete ON public.contract_files;
CREATE POLICY cf_delete ON public.contract_files
  FOR DELETE USING (
    public.has_role('admin')
    OR uploaded_by_id = auth.uid()
  );

ALTER TABLE public.file_comments ENABLE ROW LEVEL SECURITY;

-- Solo aprobadores del workflow + admin + autor pueden leer comentarios.
DROP POLICY IF EXISTS fc_read ON public.file_comments;
CREATE POLICY fc_read ON public.file_comments
  FOR SELECT USING (
    public.has_role('admin')
    OR author_email = public.current_user_email()
    OR EXISTS (
      SELECT 1 FROM public.workflow_runs wr
      WHERE wr.id = file_comments.workflow_run_id
        AND public.has_role('aprobador')
        AND (
          wr.sociedad_contratante IS NULL
          OR wr.sociedad_contratante = ANY(public.current_user_sociedades())
          OR array_length(public.current_user_sociedades(), 1) IS NULL
        )
    )
  );

DROP POLICY IF EXISTS fc_insert ON public.file_comments;
CREATE POLICY fc_insert ON public.file_comments
  FOR INSERT WITH CHECK (
    public.has_role('admin')
    OR (public.has_role('aprobador') AND author_email = public.current_user_email())
  );

DROP POLICY IF EXISTS fc_update ON public.file_comments;
CREATE POLICY fc_update ON public.file_comments
  FOR UPDATE USING (
    public.has_role('admin') OR author_email = public.current_user_email()
  );

ALTER TABLE public.file_comment_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fcm_read ON public.file_comment_mentions;
CREATE POLICY fcm_read ON public.file_comment_mentions
  FOR SELECT USING (
    public.has_role('admin')
    OR mentioned_email = public.current_user_email()
    OR EXISTS (
      SELECT 1 FROM public.file_comments fc
      WHERE fc.id = file_comment_mentions.comment_id
        AND fc.author_email = public.current_user_email()
    )
  );

DROP POLICY IF EXISTS fcm_update ON public.file_comment_mentions;
CREATE POLICY fcm_update ON public.file_comment_mentions
  FOR UPDATE USING (mentioned_email = public.current_user_email());

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_read ON public.notifications;
CREATE POLICY notif_read ON public.notifications
  FOR SELECT USING (
    recipient_email = public.current_user_email() OR public.has_role('admin')
  );

DROP POLICY IF EXISTS notif_update ON public.notifications;
CREATE POLICY notif_update ON public.notifications
  FOR UPDATE USING (
    recipient_email = public.current_user_email()
  );

-- Vista para badge: cuenta no leídos por user.
CREATE OR REPLACE VIEW public.v_unread_notifications AS
SELECT
  recipient_email,
  COUNT(*) FILTER (WHERE read_at IS NULL) AS unread_count,
  MAX(created_at) FILTER (WHERE read_at IS NULL) AS latest_unread_at
FROM public.notifications
GROUP BY recipient_email;
