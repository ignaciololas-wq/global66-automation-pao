-- Re-grant EXECUTE en funciones helper RLS para role `authenticated`.
-- Causa: lockdown PR1 (REVOKE all) impedía que las RLS policies que las
-- invocan corrieran cuando el JWT del cliente venía con role=authenticated.
-- Las funciones son SECURITY DEFINER pero solo devuelven info del propio
-- user vía auth.uid() — seguro grantarlas.

GRANT EXECUTE ON FUNCTION public.current_user_email()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_roles()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_sociedades()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(TEXT)              TO authenticated;
