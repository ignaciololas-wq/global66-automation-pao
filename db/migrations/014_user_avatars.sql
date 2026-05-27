-- Avatares de usuario (PR3-fix UX).
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/png','image/jpeg','image/webp','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_read ON storage.objects;
CREATE POLICY avatars_read ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_write ON storage.objects;
CREATE POLICY avatars_write ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars');
