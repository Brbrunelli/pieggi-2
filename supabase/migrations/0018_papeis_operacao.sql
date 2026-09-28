-- ============================================================
-- SISTEMA PIEGGI — Migration 0018: papéis na operação
--
-- Até aqui qualquer usuário autenticado editava tudo. A partir de agora:
--
--   admin             → edita e aprova Programação, Comandas e Plaquinhas
--   producao/compras  → EQUIPE: vê, baixa o arquivo e marca o que já ficou pronto
--   comercial         → lado comercial (proposta/funil); na operação, só leitura
--
-- A trava mora na RLS, não só na tela: esconder botão não protege dado —
-- o anon key do Supabase está no front e qualquer um chama a API direto.
-- ============================================================

-- ------------------------------------------------------------
-- Helpers de papel (security definer evita recursão de RLS,
-- igual ao is_admin() da 0001)
-- ------------------------------------------------------------
create or replace function public.papel()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and ativo;
$$;

/** Chão de produção: produz, expede e compra — nunca edita a ficha. */
create or replace function public.is_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('producao', 'compras');
$$;

/** Quem pode mexer na programação/comanda/plaquinha e aprovar a fase. */
create or replace function public.pode_editar_operacao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() = 'admin';
$$;

-- ------------------------------------------------------------
-- Operação: leitura para todos, escrita só para quem pode editar
--
-- events/event_services/service_items/proposals continuam abertos — são o
-- lado comercial. purchase_lists também: a lista de compras é justamente o
-- trabalho do papel 'compras'.
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'schedules', 'production_orders', 'signage_sets', 'approvals'
  ]
  loop
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s', t);

    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (public.pode_editar_operacao())', t);
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated
         using (public.pode_editar_operacao()) with check (public.pode_editar_operacao())', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$s for delete to authenticated
         using (public.pode_editar_operacao())', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- BAIXA DA EQUIPE
--
-- Uma linha = uma parte da fase que já ficou pronta. A presença da linha
-- é o "pronto"; desmarcar é apagar. Sem update: quem marcou e quando é
-- histórico, não campo editável.
--
-- chave  = identificador estável da parte
--          comandas   → '<dia ISO>|<estacao>'  ex.: '2026-08-12|quente'
--          plaquinhas → 'impresso' | 'dobrado'
-- rotulo = como aparece na tela ('DIA 1 · 12/08 — Cozinha Quente')
-- ------------------------------------------------------------
create table if not exists public.station_progress (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  fase       text not null check (fase in ('comandas', 'plaquinhas')),
  chave      text not null,
  rotulo     text not null default '',
  pronto_em  timestamptz not null default now(),
  pronto_por uuid references public.profiles (id),
  unique (event_id, fase, chave)
);

create index if not exists station_progress_evento_fase_idx
  on public.station_progress (event_id, fase);

alter table public.station_progress enable row level security;

-- todos enxergam o andamento (o admin precisa ver o que a equipe já deu baixa)
create policy "station_progress_select" on public.station_progress
  for select to authenticated using (true);

-- marcar/desmarcar: equipe e admin. O comercial não dá baixa de produção.
create policy "station_progress_insert" on public.station_progress
  for insert to authenticated
  with check (
    pronto_por = auth.uid() and (public.is_admin() or public.is_equipe())
  );

create policy "station_progress_delete" on public.station_progress
  for delete to authenticated
  using (public.is_admin() or public.is_equipe());

-- O bucket 'documentos' fica como está: a equipe precisa baixar o arquivo
-- gerado, e quem só lê não chega a subir versão nova — a tela de leitura
-- gera o arquivo em memória e faz download, sem salvar (ver Comandas.tsx).
