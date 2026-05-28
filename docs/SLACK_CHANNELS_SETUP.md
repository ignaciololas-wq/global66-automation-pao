# Slack — separar canales por equipo (opcional)

Hoy todas las aprobaciones llegan al canal fallback `SLACK_DEFAULT_CHANNEL=C0B6ANYFQJD`. Si querés que cada equipo (Compliance / Legal / Administración) reciba solo SUS aprobaciones en su propio canal, seguí estos pasos.

## 1) Crear 3 canales en Slack

Sugerencia naming:
- `#contratos-compliance`
- `#contratos-legal`
- `#contratos-admin`

Privados o públicos según política interna. Si son privados, el bot `socket-global66` debe ser invitado a cada uno manualmente:

1. Abrí el canal
2. Click nombre canal arriba → tab **Integrations**
3. **Add an App** → buscá `socket-global66` (App ID `A0B3ZKS6Q93`)
4. Add

## 2) Conseguir los 3 Channel IDs

Por canal:
- Click derecho sobre el canal en sidebar → **Copy link**
- La URL es `https://global66.slack.com/archives/C0XXXXXXXXXX`
- El `C0XXXXXXXXXX` final = channel ID (11 caracteres, empieza con C)

Anotá los 3 IDs.

## 3) Setear env vars

**Local** (`.env`):
```
SLACK_COMPLIANCE_CHANNEL=C0COMPLI4NCE
SLACK_LEGAL_CHANNEL=C0LEG4LXXXX
SLACK_ADMIN_CHANNEL=C0ADM1NXXXX
# Mantener SLACK_DEFAULT_CHANNEL como fallback opcional o borrar
SLACK_DEFAULT_CHANNEL=C0B6ANYFQJD
```

**Vercel** (producción):
```
vercel env add SLACK_COMPLIANCE_CHANNEL production
vercel env add SLACK_LEGAL_CHANNEL production
vercel env add SLACK_ADMIN_CHANNEL production
```
Pegá los IDs cuando te lo pida.

## 4) Redeploy

```
git commit --allow-empty -m "trigger redeploy"
git push origin main
```

Después de ~30s, una solicitud nueva debería dispatchear así:
- Compliance message → `#contratos-compliance`
- Legal message → `#contratos-legal`
- Admin message → `#contratos-admin`

## 5) Verificar

Crea una solicitud test desde `/admin/intake/new` y confirma que cada canal recibe SOLO su mensaje (compliance no debe ver el de legal, etc.).

## Lógica del fallback

`legacy/src/approvals_dispatch.js` resuelve canal así:
```js
CHANNELS = {
  compliance: SLACK_COMPLIANCE_CHANNEL || SLACK_DEFAULT_CHANNEL,
  legal:      SLACK_LEGAL_CHANNEL      || SLACK_DEFAULT_CHANNEL,
  admin:      SLACK_ADMIN_CHANNEL      || SLACK_DEFAULT_CHANNEL,
};
```

Si todas las vars específicas están seteadas, el fallback no se usa. Si alguna está vacía y default está vacío también → ese team queda sin notificación (warning en logs `[slack] SLACK_X_CHANNEL not set + no SLACK_DEFAULT_CHANNEL fallback — skipping`).
