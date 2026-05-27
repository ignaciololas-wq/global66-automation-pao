-- Hardening seguridad: hallazgos del database linter Supabase.
--
-- 1. Vistas con SECURITY DEFINER → security_invoker=true (RLS aplica al usuario, no al owner).
-- 2. Función set_updated_at con search_path mutable → fijar a public,pg_temp.
-- 3. Bucket avatars con SELECT amplio → drop policy (URL pública sigue funcionando).

create or replace view public.v_avg_approval_time
  with (security_invoker = true) as
  SELECT a.team,
    count(*) AS total_decisions,
    count(*) FILTER (WHERE (a.decision = 'approved'::text)) AS approved,
    count(*) FILTER (WHERE (a.decision = 'rejected'::text)) AS rejected,
    count(*) FILTER (WHERE (a.decision = 'requested_changes'::text)) AS requested_changes,
    round(avg((EXTRACT(epoch FROM (a.decided_at - r.created_at)) / (3600)::numeric)), 2) AS avg_hours_to_decide
   FROM (approvals a
     JOIN workflow_runs r ON ((r.id = a.workflow_run_id)))
  GROUP BY a.team;

create or replace view public.v_contracts_by_status
  with (security_invoker = true) as
  SELECT status,
    count(*) AS total,
    round(sum(monto), 2) AS total_amount_sum,
    count(DISTINCT provider_id) AS unique_providers
   FROM contracts
  GROUP BY status;

create or replace view public.v_expiring_contracts
  with (security_invoker = true) as
  SELECT c.id,
    c.provider_id,
    p.razon_social AS provider_name,
    p.tax_id,
    c.tipo_contrato AS type,
    c.monto AS amount,
    c.moneda AS currency,
    c.end_date AS expires_at,
    c.owner_email,
    (c.end_date - CURRENT_DATE) AS days_until_expiry,
    c.status
   FROM (contracts c
     JOIN providers p ON ((p.id = c.provider_id)))
  WHERE ((c.status = ANY (ARRAY['active'::text, 'signed'::text])) AND (c.end_date IS NOT NULL) AND (c.end_date >= CURRENT_DATE));

create or replace view public.v_extraction_costs
  with (security_invoker = true) as
  SELECT (date_trunc('day'::text, created_at))::date AS day,
    model,
    count(*) AS extractions,
    sum(tokens_in) AS tokens_in_sum,
    sum(tokens_out) AS tokens_out_sum,
    round(sum(cost_usd), 2) AS cost_usd_total
   FROM extractions
  GROUP BY (date_trunc('day'::text, created_at)), model
  ORDER BY ((date_trunc('day'::text, created_at))::date) DESC;

create or replace view public.v_providers_by_country
  with (security_invoker = true) as
  SELECT pais,
    count(*) FILTER (WHERE (status = 'aceptado'::text)) AS aceptados,
    count(*) FILTER (WHERE (status = 'pendiente_revision'::text)) AS pendientes,
    count(*) FILTER (WHERE (status = 'rechazado'::text)) AS rechazados,
    count(*) AS total
   FROM providers
  GROUP BY pais
  ORDER BY (count(*)) DESC;

create or replace view public.v_runs_by_phase
  with (security_invoker = true) as
  SELECT current_phase,
    count(*) AS total,
    count(*) FILTER (WHERE (semaforo = 'green'::text)) AS green,
    count(*) FILTER (WHERE (semaforo = 'yellow'::text)) AS yellow,
    count(*) FILTER (WHERE (semaforo = 'red'::text)) AS red
   FROM workflow_runs
  GROUP BY current_phase;

create or replace view public.v_sanctions_hits
  with (security_invoker = true) as
  SELECT (date_trunc('week'::text, created_at))::date AS week,
    count(*) AS checks,
    count(*) FILTER (WHERE hit) AS hits,
    round(((100.0 * (count(*) FILTER (WHERE hit))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS hit_pct
   FROM sanctions_checks s
  GROUP BY (date_trunc('week'::text, created_at))
  ORDER BY ((date_trunc('week'::text, created_at))::date) DESC;

create or replace view public.v_workflow_stage
  with (security_invoker = true) as
  SELECT id,
    razon_social,
    tax_id,
    sociedad_contratante,
    current_phase,
    internal_approval_status,
        CASE
            WHEN (current_phase = 'rejected'::text) THEN 'rechazado'::text
            WHEN (current_phase = 'cancelled'::text) THEN 'cancelado'::text
            WHEN (current_phase = 'signed'::text) THEN 'cerrado'::text
            WHEN (current_phase = 'fase3'::text) THEN 'firma'::text
            WHEN (current_phase = 'fase2'::text) THEN 'validacion_docs'::text
            WHEN (current_phase = 'hito1'::text) THEN 'aprobaciones_compliance'::text
            WHEN ((current_phase = 'fase1'::text) AND (internal_approval_status = 'approved'::text)) THEN 'datos_proveedor'::text
            WHEN (current_phase = 'fase1'::text) THEN 'aprobacion_interna'::text
            ELSE current_phase
        END AS stage,
    created_at,
    updated_at
   FROM workflow_runs r;

alter function public.set_updated_at() set search_path = public, pg_temp;

drop policy if exists avatars_read on storage.objects;
