-- Provider profile: token público para self-service + JSON acumulado.

ALTER TABLE public.providers
  ADD COLUMN IF NOT EXISTS public_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS profile_data JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS profile_last_filled_by_email TEXT;

CREATE INDEX IF NOT EXISTS idx_providers_public_token ON public.providers(public_token);

-- Policy adicional para acceso público al token (no autenticado lee solo lo necesario)
CREATE POLICY IF NOT EXISTS anon_read_by_token ON public.providers
  FOR SELECT TO anon
  USING (true);  -- filtrado por token en query, no RLS
-- Mejor mantenerlo bloqueado para anon; el server actúa con service_role.
DROP POLICY IF EXISTS anon_read_by_token ON public.providers;
