# App Next.js 15 — Plataforma Contratos Global66

Referencia para devs que entran al stack web. Asume conocimiento básico de Next.js App Router, React Server Components y Supabase. Para el dominio de negocio (flujo paralelo PR-B, RegCheq, fases) ver `CLAUDE.md` en la raíz.

## 1. Resumen

Es la SPA + backend de la plataforma de alta y firma de contratos con proveedores. Reemplaza al stack `legacy/` (Node.js plano): el **cutover ya está hecho**, esta app Next.js es el deploy primario en Vercel.

Tres ideas clave para ubicarse rápido:

- Next.js 15 (App Router) + React 19 + TypeScript + Tailwind. Todo server-first: las páginas son Server Components que leen datos directo de Supabase y mandan HTML ya armado.
- `legacy/` queda como histórico/consulta. La regla "cambios primero en legacy" del `CLAUDE.md` aplica solo mientras coexistían; hoy el desarrollo activo es acá.
- Persistencia y auth las provee Supabase (project `kdhpbrpeneokvhwyxmwn`). La app habla con la DB vía dos clientes (con RLS y bypass service_role).

## 2. Estructura de carpetas

El App Router usa **route groups** (`(admin)`, paréntesis = no aparecen en la URL) para compartir layout sin ensuciar las rutas.

- `app/(admin)/` — todo lo interno bajo `/admin/*`. Layout propio con `Sidebar` (`app/(admin)/layout.tsx`), más `error.tsx` de grupo.
- `app/login`, `app/auth/confirm`, `app/p/[token]`, `app/page.tsx` — rutas públicas (sin sidebar). El portal de proveedor `/p/[token]` trae su propio header.
- `app/api/*` — Route Handlers (endpoints HTTP, ver mapa abajo).
- `lib/` — lógica server-side: `config.ts` (env), `auth.ts` (sesión + roles), `supabase/` (clientes), `data/` (acceso a datos), `format.ts`, `validation.ts`, `ai.ts`, `types.ts`, `database.types.ts`.
- `components/` — UI client/server organizada por área: `admin/` (sidebar y compartidos), `dashboard/`, `workflow/` (canvas de fases, doc viewer, card RegCheq manual).

## 3. Mapa de rutas

Las páginas internas declaran `export const dynamic = 'force-dynamic'` para renderizar siempre fresco (sin cache de build). Rutas con `[id]`/`[token]` reciben `params` como `Promise` (convención Next 15) y se hace `await params`.

| Ruta | Archivo | Qué muestra |
| --- | --- | --- |
| `/` | `app/page.tsx` | Landing. Con auth activa redirige a `/admin` o `/login`; sin auth, botón directo. |
| `/admin` | `app/(admin)/admin/page.tsx` | Dashboard con KPIs (`getDashboardStats`, `getPhaseStats`). |
| `/admin/workflows` · `/admin/workflows/[id]` | `.../workflows/page.tsx` · `[id]/page.tsx` | Lista de solicitudes y detalle (canvas de fases, docs, comentarios, card RegCheq manual). |
| `/admin/contracts` · `/admin/contracts/[id]` | `.../contracts/...` | Contratos firmados/en curso y detalle de archivos. |
| `/admin/providers` · `/admin/providers/[id]` | `.../providers/...` | Proveedores y perfil con histórico RegCheq. |
| `/admin/matriz` | `.../matriz/page.tsx` | Matriz de sociedades, apoderados y documentos requeridos. |
| `/admin/intake/new` | `.../intake/new/page.tsx` | Form de nueva solicitud (`IntakeForm`). Arranca el flujo paralelo. |
| `/admin/users` | `.../users/page.tsx` | Gestión de usuarios y roles. |
| `/admin/settings` | `.../settings/page.tsx` | Branding (logo, banner) y settings de app. |
| `/login` | `app/login/page.tsx` | Pide email para magic link (`LoginForm` en `<Suspense>`). |
| `/auth/confirm` | `app/auth/confirm/page.tsx` | Handler client del magic link (ver Auth). |
| `/p/[token]` | `app/p/[token]/page.tsx` | Portal público de proveedor: form multi-step + subida de docs. |
| `/api/*` | `app/api/**/route.ts` | Auth (`magic-link`, `callback`, `logout`, `me`), `health`, signed URLs (`files/url`, `provider-uploads/url`). |

## 4. Auth (magic-link + roles)

Sin contraseñas: el ingreso es por **magic link** de Supabase Auth. El flujo end-to-end:

1. `POST /api/auth/magic-link` recibe el email, auto-crea el user si no existe y dispara el correo. La entrega sigue el fallback del proyecto: n8n webhook → Resend → SMTP built-in de Supabase (`signInWithOtp`). El `redirectTo` apunta a `/auth/confirm`.
2. `/auth/confirm` es **client-side a propósito**: cubre los 3 formatos que manda Supabase (fragment `#access_token`, query `token_hash`, query `code` PKCE). El fragment `#` nunca llega al server, por eso el route handler `/api/auth/callback` veía "missing code or token_hash"; el handler client lee `location.hash`, valida y deja que `@supabase/ssr` escriba las cookies. Luego hace hard-nav para que el server las lea.
3. `middleware.ts` refresca la sesión (rotación de token transparente) en cada request vía cookies SSR. `/api/auth/callback` queda como ruta SSR alternativa (PKCE/OTP puro por query).

Puntos a tener presentes:

- **`AUTH_ENABLED` bypass**: con `AUTH_ENABLED=false` (default dev) el middleware deja pasar todo y `getCurrentUser()` devuelve un dev user impersonado (`DEV_BYPASS_EMAIL` con `DEV_BYPASS_ROLES`). No hay sesión real. Encender solo con `AUTH_ENABLED=true`.
- **Roles** (`lib/types.ts`): `admin | aprobador | solicitante | proveedor`. Se leen de `user_profiles`; los emails en `ADMIN_EMAILS` reciben admin+aprobador+solicitante automáticamente (`mergeAdminAllowlist`). Helpers: `getCurrentUser`, `requireRole(...)`, `requireAdmin()` en `lib/auth.ts`.
- **`PUBLIC_PATHS`** (middleware): `/`, `/login`, `/auth`, `/p`, `/api/auth`, `/api/settings`. Con auth activa, cualquier otra ruta sin sesión redirige a `/login?next=...`. Al sumar rutas públicas nuevas (ej. otro portal externo) hay que agregarlas acá.

## 5. Capa de datos (`lib/data/*`)

Las páginas no consultan Supabase a mano: llaman funciones de `lib/data/*`, todas marcadas `import 'server-only'` (nunca llegan al bundle del cliente).

- **Dos clientes** (`lib/supabase/server.ts`): `createServerClient()` respeta las cookies del request (RLS aplicado con el JWT del user) y `createAdminClient()` usa `service_role` y **bypassa RLS** — solo server. El admin client es singleton y tira error si falta la key.
- **Módulos**: `workflows.ts` (`listWorkflows`, `getWorkflow`, `getPhaseStats`, `getDashboardStats`), `contracts.ts` (`listContracts`, `getContract`, `listContractFiles`, `getSignedUrl`, `listComments`…), `providers.ts` (`listProviders`, `getProvider`, `getRegcheqHistory`, `findProviderByToken`, `findRunsForProvider`…), `matriz.ts` (`listSociedades`, `listApoderados`, `getMatrizSnapshot`…), `users.ts` (`listUsers`, `updateUserRoles`, `inviteUser`), `settings.ts` (`getAppSettings`, `getBanner`, `saveSetting`, `uploadLogo`…).
- **Patrón loading/error**: cada ruta pesada tiene su `loading.tsx` (skeleton vía Suspense de Next) y las rutas `[id]` además un `error.tsx` (error boundary). Las páginas paralelizan IO con `Promise.all` y llaman `notFound()` cuando el recurso no existe.

## 6. Variables de entorno

Centralizadas en `lib/config.ts` (con fallbacks entre nombres). Mínimas para levantar:

- `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o `SUPABASE_ANON_KEY` / `SUPABASE_PUBLISHABLE_KEY`) y `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_KEY`). El service_role es server-only — **nunca exponerlo al cliente**.
- `AUTH_ENABLED` (`true`/`false`), `ADMIN_EMAILS` (lista separada por comas), `SITE_URL` (o `NEXT_PUBLIC_SITE_URL`, default `http://localhost:3000`).
- En modo bypass: `DEV_BYPASS_EMAIL`, `DEV_BYPASS_ROLES`.
- Email/IA según se usen: `N8N_EMAIL_WEBHOOK_URL` (+`N8N_EMAIL_WEBHOOK_SECRET`), `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`; `ANTHROPIC_API_KEY` (acepta typo `ANHTROPIC_API_KEY` y `CLAUDE_API_KEY`, opcional `ANTHROPIC_MODEL`), `GEMINI_API_KEY`, `SLACK_BOT_TOKEN`.

`GET /api/health` reporta qué keys están presentes y hace un ping real a la DB (count contra `sociedades`) — útil para validar el entorno tras un deploy.

## 7. Comandos

Requiere Node ≥ 20. Definidos en `package.json`:

- `npm run dev` — servidor de desarrollo (Turbopack, `next dev --turbo`).
- `npm run build` — build de producción.
- `npm run start` — sirve el build.
- `npm run lint` — ESLint (config Next). También existe `npm run typecheck` (`tsc --noEmit`).

## 8. Deuda técnica conocida

Cosas en las que conviene no tropezar (o que están esperando una pasada):

- **Cliente Supabase sin tipar**: `createAdminClient`/`createServerClient` usan `SupabaseClient<any>`. Existe `lib/database.types.ts` (autogenerado por Supabase, `Database`) como **reference**, pero tiparlo dispara una cascada de errores en los `insert`/`update` dinámicos (`Record<string, any>`) del data layer. La migración a cliente tipado (castear cada mutación) es tarea aparte y está pendiente.
- **Advisor `auth_rls_initplan` diferido**: optimización de políticas RLS (envolver `auth.*()` en subselect) reconocida pero no aplicada todavía.
- **Warnings `no-explicit-any`**: hay `any` deliberados (payloads dinámicos, SDK Supabase auth-admin) que generan warnings de ESLint; van junto con la limpieza de tipos.
