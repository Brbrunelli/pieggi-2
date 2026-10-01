-- ============================================================
-- APLICAR — PARTE 2 de 2
--
-- Junta as migrations 0021 a 0027 num arquivo só, na ordem correta.
-- O editor do Supabase roda tudo numa transação: se qualquer parte
-- falhar, NADA é aplicado — não existe estado pela metade.
--
-- Pré-requisito: a PARTE 1 já ter dito "Success".
-- ============================================================

-- ############ 0021 — funil e contrato ############

-- ============================================================
-- SISTEMA PIEGGI — Migration 0021: funil completo + contrato
--
-- O funil volta a ser um Kanban de verdade (a 0017 tinha reduzido a
-- negociação → aprovado porque o funil morava no Pipedrive). Agora o
-- processo comercial inteiro vive aqui:
--
--   briefing → negociacao → contrato_enviado → aprovado → (perdido)
--
-- "aprovado" CONTINUA sendo o portão da operação — o nome não muda de
-- propósito: `operacaoLiberada()`, `ETAPA_FECHADO` e a FaseGuard seguem
-- valendo sem alteração. O que muda é COMO se chega nele: antes era o
-- aceite verbal do cliente; agora é o contrato assinado.
--
-- Nenhum evento existente se perde: quem está em 'negociacao' ou
-- 'aprovado' fica onde está.
-- ============================================================

-- ---------- 1. novas etapas do funil ----------
alter table public.events drop constraint if exists events_pipeline_check;
alter table public.pipeline_log drop constraint if exists pipeline_log_de_check;
alter table public.pipeline_log drop constraint if exists pipeline_log_para_check;

alter table public.events
  add constraint events_pipeline_check
  check (pipeline in ('briefing', 'negociacao', 'contrato_enviado', 'aprovado', 'perdido'));

comment on column public.events.pipeline is
  'Etapa do funil comercial: briefing → negociacao → contrato_enviado → aprovado (contrato assinado, libera a operação) → perdido.';

-- ---------- 2. papel do financeiro ----------
-- ATENÇÃO: só o ADD VALUE nesta migration. Usar o valor novo na mesma
-- transação em que ele é criado falha no Postgres — as funções que
-- comparam com 'financeiro' ficam na 0022.

-- ---------- 3. CONTRATO ----------
-- Uma linha por contrato do evento. O ciclo é o do DocuSign: o sistema
-- monta, envia para assinar, e o webhook devolve assinado — é a
-- assinatura que empurra o card para a operação, não o clique de alguém.
create table if not exists public.contracts (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events (id) on delete cascade,
  versao          int not null default 1,

  -- valor contratado (vem da proposta aprovada; fica registrado aqui
  -- porque a proposta pode ser reaberta depois e o contrato não muda)
  valor           numeric(12,2),
  /** condições, forma de pagamento, prazos — o que sai escrito no .docx */
  condicoes       jsonb not null default '{}'::jsonb,

  -- quem assina do lado do cliente
  signatario_nome  text,
  signatario_email text,
  signatario_doc   text,

  -- ciclo de vida
  status          text not null default 'rascunho'
                  check (status in ('rascunho', 'enviado', 'assinado', 'recusado', 'expirado', 'cancelado')),
  enviado_em      timestamptz,
  assinado_em     timestamptz,
  recusado_motivo text,

  -- DocuSign
  docusign_envelope_id text,
  docusign_status      text,
  /** último payload do webhook — para auditar o que o DocuSign disse */
  docusign_evento      jsonb,

  -- arquivos no bucket 'documentos'
  minuta_path     text,
  assinado_path   text,

  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists contracts_event_idx on public.contracts (event_id);
create unique index if not exists contracts_envelope_idx
  on public.contracts (docusign_envelope_id)
  where docusign_envelope_id is not null;

drop trigger if exists on_contract_update on public.contracts;
create trigger on_contract_update
  before update on public.contracts
  for each row execute function public.touch_updated_at();

-- ---------- 4. assinatura empurra o evento para a operação ----------
-- Fica no banco, e não no front, porque quem carimba "assinado" é o
-- webhook do DocuSign — não há tela aberta para reagir.
create or replace function public.contrato_assinado_libera_operacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'assinado' and (old.status is distinct from 'assinado') then
    update public.events
    set pipeline = 'aprovado',
        status   = case
                     when status in ('rascunho', 'proposta_em_montagem', 'proposta_enviada')
                       then 'proposta_aprovada'
                     else status
                   end
    where id = new.event_id;

    insert into public.pipeline_log (event_id, de, para, user_id, motivo)
    values (new.event_id, 'contrato_enviado', 'aprovado', new.created_by, 'Contrato assinado');
  end if;
  return new;
end;
$$;

drop trigger if exists on_contract_signed on public.contracts;
create trigger on_contract_signed
  after update on public.contracts
  for each row execute function public.contrato_assinado_libera_operacao();

-- ---------- 5. RLS ----------
alter table public.contracts enable row level security;

-- drop antes de criar: a migration precisa poder rodar de novo sem erro
drop policy if exists "contracts_select" on public.contracts;
drop policy if exists "contracts_insert" on public.contracts;
drop policy if exists "contracts_update" on public.contracts;
drop policy if exists "contracts_delete" on public.contracts;

-- o contrato carrega valor: mesmo critério da 0019
create policy "contracts_select" on public.contracts
  for select to authenticated using (public.pode_ver_valores());
create policy "contracts_insert" on public.contracts
  for insert to authenticated with check (public.pode_ver_valores());
create policy "contracts_update" on public.contracts
  for update to authenticated
  using (public.pode_ver_valores()) with check (public.pode_ver_valores());
create policy "contracts_delete" on public.contracts
  for delete to authenticated using (public.is_admin());



-- ############ 0022_financeiro_nf ############

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



-- ############ 0023_cs_cadencia ############

-- ============================================================
-- SISTEMA PIEGGI — Migration 0023: cadência de CS
--
-- Duas cadências, dentro do comercial:
--   PRÉ  — cliente que fechou com antecedência não pode ficar no silêncio
--          até a véspera. Só entra na fila quem assinou com folga
--          (`min_antecedencia_dias`), senão vira spam em cima do evento.
--   PÓS  — perguntar como foi a experiência, por WhatsApp e e-mail.
--
-- DESENHO: a fila NÃO é uma tabela. Ela é derivada de
-- (eventos aprovados × templates ativos × data do evento) e o banco só
-- guarda o que JÁ foi enviado ou dispensado (`cs_envios`). Fila
-- materializada envelheceria sozinha: evento que muda de data deixaria
-- tarefa órfã apontando para o dia errado.
-- ============================================================

-- ---------- 1. quem cuida do CS ----------
create or replace function public.pode_comercial()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'comercial');
$$;

-- ---------- 2. templates da cadência ----------
create table if not exists public.cs_templates (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  canal     text not null check (canal in ('whatsapp', 'email')),
  momento   text not null check (momento in ('pre', 'pos')),
  /** dias em relação ao 1º dia do evento: negativo = antes, positivo = depois */
  dias      int not null,
  /**
   * Só para a cadência PRÉ: quantos dias de folga entre a assinatura e o
   * evento para valer a pena aquecer o cliente. 0 = sempre.
   */
  min_antecedencia_dias int not null default 0,
  assunto   text,
  /** aceita {{cliente}} {{evento}} {{contato}} {{data}} {{pax}} {{local}} */
  corpo     text not null,
  ativo     boolean not null default true,
  ordem     int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cs_templates_ativo_idx on public.cs_templates (ativo, momento, dias);

-- ---------- 3. log do que foi enviado ----------
-- A presença da linha é o "já tratei". Sem update: quem enviou e quando
-- é histórico de relacionamento, não campo editável.
create table if not exists public.cs_envios (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  template_id  uuid not null references public.cs_templates (id) on delete cascade,
  canal        text not null check (canal in ('whatsapp', 'email')),
  status       text not null default 'enviado' check (status in ('enviado', 'dispensado')),
  destinatario text,
  /** a mensagem como foi realmente enviada, já com os dados trocados */
  mensagem     text,
  enviado_em   timestamptz not null default now(),
  enviado_por  uuid references public.profiles (id),
  unique (event_id, template_id)
);

create index if not exists cs_envios_event_idx on public.cs_envios (event_id);

-- ---------- 4. contato do cliente (a cadência precisa para onde mandar) ----------
alter table public.clients
  add column if not exists telefone text,
  add column if not exists email    text;

alter table public.events
  add column if not exists contato_telefone text,
  add column if not exists contato_email    text;

comment on column public.events.contato_telefone is
  'Telefone de quem contratou este evento. Tem prioridade sobre o do cadastro do cliente: é a pessoa do evento que responde a pesquisa, não a empresa.';

-- ---------- 5. RLS ----------
alter table public.cs_templates enable row level security;
alter table public.cs_envios    enable row level security;

-- drop antes de criar: a migration precisa poder rodar de novo sem erro
drop policy if exists "cs_templates_select" on public.cs_templates;
drop policy if exists "cs_templates_write"  on public.cs_templates;
drop policy if exists "cs_envios_select"    on public.cs_envios;
drop policy if exists "cs_envios_insert"    on public.cs_envios;
drop policy if exists "cs_envios_delete"    on public.cs_envios;

create policy "cs_templates_select" on public.cs_templates
  for select to authenticated using (public.pode_comercial());
create policy "cs_templates_write" on public.cs_templates
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "cs_envios_select" on public.cs_envios
  for select to authenticated using (public.pode_comercial());
create policy "cs_envios_insert" on public.cs_envios
  for insert to authenticated
  with check (public.pode_comercial() and enviado_por = auth.uid());
create policy "cs_envios_delete" on public.cs_envios
  for delete to authenticated using (public.pode_comercial());

-- ---------- 6. cadência inicial ----------
-- Ponto de partida editável em Administração → Cadência de CS.
insert into public.cs_templates (nome, canal, momento, dias, min_antecedencia_dias, assunto, corpo, ordem)
values
  (
    'Pré · confirmação com folga', 'whatsapp', 'pre', -15, 30, null,
    'Oi {{contato}}, tudo bem? Aqui é da Pieggi. Passando para dizer que o {{evento}} do dia {{data}} já está na nossa agenda e caminhando bem. Qualquer ajuste de cardápio ou número de pessoas, temos tempo de sobra para acomodar — só me avisar.',
    1
  ),
  (
    'Pré · alinhamento final', 'email', 'pre', -5, 0,
    'Seu evento na Pieggi está chegando — {{evento}}',
    'Olá {{contato}},' || chr(10) || chr(10) ||
    'O {{evento}} acontece em {{data}}, para {{pax}} pessoas, em {{local}}.' || chr(10) || chr(10) ||
    'Nesta semana fechamos a produção. Se houver qualquer mudança de número de pessoas, restrição alimentar ou horário, este é o melhor momento para nos contar.' || chr(10) || chr(10) ||
    'Qualquer coisa, estamos à disposição.' || chr(10) ||
    'Equipe Pieggi Catering, Coffee & Eventos',
    2
  ),
  (
    'Pós · como foi', 'whatsapp', 'pos', 1, 0, null,
    'Oi {{contato}}! Como foi o {{evento}} ontem? Queria muito saber a sua impressão e a do time — o que funcionou bem e o que a gente pode fazer melhor na próxima. Sua resposta vai direto para a nossa cozinha.',
    3
  ),
  (
    'Pós · pesquisa de experiência', 'email', 'pos', 3,  0,
    'Como foi a sua experiência com a Pieggi?',
    'Olá {{contato}},' || chr(10) || chr(10) ||
    'Obrigado por confiar na Pieggi para o {{evento}}, no dia {{data}}.' || chr(10) || chr(10) ||
    'Em uma escala de 0 a 10, o quanto você recomendaria a Pieggi para outra área da {{cliente}}?' || chr(10) || chr(10) ||
    'E, se puder, conte em uma linha o que mais e o que menos agradou. Lemos todas as respostas.' || chr(10) || chr(10) ||
    'Equipe Pieggi Catering, Coffee & Eventos',
    4
  )
on conflict do nothing;



-- ############ 0024_grupos_fiscais ############

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



-- ############ 0025_funil_temperatura ############

-- ============================================================
-- SISTEMA PIEGGI — Migration 0025: temperatura no funil
--
-- O funil comercial volta a ter temperatura:
--
--   Frio → Morno → Quente → Contrato para assinar → Contrato assinado
--                                                    + (Perdido)
--
-- `aprovado` (= contrato assinado) continua com o mesmo nome: é o portão
-- que a FaseGuard, a fila da operação, o financeiro e o CS já consultam.
--
-- Ninguém se perde no caminho:
--   briefing   → frio   (era onde o negócio nascia)
--   negociacao → morno  (já houve conversa, ainda não esquentou)
-- ============================================================

alter table public.events drop constraint if exists events_pipeline_check;
alter table public.pipeline_log drop constraint if exists pipeline_log_de_check;
alter table public.pipeline_log drop constraint if exists pipeline_log_para_check;

update public.events
set pipeline = case
      when pipeline = 'briefing'   then 'frio'
      when pipeline = 'negociacao' then 'morno'
      else pipeline
    end
where pipeline in ('briefing', 'negociacao');

update public.pipeline_log
set de = case when de in ('briefing') then 'frio'
              when de in ('negociacao') then 'morno'
              else de end,
    para = case when para in ('briefing') then 'frio'
                when para in ('negociacao') then 'morno'
                else para end;

alter table public.events
  alter column pipeline set default 'frio';

alter table public.events
  add constraint events_pipeline_check
  check (pipeline in ('frio', 'morno', 'quente', 'contrato_enviado', 'aprovado', 'perdido'));

comment on column public.events.pipeline is
  'Etapa do funil: frio → morno → quente → contrato_enviado → aprovado (contrato assinado, libera a operação) → perdido.';



-- ############ 0026_cs_nps ############

-- ============================================================
-- SISTEMA PIEGGI — Migration 0026: resposta e NPS do cliente
--
-- Até aqui o CS só sabia o que a casa MANDOU. Faltava a metade que
-- importa: o cliente respondeu? deu quantos? o que disse?
--
-- A resposta fica na própria linha do envio (`cs_envios`), não numa
-- tabela nova, porque resposta sem pergunta não existe — é sempre "a
-- resposta daquele contato". Assim a linha do tempo do cliente sai em
-- ordem sem juntar duas tabelas.
-- ============================================================

alter table public.cs_envios
  add column if not exists respondido_em timestamptz,
  /** 0 a 10 — a pergunta de recomendação. null = não respondeu (ou não perguntou) */
  add column if not exists nps int check (nps is null or (nps >= 0 and nps <= 10)),
  add column if not exists resposta text;

comment on column public.cs_envios.nps is
  'Nota 0–10 de recomendação. Promotor 9–10 · neutro 7–8 · detrator 0–6.';

create index if not exists cs_envios_nps_idx
  on public.cs_envios (nps) where nps is not null;

-- Registrar resposta é editar o envio: precisa de UPDATE, que a 0023
-- não tinha dado (lá o envio era só histórico imutável).
drop policy if exists "cs_envios_update" on public.cs_envios;
create policy "cs_envios_update" on public.cs_envios
  for update to authenticated
  using (public.pode_comercial()) with check (public.pode_comercial());

-- ------------------------------------------------------------
-- Contato avulso: "liguei para o cliente" não vem de template nenhum.
-- Sem isso a linha do tempo mentiria por omissão — mostraria só o que o
-- sistema mandou, e não a conversa real.
-- ------------------------------------------------------------
alter table public.cs_envios
  alter column template_id drop not null;

alter table public.cs_envios
  add column if not exists titulo text;

comment on column public.cs_envios.titulo is
  'Rótulo do contato quando não vem de template (ligação, reunião, visita). Para contato de cadência, o nome sai do template.';

-- A restrição de unicidade impedia dois contatos avulsos no mesmo
-- evento (ambos com template_id nulo). Passa a valer só para cadência.
alter table public.cs_envios drop constraint if exists cs_envios_event_id_template_id_key;
create unique index if not exists cs_envios_cadencia_unica
  on public.cs_envios (event_id, template_id)
  where template_id is not null;



-- ############ 0027_travas_producao ############

-- ============================================================
-- SISTEMA PIEGGI — Migration 0027: travas antes de abrir para o time
--
-- A 0001 liberou insert/update/delete das tabelas operacionais para
-- QUALQUER usuário autenticado, porque na época só o Bruno usava. Antes
-- de entregar login para a cozinha, isso precisa fechar: hoje um usuário
-- de produção consegue APAGAR qualquer evento chamando a API direto — o
-- botão está escondido na tela, e esconder botão não protege dado.
--
-- O que muda:
--   events           → apagar é só ADMIN (evento apagado leva serviços,
--                      programação, produção e contrato com ele)
--   event_services   → mexer é do comercial e do admin
--   service_items    → idem (é o cardápio da proposta)
--   special_requests → idem (é registro de combinado com o cliente)
--
-- Ninguém perde LEITURA: a cozinha continua vendo tudo que precisa.
-- ============================================================

-- ------------------------------------------------------------
-- events: cozinha e financeiro não criam nem apagam evento.
-- O UPDATE segue no comercial + admin porque é ele que move o funil, e a
-- esteira (status) é mexida pelo admin.
-- ------------------------------------------------------------
drop policy if exists "events_insert" on public.events;
drop policy if exists "events_update" on public.events;
drop policy if exists "events_delete" on public.events;

create policy "events_insert" on public.events
  for insert to authenticated with check (public.pode_comercial());
create policy "events_update" on public.events
  for update to authenticated
  using (public.pode_comercial()) with check (public.pode_comercial());
create policy "events_delete" on public.events
  for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- event_services / service_items / special_requests
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['event_services', 'service_items', 'special_requests']
  loop
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s', t);

    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (public.pode_comercial())', t);
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated
         using (public.pode_comercial()) with check (public.pode_comercial())', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$s for delete to authenticated
         using (public.pode_comercial())', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- LEMBRETE do que continua aberto de propósito
--
-- documents  — quem gera um .docx/PDF registra o arquivo. Fechar aqui
--              quebraria a geração feita pelo admin sem ganhar nada: o
--              bucket 'documentos' já exige usuário autenticado.
-- station_progress — a cozinha PRECISA escrever: é a baixa dela. Já está
--              restrita a admin + equipe na 0018, com pronto_por = auth.uid().
-- ------------------------------------------------------------

-- Conferência: liste as políticas de escrita que sobraram abertas.
-- O resultado esperado é VAZIO fora de documents/approvals/pipeline_log.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
  and (qual = 'true' or with_check = 'true')
order by tablename, policyname;


select 'Parte 2 aplicada com sucesso.' as resultado;
