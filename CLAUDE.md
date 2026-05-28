# CLAUDE.md — Global66 Contratos (Pao P2)

Guía para agentes que tocan este repo. Lee esto antes de proponer cambios grandes.

## Qué hace la plataforma

Automatiza el ciclo completo de alta y firma de contratos con proveedores Global66 (4 sociedades: Chile, Panamá, Colombia). Reduce el tiempo de gestión de hasta 30 días → tiempo real. Libera ~51 horas/mes del equipo de Administración.

## Arquitectura (2 stacks coexistiendo durante migración)

**Stack activo (`legacy/`)** — Node.js plano. Es lo que corre en producción HOY.
- `legacy/src/server.js` — HTTP server consolidado (todos los endpoints `/api/*`, `/admin`, `/p/{token}`)
- `legacy/src/approvals_dispatch.js` — dispatcher paralelo Slack 3 canales + tracking branches
- `legacy/src/regcheq.js` — cliente RegCheq AML/PEP + reglas bloqueo
- `legacy/src/lista_negra.js` — orquestador full check (OpenSanctions + RegCheq + apoderados IA)
- `legacy/src/email.js` — templates (n8n webhook → Resend → MOCK)
- `legacy/src/sociedad.js` — checklist docs por sociedad + template URLs
- `legacy/public/admin.html` — SPA admin completa (renderStepper, providerDetail, contractDetail)
- `legacy/public/provider.html` — form proveedor multi-step (Tally-style)
- `legacy/scripts/e2e_test.js` — test end-to-end automatizado

**Stack futuro (`app/`, `components/`, `lib/`)** — Next.js 15 App Router con TypeScript. Migración en curso, no productivo todavía.
- Branch `next-migration` tiene el avance completo
- Reemplazará legacy/ una vez QA-validado

**Regla de oro durante coexistencia**: cambios funcionales se aplican PRIMERO en `legacy/` (es lo que sirve hoy). Si la migración Next.js está cerca, replicar en `app/`. NUNCA tocar solo Next.js y olvidar legacy — rompe producción.

## Flujo crítico — paralelo real (PR-B)

Cuando un usuario interno crea solicitud (`POST /api/intake`):

1. Se inserta `workflow_run` con `current_phase='parallel'`
2. `active_phases=['fase2_provider_data', 'hito1_approvals']` (jsonb array)
3. **EN PARALELO Y SIN INTERVENCIÓN HUMANA**:
   - Branch A: mail al proveedor con magic-link → llena form + sube docs
   - Branch B: Slack a Compliance + Legal + Admin con bloques Aprobar/Rechazar/Pedir cambios
4. Cuando proveedor termina su parte → `provider_data_completed_at` se setea, branch A se quita de `active_phases`
5. Cuando los 3 Slack approvals deciden (vía `/slack-callback` → `/hito1-semaforo`) → `internal_approvals_completed_at` se setea, branch B se quita
6. `maybeAdvanceToFase3()` (idempotente) detecta ambos done → setea `current_phase='fase3'` automáticamente
7. Mail al proveedor "Tu solicitud avanzó" se dispara

NUNCA borrar `provider_data_completed_at` o `internal_approvals_completed_at` para "resetear" — la lógica es idempotente y orientada a forward-only.

## CHECK constraint sobre `current_phase`

Permitidos: `fase1, hito1, fase2, fase3, signed, rejected, cancelled, parallel`. Si agregás un valor nuevo, actualizar `workflow_runs_current_phase_check` (ver migración 021 como referencia).

## Supabase

- Project ID: `kdhpbrpeneokvhwyxmwn`
- Usa `service_role` key server-side (bypassa RLS). NUNCA exponer al cliente.
- RLS habilitado en todas las tablas (sí incluso `regcheq_checks` — migración 018+022)
- Storage buckets: `contracts` (privado, signed URLs 1h), `templates` (público read), `avatars` (público, sin listing)
- Vistas con `SECURITY DEFINER` fueron migradas a `security_invoker=true` (019_security_hardening)
- `set_updated_at()` función tiene `search_path = public, pg_temp` fijo

## Compliance / AML

**RegCheq** (Chile-first):
- Endpoint base: `https://external-api.regcheq.com`
- Key en path: `/{endpoint}/{API_KEY}` (no header)
- Tres niveles de decisión: `block` (OFAC/ONU/UE) | `review` (PEP/PDI/RTP/GAFI) | `approve_flag` (riesgo medio) | `approve`
- Resultado por run en tabla `regcheq_checks` (con FK a `providers` para histórico permanente)
- UI: card en detalle solicitud + histórico expandible en perfil proveedor + KPIs dashboard

**OpenSanctions**: corre en paralelo a RegCheq via `runFullCheck()` en `lista_negra.js`. Decisión final = peor caso entre ambos.

## Upload archivos proveedor

Usa **busboy** (no parser casero). Acepta multipart con field `file` + `token` + `doc_type`. Bucket: `contracts`. Path: `providers/{provider_id}/{uuid}-{filename}`. Mime allowed: PDF, PNG, JPG, WEBP. Max 10MB.

Si necesitás otro endpoint multipart, copiar el patrón de `POST /api/provider/upload` — busboy stream-based maneja edge cases que `parseMultipart` casero rompe.

## Slack

App ID: `A0B3ZKS6Q93` (nombre interno `demo_app4`, display name `socket-global66`). Workspace: Global66 (T-CSGP4JFQ).

Env vars (en orden de precedencia):
- `SLACK_COMPLIANCE_CHANNEL` / `SLACK_LEGAL_CHANNEL` / `SLACK_ADMIN_CHANNEL` (canales separados por equipo)
- `SLACK_DEFAULT_CHANNEL` fallback común si los 3 anteriores vacíos
- Hoy producción usa `SLACK_DEFAULT_CHANNEL=C0B6ANYFQJD`

Bot scopes que sí tiene: `chat:write`, `chat:write.public`, `im:write`, `users:read`, `users:read.email`.
Bot NO tiene: `channels:read`, `users:conversations` — no puede listar canales ni verificar membership programáticamente. Si necesitás eso, agregar scopes en https://api.slack.com/apps/A0B3ZKS6Q93/oauth.

Para canales privados el bot debe ser invitado manualmente (UI Slack → canal → Integrations → Add app).

## Email backends (orden de fallback)

1. `N8N_EMAIL_WEBHOOK_URL` → workflow Gmail centralizado n8n
2. `RESEND_API_KEY` → Resend (3k/mes free)
3. MOCK → console.log si `MOCK_MODE=true` o falta config

Todos los templates devuelven `{subject, html, text}` — son funciones puras en `email.js`.

## Migrations

Ver `db/migrations/README.md` para orden histórico. Conflictos numéricos (016 / 019 / 020) por branches paralelos. Todas idempotentes (`IF NOT EXISTS` / `OR REPLACE`). Nuevas migraciones desde **023**.

## Test end-to-end

```bash
# Server local
cd legacy && node --env-file=../.env src/server.js

# E2E test (en otra terminal)
SUPABASE_SERVICE_ROLE_KEY=$(...) node --env-file=.env scripts/e2e_test.js
```

Valida 10 steps: intake → paralelo arranca → provider fill → hito1 semaforo → advance fase3 → regcheq + audit log con 8 eventos.

## Convenciones código

- **No bullets densos en docs** — preferir 3-5 puntos cortos
- Audit log es source of truth. Toda mutación importante registra en `audit_log` con actor + action + payload
- No commit secrets nunca. `.env` está gitignored
- Tildes / UTF-8: usar `Content-Type: application/json; charset=utf-8` en fetch
- Idempotencia: helpers como `markProviderDataDone`, `maybeAdvanceToFase3` se pueden llamar múltiples veces sin efecto duplicado
- Errores silenciosos PROHIBIDOS — siempre `console.error` o devolver al cliente

## Cosas que NO funcionan

- HIBP password protection (`auth_leaked_password_protection` advisor) requiere Pro plan. App usa magic-link → advisor benigno, aceptado como WARN.
- Bot Slack no puede `conversations.list` (falta scope). Listar canales = manual.

## Comandos útiles

```bash
# Ver runs recientes
node legacy/scripts/show_runs.js

# Refresh OFAC offline cache
cd legacy && npm run ofac:refresh

# Daily alerts (cron)
cd legacy && node --env-file=../.env src/alertas.js

# Reportar a Notion DB Proyectos
cd legacy && npm run notion:report

# Run pilot mock
cd legacy && npm run pilot
```

## URLs producción

- App: https://global66-automation-pao.vercel.app
- Supabase Studio: https://supabase.com/dashboard/project/kdhpbrpeneokvhwyxmwn
- Slack workspace: https://global66.slack.com
- Repo: https://github.com/ignaciololas-wq/global66-automation-pao
