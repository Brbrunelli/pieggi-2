-- ============================================================
-- APLICAR — PARTE 4 de 8
--
-- Migrations 0028 (o contrato tranca o caixa) e 0030 (a rua).
-- Rode SÓ DEPOIS da Parte 3. Pode rodar de novo sem erro.
-- ============================================================

-- ============================================================
-- SISTEMA PIEGGI — Migration 0028: o contrato tranca o caixa
--
-- A dor nº 1 da call de 30/09: boleto e NF saindo ANTES do contrato
-- assinado → cliente desiste, nota é cancelada e a taxa fica perdida.
--
-- Até aqui a trava existia só na TELA: a fila de Notas listava apenas
-- eventos em 'aprovado', mas o banco aceitava nota e título de qualquer
-- evento. Esconder botão não protege dado — esta migration põe a regra
-- no banco:
--
--   1. evento sem contrato assinado não entra em nota (invoice_events)
--   2. nota não transmite se algum evento dela perdeu o contrato
--   3. título a receber ligado a evento exige contrato assinado
--   4. contrato assinado que é cancelado DEPOIS fecha o portão de novo
--
-- Exceção: o ADMIN passa (sinal antecipado combinado é decisão do dono,
-- não da tela). A Edge Function usa service_role e também passa — quem
-- decide a regra é o usuário que montou a nota, não o transmissor.
-- ============================================================

-- ---------- correção da 0021 ----------
-- O trigger de assinatura (0021) grava `pipeline_log.motivo`, mas a
-- coluna nunca foi criada (a 0010 fez a tabela sem ela). Resultado: o
-- webhook marcava o contrato como assinado, o trigger falhava e a
-- transação inteira voltava — o card não ia para a operação.
alter table public.pipeline_log add column if not exists motivo text;

-- ---------- 0. "está contratado?" num lugar só ----------
-- 'aprovado' = contrato assinado (ver 0021). É o mesmo critério da
-- FaseGuard e de operacaoLiberada() no front.
create or replace function public.evento_contratado(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events where id = p_event and pipeline = 'aprovado'
  );
$$;

/** Quem pode furar a trava: admin, ou a Edge Function (service_role). */
create or replace function public.pode_furar_contrato()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

-- ---------- 1. evento na nota ----------
create or replace function public.trava_nota_sem_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- update que não troca o evento (só mexe no rateio) não precisa checar
  if tg_op = 'UPDATE' and new.event_id = old.event_id then
    return new;
  end if;
  if not public.evento_contratado(new.event_id) and not public.pode_furar_contrato() then
    raise exception 'Evento sem contrato assinado — a nota fiscal só pode ser montada depois da assinatura.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists on_invoice_event_contrato on public.invoice_events;
create trigger on_invoice_event_contrato
  before insert or update on public.invoice_events
  for each row execute function public.trava_nota_sem_contrato();

-- ---------- 2. transmissão ----------
-- A nota pode ter sido montada com o contrato assinado e o contrato ser
-- cancelado depois (item 4). Por isso a checagem se repete na hora de
-- TRANSMITIR — é ali que a taxa é cobrada.
create or replace function public.trava_transmissao_sem_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_evento text;
begin
  if new.status = 'transmitindo'
     and old.status in ('rascunho', 'erro')
     and not public.pode_furar_contrato() then
    select e.nome into v_evento
    from public.invoice_events ie
    join public.events e on e.id = ie.event_id
    where ie.invoice_id = new.id
      and e.pipeline <> 'aprovado'
    limit 1;

    if v_evento is not null then
      raise exception 'O evento "%" está sem contrato assinado — a nota não pode ser transmitida.', v_evento
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_invoice_transmitir_contrato on public.invoices;
create trigger on_invoice_transmitir_contrato
  before update on public.invoices
  for each row execute function public.trava_transmissao_sem_contrato();

-- ---------- 3. contas a receber ----------
-- Título SEM evento (lançamento avulso) continua livre. Título de evento
-- é boleto do evento: só depois da assinatura.
create or replace function public.trava_titulo_sem_contrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_id is null then
    return new;
  end if;
  -- baixa de título já existente (registrar recebimento) nunca trava:
  -- o dinheiro entrou, recusar o registro só esconderia o fato
  if tg_op = 'UPDATE' and new.event_id is not distinct from old.event_id then
    return new;
  end if;
  if not public.evento_contratado(new.event_id) and not public.pode_furar_contrato() then
    raise exception 'Evento sem contrato assinado — boleto/título só depois da assinatura.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists on_receivable_contrato on public.receivables;
create trigger on_receivable_contrato
  before insert or update on public.receivables
  for each row execute function public.trava_titulo_sem_contrato();

-- ---------- 4. contrato desfeito fecha o portão ----------
-- A 0021 só olhava a ida (assinado → libera). A volta não existia: um
-- contrato cancelado depois de assinado deixava o evento liberado para
-- produção e NF. Agora, se não sobrar NENHUM contrato assinado do
-- evento, ele volta para "Contrato para assinar".
create or replace function public.contrato_desfeito_trava_operacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'assinado'
     and new.status in ('cancelado', 'recusado', 'expirado')
     and not exists (
       select 1 from public.contracts
       where event_id = new.event_id and status = 'assinado' and id <> new.id
     ) then
    update public.events
    set pipeline = 'contrato_enviado'
    where id = new.event_id and pipeline = 'aprovado';

    if found then
      insert into public.pipeline_log (event_id, de, para, user_id, motivo)
      values (new.event_id, 'aprovado', 'contrato_enviado', auth.uid(),
              'Contrato ' || new.status || ' depois de assinado — operação e financeiro travados');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_contract_undone on public.contracts;
create trigger on_contract_undone
  after update on public.contracts
  for each row execute function public.contrato_desfeito_trava_operacao();

-- ---------- 5. a view de contas a receber respeita a RLS ----------
-- A 0022 criou receivables_abertos sem security_invoker: no Postgres a
-- view roda com os direitos do DONO e ignora a RLS de receivables — a
-- cozinha ou o motorista leriam todos os títulos pela view. Com
-- security_invoker, quem consulta precisa poder ler a tabela.
alter view public.receivables_abertos set (security_invoker = true);


-- ============================================================
-- SISTEMA PIEGGI — Migration 0030: a rua (fase de campo)
--
-- Até aqui o evento "acabava" quando a cozinha terminava: depois da
-- Produção não havia onde registrar nada. A call de 30/09 validou o
-- resto da cadeia — rua, montagem, reposição, desmontagem com
-- conferência — e é isso que esta migration estrutura.
--
--   Fase de campo do evento (events.campo_etapa):
--
--     (não saiu) → expedido → montado → desmontado → encerrado
--
--   Cada avanço exige a evidência daquela etapa, e quem confere é o
--   BANCO (campo_pendencias / campo_avancar), não a tela:
--
--     expedido   → material conferido na SAÍDA + checklist de saída
--     montado    → checklist de montagem (mesa, touca, plaquinha — com foto)
--     desmontado → checklist de reposição e desmontagem + material
--                  conferido no RETORNO + termo de sobras
--     encerrado  → presença de todos os freelancers registrada
--
--   Peças:
--     materials            cadastro (copo de vidro, réchaud…) + custo de reposição
--     event_materials      previsto → saiu → voltou → quebrou (perda é DERIVADA)
--     checklist_templates  modelos por momento e tipo de serviço
--     event_checks         o que foi feito (a fila é derivada, como no CS)
--     freelancers          cadastro da Adriana
--     event_staff          escala por evento: função, saída, valor, presença
--     event_sobras         termo de entrega da comida que fica com o cliente
--     event_ocorrencias    quebra, atraso, reclamação — com foto
--     bucket 'campo'       as fotos e assinaturas
--
-- Depende da 0029 (papel 'logistica') aplicada ANTES, em outra transação.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUEM FAZ O QUÊ NA RUA
-- ------------------------------------------------------------

/** Conferir material e marcar checklist: expedição (cozinha) e rua. */
create or replace function public.pode_campo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'logistica', 'producao', 'compras');
$$;

/** Montar escala e cadastrar freelancer: Adriana e admin. */
create or replace function public.pode_escalar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'logistica');
$$;

/** Ver a equipe (tem PIX, documento e valor pago): rua + quem paga. */
create or replace function public.pode_ver_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'logistica', 'financeiro');
$$;

-- ------------------------------------------------------------
-- 2. FASE DE CAMPO NO EVENTO
-- ------------------------------------------------------------
alter table public.events
  add column if not exists campo_etapa text
    check (campo_etapa in ('expedido', 'montado', 'desmontado', 'encerrado')),
  add column if not exists campo_em timestamptz;

comment on column public.events.campo_etapa is
  'Fase de campo: null (não saiu) → expedido → montado → desmontado → encerrado. Só muda por campo_avancar().';

create table if not exists public.campo_log (
  id        bigint generated always as identity primary key,
  event_id  uuid not null references public.events (id) on delete cascade,
  de        text,
  para      text,
  user_id   uuid references public.profiles (id),
  obs       text,
  criado_em timestamptz not null default now()
);

create index if not exists campo_log_event_idx on public.campo_log (event_id, criado_em);

alter table public.campo_log enable row level security;
drop policy if exists "campo_log_select" on public.campo_log;
create policy "campo_log_select" on public.campo_log
  for select to authenticated using (true);
-- sem policy de escrita: só campo_avancar() (security definer) grava

-- ------------------------------------------------------------
-- 3. MATERIAIS
-- ------------------------------------------------------------
create table if not exists public.materials (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null unique,
  -- os 3 setores da expedição validados na call
  setor           text not null default 'estrutura'
                  check (setor in ('alimentacao', 'bebidas', 'estrutura')),
  unidade         text not null default 'un',
  /** quanto custa repor 1 unidade — base do prejuízo de quebra/perda */
  custo_reposicao numeric(10,2),
  /**
   * Como achar este material na comanda: termos separados por "|",
   * comparados sem maiúscula com o ITEM da linha de estrutura.
   * null = só entra à mão.
   */
  chave           text,
  ativo           boolean not null default true,
  ordem           int not null default 0,
  created_at      timestamptz not null default now()
);

comment on column public.materials.chave is
  'Termos (separados por |) que casam com o item da linha de estrutura da comanda — é assim que o previsto é carregado sozinho.';

-- Os retornáveis que a comanda já calcula (roteamento.ts → gerarEstrutura).
-- Custo fica em branco de propósito: é número da casa, o Bruno preenche.
insert into public.materials (nome, setor, chave, ordem) values
  ('Copos de vidro',                 'bebidas',   'copos de vidro',                   10),
  ('Cup mini de vidro',              'estrutura', 'cup mini de vidro',                20),
  ('Pratos de louça',                'estrutura', 'pratos de louça',                  30),
  ('Garfos de bolo',                 'estrutura', 'garfos de bolo',                   40),
  ('Colherinhas de verrine',         'estrutura', 'colherinhas',                      50),
  ('Travessas de cerâmica',          'estrutura', 'cerâmica',                         60),
  ('Réchaud',                        'estrutura', 'réchaud|rechaud',                  70),
  ('Placa elétrica',                 'estrutura', 'placas elétricas|placa elétrica',  80),
  ('Transformador 100→220V',         'estrutura', 'transformador',                    90),
  ('Extensão + adaptador',           'estrutura', 'extensão',                        100),
  ('Galheteiro',                     'estrutura', 'galheteiro',                      110),
  ('Bandeja garçom preta',           'estrutura', 'bandeja garçom',                  120),
  ('Champanheira',                   'bebidas',   'champanheira',                    130),
  ('Kit saladas (cristais)',         'estrutura', 'kit saladas',                     140),
  ('Pote de inox (achocolatado)',    'bebidas',   null,                              150),
  ('Caixas etiquetadas',             'estrutura', 'caixa ',                          160)
on conflict (nome) do nothing;

create table if not exists public.event_materials (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  material_id  uuid references public.materials (id) on delete set null,
  -- nome e setor congelados: renomear o cadastro não reescreve evento passado
  descricao    text not null,
  setor        text not null default 'estrutura'
               check (setor in ('alimentacao', 'bebidas', 'estrutura')),
  unidade      text not null default 'un',
  qtd_prevista numeric(10,2),
  -- SAÍDA (expedição confere ao carregar)
  qtd_saida    numeric(10,2),
  saida_por    uuid references public.profiles (id),
  saida_em     timestamptz,
  -- RETORNO (rua confere ao descarregar)
  qtd_retorno  numeric(10,2),
  qtd_quebra   numeric(10,2) not null default 0,
  retorno_por  uuid references public.profiles (id),
  retorno_em   timestamptz,
  obs          text,
  ordem        int not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists event_materials_event_idx on public.event_materials (event_id);
create unique index if not exists event_materials_unico
  on public.event_materials (event_id, material_id) where material_id is not null;

-- Perda NÃO é coluna: é saiu − voltou − quebrou, calculado na hora.
-- Guardar viraria número que diverge quando alguém corrige o retorno.
create or replace view public.event_materials_conferencia
with (security_invoker = true) as
  select em.*,
         m.custo_reposicao,
         case when em.qtd_retorno is null then null
              else greatest(coalesce(em.qtd_saida, 0) - em.qtd_retorno - em.qtd_quebra, 0)
         end as qtd_perda,
         case when em.qtd_retorno is null or m.custo_reposicao is null then null
              else (greatest(coalesce(em.qtd_saida, 0) - em.qtd_retorno - em.qtd_quebra, 0)
                    + em.qtd_quebra) * m.custo_reposicao
         end as prejuizo
  from public.event_materials em
  left join public.materials m on m.id = em.material_id;

-- ------------------------------------------------------------
-- 4. CHECKLIST COM EVIDÊNCIA
-- ------------------------------------------------------------
create table if not exists public.checklist_templates (
  id            uuid primary key default gen_random_uuid(),
  momento       text not null
                check (momento in ('saida', 'montagem', 'reposicao', 'desmontagem')),
  texto         text not null,
  detalhe       text,
  /** null = vale para todo evento; senão, só nos dias que têm um desses serviços */
  service_types public.service_type[],
  exige_foto    boolean not null default false,
  obrigatorio   boolean not null default true,
  ordem         int not null default 0,
  ativo         boolean not null default true,
  created_at    timestamptz not null default now()
);

-- O que a call apontou: mesa sem registro padronizado, touca esquecida,
-- reposição sem acompanhamento, local largado.
insert into public.checklist_templates (momento, texto, detalhe, service_types, exige_foto, obrigatorio, ordem)
select * from (values
  ('saida', 'Carro carregado e conferido', 'Foto do material arrumado no carro, antes de fechar.', null::public.service_type[], true, true, 10),
  ('saida', 'Equipe com uniforme, touca e luvas', 'Foto da equipe antes de sair.', null, true, true, 20),
  ('montagem', 'Mesa montada no padrão Pieggi', 'Foto de FRENTE, mesa inteira, antes de liberar para o cliente.', null, true, true, 10),
  ('montagem', 'Plaquinhas posicionadas em todos os itens', 'Foto mostrando as plaquinhas.', null, true, true, 20),
  ('montagem', 'Equipe de touca no salão', 'Foto da equipe em serviço — touca é obrigatória.', null, true, true, 30),
  ('montagem', 'Placas/réchauds ligados e testados', null, array['almoco', 'jantar']::public.service_type[], false, true, 40),
  ('montagem', 'Restrições e alérgicos sinalizados na mesa', 'Cards CONTÉM e itens especiais separados.', null, false, false, 50),
  ('reposicao', 'Reposição feita', 'Foto da mesa reposta.', array['coffee_break', 'auditorio', 'brunch', 'coquetel', 'bar', 'almoco', 'jantar', 'coquetel_pizza']::public.service_type[], true, true, 10),
  ('desmontagem', 'Local entregue limpo', 'Foto do espaço depois de desmontar — lixo recolhido.', null, true, true, 10)
) as v(momento, texto, detalhe, service_types, exige_foto, obrigatorio, ordem)
where not exists (select 1 from public.checklist_templates);

-- Uma linha = um item feito naquele dia. Desmarcar = apagar a linha.
-- A lista do que FALTA é derivada (modelos × dias do evento), igual à
-- fila de CS: lista materializada envelheceria quando o evento muda de data.
create table if not exists public.event_checks (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  template_id uuid not null references public.checklist_templates (id) on delete cascade,
  dia         date not null,
  foto_path   text,
  obs         text,
  feito_por   uuid references public.profiles (id),
  feito_em    timestamptz not null default now(),
  unique (event_id, template_id, dia)
);

create index if not exists event_checks_event_idx on public.event_checks (event_id);

-- ------------------------------------------------------------
-- 5. FREELANCERS E ESCALA
-- ------------------------------------------------------------
create table if not exists public.freelancers (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  telefone      text,
  documento     text,
  pix           text,
  funcao_padrao text,
  /** diária combinada — sugestão ao escalar, editável por evento */
  valor_padrao  numeric(10,2),
  ativo         boolean not null default true,
  obs           text,
  created_at    timestamptz not null default now()
);

create table if not exists public.event_staff (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  freelancer_id  uuid references public.freelancers (id) on delete set null,
  nome           text not null,
  funcao         text,
  dia            date not null,
  horario_saida  time,
  horario_fim    time,
  valor          numeric(10,2),
  status         text not null default 'escalado'
                 check (status in ('escalado', 'confirmado', 'presente', 'faltou', 'cancelado')),
  /** 1 a 5, depois do evento — alimenta a próxima escala */
  avaliacao      int check (avaliacao between 1 and 5),
  obs            text,
  created_at     timestamptz not null default now()
);

create index if not exists event_staff_event_idx on public.event_staff (event_id, dia);
create index if not exists event_staff_freela_idx on public.event_staff (freelancer_id);

-- Custo da equipe contra a verba (8% — rule_params.verba_pct). A call
-- registrou a queda de 15% para 8%; o sistema passa a mostrar se o
-- evento estourou, em vez de descobrir no fechamento do mês.
-- A verba sai daqui (e não o orçamento) porque a rua não vê o total —
-- mesma regra da página da Adriana na comanda.
create or replace view public.event_staff_custo
with (security_invoker = true) as
  select s.event_id,
         sum(coalesce(s.valor, 0)) filter (where s.status in ('escalado', 'confirmado', 'presente')) as custo,
         count(*) filter (where s.status in ('escalado', 'confirmado', 'presente'))                 as pessoas,
         round(e.orcamento_valor
               * coalesce((select (valor #>> '{}')::numeric from public.rule_params where chave = 'verba_pct'), 8)
               / 100, 2)                                                                            as verba
  from public.event_staff s
  join public.events e on e.id = s.event_id
  group by s.event_id, e.orcamento_valor;

-- ------------------------------------------------------------
-- 6. TERMO DE SOBRAS E OCORRÊNCIAS
-- ------------------------------------------------------------
create table if not exists public.event_sobras (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  dia               date not null,
  /** marcar "não sobrou nada" também é registro — o que não pode é ficar em branco */
  sem_sobra         boolean not null default false,
  -- [{"descricao": "Mini brioche peito de peru", "quantidade": 40, "unidade": "un"}]
  itens             jsonb not null default '[]'::jsonb,
  recebedor_nome    text,
  recebedor_contato text,
  assinatura_path   text,
  foto_path         text,
  registrado_por    uuid references public.profiles (id),
  registrado_em     timestamptz not null default now(),
  unique (event_id, dia),
  check (sem_sobra or (recebedor_nome is not null and jsonb_array_length(itens) > 0))
);

create table if not exists public.event_ocorrencias (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  tipo           text not null
                 check (tipo in ('quebra', 'atraso', 'reclamacao', 'falta', 'acidente', 'outro')),
  descricao      text not null,
  foto_path      text,
  staff_id       uuid references public.event_staff (id) on delete set null,
  registrado_por uuid references public.profiles (id),
  registrado_em  timestamptz not null default now(),
  resolvida      boolean not null default false,
  resolucao      text
);

create index if not exists event_ocorrencias_event_idx on public.event_ocorrencias (event_id);

-- ------------------------------------------------------------
-- 7. O PORTÃO DE CADA ETAPA — regra num lugar só
--
-- A tela chama campo_pendencias() para MOSTRAR o que falta, e
-- campo_avancar() recusa se faltar algo. Os dois usam a mesma função:
-- impossível a tela dizer "pode" e o banco dizer "não".
--
-- Evento de vários dias: a saída e a montagem olham o PRIMEIRO dia
-- (é quando o material sai); a desmontagem olha TODOS os dias.
-- ------------------------------------------------------------
-- null testado com IS: `case x when null` nunca casa (null = null é null)
create or replace function public.campo_proxima(p_atual text)
returns text
language sql
immutable
as $$
  select case
           when p_atual is null then 'expedido'
           when p_atual = 'expedido' then 'montado'
           when p_atual = 'montado' then 'desmontado'
           when p_atual = 'desmontado' then 'encerrado'
         end;
$$;

create or replace function public.campo_pendencias(p_event uuid, p_para text)
returns setof text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pipeline  text;
  v_primeiro  date;
  v_momentos  text[];
  v_so_primeiro boolean;
  v_n         int;
begin
  select pipeline into v_pipeline from public.events where id = p_event;
  if v_pipeline is null then
    return next 'Evento não encontrado.';
    return;
  end if;
  if v_pipeline <> 'aprovado' then
    return next 'Contrato não assinado — o evento não pode sair.';
  end if;

  select min(dia) into v_primeiro from public.event_services where event_id = p_event;

  -- ---- material ----
  if p_para = 'expedido' then
    if not exists (select 1 from public.production_orders
                   where event_id = p_event and aprovado_em is not null) then
      return next 'Produção (comanda) ainda não foi gerada/aprovada.';
    end if;
    select count(*) into v_n from public.event_materials where event_id = p_event;
    if v_n = 0 then
      return next 'Lista de material não carregada — carregue o previsto da comanda.';
    end if;
    select count(*) into v_n from public.event_materials
    where event_id = p_event and qtd_saida is null;
    if v_n > 0 then
      return next v_n || ' material(is) sem conferência de SAÍDA.';
    end if;
  elsif p_para = 'desmontado' then
    select count(*) into v_n from public.event_materials
    where event_id = p_event and qtd_retorno is null;
    if v_n > 0 then
      return next v_n || ' material(is) sem conferência de RETORNO.';
    end if;
    -- termo de sobras: um por dia de evento
    return query
      select 'Termo de sobras de ' || to_char(d.dia, 'DD/MM') || ' não registrado (ou marque "não sobrou").'
      from (select distinct dia from public.event_services where event_id = p_event) d
      where not exists (select 1 from public.event_sobras s
                        where s.event_id = p_event and s.dia = d.dia)
      order by d.dia;
  elsif p_para = 'encerrado' then
    select count(*) into v_n from public.event_staff
    where event_id = p_event and status in ('escalado', 'confirmado');
    if v_n > 0 then
      return next v_n || ' freelancer(s) sem presença registrada (presente/faltou).';
    end if;
  end if;

  -- ---- checklist ----
  v_momentos := case p_para
                  when 'expedido'   then array['saida']
                  when 'montado'    then array['montagem']
                  when 'desmontado' then array['saida', 'montagem', 'reposicao', 'desmontagem']
                  else array[]::text[]
                end;
  v_so_primeiro := p_para in ('expedido', 'montado');

  return query
    with servicos as (
      select distinct dia, service_type from public.event_services where event_id = p_event
    ),
    dias as (
      select distinct dia from servicos
      where not v_so_primeiro or dia = v_primeiro
    ),
    exigidos as (
      select t.id, t.texto, t.exige_foto, d.dia, t.momento, t.ordem
      from public.checklist_templates t
      cross join dias d
      where t.ativo and t.obrigatorio and t.momento = any (v_momentos)
        and (t.service_types is null
             or exists (select 1 from servicos s
                        where s.dia = d.dia and s.service_type = any (t.service_types)))
    )
    select 'Checklist ' || to_char(x.dia, 'DD/MM') || ' — ' || x.texto
           || case when c.id is not null then ' (falta a foto)' else '' end
    from exigidos x
    left join public.event_checks c
      on c.event_id = p_event and c.template_id = x.id and c.dia = x.dia
    where c.id is null or (x.exige_foto and c.foto_path is null)
    order by x.dia, x.momento, x.ordem;
end;
$$;

create or replace function public.campo_avancar(p_event uuid, p_obs text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual text;
  v_para  text;
  v_falta text;
begin
  if not public.pode_campo() then
    raise exception 'Sem permissão para mover a fase de campo.' using errcode = 'insufficient_privilege';
  end if;

  select campo_etapa into v_atual from public.events where id = p_event for update;
  v_para := public.campo_proxima(v_atual);
  if v_para is null then
    raise exception 'O evento já está encerrado.';
  end if;
  -- encerrar é fechar a conta do evento: rua e admin, não a cozinha
  if v_para = 'encerrado' and not public.pode_escalar() then
    raise exception 'Só a logística ou o admin encerram o evento.' using errcode = 'insufficient_privilege';
  end if;

  select string_agg(linha, E'\n') into v_falta
  from public.campo_pendencias(p_event, v_para) as p(linha);
  if v_falta is not null then
    raise exception E'Falta para marcar como %:\n%', v_para, v_falta using errcode = 'check_violation';
  end if;

  update public.events set campo_etapa = v_para, campo_em = now() where id = p_event;
  insert into public.campo_log (event_id, de, para, user_id, obs)
  values (p_event, v_atual, v_para, auth.uid(), p_obs);
  return v_para;
end;
$$;

/** Desfazer uma etapa (marcou sem querer). Só admin, sempre com motivo. */
create or replace function public.campo_voltar(p_event uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual text;
  v_para  text;
begin
  if not public.is_admin() then
    raise exception 'Só o admin volta a fase de campo.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Informe o motivo para voltar a etapa.';
  end if;
  select campo_etapa into v_atual from public.events where id = p_event for update;
  v_para := case v_atual
              when 'expedido' then null
              when 'montado' then 'expedido'
              when 'desmontado' then 'montado'
              when 'encerrado' then 'desmontado'
            end;
  if v_atual is null then
    raise exception 'O evento ainda não saiu.';
  end if;
  update public.events set campo_etapa = v_para, campo_em = now() where id = p_event;
  insert into public.campo_log (event_id, de, para, user_id, obs)
  values (p_event, v_atual, v_para, auth.uid(), 'VOLTOU: ' || p_motivo);
  return v_para;
end;
$$;

grant execute on function public.campo_pendencias(uuid, text) to authenticated;
grant execute on function public.campo_avancar(uuid, text) to authenticated;
grant execute on function public.campo_voltar(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 8. RLS
-- ------------------------------------------------------------
alter table public.materials           enable row level security;
alter table public.event_materials     enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.event_checks        enable row level security;
alter table public.freelancers         enable row level security;
alter table public.event_staff         enable row level security;
alter table public.event_sobras        enable row level security;
alter table public.event_ocorrencias   enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['materials', 'event_materials', 'checklist_templates', 'event_checks',
                           'freelancers', 'event_staff', 'event_sobras', 'event_ocorrencias']
  loop
    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s', t);
  end loop;
end $$;

-- cadastros: todos leem, admin escreve
create policy "materials_select" on public.materials for select to authenticated using (true);
create policy "materials_insert" on public.materials for insert to authenticated with check (public.is_admin());
create policy "materials_update" on public.materials for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "materials_delete" on public.materials for delete to authenticated using (public.is_admin());

create policy "checklist_templates_select" on public.checklist_templates for select to authenticated using (true);
create policy "checklist_templates_insert" on public.checklist_templates for insert to authenticated with check (public.is_admin());
create policy "checklist_templates_update" on public.checklist_templates for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "checklist_templates_delete" on public.checklist_templates for delete to authenticated using (public.is_admin());

-- conferência de material: expedição e rua
create policy "event_materials_select" on public.event_materials for select to authenticated using (true);
create policy "event_materials_insert" on public.event_materials for insert to authenticated with check (public.pode_campo());
create policy "event_materials_update" on public.event_materials for update to authenticated
  using (public.pode_campo()) with check (public.pode_campo());
create policy "event_materials_delete" on public.event_materials for delete to authenticated using (public.pode_escalar());

-- checklist: marcar é assinar — feito_por é sempre quem está logado
create policy "event_checks_select" on public.event_checks for select to authenticated using (true);
create policy "event_checks_insert" on public.event_checks for insert to authenticated
  with check (public.pode_campo() and feito_por = auth.uid());
create policy "event_checks_update" on public.event_checks for update to authenticated
  using (public.pode_campo()) with check (public.pode_campo());
create policy "event_checks_delete" on public.event_checks for delete to authenticated using (public.pode_campo());

-- equipe: tem PIX, documento e valor — só rua e quem paga
create policy "freelancers_select" on public.freelancers for select to authenticated using (public.pode_ver_equipe());
create policy "freelancers_insert" on public.freelancers for insert to authenticated with check (public.pode_escalar());
create policy "freelancers_update" on public.freelancers for update to authenticated
  using (public.pode_escalar()) with check (public.pode_escalar());
create policy "freelancers_delete" on public.freelancers for delete to authenticated using (public.is_admin());

create policy "event_staff_select" on public.event_staff for select to authenticated using (public.pode_ver_equipe());
create policy "event_staff_insert" on public.event_staff for insert to authenticated with check (public.pode_escalar());
create policy "event_staff_update" on public.event_staff for update to authenticated
  using (public.pode_escalar()) with check (public.pode_escalar());
create policy "event_staff_delete" on public.event_staff for delete to authenticated using (public.pode_escalar());

-- sobras: registro da rua
create policy "event_sobras_select" on public.event_sobras for select to authenticated using (true);
create policy "event_sobras_insert" on public.event_sobras for insert to authenticated
  with check (public.pode_campo() and registrado_por = auth.uid());
create policy "event_sobras_update" on public.event_sobras for update to authenticated
  using (public.pode_campo()) with check (public.pode_campo());
create policy "event_sobras_delete" on public.event_sobras for delete to authenticated using (public.is_admin());

-- ocorrência: qualquer um registra (o comercial ouve a reclamação do
-- cliente); resolver é da rua e do comercial
create policy "event_ocorrencias_select" on public.event_ocorrencias for select to authenticated using (true);
create policy "event_ocorrencias_insert" on public.event_ocorrencias for insert to authenticated
  with check (registrado_por = auth.uid());
create policy "event_ocorrencias_update" on public.event_ocorrencias for update to authenticated
  using (public.pode_campo() or public.pode_comercial())
  with check (public.pode_campo() or public.pode_comercial());
create policy "event_ocorrencias_delete" on public.event_ocorrencias for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- 9. FOTOS — bucket privado 'campo'
-- caminho: <event_id>/<tipo>/<arquivo>.jpg
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('campo', 'campo', false)
on conflict (id) do nothing;

drop policy if exists "campo_select" on storage.objects;
drop policy if exists "campo_insert" on storage.objects;
drop policy if exists "campo_delete" on storage.objects;

create policy "campo_select" on storage.objects
  for select to authenticated using (bucket_id = 'campo');
-- qualquer logado sobe (ocorrência é de todos); a foto só vale quando
-- o registro que aponta para ela passa pela RLS da tabela
create policy "campo_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'campo');
-- foto é evidência: só o admin apaga
create policy "campo_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'campo' and public.is_admin());


select 'Parte 4 aplicada — travas do financeiro e rua no ar.' as resultado;
