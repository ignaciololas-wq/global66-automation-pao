-- Vincular regcheq_checks al perfil del proveedor (histórico permanente)
alter table regcheq_checks add column if not exists provider_id uuid references providers(id) on delete cascade;
create index if not exists regcheq_checks_provider_idx on regcheq_checks(provider_id, created_at desc);
