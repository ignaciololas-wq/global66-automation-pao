-- 025: aprobadores internos por país × equipo (compliance/legal/admin).
-- Reemplaza/complementa la config por env SLACK_{TEAM}_EMAILS. Editable desde
-- la plataforma (tab Aprobadores en Matriz). El dispatch resuelve por país del run.

CREATE TABLE IF NOT EXISTS public.approval_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country       TEXT NOT NULL,
  team          TEXT NOT NULL CHECK (team IN ('compliance', 'legal', 'admin')),
  user_id       UUID REFERENCES public.user_profiles(user_id) ON DELETE SET NULL,
  email         TEXT NOT NULL,
  display_name  TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Un aprobador (por email) no se repite en el mismo país+equipo.
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_assignment
  ON public.approval_assignments (country, team, lower(email)) WHERE active;
CREATE INDEX IF NOT EXISTS idx_approval_assignments_lookup
  ON public.approval_assignments (country, team) WHERE active;

DROP TRIGGER IF EXISTS trg_approval_assignments_updated ON public.approval_assignments;
CREATE TRIGGER trg_approval_assignments_updated BEFORE UPDATE ON public.approval_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.approval_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appr_read ON public.approval_assignments;
CREATE POLICY appr_read ON public.approval_assignments FOR SELECT USING (
  public.has_role('admin') OR public.has_role('aprobador')
);
DROP POLICY IF EXISTS appr_write ON public.approval_assignments;
CREATE POLICY appr_write ON public.approval_assignments FOR ALL
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
