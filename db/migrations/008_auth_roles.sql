-- PR1: roles array + per-sociedad routing + RLS.
-- Sustituye el role único en auth.users.app_metadata.role por una tabla user_profiles
-- con roles[] y sociedades[]. Mantiene el flag legacy en app_metadata para back-compat
-- durante la transición.

CREATE TABLE IF NOT EXISTS public.user_profiles (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT UNIQUE NOT NULL,
  roles        TEXT[] NOT NULL DEFAULT ARRAY['solicitante']::TEXT[],
  sociedades   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  display_name TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_valid CHECK (
    roles <@ ARRAY['admin','aprobador','solicitante','proveedor']::TEXT[]
    AND array_length(roles, 1) >= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_roles ON public.user_profiles USING GIN (roles);
CREATE INDEX IF NOT EXISTS idx_user_profiles_sociedades ON public.user_profiles USING GIN (sociedades);

-- Helper: roles del usuario actual (basado en auth.uid()).
CREATE OR REPLACE FUNCTION public.current_user_roles()
RETURNS TEXT[]
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT roles FROM public.user_profiles WHERE user_id = auth.uid()),
    ARRAY[]::TEXT[]
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_sociedades()
RETURNS TEXT[]
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT sociedades FROM public.user_profiles WHERE user_id = auth.uid()),
    ARRAY[]::TEXT[]
  );
$$;

CREATE OR REPLACE FUNCTION public.current_user_email()
RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT email FROM public.user_profiles WHERE user_id = auth.uid()),
    (SELECT email FROM auth.users WHERE id = auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_role(role_name TEXT)
RETURNS BOOLEAN
LANGUAGE SQL STABLE
AS $$
  SELECT role_name = ANY(public.current_user_roles());
$$;

-- Trigger: cuando un user nuevo se crea en auth.users, crear profile con role default.
CREATE OR REPLACE FUNCTION public.on_auth_user_created()
RETURNS TRIGGER
LANGUAGE PLPGSQL SECURITY DEFINER
AS $$
DECLARE
  legacy_role TEXT;
  initial_roles TEXT[];
BEGIN
  legacy_role := NEW.raw_app_meta_data->>'role';
  IF legacy_role = 'admin' THEN
    initial_roles := ARRAY['admin','aprobador','solicitante']::TEXT[];
  ELSIF legacy_role IN ('aprobador','solicitante') THEN
    initial_roles := ARRAY[legacy_role]::TEXT[];
  ELSE
    initial_roles := ARRAY['solicitante']::TEXT[];
  END IF;

  INSERT INTO public.user_profiles (user_id, email, roles)
  VALUES (NEW.id, NEW.email, initial_roles)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_user_created ON auth.users;
CREATE TRIGGER trg_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.on_auth_user_created();

-- Backfill: copia roles desde app_metadata existente al user_profiles.
INSERT INTO public.user_profiles (user_id, email, roles)
SELECT
  u.id,
  u.email,
  CASE
    WHEN u.raw_app_meta_data->>'role' = 'admin'
      THEN ARRAY['admin','aprobador','solicitante']::TEXT[]
    WHEN u.raw_app_meta_data->>'role' IN ('aprobador','solicitante')
      THEN ARRAY[u.raw_app_meta_data->>'role']::TEXT[]
    ELSE ARRAY['solicitante']::TEXT[]
  END
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- ─── RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS up_self_read ON public.user_profiles;
CREATE POLICY up_self_read ON public.user_profiles
  FOR SELECT
  USING (user_id = auth.uid() OR public.has_role('admin'));

DROP POLICY IF EXISTS up_admin_write ON public.user_profiles;
CREATE POLICY up_admin_write ON public.user_profiles
  FOR ALL
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wr_read ON public.workflow_runs;
CREATE POLICY wr_read ON public.workflow_runs
  FOR SELECT
  USING (
    public.has_role('admin')
    OR solicitante_email = public.current_user_email()
    OR owner_email = public.current_user_email()
    OR (
      public.has_role('aprobador')
      AND (
        sociedad_contratante IS NULL
        OR sociedad_contratante = ANY(public.current_user_sociedades())
        OR array_length(public.current_user_sociedades(), 1) IS NULL
      )
    )
  );

DROP POLICY IF EXISTS wr_insert ON public.workflow_runs;
CREATE POLICY wr_insert ON public.workflow_runs
  FOR INSERT
  WITH CHECK (
    public.has_role('admin') OR public.has_role('solicitante')
  );

DROP POLICY IF EXISTS wr_update ON public.workflow_runs;
CREATE POLICY wr_update ON public.workflow_runs
  FOR UPDATE
  USING (
    public.has_role('admin')
    OR (public.has_role('aprobador') AND (
      sociedad_contratante IS NULL
      OR sociedad_contratante = ANY(public.current_user_sociedades())
    ))
  );

-- Audit + providers + contracts: leibles por roles internos, escribibles por admin.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read ON public.audit_log;
CREATE POLICY audit_read ON public.audit_log
  FOR SELECT USING (
    public.has_role('admin') OR public.has_role('aprobador')
  );

ALTER TABLE public.providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prov_read ON public.providers;
CREATE POLICY prov_read ON public.providers
  FOR SELECT USING (
    public.has_role('admin') OR public.has_role('aprobador') OR public.has_role('solicitante')
  );
DROP POLICY IF EXISTS prov_write ON public.providers;
CREATE POLICY prov_write ON public.providers
  FOR ALL USING (public.has_role('admin') OR public.has_role('aprobador'))
  WITH CHECK (public.has_role('admin') OR public.has_role('aprobador'));

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contract_read ON public.contracts;
CREATE POLICY contract_read ON public.contracts
  FOR SELECT USING (
    public.has_role('admin') OR public.has_role('aprobador')
    OR owner_email = public.current_user_email()
  );
DROP POLICY IF EXISTS contract_write ON public.contracts;
CREATE POLICY contract_write ON public.contracts
  FOR ALL USING (public.has_role('admin') OR public.has_role('aprobador'))
  WITH CHECK (public.has_role('admin') OR public.has_role('aprobador'));
