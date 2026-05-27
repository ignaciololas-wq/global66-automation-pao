-- Regcheq AML/PEP checks (nodo 4 — complementa sanctions_checks)
create table if not exists regcheq_checks (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid references workflow_runs(id) on delete cascade,
  decision text not null,                 -- block | review | approve_flag | approve | unknown | skip
  reason text,
  company jsonb,                          -- { decision, matches, effectiveRisk, raw }
  relations jsonb default '[]'::jsonb,    -- [{ dni, type, decision, matches, ... }]
  created_at timestamptz default now()
);

create index if not exists regcheq_checks_run_idx on regcheq_checks(workflow_run_id, created_at desc);
create index if not exists regcheq_checks_decision_idx on regcheq_checks(decision);
