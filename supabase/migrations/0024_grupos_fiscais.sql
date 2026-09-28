-- ============================================================
-- SISTEMA PIEGGI — Migration 0024: grupos fiscais
--
-- Cadastrar NCM e alíquota em 140 itens do cardápio não é trabalho, é
-- desistência: ninguém mantém isso, e alíquota que muda obriga a
-- reeditar tudo. Agora existem POUCOS grupos fiscais ("Alimento
-- preparado", "Bebida", "Serviço de buffet") e cada item aponta para um.
-- Muda a alíquota? Um lugar só.
--
-- As colunas fiscais que a 0022 criou em `catalog_items` NÃO são
-- apagadas: viram exceção por item, para o caso raro de um produto com
-- NCM próprio. Quando o item tem grupo, o GRUPO manda.
-- ============================================================

create table if not exists public.tax_groups (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  descricao text,

  /** produto = NF-e · servico = NFS-e. É o que decide o split da nota. */
  classificacao_fiscal text not null default 'servico'
    check (classificacao_fiscal in ('produto', 'servico')),

  -- produto
  ncm               text,
  cest              text,
  cfop              text,
  origem_mercadoria text default '0',
  unidade_fiscal    text default 'UN',
  icms_pct   numeric(6,3),
  ipi_pct    numeric(6,3),
  pis_pct    numeric(6,3),
  cofins_pct numeric(6,3),

  -- serviço
  iss_pct            numeric(6,3),
  item_lista_servico text,

  ativo  boolean not null default true,
  ordem  int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.catalog_items
  add column if not exists tax_group_id uuid references public.tax_groups (id) on delete set null;

create index if not exists catalog_items_tax_group_idx
  on public.catalog_items (tax_group_id);

comment on column public.catalog_items.tax_group_id is
  'Grupo fiscal do item. Quando preenchido, o grupo manda sobre as colunas fiscais do próprio item (que ficam como exceção).';

-- ---------- RLS ----------
alter table public.tax_groups enable row level security;

drop policy if exists "tax_groups_select" on public.tax_groups;
drop policy if exists "tax_groups_write"  on public.tax_groups;

-- alíquota não é preço de venda: qualquer usuário pode ler sem problema,
-- e a tela de produção nem usa. Escrever é do financeiro e do admin.
create policy "tax_groups_select" on public.tax_groups
  for select to authenticated using (true);
create policy "tax_groups_write" on public.tax_groups
  for all to authenticated
  using (public.pode_ver_financeiro()) with check (public.pode_ver_financeiro());

-- ---------- ponto de partida ----------
-- Valores de alíquota ficam VAZIOS de propósito: preencher com número
-- chutado é pior do que deixar em branco — a nota sairia errada e
-- ninguém desconfiaria. A tela avisa o que falta.
insert into public.tax_groups (nome, descricao, classificacao_fiscal, ordem, unidade_fiscal)
values
  ('Serviço de buffet e eventos',
   'Padrão da casa: coffee break, coquetel, almoço, jantar — tudo que é servido como serviço.',
   'servico', 1, null),
  ('Alimento preparado',
   'Item alimentício vendido como mercadoria (kit, marmita, bolo fechado).',
   'produto', 2, 'UN'),
  ('Bebida',
   'Refrigerante em lata, água, cerveja — vendidos como produto.',
   'produto', 3, 'UN'),
  ('Material e estrutura',
   'Descartáveis, locação repassada e material que sai como produto.',
   'produto', 4, 'UN')
on conflict (nome) do nothing;

-- Todo item do cardápio nasce no grupo de serviço: é o que a casa faz na
-- esmagadora maioria dos casos. O financeiro move para produto o que for
-- exceção, em vez de classificar 140 itens do zero.
update public.catalog_items c
set tax_group_id = g.id
from public.tax_groups g
where g.nome = 'Serviço de buffet e eventos'
  and c.tax_group_id is null;
