# Global66 Automation — Pao P2 Contratos

Automatización del flujo de alta y gestión de contratos con proveedores.

**Stack A (actual):** n8n (orquestación) + Gemini API (extracción / IA) + Google Workspace (Form/Drive/Sheets) + Slack (aprobaciones) + Finnecto/Manager (ERP) + SignNow (firma electrónica).

**Stack legacy:** Slack Bolt socket mode + Supabase + Playwright Finecto. Conservado en `src/*.cjs` como referencia / fallback.

## Estructura

```
forms/                  Apps Script Form + onSubmit webhook
prompts/                Prompts Gemini
src/
  server.js             HTTP server consolidado (todos los endpoints)
  finnecto.js           Cliente API Finnecto
  gemini_extract.js     Extracción PDF + cache Supabase (Gemini 2.5 Pro)
  lista_negra.js        OpenSanctions + apoderados IA
  drive_docs.js         Fase 2 Drive + checklist país
  signnow.js            Fase 3 firma electrónica
  alertas.js            Cron 9/6/3m + 30/7d
  inventario_tc.js      Dashboard suscripciones TC
  hito1_semaforo.js     Lógica semáforo
  hito1_endpoint.js     Wrapper standalone (legacy del server)
  slack_blocks.js       Block Kit builder
  slack_verify.js       HMAC v0 signature
  supabase_audit.js     Cliente Supabase (workflow_runs, approvals, ...)
  *.cjs                 Legacy Stack B
n8n/                    Workflows JSON
db/migrations/          SQL migrations Supabase
checklists/             Docs requeridos por país (CL/PE/MX/CO/AR)
test/                   node:test
Dockerfile / docker-compose.yml
.github/workflows/ci.yml
```

## Instalación

```bash
npm install
cp .env.example .env
# completar credenciales (ver docs/SETUP.md)
```

**Setup paso a paso:** [`docs/SETUP.md`](docs/SETUP.md) — guía completa Slack, Google, Finnecto, SignNow, ngrok, etc.

## Uso

```bash
# Server HTTP (todos los endpoints n8n+Slack)
npm start              # producción
npm run dev            # watch mode

# Scripts CLI
npm run extract -- ruta/al/contrato.pdf
npm run inventario -- transactions.csv
npm run alertas
npm test
```

## Endpoints server (puerto 3000)

| Método | Path | Uso |
|--------|------|-----|
| POST | `/form-webhook` | Apps Script `onFormSubmit` → crea workflow_run |
| POST | `/extract` | Gemini extract PDF (cache por SHA256) |
| POST | `/sanctions` | OpenSanctions check |
| POST | `/hito1-semaforo` | Computa semáforo + persiste |
| POST | `/slack-callback` | Slack button clicks (HMAC verified) |
| POST | `/validate-checklist` | Fase 2 valida docs Drive |
| POST | `/run-alertas` | Trigger cron diario |
| GET | `/health` | Health check |
| GET | `/run?id=X` | Fetch run state |

## Deploy

```bash
docker compose up -d --build
# o
docker build -t global66-automation . && docker run -p 3000:3000 --env-file .env global66-automation
```

CI: `.github/workflows/ci.yml` corre tests + build imagen en push a main.

## Flujo end-to-end (Stack A)

1. **Intake:** Proveedor llena Google Form (17 campos) → fila en Sheet
2. **Fase 1:** n8n trigger → descarga PDF Drive → Gemini extrae campos → OpenSanctions check → Slack DMs paralelos Compliance/Legal/Admin → Finnecto crea supplier
3. **Hito 1:** Cuando 3/3 aprueben → semáforo (verde/amarillo/rojo)
4. **Fase 2:** Si verde → crea carpeta Drive → envía checklist país al proveedor → espera docs → valida vigencia
5. **Fase 3:** Docs OK → SignNow copia template → invita firmantes → callback → guarda PDF firmado en Drive → Finnecto marca `signed`
6. **Monitoreo:** Cron diario revisa contratos próximos a vencer (270/180/90/30/7 días) → alerta Slack al owner

## Pendiente pre-GO-LIVE

- Validar Form con Legal Lead (Paola)
- Confirmar endpoints API Finnecto reales (asume `/suppliers`, `/contracts`, `/contracts/:id/attachments`)
- Configurar Slack App + webhooks de aprobación (buttons → callback n8n)
- Template SignNow con fields prefilled
- Service Account Google con permisos Drive root folder
- Piloto P2 (2 semanas paralelo G81-PRO-005 manual)

Notion DB: https://www.notion.so/8ee9db22f90349b0bb724a9b5722996b
Form intake: https://docs.google.com/forms/d/e/1FAIpQLSeM3XQ_CB3G7EkuxUxAs_UK8AX2vtnPZ4ZXkUKR620X7hlUyw/viewform
