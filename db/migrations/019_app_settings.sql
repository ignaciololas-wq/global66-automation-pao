-- App settings (key-value): logo, brand colors, feature flags.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS settings_read ON public.app_settings;
CREATE POLICY settings_read ON public.app_settings FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS settings_write ON public.app_settings;
CREATE POLICY settings_write ON public.app_settings FOR ALL
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
