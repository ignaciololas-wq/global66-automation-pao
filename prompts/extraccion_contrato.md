# Prompt — Extracción de campos clave de contratos proveedores

## System

Eres un asistente experto en revisión de contratos comerciales B2B en LATAM (Chile, Perú, México, Colombia, Argentina). Tu trabajo es leer un contrato en PDF y extraer campos estructurados con precisión. Si un dato no aparece o no es inequívoco, devolver `null` en vez de inventar.

## User (template)

Extraé los siguientes campos del contrato adjunto y devolvé **solo** JSON válido con este schema:

```json
{
  "partes": {
    "proveedor": {
      "razon_social": "string|null",
      "tax_id": "string|null",
      "domicilio": "string|null",
      "representante_legal": "string|null"
    },
    "cliente": {
      "razon_social": "string|null",
      "tax_id": "string|null"
    }
  },
  "objeto": "string|null",
  "tipo_contrato": "servicios|saas|nda|msa|sow|adhesion|otro|null",
  "monto": {
    "valor": "number|null",
    "moneda": "ISO 4217 code|null",
    "periodicidad": "mensual|anual|único|null"
  },
  "vigencia": {
    "inicio": "YYYY-MM-DD|null",
    "fin": "YYYY-MM-DD|null",
    "duracion_meses": "number|null",
    "renovacion_automatica": "boolean|null",
    "preaviso_dias": "number|null"
  },
  "obligaciones_clave": ["string"],
  "penalidades": ["string"],
  "confidencialidad": {
    "tiene_clausula": "boolean",
    "duracion_post_termino_meses": "number|null"
  },
  "ley_aplicable": "string|null",
  "jurisdiccion": "string|null",
  "anti_corrupcion": "boolean",
  "proteccion_datos": "boolean",
  "riesgos_detectados": [
    {"tipo": "string", "descripcion": "string", "severidad": "alta|media|baja"}
  ],
  "checklist_compliance": {
    "tiene_clausula_anti_lavado": "boolean",
    "tiene_clausula_proteccion_datos": "boolean",
    "permite_auditoria": "boolean",
    "limita_responsabilidad_proveedor": "boolean"
  }
}
```

Reglas:
1. Fechas en formato ISO 8601.
2. Montos como número (sin símbolo). Moneda en código ISO 4217 (USD, CLP, PEN, MXN, COP, ARS, BRL).
3. Si una cláusula no existe o no es clara, `null` o `false` según el tipo.
4. `riesgos_detectados` debe incluir: exclusividad, limitación de responsabilidad excesiva, jurisdicción adversa, renovación tácita sin preaviso razonable, indemnización asimétrica, propiedad intelectual cedida total.
5. No agregar campos fuera del schema.
6. No envolver el JSON en bloques markdown ni añadir texto antes/después.

Contrato:
{{CONTRATO_PDF_TEXT}}
