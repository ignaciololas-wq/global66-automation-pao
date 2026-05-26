# Deploy a Vercel

Stack: Node 20 serverless (sin build). `api/index.js` = catch-all handler.
Estáticos servidos desde `public/`.

## Paso a paso

### 1. Push del repo a GitHub

```bash
cd C:\Users\julio.lolas\global66-automation
git remote -v
git push origin main
```

Si no hay remote:
1. Crear repo nuevo en https://github.com/new (privado recomendado)
2. `git remote add origin git@github.com:tu-org/global66-automation.git`
3. `git push -u origin main`

### 2. Conectar a Vercel

1. https://vercel.com/new
2. Login con GitHub (mismo usuario que tiene el repo)
3. **Import** el repo `global66-automation`
4. **Framework Preset:** Other
5. **Root Directory:** `.` (default)
6. **Build Command:** dejar vacío
7. **Output Directory:** `public`
8. Antes de **Deploy** → expandir **Environment Variables** y agregar (paso 3)

### 3. Variables de entorno

En la pantalla del deploy, agregá todas (copy-paste de tu `.env`):

```
GEMINI_API_KEY                    requerida
SUPABASE_URL                      requerida
SUPABASE_KEY                      requerida (service_role)
SUPABASE_SERVICE_ROLE_KEY         opcional (alias)
SUPABASE_PUBLISHABLE_KEY          requerida (frontend)

SLACK_BOT_TOKEN                   requerida
SLACK_SIGNING_SECRET              requerida
SLACK_COMPLIANCE_CHANNEL          al tener canales
SLACK_LEGAL_CHANNEL               al tener canales
SLACK_ADMIN_CHANNEL               al tener canales

TALLY_API_KEY                     opcional (si reusás Tally)
TALLY_FORM_ID                     opcional

RESEND_API_KEY                    para mails reales
RESEND_FROM                       Global66 Contratos <contratos@global66.com>

OPENSANCTIONS_API_KEY             opcional (fallback offline)
FINNECTO_API_KEY                  opcional (no se usa en stack actual)

SERVER_PUBLIC_URL                 https://TU-DEPLOY.vercel.app
                                  (importante para que el link en email a
                                   proveedor sea absoluto)

GOOGLE_FORM_ID                    legacy, no crítico
GOOGLE_SHEET_ID                   legacy, no crítico

NOTION_API_KEY                    opcional (reporter)
```

⚠️ **NO subir** `MOCK_MODE=true` a producción.

### 4. Deploy

Click **Deploy**. Tarda ~30 seg.

Cuando termine, Vercel te da una URL tipo `https://global66-automation.vercel.app`.

### 5. Verificar

```bash
curl https://TU-DEPLOY.vercel.app/health
# {"ok":true,"ts":"..."}

curl https://TU-DEPLOY.vercel.app/admin
# HTML del admin

curl https://TU-DEPLOY.vercel.app/dashboard
# Landing
```

### 6. Configurar webhooks externos hacia el deploy

Reemplazar `localhost:3000` o ngrok URL por la URL de Vercel:

**Tally:**
```bash
node --env-file=.env -e "
const KEY = process.env.TALLY_API_KEY;
const formId = process.env.TALLY_FORM_ID;
fetch('https://api.tally.so/webhooks', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    formId,
    url: 'https://TU-DEPLOY.vercel.app/form-webhook',
    eventTypes: ['FORM_RESPONSE'],
  }),
}).then(r => r.text()).then(console.log);
"
```

**Slack Interactivity:**
1. https://api.slack.com/apps → tu app → Features → Interactivity & Shortcuts
2. Request URL: `https://TU-DEPLOY.vercel.app/slack-callback`
3. Save Changes

**n8n env (en la instancia c204.app.n8n.cloud):**
- `SERVER_BASE=https://TU-DEPLOY.vercel.app`

### 7. Dominio custom (opcional)

Vercel → tu proyecto → Settings → Domains → Add `contratos.global66.com`
- Configurar DNS CNAME → cname.vercel-dns.com

## Limitaciones a tener en cuenta

- **maxDuration: 30s** por request. Suficiente para todo excepto:
  - Extracción Gemini con PDFs muy grandes (>20MB) → puede timeout
  - SignNow downloads → revisar
- **Cold starts** primera request luego de inactividad: ~1-2 seg
- **Sin cron nativo** en hobby. Para alertas diarias usar Vercel Cron (Pro $20/mes) o n8n cloud schedule
- **Stateless:** no podés guardar archivos temporales que persistan entre requests

## Cron alternativa (sin Vercel Pro)

Configurar en n8n cloud (gratis):
- Trigger: Schedule (daily 08:00)
- HTTP node → POST `https://TU-DEPLOY.vercel.app/run-alertas`
- Workflow `alertas_vencimiento.json` ya importado en c204.app.n8n.cloud — solo cambiar URL.

## Test local con Vercel CLI

```bash
npm i -g vercel
vercel dev
```

Levanta server local idéntico a producción (incluye rewrites).

## Re-deploy automático

Cada `git push origin main` re-deploya en ~30 seg. Preview branches para PRs.
