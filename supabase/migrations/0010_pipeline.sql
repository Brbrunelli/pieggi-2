-- ============================================================
-- SISTEMA PIEGGI — Migration 0010: pipeline comercial (Kanban)
-- Frio → Morno → Quente → Contrato para Assinatura → Contrato Assinado
-- "Contrato Assinado" = proposta aprovada: libera Programação,
-- Comandas, Plaquinhas e publica os serviços na agenda.
-- ============================================================

alter table public.events
  add column if not exists pipeline           text not null default 'frio',
  add column if not exists pipeline_em        timestamptz not null default now(),
  add column if not exists pipeline_ordem     int not null default 0,
  add column if not exists motivo_perda       text;

comment on column public.events.pipeline is
  'frio | morno | quente | contrato_assinatura | contrato_assinado | perdido';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'events_pipeline_check'
  ) then
    alter table public.events add constraint events_pipeline_check
      check (pipeline in ('frio','morno','quente','contrato_assinatura','contrato_assinado','perdido'));
  end if;
end $$;

create index if not exists idx_events_pipeline on public.events (pipeline, pipeline_ordem);

-- registra quando a etapa muda (para medir tempo em cada fase)
create or replace function public.touch_pipeline()
returns trigger
language plpgsql
as $$
begin
  if new.pipeline is distinct from old.pipeline then
    new.pipeline_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists on_event_pipeline_change on public.events;
create trigger on_event_pipeline_change
  before update on public.events
  for each row execute function public.touch_pipeline();

-- ---------- alinha os eventos já existentes ----------
update public.events set pipeline = 'contrato_assinado'
where pipeline = 'frio' and status in (
  'proposta_aprovada','programacao_em_montagem','programacao_aprovada',
  'comandas_geradas','plaquinhas_geradas','compras_consolidadas','concluido'
);

update public.events set pipeline = 'contrato_assinatura'
where pipeline = 'frio' and status = 'proposta_enviada';

update public.events set pipeline = 'perdido'
where pipeline = 'frio' and status in ('proposta_recusada','cancelado');

update public.events set pipeline = 'morno'
where pipeline = 'frio' and status = 'proposta_em_montagem';

-- ---------- histórico de movimentação ----------
create table if not exists public.pipeline_log (
  id         bigint generated always as identity primary key,
  event_id   uuid not null references public.events (id) on delete cascade,
  de         text,
  para       text not null,
  user_id    uuid references public.profiles (id),
  criado_em  timestamptz not null default now()
);

alter table public.pipeline_log enable row level security;
create policy "pipeline_log_select" on public.pipeline_log
  for select to authenticated using (true);
create policy "pipeline_log_insert" on public.pipeline_log
  for insert to authenticated with check (true);
