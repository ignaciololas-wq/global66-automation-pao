-- Tabla estado aprobaciones secuencial (form interno → Legal+Admin paralelo → Proveedor)
create table if not exists public.contract_approvals (
  run_id            text primary key,
  stage             text not null default 'internal_review',
    -- 'internal_review' | 'provider_action' | 'returned_to_submitter' | 'signed' | 'cancelled'
  submitter_email   text not null,
  razon_social      text not null,
  monto             numeric,
  moneda            text,
  link_drive        text,
  provider_email    text,
  payload           jsonb,

  legal_status      text not null default 'pending',  -- pending|approved|rejected
  legal_by          text,
  legal_ts          timestamptz,
  legal_comment     text,

  admin_status      text not null default 'pending',
  admin_by          text,
  admin_ts          timestamptz,
  admin_comment     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_contract_approvals_stage on public.contract_approvals(stage);
create index if not exists idx_contract_approvals_submitter on public.contract_approvals(submitter_email);

-- trigger updated_at
create or replace function public.touch_contract_approvals()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists trg_touch_contract_approvals on public.contract_approvals;
create trigger trg_touch_contract_approvals
before update on public.contract_approvals
for each row execute function public.touch_contract_approvals();
