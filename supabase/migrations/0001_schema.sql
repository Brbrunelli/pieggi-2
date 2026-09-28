-- ============================================================
-- SISTEMA PIEGGI — Migration 0001: Schema
-- Esteira: Proposta > Programação > Comandas > Plaquinhas > Compras
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
create type public.user_role as enum ('admin', 'comercial', 'producao', 'compras');

create type public.client_kind as enum ('startse', 'inteli', 'wtc', 'externo');

create type public.price_table_kind as enum (
  'startse_atual', 'startse_negociacao', 'externos', 'wtc'
);

create type public.event_status as enum (
  'rascunho',
  'proposta_em_montagem',
  'proposta_aprovada',
  'programacao_em_montagem',
  'programacao_aprovada',
  'comandas_geradas',
  'plaquinhas_geradas',
  'compras_consolidadas',
  'concluido',
  'cancelado'
);

create type public.service_type as enum (
  'welcome_coffee', 'coffee_break', 'auditorio', 'brunch',
  'coquetel', 'bar', 'almoco', 'jantar', 'coquetel_pizza', 'kit'
);

create type public.service_line as enum (
  'basic', 'standard', 'executive', 'master', 'premium', 'pizza', 'cortesia'
);

create type public.day_period as enum ('manha', 'tarde', 'noite');

-- Estação de produção / roteamento (Comandas)
create type public.station as enum (
  'cozinha_quente', 'cozinha_fria', 'confeitaria',
  'expedicao_alimentacao', 'expedicao_bebidas', 'fornecedor', 'congelado'
);

create type public.diet_seal as enum (
  'vegetariano', 'vegano', 'sem_gluten', 'sem_lactose', 'sem_acucar'
);

create type public.doc_kind as enum (
  'proposta_pptx', 'programacao_docx', 'comanda_docx',
  'plaquinha_pdf', 'compras_xlsx', 'outro'
);

-- ------------------------------------------------------------
-- PROFILES (usuários — Supabase Auth e-mail/senha)
-- ------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text not null default '',
  email      text,
  role       public.user_role not null default 'comercial',
  ativo      boolean not null default true,
  created_at timestamptz not null default now()
);

-- Cria o profile automaticamente ao registrar usuário no Auth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nome', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper de autorização (security definer evita recursão de RLS)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and ativo
  );
$$;

-- ------------------------------------------------------------
-- DADOS MESTRES
-- ------------------------------------------------------------

-- Clientes (StartSe / Inteli / WTC / Externos) com regras específicas
create table public.clients (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null,
  tipo                  public.client_kind not null default 'externo',
  endereco              text,
  endereco_fixo         boolean not null default false,
  marca_agua            text not null default 'qualquer',
  marca_refri           text not null default 'Coca-Cola',
  marca_cerveja         text not null default 'Heineken',
  isento_logistica      boolean not null default false,
  isento_taxa_servico   boolean not null default false,
  -- regras específicas do cliente, ex.:
  -- {"reposicao_fator": 1.6, "cortesia_restricao_pax": 10,
  --  "pao_queijo_split": {"tradicional":0.3,"multigraos":0.3,"croissant":0.4},
  --  "ponto_fixo": true, "nao_enviar": ["kit_limpeza","uniforme","transformador"]}
  regras                jsonb not null default '{}'::jsonb,
  ativo                 boolean not null default true,
  created_at            timestamptz not null default now()
);

-- Tabelas de preço (4 tipos, versionáveis)
create table public.price_tables (
  id         uuid primary key default gen_random_uuid(),
  kind       public.price_table_kind not null,
  nome       text not null,
  vigente    boolean not null default true,
  versao     int not null default 1,
  obs        text,
  created_at timestamptz not null default now()
);

create table public.price_items (
  id             uuid primary key default gen_random_uuid(),
  price_table_id uuid not null references public.price_tables (id) on delete cascade,
  service_type   public.service_type not null,
  service_line   public.service_line,
  -- variante: ex. '4h', '8h', 'sem_cerveja', 'lata', 'long_neck'
  variante       text not null default '',
  preco_pax      numeric(10,2) not null,
  obs            text,
  unique (price_table_id, service_type, service_line, variante)
);

-- Catálogo oficial (cardápio MAIO2026) — fonte única de verdade dos itens
create table public.catalog_items (
  id            uuid primary key default gen_random_uuid(),
  -- categoria livre: mini_lanche, bebezinho, verrine, shot_funcional, shot_vitaminado,
  -- petit_four_salgado, petit_four_doce, tramezzino, croissant, barquete, tartelete,
  -- canape, quiche, pasta_board, pao_de_queijo, bolo, wrap, tapioca, bebida, dip,
  -- proteina, massa, molho, acompanhamento, salada, sobremesa, salgado_festa, pizza...
  categoria     text not null,
  nome          text not null,
  descricao     text,
  -- base do sabor p/ regra "nunca repetir a base no mesmo dia" (chocolate, frango, limao...)
  base_sabor    text,
  tier_minimo   public.service_line,          -- null = qualquer linha
  servicos      public.service_type[] not null default '{}',  -- onde pode aparecer
  periodos      public.day_period[] not null default '{}',    -- vazio = qualquer período
  selo          public.diet_seal,             -- null = sem selo (contém carne/peixe)
  nome_en       text,
  nome_es       text,
  proibido      boolean not null default false,     -- atum, wrap de abacate, red velvet
  descontinuado boolean not null default false,
  estacao       public.station,               -- roteamento de produção (Comandas)
  -- fornecedor: null = produção interna | 'leticia' | 'leal' | 'arosa' | 'mercado'
  --            | 'luigi' | 'rotisseria' | 'cpl'
  fornecedor    text,
  -- ficha p/ lista de compras, ex.:
  -- {"principal": "peito de peru", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}
  ficha_compra  jsonb not null default '{}'::jsonb,
  ativo         boolean not null default true,
  obs           text,
  created_at    timestamptz not null default now()
);

create index idx_catalog_categoria on public.catalog_items (categoria);

-- Parâmetros de regra (fatores, gramaturas, %) — editáveis no admin, com histórico
create table public.rule_params (
  chave      text primary key,
  valor      jsonb not null,
  descricao  text,
  categoria  text not null default 'geral',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create table public.rule_params_history (
  id         bigint generated always as identity primary key,
  chave      text not null,
  valor      jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid
);

create or replace function public.log_rule_param_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.rule_params_history (chave, valor, changed_by)
  values (old.chave, old.valor, auth.uid());
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger on_rule_param_update
  before update on public.rule_params
  for each row execute function public.log_rule_param_change();

-- Glossário de traduções (Plaquinhas — PT/EN/ES)
create table public.term_translations (
  id   uuid primary key default gen_random_uuid(),
  pt   text not null unique,
  en   text not null,
  es   text not null,
  tipo text not null default 'categoria'  -- 'categoria' | 'sabor'
);

-- ------------------------------------------------------------
-- EVENTOS (objeto central da esteira)
-- ------------------------------------------------------------
create table public.events (
  id                  uuid primary key default gen_random_uuid(),
  client_id           uuid references public.clients (id),
  nome                text not null,
  contato             text,
  price_table_id      uuid references public.price_tables (id),
  status              public.event_status not null default 'rascunho',
  pax                 int check (pax is null or pax > 0),
  endereco            text,
  endereco_confirmado boolean not null default false,
  local_detalhe       text,   -- andar / sala / auditório / torre / bloco
  -- [{"tipo": "camarao", "pax": 3, "critico": true}, {"tipo": "lactose", "pax": 1}]
  restricoes          jsonb not null default '[]'::jsonb,
  -- valor do orçamento p/ verba 8% — NUNCA exibido em documento
  orcamento_valor     numeric(12,2),
  obs                 text,
  created_by          uuid references public.profiles (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger on_event_update
  before update on public.events
  for each row execute function public.touch_updated_at();

-- Serviços do evento (um por tipo/dia/período)
create table public.event_services (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  service_type     public.service_type not null,
  service_line     public.service_line,
  dia              date not null,
  periodo          public.day_period,
  hora_inicio      time,
  hora_fim         time,
  -- % de reposição aplicada (preço E quantidade) — calculada pelo engine
  reposicao_pct    numeric(6,2) not null default 0,
  -- regra "cardápio interno": nome real Pieggi quando difere do vendido
  cardapio_interno text,
  obs              text,
  ordem            int not null default 0
);

create index idx_event_services_event on public.event_services (event_id);

-- Itens de cada serviço (cardápio montado + quantidades)
create table public.service_items (
  id                  uuid primary key default gen_random_uuid(),
  event_service_id    uuid not null references public.event_services (id) on delete cascade,
  catalog_item_id     uuid references public.catalog_items (id),
  descricao_livre     text,   -- item fora do catálogo (vai p/ "A classificar")
  quantidade          numeric(12,3),
  unidade             text not null default 'un',   -- un | g | kg | ml | l | pacote
  quantidade_override numeric(12,3),
  override_motivo     text,
  -- memória de cálculo do engine (auditável), ex.:
  -- {"formula": "pax*1.1*(1+reposicao)", "pax": 50, "fator": 1.1, "reposicao": 0.3}
  calculo             jsonb not null default '{}'::jsonb,
  ordem               int not null default 0
);

create index idx_service_items_service on public.service_items (event_service_id);

-- ------------------------------------------------------------
-- ARTEFATOS POR FASE
-- ------------------------------------------------------------

-- Fase 1: Proposta comercial (.pptx)
create table public.proposals (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  versao        int not null default 1,
  desconto_pct  numeric(5,2) not null default 0,
  cmv_status    text,           -- 'ok' | 'alerta' | 'bloqueado'
  preco_total   numeric(12,2),
  dados         jsonb not null default '{}'::jsonb,  -- snapshot do cálculo
  arquivo_path  text,
  aprovado_por  uuid references public.profiles (id),
  aprovado_em   timestamptz,
  created_at    timestamptz not null default now()
);

-- Fase 2: Programação operacional (.docx)
create table public.schedules (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  versao       int not null default 1,
  snapshot     jsonb not null default '{}'::jsonb,   -- tabelas por serviço
  arquivo_path text,
  aprovado_por uuid references public.profiles (id),
  aprovado_em  timestamptz,
  created_at   timestamptz not null default now()
);

-- Fase 3: Comandas de produção (.docx — 6 comandas)
create table public.production_orders (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  versao       int not null default 1,
  verba        numeric(12,2),   -- 8% do orçamento — só a verba, nunca o total
  snapshot     jsonb not null default '{}'::jsonb,   -- roteamento + conversões + estrutura
  arquivo_path text,
  aprovado_por uuid references public.profiles (id),
  aprovado_em  timestamptz,
  created_at   timestamptz not null default now()
);

-- Fase 4: Plaquinhas (.pdf)
create table public.signage_sets (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  versao       int not null default 1,
  -- cards: [{"titulo","subtitulo","en","es","selo","dia","grupo"}]
  cards        jsonb not null default '[]'::jsonb,
  arquivo_path text,
  aprovado_por uuid references public.profiles (id),
  aprovado_em  timestamptz,
  created_at   timestamptz not null default now()
);

-- Fase 5: Lista de compras (multi-evento, filtro de datas)
create table public.purchase_lists (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  data_inicio  date,
  data_fim     date,
  event_ids    uuid[] not null default '{}',
  snapshot     jsonb not null default '{}'::jsonb,   -- seções 1–18 consolidadas
  arquivo_path text,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

-- Aprovações (o "OK explícito" de cada fase)
create table public.approvals (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events (id) on delete cascade,
  fase       text not null,   -- 'proposta' | 'programacao' | 'comandas' | 'plaquinhas' | 'compras'
  user_id    uuid references public.profiles (id),
  obs        text,
  created_at timestamptz not null default now()
);

-- Documentos gerados (Storage)
create table public.documents (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid references public.events (id) on delete cascade,
  tipo         public.doc_kind not null default 'outro',
  nome_arquivo text not null,
  storage_path text not null,
  versao       int not null default 1,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.clients             enable row level security;
alter table public.price_tables        enable row level security;
alter table public.price_items         enable row level security;
alter table public.catalog_items       enable row level security;
alter table public.rule_params         enable row level security;
alter table public.rule_params_history enable row level security;
alter table public.term_translations   enable row level security;
alter table public.events              enable row level security;
alter table public.event_services      enable row level security;
alter table public.service_items       enable row level security;
alter table public.proposals           enable row level security;
alter table public.schedules           enable row level security;
alter table public.production_orders   enable row level security;
alter table public.signage_sets        enable row level security;
alter table public.purchase_lists      enable row level security;
alter table public.approvals           enable row level security;
alter table public.documents           enable row level security;

-- profiles: todos leem; o próprio usuário edita o nome; admin gerencia
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "profiles_admin_all" on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Dados mestres: todos leem; só admin escreve
do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'price_tables', 'price_items', 'catalog_items',
    'rule_params', 'term_translations'
  ]
  loop
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated using (true)', t);
    execute format(
      'create policy "%1$s_admin_write" on public.%1$s for insert to authenticated with check (public.is_admin())', t);
    execute format(
      'create policy "%1$s_admin_update" on public.%1$s for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format(
      'create policy "%1$s_admin_delete" on public.%1$s for delete to authenticated using (public.is_admin())', t);
  end loop;
end $$;

create policy "rule_history_select" on public.rule_params_history
  for select to authenticated using (true);

-- Tabelas operacionais: qualquer usuário autenticado ativo lê e escreve
do $$
declare
  t text;
begin
  foreach t in array array[
    'events', 'event_services', 'service_items', 'proposals', 'schedules',
    'production_orders', 'signage_sets', 'purchase_lists', 'approvals', 'documents'
  ]
  loop
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated using (true)', t);
    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated with check (true)', t);
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated using (true) with check (true)', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$s for delete to authenticated using (true)', t);
  end loop;
end $$;
