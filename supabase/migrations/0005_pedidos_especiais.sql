-- ============================================================
-- SISTEMA PIEGGI — Migration 0005: Pedidos especiais (trava tática)
-- "Não podemos deixar passar": todo pedido fora do padrão do cliente
-- (1 copeira a mais, trocar marca de suco, Coca no lugar de Pepsi…)
-- vira um registro que PRECISA ser verificado em cada fase da esteira
-- antes da aprovação daquela fase.
-- ============================================================

create table public.special_requests (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  descricao    text not null,
  -- crítico = bloqueia a aprovação da fase enquanto não verificado
  critico      boolean not null default true,
  -- fases em que o pedido precisa ser verificado
  fases        text[] not null default '{proposta,programacao,comandas,plaquinhas}',
  -- {"proposta": {"user_id": "...", "em": "2026-07-28T..."}, ...}
  verificacoes jsonb not null default '{}'::jsonb,
  resolvido    boolean not null default false,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

create index idx_special_requests_event on public.special_requests (event_id);

alter table public.special_requests enable row level security;

create policy "special_requests_select" on public.special_requests
  for select to authenticated using (true);
create policy "special_requests_insert" on public.special_requests
  for insert to authenticated with check (true);
create policy "special_requests_update" on public.special_requests
  for update to authenticated using (true) with check (true);
create policy "special_requests_delete" on public.special_requests
  for delete to authenticated using (true);
