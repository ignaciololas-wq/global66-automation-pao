-- 025_docs_validated_at.sql
-- Gate explícito validación docs → firma. Antes ambos nodos (4 validación, 5 firma)
-- se marcaban activos a la vez en fase3 porque no había señal de "docs validados".
-- Compliance setea docs_validated_at cuando confirma los documentos; recién ahí
-- se habilita el nodo de firma. Forward-only, idempotente.

alter table public.workflow_runs
  add column if not exists docs_validated_at timestamptz;

comment on column public.workflow_runs.docs_validated_at is
  'Timestamp en que Compliance validó los documentos del proveedor (nodo 4). Gate para habilitar el nodo 5 (Firma). NULL = docs aún no validados.';
