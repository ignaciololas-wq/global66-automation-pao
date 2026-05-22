-- KPI views Pao P2

CREATE OR REPLACE VIEW public.v_avg_approval_time AS
SELECT
  team,
  COUNT(*) AS total_decisions,
  COUNT(*) FILTER (WHERE decision = 'approved')  AS approved,
  COUNT(*) FILTER (WHERE decision = 'rejected')  AS rejected,
  COUNT(*) FILTER (WHERE decision = 'requested_changes') AS requested_changes,
  ROUND(AVG(EXTRACT(EPOCH FROM (a.decided_at - r.created_at)) / 3600)::numeric, 2) AS avg_hours_to_decide
FROM public.approvals a
JOIN public.workflow_runs r ON r.id = a.workflow_run_id
GROUP BY team;

CREATE OR REPLACE VIEW public.v_runs_by_phase AS
SELECT
  current_phase,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE semaforo = 'green')  AS green,
  COUNT(*) FILTER (WHERE semaforo = 'yellow') AS yellow,
  COUNT(*) FILTER (WHERE semaforo = 'red')    AS red
FROM public.workflow_runs
GROUP BY current_phase;

CREATE OR REPLACE VIEW public.v_extraction_costs AS
SELECT
  DATE_TRUNC('day', created_at)::date AS day,
  model,
  COUNT(*) AS extractions,
  SUM(tokens_in)  AS tokens_in_sum,
  SUM(tokens_out) AS tokens_out_sum,
  ROUND(SUM(cost_usd)::numeric, 2) AS cost_usd_total
FROM public.extractions
GROUP BY DATE_TRUNC('day', created_at), model
ORDER BY day DESC;

CREATE OR REPLACE VIEW public.v_sanctions_hits AS
SELECT
  DATE_TRUNC('week', s.created_at)::date AS week,
  COUNT(*) AS checks,
  COUNT(*) FILTER (WHERE s.hit) AS hits,
  ROUND(100.0 * COUNT(*) FILTER (WHERE s.hit) / NULLIF(COUNT(*), 0), 2) AS hit_pct
FROM public.sanctions_checks s
GROUP BY DATE_TRUNC('week', s.created_at)
ORDER BY week DESC;

GRANT SELECT ON public.v_avg_approval_time TO service_role, authenticated;
GRANT SELECT ON public.v_runs_by_phase TO service_role, authenticated;
GRANT SELECT ON public.v_extraction_costs TO service_role, authenticated;
GRANT SELECT ON public.v_sanctions_hits TO service_role, authenticated;
