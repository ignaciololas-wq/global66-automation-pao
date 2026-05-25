# Form Tally — IDs deployados

**Deploy date:** 2026-05-25 vía API.

| Recurso | Valor |
|---------|-------|
| Form URL pública | https://tally.so/r/b56ge6 |
| Form ID | `b56ge6` |
| Workspace ID | `nP8Qxx` |
| Organization ID | `mZg69A` |
| Status | PUBLISHED |

## Endpoints API

```
GET    https://api.tally.so/forms/b56ge6
GET    https://api.tally.so/forms/b56ge6/submissions
POST   https://api.tally.so/webhooks            # crear webhook
```

## Setup webhook (cuando tengas ngrok o server público)

```bash
node --env-file=.env scripts/create_tally_form.js https://TU-URL/form-webhook
```

(Esto crea OTRO form. Para webhook en form existente: usar API `POST /webhooks` con `formId=b56ge6` manualmente.)

## Limpiar forms de prueba

Hay forms en DRAFT generados durante probe. Eliminar:
```bash
curl -X DELETE -H "Authorization: Bearer $TALLY_API_KEY" https://api.tally.so/forms/{id}
```

IDs de prueba a borrar: `yPdg28`, `Xx29JP`, `81R2al`, `q4kgGO`, `QKOjRY` + posibles más.
