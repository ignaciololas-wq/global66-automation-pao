# Setup paso a paso

Esta guía cubre todas las credenciales y configuraciones de terceros que el sistema necesita.

Marcá ✅ cuando termines cada bloque.

---

## 1. Slack ⬜

### 1a. Bot tokens
Ya están en `.env` ✓
```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
```

### 1b. Channel IDs

El bot necesita saber a qué canales mandar mensajes de aprobación.

1. Abrir Slack (desktop o web).
2. Si no existen, crear 3 canales:
   - `#contratos-compliance`
   - `#contratos-legal`
   - `#contratos-admin`
3. Invitar al bot a cada canal: `/invite @nombre-de-tu-bot`
4. Click en el nombre del canal (arriba) → panel derecho.
5. Scroll hasta el fondo → `Channel ID: C0XXXXXXXXXX` → botón copiar.
6. Pegar en `.env`:
```
SLACK_COMPLIANCE_CHANNEL=C0XXXXXXXXXX
SLACK_LEGAL_CHANNEL=C0XXXXXXXXXX
SLACK_ADMIN_CHANNEL=C0XXXXXXXXXX
```

### 1c. Configurar interactividad (para botones)

Slack necesita saber a dónde enviar los clicks de los botones aprobar/rechazar.

1. https://api.slack.com/apps → tu app `Global66 Contratos`
2. **Features → Interactivity & Shortcuts** → Enable Interactivity
3. **Request URL:** `https://TU_SERVER_PUBLICO/slack-callback`
   - Si server local: usar ngrok (ver sección 5)
   - Si producción: `https://server.global66.com/slack-callback`

### 1d. OAuth scopes (verificar)

**Features → OAuth & Permissions → Bot Token Scopes** debe tener:
- `chat:write`
- `chat:write.public`
- `commands`
- `im:write`
- `users:read`
- `users:read.email`

Si falta alguno, agregalo y re-instalá la app al workspace.

---

## 2. Google Workspace ⬜

### 2a. Service Account (usuario robot para Drive)

1. https://console.cloud.google.com (login con cuenta Global66)
2. Seleccionar/crear proyecto (ej: `global66-automation`)
3. **IAM & Admin → Service Accounts** → `+ Create Service Account`
4. Nombre: `global66-automation`
5. `Create and continue` → `Done`
6. Click en el service account creado → pestaña **Keys** → `Add Key` → `Create new key` → tipo **JSON**
7. Se descarga un archivo `xxx-yyy.json`

### 2b. Guardar el JSON

```bash
mkdir C:\Users\julio.lolas\global66-automation\secrets
```

Mover el JSON descargado a esa carpeta y renombrarlo a `gsa.json`.

Ruta final: `C:\Users\julio.lolas\global66-automation\secrets\gsa.json`

Ya está en `.gitignore` — no se sube a git.

### 2c. Activar APIs

En la consola Cloud → buscador arriba:

- **Google Drive API** → click → `ENABLE`
- **Google Sheets API** → click → `ENABLE`
- **Google Forms API** → click → `ENABLE` (opcional, para leer responses)
- **Gmail API** → click → `ENABLE` (para email digests futuros)

### 2d. Carpeta raíz Drive

1. https://drive.google.com (cuenta Global66)
2. Crear carpeta: `Proveedores Global66`
3. Click derecho → **Compartir**
4. Email a compartir = `client_email` del JSON (algo tipo `global66-automation@xxx.iam.gserviceaccount.com`)
5. Permiso: **Editor**
6. Copiar ID de la carpeta: en la URL `drive.google.com/drive/folders/XXXXXXXX` el `XXXXXXXX` es el ID
7. Pegar en `.env`:
```
GOOGLE_DRIVE_ROOT_FOLDER=XXXXXXXX
GOOGLE_SERVICE_ACCOUNT_JSON=./secrets/gsa.json
```

### 2e. Compartir Sheet de respuestas del Form

El service account también necesita leer el Sheet con respuestas del Form.

1. Abrir Sheet: https://docs.google.com/spreadsheets/d/1q2LluwpzObY7m0WWzWeKt7-uzb1ESY_I4SuY_mzqvPs/edit
2. Botón **Share** arriba a la derecha
3. Pegar email del service account → permiso **Viewer**

---

## 3. Gemini ⬜

Ya configurado:
```
GEMINI_API_KEY=AQ.Ab8R...
```

Verificar tier gratis: https://aistudio.google.com/apikey

---

## 4. Finnecto ⬜ (esperando respuesta)

Pendientes a obtener cuando Finnecto responda:
```
FINNECTO_API_KEY=                  # generar en Admin → Ajustes (prod)
FINNECTO_PROVIDER_FORM_ID=         # ID del form de alta de proveedores
```

---

## 5. ngrok (exponer server local a internet) ⬜

n8n cloud y Slack callbacks necesitan llegar a tu server. Si corre en `localhost:3000`, no es accesible desde afuera. Ngrok hace túnel.

### Instalar

1. https://ngrok.com/download → bajar Windows
2. Descomprimir → `ngrok.exe` en algún lugar (ej: `C:\tools\`)
3. Crear cuenta gratis → copiar tu authtoken
4. PowerShell:
```
ngrok config add-authtoken TU_TOKEN
```

### Usar

Terminal 1:
```
npm run mock
```

Terminal 2:
```
ngrok http 3000
```

Ngrok te muestra:
```
Forwarding   https://xxxx-yyyy.ngrok-free.app -> http://localhost:3000
```

Esa URL `https://xxxx-yyyy.ngrok-free.app` es la pública. Úsala en:
- `SERVER_BASE` env en n8n cloud → `https://xxxx-yyyy.ngrok-free.app`
- Slack Interactivity Request URL → `https://xxxx-yyyy.ngrok-free.app/slack-callback`
- Apps Script `WEBHOOK_URL` en `forms/push_to_webhook.gs` → `https://xxxx-yyyy.ngrok-free.app/form-webhook`

⚠️ La URL ngrok cambia cada vez que reiniciás ngrok (en plan gratis). Para URL estable: plan paid o usá un dominio propio.

---

## 6. SignNow ⬜

1. Signup: https://signnow.com
2. Plan API (no Free)
3. **Settings → API** → generar Client ID + Client Secret
4. Crear template del contrato → copiar Template ID
5. Pegar en `.env`:
```
SIGNNOW_CLIENT_ID=
SIGNNOW_CLIENT_SECRET=
SIGNNOW_USERNAME=        # tu email signnow
SIGNNOW_PASSWORD=
SIGNNOW_TEMPLATE_ID=
```

---

## 7. OpenSanctions ⬜

1. Signup: https://www.opensanctions.org/api/
2. Free tier disponible
3. Copiar API key:
```
OPENSANCTIONS_API_KEY=
```

---

## 8. Supabase ⬜ ✓

Ya configurado:
- Proyecto `kdhpbrpeneokvhwyxmwn` (región sa-east-1)
- Service role key en `.env`
- 6 tablas + 4 KPI views aplicadas (migraciones 001-003)

URL dashboard: https://supabase.com/dashboard/project/kdhpbrpeneokvhwyxmwn

---

## 9. n8n Cloud ⬜ (parcial)

Listo:
- 4 workflows importados a `c204.app.n8n.cloud`

Falta (a mano en UI):
- Asignar credenciales en cada nodo (Slack, Google Drive, HTTP Server)
- Setear environment variables del workflow (SERVER_BASE, SLACK_*, FINNECTO_*)
- Activar cada workflow

---

## 10. Verificación final

```bash
npm run check-env
```

Debería decir `Missing: 0` cuando todo esté completo.

```bash
npm test
npm run mock          # arranca server
# en otra terminal:
npm run pilot         # corre flow end-to-end mock
```

Resultado esperado: pilot completa con `semaforo: green` y `phase: fase2`.
