# Intake — Alta de contrato proveedor

**Proyecto:** Pao P2 — Alta de contratos con proveedores (Slack + Finecto)
**Procedimiento:** G81-PRO-005
**Validación pendiente:** Legal Lead

## Configuración

- Colectar email (auto): sí
- Login requerido: sí (workspace Global66)
- Allow edit responses: no
- Progress bar: sí
- Destination: Google Sheet auto-generado (n8n lo lee con webhook o trigger Sheets)

## 17 campos

| # | Campo | Tipo | Obligatorio | Notas |
|---|-------|------|-------------|-------|
| 0 | Email owner | auto (collectEmail) | — | quien envía el form |
| 1 | Razón social proveedor | texto corto | sí | nombre legal completo |
| 2 | RUT / Tax ID | texto corto | sí | sin puntos, con guion |
| 3 | País | dropdown | sí | CL, PE, MX, CO, AR, EC, BR, UY, US, Otro |
| 4 | Tipo proveedor | dropdown | sí | Servicios, SaaS, Cloud, Marketing, Logística, Insumos, Consultoría, Otro |
| 5 | Nivel acceso datos | radio | sí | Ninguno → Acceso crítico (5 niveles) |
| 6 | Criticidad | radio | sí | Baja/Media/Alta/Crítica |
| 7 | Tipo contrato | dropdown | sí | Servicios, SaaS, NDA, MSA, SOW, Adhesión, Otro |
| 8 | Monto anual | número | sí | numérico |
| 9 | Moneda | dropdown | sí | USD, CLP, PEN, MXN, COP, ARS, BRL, EUR, UF, Otra |
| 10 | Vigencia (meses) | texto corto | sí | número o "indefinido" |
| 11 | Email contacto proveedor | email | sí | quien firma |
| 12 | Email facturación | email | sí | |
| 13 | ¿Adhesión? | radio | sí | Sí/No |
| 14 | Justificación negocio | párrafo | sí | impacto esperado |
| 15 | Link Drive del borrador | URL | sí | Apps Script no soporta file upload; usar link Drive o agregar campo manualmente en UI |
| 16 | Responsable backup | email | sí | |
| 17 | Notas adicionales | párrafo | no | |

## Flujo downstream (n8n)

1. Trigger Google Sheets row added → webhook n8n
2. Validar campos requeridos (defensa en profundidad)
3. Descargar PDF Drive (campo 15) → enviar a Claude API extracción
4. Crear registro Finnecto vía API (no Playwright, ver stack A)
5. Distribución paralela aprobaciones (Compliance/Legal/Admin) — Slack DMs
6. Hito 1 semáforo cuando 3/3 aprueben

## Deploy del form

1. Abrir https://script.google.com
2. New Project → pegar `create_intake_form.gs`
3. Run > `createIntakeForm` → autorizar
4. Logger devuelve `formPublishedUrl` y `sheetUrl`
5. Compartir form URL con Legal Lead para review
6. Sheet ID → guardar en `.env` del proyecto n8n
