# Aprobación secuencial — Setup

Flujo: form plataforma interna → Legal + Admin (paralelo) → Proveedor. Rechazo → vuelve al solicitante.

## Archivos
- `n8n/fase_aprobacion_secuencial.json` — workflow n8n (importar en c204.app.n8n.cloud)
- `db/contract_approvals.sql` — tabla Supabase

## 1. Crear tabla
```
psql $SUPABASE_URL -f db/contract_approvals.sql
```
o pegar en Supabase SQL editor.

## 2. Env vars nuevas
Agregar a `.env`:
```
LEGAL_EMAIL=legal@global66.com
ADMIN_EMAIL=admin@global66.com
PLATFORM_BASE_URL=https://<tu-vercel-deploy>
```
Reusa: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_BOT_TOKEN`, `SLACK_LEGAL_CHANNEL`, `SLACK_ADMIN_CHANNEL`, `RESEND_API_KEY`, `RESEND_FROM`.

> Nota: `SLACK_*_CHANNEL` puede ser channel ID (canal compartido) **o** user ID `U…` (DM directo).

## 3. Importar workflow
- n8n → Workflows → Import from File → `fase_aprobacion_secuencial.json`
- Activar workflow.
- Copiar URL prod de webhooks:
  - `POST {N8N_WEBHOOK_BASE}/contract-approval-submit`
  - `POST {N8N_WEBHOOK_BASE}/contract-approval-action`

## 4. Slack app config
- **Interactivity & Shortcuts** → Request URL = `{N8N_WEBHOOK_BASE}/contract-approval-action`
- Scopes bot: `chat:write`, `chat:write.public`, `im:write`
- Reinstalar app.

## 5. Plataforma (cliente)
En el handler del form de la plataforma, tras validar, POST:
```
POST {N8N_WEBHOOK_BASE}/contract-approval-submit
Content-Type: application/json

{
  "run_id": "uuid-v4",
  "submitter_email": "user@global66.com",
  "razon_social": "Acme SpA",
  "monto": 12000,
  "moneda": "USD",
  "link_drive": "https://drive.google.com/...",
  "provider_email": "contacto@acme.com",
  ...resto campos form
}
```

## 6. Estados
| stage | significado |
|-------|-------------|
| `internal_review` | esperando Legal y/o Admin |
| `provider_action` | ambos aprobaron, mail proveedor enviado |
| `returned_to_submitter` | rechazado, solicitante debe corregir y reenviar |

## 7. Reenvío tras rechazo
Solicitante edita en plataforma → mismo `run_id` → POST de nuevo a `/contract-approval-submit` con `legal_status: 'pending', admin_status: 'pending'` (o UPSERT desde server). El workflow vuelve a notificar Legal+Admin.

## 8. Test rápido
```
curl -X POST $N8N_WEBHOOK_BASE/contract-approval-submit \
  -H 'Content-Type: application/json' \
  -d '{"run_id":"test-001","submitter_email":"julio.lolas@global66.com","razon_social":"Test SpA","monto":1000,"moneda":"USD","link_drive":"https://example.com","provider_email":"test@example.com"}'
```
Esperado: DMs Slack Legal + Admin con botones, mails Resend, row en `contract_approvals` con stage `internal_review`.
