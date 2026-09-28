-- ============================================================
-- SISTEMA PIEGGI — Migration 0022: módulo financeiro e nota fiscal
--
-- Quando o evento fecha, ele cai para o financeiro emitir a NF. Duas
-- exigências da casa moldam o desenho:
--
--   1. Uma NF pode somar VÁRIOS eventos (por isso `invoice_events`, e
--      não um campo event_id na nota).
--   2. Toda nota se divide entre PRODUTO e SERVIÇO — é a única pergunta
--      que o financeiro faz. O rateio fica por evento, para o contas a
--      receber e o relatório saberem de onde veio cada parte.
--
-- Emissão via PlugNotas: o sistema monta a nota, a Edge Function
-- `nota-fiscal` transmite, e o retorno (número, PDF, XML) volta para cá.
-- ============================================================

-- ---------- 1. quem enxerga dinheiro da empresa ----------
-- Preço de venda (0019) e caixa da empresa são coisas diferentes: o
-- comercial precisa de preço para vender, mas NF e contas a receber são
-- do financeiro e do admin.
create or replace function public.pode_ver_financeiro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'financeiro');
$$;

-- O financeiro também precisa VER preço de venda: sem isso não confere a
-- nota contra o contrato nem monta o rateio produto/serviço. Amplia a
-- função da 0019 (que era só admin + comercial).
create or replace function public.pode_ver_valores()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'comercial', 'financeiro');
$$;

-- ---------- 2. dados fiscais da empresa (linha única) ----------
create table if not exists public.fiscal_config (
  id                   int primary key default 1 check (id = 1),
  razao_social         text,
  cnpj                 text,
  inscricao_municipal  text,
  inscricao_estadual   text,
  regime_tributario    text default 'simples_nacional'
                       check (regime_tributario in ('simples_nacional', 'lucro_presumido', 'lucro_real')),
  endereco             text,
  municipio            text default 'São Paulo',
  uf                   text default 'SP',
  cep                  text,

  -- serviço (NFS-e)
  item_lista_servico   text,
  codigo_tributario_municipio text,
  cnae                 text,
  iss_pct              numeric(6,3) default 0,
  iss_retido           boolean not null default false,

  -- produto (NF-e)
  cfop_padrao          text default '5102',
  ncm_padrao           text,

  -- PlugNotas
  plugnotas_ambiente   text not null default 'homologacao'
                       check (plugnotas_ambiente in ('homologacao', 'producao')),
  /** o cadastro da empresa no PlugNotas devolve um id — guardamos para reusar */
  plugnotas_empresa_id text,

  atualizado_em        timestamptz not null default now()
);

insert into public.fiscal_config (id) values (1) on conflict (id) do nothing;

comment on table public.fiscal_config is
  'Dados fiscais da Pieggi. Linha única (id=1) — é a empresa emitente, não um cadastro com várias linhas.';

-- ---------- 3. impostos POR PRODUTO ----------
-- Ficam no próprio item do catálogo: é o produto que tem NCM e alíquota,
-- não o evento. Assim a nota se monta a partir do que foi vendido.
alter table public.catalog_items
  add column if not exists classificacao_fiscal text not null default 'servico'
    check (classificacao_fiscal in ('produto', 'servico')),
  add column if not exists ncm             text,
  add column if not exists cest            text,
  add column if not exists cfop            text,
  add column if not exists origem_mercadoria text default '0',
  add column if not exists unidade_fiscal  text default 'UN',
  add column if not exists icms_pct        numeric(6,3),
  add column if not exists ipi_pct         numeric(6,3),
  add column if not exists pis_pct         numeric(6,3),
  add column if not exists cofins_pct      numeric(6,3),
  add column if not exists iss_pct         numeric(6,3),
  add column if not exists item_lista_servico text;

comment on column public.catalog_items.classificacao_fiscal is
  'produto = entra na parte de NF-e da nota; servico = entra na NFS-e. É o que decide o split produto/serviço.';

-- ---------- 4. NOTA FISCAL ----------
create table if not exists public.invoices (
  id            uuid primary key default gen_random_uuid(),

  -- destinatário: cliente cadastrado ou avulso (evento de cliente novo)
  client_id     uuid references public.clients (id),
  destinatario_nome  text not null,
  destinatario_doc   text,
  destinatario_email text,
  destinatario_endereco text,

  tipo          text not null default 'servico'
                check (tipo in ('servico', 'produto', 'mista')),

  -- o split que o financeiro decide
  valor_produto numeric(12,2) not null default 0,
  valor_servico numeric(12,2) not null default 0,
  valor_total   numeric(12,2) generated always as (valor_produto + valor_servico) stored,
  /** memória de cálculo dos impostos no momento da emissão */
  impostos      jsonb not null default '{}'::jsonb,

  competencia   date,
  observacoes   text,

  status        text not null default 'rascunho'
                check (status in ('rascunho', 'transmitindo', 'emitida', 'erro', 'cancelada')),
  -- retorno do PlugNotas
  plugnotas_id  text,
  numero        text,
  serie         text,
  emitida_em    timestamptz,
  pdf_url       text,
  xml_url       text,
  erro_msg      text,
  cancelada_em     timestamptz,
  cancelada_motivo text,

  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists invoices_status_idx on public.invoices (status, created_at desc);
create index if not exists invoices_client_idx on public.invoices (client_id);
create unique index if not exists invoices_plugnotas_idx
  on public.invoices (plugnotas_id) where plugnotas_id is not null;

drop trigger if exists on_invoice_update on public.invoices;
create trigger on_invoice_update
  before update on public.invoices
  for each row execute function public.touch_updated_at();

-- ---------- 5. eventos dentro da nota (N:N) ----------
-- É isto que permite "somar vários eventos para sair uma NF só", com o
-- rateio guardado por evento.
create table if not exists public.invoice_events (
  invoice_id    uuid not null references public.invoices (id) on delete cascade,
  event_id      uuid not null references public.events (id) on delete restrict,
  valor_produto numeric(12,2) not null default 0,
  valor_servico numeric(12,2) not null default 0,
  primary key (invoice_id, event_id)
);

create index if not exists invoice_events_event_idx on public.invoice_events (event_id);

-- ---------- 6. CONTAS A RECEBER ----------
-- Uma parcela = uma linha. Pode nascer de uma nota ou direto do evento
-- (entrada paga antes de emitir nota é comum na casa).
create table if not exists public.receivables (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid references public.invoices (id) on delete set null,
  event_id      uuid references public.events (id) on delete set null,
  client_id     uuid references public.clients (id),
  descricao     text not null,
  parcela       int not null default 1,
  parcelas      int not null default 1,
  valor         numeric(12,2) not null,
  vencimento    date not null,
  forma_pagamento text,
  valor_pago    numeric(12,2),
  pago_em       date,
  status        text not null default 'a_receber'
                check (status in ('a_receber', 'recebido', 'cancelado')),
  obs           text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists receivables_venc_idx on public.receivables (status, vencimento);
create index if not exists receivables_event_idx on public.receivables (event_id);

drop trigger if exists on_receivable_update on public.receivables;
create trigger on_receivable_update
  before update on public.receivables
  for each row execute function public.touch_updated_at();

-- "atrasado" não é status guardado: é vencimento no passado e ainda a
-- receber. Guardar viraria dado que envelhece sozinho e mente.
create or replace view public.receivables_abertos as
  select r.*,
         (r.status = 'a_receber' and r.vencimento < current_date) as atrasado,
         (r.vencimento - current_date)                            as dias_ate_vencer
  from public.receivables r
  where r.status <> 'cancelado';

-- ---------- 7. RLS ----------
alter table public.fiscal_config  enable row level security;
alter table public.invoices       enable row level security;
alter table public.invoice_events enable row level security;
alter table public.receivables    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['fiscal_config', 'invoices', 'invoice_events', 'receivables']
  loop
    -- drop antes de criar: a migration precisa poder rodar de novo sem erro
    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s', t);

    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated
         using (public.pode_ver_financeiro())', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (public.pode_ver_financeiro())', t);
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated
         using (public.pode_ver_financeiro()) with check (public.pode_ver_financeiro())', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$s for delete to authenticated
         using (public.is_admin())', t);
  end loop;
end $$;
