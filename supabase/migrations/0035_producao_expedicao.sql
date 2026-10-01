-- ============================================================
-- SISTEMA PIEGGI — Migration 0035: produção por praça + expedição
--
-- Até aqui a cozinha tinha UMA baixa por estação inteira
-- (station_progress: "Cozinha Fria do dia 1 — pronto"). Na reunião ficou
-- claro que isso não serve na TV da praça: a confeiteira precisa ver
-- ITEM a ITEM o que falta e quanto tempo sobra até o carro sair — como
-- a tela de cozinha do McDonald's.
--
--   producao_itens    o status de cada item da comanda aprovada, por
--                     evento × dia × praça:  a fazer → produzindo → pronto.
--                     "A fazer" é a AUSÊNCIA de linha (voltar = apagar).
--
--   expedicao_checks  o checklist da expedição em três setores —
--                     comidas, bebidas, estrutura — como validado na
--                     reunião. A linha existir É o "conferido" (igual a
--                     station_progress): desmarcar apaga.
--
-- Os itens NÃO são copiados para o banco: a lista vem sempre da comanda
-- aprovada (production_orders.snapshot). Aqui só fica o andamento,
-- amarrado por uma CHAVE derivada do texto da linha (src/engine/
-- expedicao.ts → chaveItem). Consequência, de propósito: regerar a
-- comanda e mudar a receita/o item de uma linha perde a baixa daquela
-- linha — o que mudou precisa ser feito/conferido de novo.
--
-- Não depende de nada novo: usa papel(), is_admin() e pode_campo()
-- das migrations 0018/0030.
-- ============================================================

-- ------------------------------------------------------------
-- 1. PRODUÇÃO — item a item, por praça
-- ------------------------------------------------------------
create table if not exists public.producao_itens (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  dia            date not null,
  estacao        text not null check (estacao in ('confeitaria', 'fria', 'quente')),
  chave          text not null,
  rotulo         text not null default '',
  status         text not null default 'produzindo'
                 check (status in ('a_fazer', 'produzindo', 'pronto')),
  atualizado_por uuid references public.profiles (id),
  atualizado_em  timestamptz not null default now(),
  unique (event_id, dia, estacao, chave)
);

create index if not exists producao_itens_dia_idx on public.producao_itens (dia, estacao);

-- ------------------------------------------------------------
-- 2. EXPEDIÇÃO — conferência por setor
-- ------------------------------------------------------------
create table if not exists public.expedicao_checks (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  dia           date not null,
  setor         text not null check (setor in ('comidas', 'bebidas', 'estrutura')),
  chave         text not null,
  conferido_por uuid references public.profiles (id),
  conferido_em  timestamptz not null default now(),
  obs           text,
  unique (event_id, dia, setor, chave)
);

create index if not exists expedicao_checks_dia_idx on public.expedicao_checks (dia, event_id);

-- ------------------------------------------------------------
-- 3. RLS
--    ler: todo mundo logado (o admin e a rua acompanham a cozinha)
--    produção: admin + cozinha (producao, compras)
--    expedição: pode_campo() — expedição (cozinha) e rua
-- ------------------------------------------------------------
alter table public.producao_itens   enable row level security;
alter table public.expedicao_checks enable row level security;

drop policy if exists "producao_itens_select" on public.producao_itens;
drop policy if exists "producao_itens_insert" on public.producao_itens;
drop policy if exists "producao_itens_update" on public.producao_itens;
drop policy if exists "producao_itens_delete" on public.producao_itens;

create policy "producao_itens_select" on public.producao_itens for select to authenticated
  using (true);
-- quem mexeu é sempre quem está logado
create policy "producao_itens_insert" on public.producao_itens for insert to authenticated
  with check (
    public.papel() in ('admin', 'producao', 'compras')
    and atualizado_por = auth.uid()
  );
create policy "producao_itens_update" on public.producao_itens for update to authenticated
  using (public.papel() in ('admin', 'producao', 'compras'))
  with check (
    public.papel() in ('admin', 'producao', 'compras')
    and atualizado_por = auth.uid()
  );
create policy "producao_itens_delete" on public.producao_itens for delete to authenticated
  using (public.papel() in ('admin', 'producao', 'compras'));

drop policy if exists "expedicao_checks_select" on public.expedicao_checks;
drop policy if exists "expedicao_checks_insert" on public.expedicao_checks;
drop policy if exists "expedicao_checks_update" on public.expedicao_checks;
drop policy if exists "expedicao_checks_delete" on public.expedicao_checks;

create policy "expedicao_checks_select" on public.expedicao_checks for select to authenticated
  using (true);
-- conferir é assinar — conferido_por é sempre quem está logado
create policy "expedicao_checks_insert" on public.expedicao_checks for insert to authenticated
  with check (public.pode_campo() and conferido_por = auth.uid());
-- update (a obs, quando ganhar campo) também não troca a assinatura por outra pessoa
create policy "expedicao_checks_update" on public.expedicao_checks for update to authenticated
  using (public.pode_campo()) with check (public.pode_campo() and conferido_por = auth.uid());
create policy "expedicao_checks_delete" on public.expedicao_checks for delete to authenticated
  using (public.pode_campo());
