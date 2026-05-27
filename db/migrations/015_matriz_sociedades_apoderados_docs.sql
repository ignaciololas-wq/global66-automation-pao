-- PR7: catálogo de sociedades + apoderados + documentos por sociedad.
-- Seed con data de "Matriz para contratos.xlsx".

CREATE TABLE IF NOT EXISTS public.sociedades (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  country     TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sociedades_country ON public.sociedades(country) WHERE active;

CREATE TABLE IF NOT EXISTS public.apoderados (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sociedad_id   UUID NOT NULL REFERENCES public.sociedades(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  email         TEXT,
  scope         TEXT NOT NULL DEFAULT 'general'
    CHECK (scope IN ('siempre', 'saas', 'comercial', 'general')),
  tipo_proveedor_match TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  priority      INTEGER NOT NULL DEFAULT 2
    CHECK (priority IN (1, 2)),
  notes         TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apoderados_sociedad ON public.apoderados(sociedad_id) WHERE active;

CREATE TABLE IF NOT EXISTS public.sociedad_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sociedad_id   UUID NOT NULL REFERENCES public.sociedades(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'base'
    CHECK (kind IN ('base', 'sign')),
  required      BOOLEAN NOT NULL DEFAULT TRUE,
  valid_months  INTEGER,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sociedad_documents_soc ON public.sociedad_documents(sociedad_id) WHERE active;

DROP TRIGGER IF EXISTS trg_sociedades_updated ON public.sociedades;
CREATE TRIGGER trg_sociedades_updated BEFORE UPDATE ON public.sociedades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_apoderados_updated ON public.apoderados;
CREATE TRIGGER trg_apoderados_updated BEFORE UPDATE ON public.apoderados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.sociedades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS soc_read ON public.sociedades;
CREATE POLICY soc_read ON public.sociedades FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS soc_write ON public.sociedades;
CREATE POLICY soc_write ON public.sociedades FOR ALL
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

ALTER TABLE public.apoderados ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS apo_read ON public.apoderados;
CREATE POLICY apo_read ON public.apoderados FOR SELECT USING (
  public.has_role('admin') OR public.has_role('aprobador') OR public.has_role('solicitante')
);
DROP POLICY IF EXISTS apo_write ON public.apoderados;
CREATE POLICY apo_write ON public.apoderados FOR ALL
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

ALTER TABLE public.sociedad_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sdocs_read ON public.sociedad_documents;
CREATE POLICY sdocs_read ON public.sociedad_documents FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS sdocs_write ON public.sociedad_documents;
CREATE POLICY sdocs_write ON public.sociedad_documents FOR ALL
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- Seed sociedades.
INSERT INTO public.sociedades (slug, name, country, active) VALUES
  ('global81-chile',         'Global 81 SpA (Chile)',          'Chile',         TRUE),
  ('global-card-chile',      'Global Card S.A. (Chile)',       'Chile',         TRUE),
  ('100x-corp',              '100x Corp',                       'Estados Unidos', TRUE),
  ('global-colombia-81',     'Global Colombia 81 (Colombia)',   'Colombia',      TRUE),
  ('argpagos-argentina',     'ArgPagos (Argentina)',            'Argentina',     TRUE),
  ('andes-latam-peru',       'Andes Latam (Perú)',              'Perú',          TRUE)
ON CONFLICT (slug) DO NOTHING;

-- Apoderados Chile.
WITH chile_socs AS (
  SELECT id FROM public.sociedades WHERE slug IN ('global81-chile', 'global-card-chile')
)
INSERT INTO public.apoderados (sociedad_id, name, email, scope, tipo_proveedor_match, priority, notes)
SELECT cs.id, 'Paola Heríquez', NULL, 'siempre', ARRAY[]::TEXT[], 1, 'Firma siempre en Chile (obligatorio)' FROM chile_socs cs
UNION ALL
SELECT cs.id, 'Lorena Silva', NULL, 'general', ARRAY['Servicios profesionales','Consultoría/Asesoría','Otro']::TEXT[], 2, 'Secundario default' FROM chile_socs cs
UNION ALL
SELECT cs.id, 'Maurizio Oneto', NULL, 'saas', ARRAY['Plataformas SaaS']::TEXT[], 2, 'Plataforma o SaaS (no exclusivo)' FROM chile_socs cs
UNION ALL
SELECT cs.id, 'Rodrigo Lama', NULL, 'comercial', ARRAY['Marketing y Publicidad']::TEXT[], 2, 'Comercial (no exclusivo)' FROM chile_socs cs
ON CONFLICT DO NOTHING;

-- Apoderados 100x Corp.
INSERT INTO public.apoderados (sociedad_id, name, email, scope, tipo_proveedor_match, priority, notes)
SELECT s.id, 'Gastón Fernitz', NULL, 'general', ARRAY[]::TEXT[], 2, 'Cualquiera de los 2 puede firmar' FROM public.sociedades s WHERE s.slug = '100x-corp'
UNION ALL
SELECT s.id, 'José Pedro Margozzini', NULL, 'general', ARRAY[]::TEXT[], 2, 'Cualquiera de los 2 puede firmar' FROM public.sociedades s WHERE s.slug = '100x-corp'
ON CONFLICT DO NOTHING;

-- Apoderado Colombia.
INSERT INTO public.apoderados (sociedad_id, name, email, scope, tipo_proveedor_match, priority, notes)
SELECT s.id, 'Daniel Londoño', NULL, 'siempre', ARRAY[]::TEXT[], 1, 'Firma siempre (Colombia)'
FROM public.sociedades s WHERE s.slug = 'global-colombia-81'
ON CONFLICT DO NOTHING;

-- Documentos Chile.
WITH chile_socs AS (
  SELECT id FROM public.sociedades WHERE slug IN ('global81-chile', 'global-card-chile')
), chile_docs(name, kind, sort_order) AS (
  VALUES
    ('Cotización y/o propuesta comercial elegida (Adjuntar OK de C-Level)', 'base', 1),
    ('Escritura constitución de la empresa', 'base', 2),
    ('Poderes vigentes de los firmantes', 'base', 3),
    ('Identificación fiscal de la empresa', 'base', 4),
    ('Identificación personal de Representantes Legales y/o firmantes', 'base', 5),
    ('Adhesión al modelo de prevención de delitos Ley 20.393', 'sign', 6),
    ('NDA - Acuerdo de confidencialidad y no divulgación', 'sign', 7),
    ('Declaración jurada de Beneficiarios finales de personas/escrituras', 'sign', 8)
)
INSERT INTO public.sociedad_documents (sociedad_id, name, kind, sort_order, required)
SELECT cs.id, cd.name, cd.kind, cd.sort_order, TRUE
FROM chile_socs cs CROSS JOIN chile_docs cd
ON CONFLICT DO NOTHING;

-- Documentos 100x Corp.
WITH soc AS (SELECT id FROM public.sociedades WHERE slug = '100x-corp')
INSERT INTO public.sociedad_documents (sociedad_id, name, kind, sort_order, required)
SELECT soc.id, d.name, 'base', d.sort, TRUE
FROM soc, (VALUES
  ('Cotización y/o propuesta comercial elegida (Adjuntar OK de C-Level)', 1),
  ('Escritura constitución de la empresa', 2),
  ('Poderes vigentes de los firmantes', 3),
  ('Identificación fiscal de la empresa', 4),
  ('Identificación personal de Representantes Legales y/o firmantes', 5)
) d(name, sort)
ON CONFLICT DO NOTHING;

-- Documentos Colombia.
WITH soc AS (SELECT id FROM public.sociedades WHERE slug = 'global-colombia-81')
INSERT INTO public.sociedad_documents (sociedad_id, name, kind, sort_order, required)
SELECT soc.id, d.name, d.kind, d.sort, TRUE
FROM soc, (VALUES
  ('Cotización y/o propuesta comercial elegida (Adjuntar OK de C-Level)', 'base', 1),
  ('Formato Registro de Proveedores', 'base', 2),
  ('Certificado reciente Cámara de Comercio', 'base', 3),
  ('Certificación bancaria', 'base', 4),
  ('Escritura constitución de la empresa', 'base', 5),
  ('Poderes vigentes de los firmantes', 'base', 6),
  ('Identificación fiscal de la empresa', 'base', 7),
  ('Identificación personal de Representantes Legales y/o firmantes', 'base', 8),
  ('Certificación SARLAFT', 'base', 9),
  ('Balance General últimos dos años', 'base', 10),
  ('Declaración jurada de Beneficiarios finales de personas/escrituras', 'sign', 11)
) d(name, kind, sort)
ON CONFLICT DO NOTHING;
