# Global66 — Automatización de Alta de Contratos con Proveedores

Sistema que permite dar de alta contratos con proveedores completamente desde Slack, con aprobaciones de Compliance, Legal y Administración, y registro automático en Finecto via Playwright.

---

## Stack

| Componente | Rol |
|---|---|
| `@slack/bolt` (Socket Mode) | Bot de Slack, slash command, modales, botones |
| `@supabase/supabase-js` | Trazabilidad de estados del contrato |
| `playwright` | Automatización del login y registro en Finecto |
| `dotenv` | Variables de entorno |

---

## Estructura de carpetas

```
global66-automation/
├── src/
│   ├── slack.js       ← bot, /nuevo-contrato, modales, botones de aprobación
│   ├── supabase.js    ← cliente y funciones CRUD
│   └── playwright.js  ← login a Finecto + creación de registro
├── scripts/
│   └── test.js        ← verifica que Playwright funciona con Finecto
├── index.js           ← punto de entrada
├── .env               ← credenciales (no se sube al repo)
└── package.json
```

---

## Setup paso a paso

### 1. Instalar dependencias

```bash
npm install
npx playwright install chromium
```

> `npx playwright install chromium` descarga el binario del navegador (≈130 MB). Solo se hace una vez.

---

### 2. Crear la Slack App

1. Ir a [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Nombre: `Global66 Contratos`, workspace: el de Global66

#### Habilitar Socket Mode
- **Settings → Socket Mode** → Enable Socket Mode
- Crear un App-Level Token con scope `connections:write` → copiar el token `xapp-...`

#### Slash Command
- **Features → Slash Commands** → Create New Command
  - Command: `/nuevo-contrato`
  - Short description: `Iniciar alta de contrato con proveedor`

#### Permisos OAuth (Bot Token Scopes)
- **Features → OAuth & Permissions → Bot Token Scopes** → agregar:
  - `commands`
  - `chat:write`
  - `chat:write.public`
  - `im:write`
  - `views:open`
  - `views:push`

#### Habilitar eventos de interactividad
- **Features → Interactivity & Shortcuts** → Enable Interactivity (la URL no importa en Socket Mode)

#### Instalar la app al workspace
- **Settings → Install App** → Install to Workspace → copiar el `Bot User OAuth Token` (`xoxb-...`)

---

### 3. Crear las tablas en Supabase

Ir a **Supabase → SQL Editor** y ejecutar:

```sql
-- Tabla principal de contratos
CREATE TABLE contratos (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  nombre_proveedor    TEXT NOT NULL,
  rut_proveedor       TEXT NOT NULL,
  tipo_contrato       TEXT NOT NULL,
  monto               NUMERIC NOT NULL,
  vigencia            TEXT NOT NULL,
  responsable_interno TEXT NOT NULL,
  solicitante_slack_id TEXT NOT NULL,
  estado              TEXT DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
  aprobaciones        JSONB DEFAULT '{"compliance": null, "legal": null, "administracion": null}',
  finecto_registrado  BOOLEAN DEFAULT FALSE
);

-- Historial de cambios de estado (trazabilidad completa)
CREATE TABLE estados (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  contrato_id      UUID REFERENCES contratos(id) ON DELETE CASCADE,
  estado_anterior  TEXT,
  estado_nuevo     TEXT NOT NULL,
  actor            TEXT NOT NULL,
  comentario       TEXT
);
```

---

### 4. Configurar el archivo .env

Llenar todos los campos en `.env`:

```env
# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...

# IDs de los canales de aprobación (no el nombre: C0XXXXXXXXXX)
# Para obtener el ID: abrir el canal en Slack → clic en el nombre → copiar Channel ID al fondo
SLACK_COMPLIANCE_CHANNEL=C0XXXXXXXXXX
SLACK_LEGAL_CHANNEL=C0XXXXXXXXXX
SLACK_ADMIN_CHANNEL=C0XXXXXXXXXX

# Supabase (Project Settings → API)
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_KEY=eyJ...

# Finecto
FINECTO_URL=https://finecto.global66.com
FINECTO_USER=tu_usuario
FINECTO_PASSWORD=tu_contraseña
```

---

### 5. Ajustar los selectores de Playwright (src/playwright.js)

Los selectores actuales en `src/playwright.js` son estimados. Una vez que tengas acceso a Finecto:

1. Correr `node scripts/test.js` — abrirá el navegador de forma visible
2. Inspeccionar los elementos con DevTools (F12)
3. Ajustar los selectores en `src/playwright.js` según la UI real

---

### 6. Crear los canales de Slack para aprobaciones

Crear 3 canales en Slack (o usar canales existentes):
- `#contratos-compliance`
- `#contratos-legal`
- `#contratos-admin`

Invitar al bot a cada canal: `/invite @Global66 Contratos`

---

### 7. Correr el bot

```bash
# Verificar que Playwright funciona con Finecto (abre navegador visible)
npm run test:playwright

# Iniciar el bot en producción
npm start

# Iniciar con recarga automática en desarrollo (Node 18+)
npm run dev
```

---

## Flujo completo

```
Usuario → /nuevo-contrato en Slack
         ↓
     Modal con 6 campos
         ↓
     Supabase: crear contrato (estado: pendiente)
         ↓
     3 mensajes en paralelo → #compliance, #legal, #admin
     con botones: Aprobar ✅ | Rechazar ❌ | Comentar 💬
         ↓
     Cada equipo responde desde Slack
         ↓
     Cuando los 3 aprueban:
         ↓
     Playwright → login Finecto → crear registro
         ↓
     Supabase: estado = registrado_finecto
         ↓
     DM al solicitante: "Contrato registrado exitosamente 🎉"
```

---

## Troubleshooting

| Síntoma | Causa probable |
|---|---|
| `An API error occurred: not_in_channel` | El bot no está invitado al canal de aprobación |
| `missing_scope` | Falta agregar el scope en OAuth & Permissions |
| Modal no abre | Verificar que el App-Level Token tenga scope `connections:write` |
| Playwright falla el login | Los selectores de Finecto no coinciden — usar `headless: false` y DevTools |
| `Cannot find module '@supabase/supabase-js'` | Correr `npm install` |
