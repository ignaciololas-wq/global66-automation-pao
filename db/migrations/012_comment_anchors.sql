-- PR3.2: comentarios anclados a texto en el doc.
ALTER TABLE public.file_comments
  ADD COLUMN IF NOT EXISTS anchor_text TEXT,
  ADD COLUMN IF NOT EXISTS anchor_meta JSONB;
CREATE INDEX IF NOT EXISTS idx_file_comments_anchor ON public.file_comments(file_id) WHERE anchor_text IS NOT NULL;
