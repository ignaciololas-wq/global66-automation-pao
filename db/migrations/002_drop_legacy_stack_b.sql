-- Drop tablas legacy Stack B (Slack Bolt + Supabase + Playwright Finecto).
-- Stack B descartado a favor de Stack A + Supabase auditoría.
-- Tablas estaban vacías (0 filas) y sin RLS — riesgo seguridad eliminado.

DROP TABLE IF EXISTS public.estados CASCADE;
DROP TABLE IF EXISTS public.contratos CASCADE;
