# Migrations — orden histórico aplicado

Las migraciones se aplicaron vía Supabase MCP / Management API en orden cronológico, no estrictamente alfabético. Algunos números colisionan porque se trabajó en branches paralelos durante la migración Stack A → Next.js.

## Conflictos resueltos (aplicados sin orden estricto)

| Archivo | Nota |
|---|---|
| `016_apoderados_firmantes.sql` | rama matriz apoderados |
| `016_regcheq_checks.sql` | rama RegCheq AML/PEP |
| `019_app_settings.sql` | rama branding (logo/banner) |
| `019_security_hardening.sql` | rama compliance Supabase advisors |
| `020_grant_rls_helpers_to_authenticated.sql` | rama RLS helpers |
| `020_workflow_parallel_phases.sql` | rama PR-B paralelo |

Estos pares fueron aplicados independientes en producción (DB ya está consolidada). El orden alfabético del filesystem no refleja exacto el orden aplicado pero todos son `IF NOT EXISTS` / `OR REPLACE` / idempotentes.

## Orden recomendado para fresh DB (si se rehacen desde cero)

1. 001 → 015 (secuencial)
2. 016_apoderados_firmantes
3. 016_regcheq_checks
4. 017_regcheq_checks_provider_id
5. 018_regcheq_checks_rls
6. 019_app_settings
7. 019_security_hardening
8. 020_grant_rls_helpers_to_authenticated
9. 020_workflow_parallel_phases
10. 021_workflow_phase_parallel
11. 022_regcheq_checks_auth_read

## Próximas migraciones

Empezar desde **023** para evitar nuevos conflictos. Convención sugerida: `NNN_descripcion_corta.sql` con NNN monotónico.
