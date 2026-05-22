# Form Intake — IDs deployados

**Re-deploy date:** 2026-05-20 17:32 (form anterior eliminado)

| Recurso | Valor |
|---------|-------|
| Form editor | https://docs.google.com/forms/d/1j6hRL9X8Dk0iVbxjrI8y3A_9RzZVLUUWjvlFwGFwhSo/edit |
| Form publicado | https://docs.google.com/forms/d/e/1FAIpQLSeTshLNKhVqIFwgQ8CILHJQUYe_ZxqzBQvkvmDo6r6WSb7JnA/viewform |
| Sheet respuestas | https://docs.google.com/spreadsheets/d/1q2LluwpzObY7m0WWzWeKt7-uzb1ESY_I4SuY_mzqvPs/edit |
| Form ID | `1j6hRL9X8Dk0iVbxjrI8y3A_9RzZVLUUWjvlFwGFwhSo` |
| Sheet ID | `1q2LluwpzObY7m0WWzWeKt7-uzb1ESY_I4SuY_mzqvPs` |

## n8n config

```
GOOGLE_FORM_ID=1j6hRL9X8Dk0iVbxjrI8y3A_9RzZVLUUWjvlFwGFwhSo
GOOGLE_SHEET_ID=1q2LluwpzObY7m0WWzWeKt7-uzb1ESY_I4SuY_mzqvPs
```

Trigger n8n: Google Sheets node → "Row added" event en Sheet ID arriba → fires Fase 1 workflow.
