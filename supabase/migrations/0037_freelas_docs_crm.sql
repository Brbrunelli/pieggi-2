-- ============================================================
-- SISTEMA PIEGGI — Migration 0037: freela com contrato + ASO, escala
-- da semana e CRM automático
--
-- Bruno (01/10): "todo freela tem que ter contrato assinado + ASO
-- (liberação pra trabalhar com comida)" e "quando um novo cliente entra
-- ele automaticamente é cadastrado no CRM".
--
--   freelancer_documentos  contrato (assinatura + vigência) e ASO
--                          (validade) de cada freela, com arquivo
--   escala_vagas           quantas pessoas de cada função um evento
--                          precisa em cada dia (a escala da semana)
--   event_staff            TRIGGER: só entra freela APTO no dia e livre
--                          (não escalado em outro evento no mesmo dia)
--   clients                origem, contato, criado_automaticamente
--   events                 TRIGGER: cliente digitado sem cadastro vira
--                          cliente no CRM e o evento ganha o client_id
--   garantir_cliente_crm() a porta única do cadastro automático (o
--                          comercial não escreve em clients — 0001)
--   bucket 'pessoas'       contrato e ASO (CPF, exame médico) — privado
--
-- A regra de APTO é a mesma de src/engine/freelas.ts (situacaoFreela).
-- Idempotente: pode rodar de novo.
--
-- PLANO DE ENTRADA NO AR (a escala não pode parar)
--   freelancer_documentos nasce VAZIA: se a trava valesse na hora, nenhum
--   freela do cadastro poderia ser escalado até a Adriana lançar contrato
--   + ASO de todo mundo. Por isso a trava nasce DESLIGADA:
--     1. Aplicar esta migration (tabelas, função, RLS, bucket, trigger).
--        rule_params.exigir_docs_freela = false → o trigger só barra o
--        conflito de dia; a tela mostra quem está sem documento em âmbar
--        ("período de transição") e deixa escalar.
--     2. A Adriana lança os documentos em /rua/freelancers. O filtro
--        "Não aptos" mostra quem falta.
--     3. Com "Não aptos" vazio (ou só gente que não vai trabalhar), o
--        Bruno muda exigir_docs_freela para true em Admin → Regras. A
--        partir daí banco e tela travam quem não está apto no dia.
--   Voltar para false é o botão de emergência, sem migration nova.
-- ============================================================

-- ------------------------------------------------------------
-- 1. DOCUMENTOS DO FREELA
-- ------------------------------------------------------------
create table if not exists public.freelancer_documentos (
  id              uuid primary key default gen_random_uuid(),
  freelancer_id   uuid not null references public.freelancers (id) on delete cascade,
  tipo            text not null check (tipo in ('contrato', 'aso')),
  /** ASO: data do exame · contrato: início da vigência */
  emitido_em      date,
  /** ASO: válido até (obrigatório) · contrato: fim da vigência (null = indeterminado) */
  validade        date,
  /** contrato: sem assinatura não vale */
  assinado_em     date,
  arquivo_path    text,
  obs             text,
  registrado_por  uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  constraint freelancer_documentos_aso_validade check (tipo <> 'aso' or validade is not null),
  constraint freelancer_documentos_periodo check (validade is null or emitido_em is null or validade >= emitido_em)
);

create index if not exists freelancer_documentos_freela_idx on public.freelancer_documentos (freelancer_id, tipo);

comment on table public.freelancer_documentos is
  'Contrato assinado + ASO do freela. Apto no dia D = contrato assinado e vigente em D + ASO com validade >= D (0037).';

-- ------------------------------------------------------------
-- 2. A REGRA: por que o freela NÃO pode trabalhar no dia (null = apto)
-- ------------------------------------------------------------
create or replace function public.freelancer_motivo_inapto(p_freela uuid, p_dia date)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_motivos text[] := '{}';
  v_tem     boolean;
begin
  -- contrato
  select exists (select 1 from freelancer_documentos where freelancer_id = p_freela and tipo = 'contrato')
    into v_tem;
  if not v_tem then
    v_motivos := v_motivos || 'sem contrato';
  elsif not exists (
    select 1 from freelancer_documentos
     where freelancer_id = p_freela and tipo = 'contrato'
       and assinado_em is not null and assinado_em <= p_dia
       and (emitido_em is null or emitido_em <= p_dia)
       and (validade is null or validade >= p_dia)
  ) then
    if exists (select 1 from freelancer_documentos
                where freelancer_id = p_freela and tipo = 'contrato' and assinado_em is not null) then
      v_motivos := v_motivos || 'contrato fora da vigência';
    else
      v_motivos := v_motivos || 'contrato não assinado';
    end if;
  end if;

  -- ASO
  select exists (select 1 from freelancer_documentos where freelancer_id = p_freela and tipo = 'aso')
    into v_tem;
  if not v_tem then
    v_motivos := v_motivos || 'sem ASO';
  elsif not exists (
    select 1 from freelancer_documentos
     where freelancer_id = p_freela and tipo = 'aso'
       and validade >= p_dia
       and (emitido_em is null or emitido_em <= p_dia)
  ) then
    v_motivos := v_motivos || 'ASO vencido';
  end if;

  if array_length(v_motivos, 1) is null then
    return null;
  end if;
  return array_to_string(v_motivos, ' · ');
end;
$$;

comment on function public.freelancer_motivo_inapto(uuid, date) is
  'null = apto no dia. Senão, o motivo (sem contrato, contrato não assinado, ASO vencido…). Espelho de situacaoFreela().';

-- é security definer: sem isto qualquer um (até anon) sondaria o ASO de
-- um freela pelo uuid, por fora da RLS de freelancer_documentos
revoke all on function public.freelancer_motivo_inapto(uuid, date) from public;
revoke all on function public.freelancer_motivo_inapto(uuid, date) from anon;
grant execute on function public.freelancer_motivo_inapto(uuid, date) to authenticated;

-- a chave da trava (ver PLANO DE ENTRADA NO AR no topo): nasce desligada
insert into public.rule_params (chave, valor, descricao, categoria)
values ('exigir_docs_freela', 'false',
        'true = só escala freela com contrato assinado + ASO válido no dia (trava no banco e na tela). '
        'false = período de transição: escala liberada, falta de documento aparece como pendência.',
        'equipe')
on conflict (chave) do nothing;

-- ------------------------------------------------------------
-- 3. TRAVA NA ESCALA: só freela apto e livre
--    Dispara ao escalar (insert) ou trocar pessoa/dia — marcar presença
--    de quem já estava escalado não trava.
-- ------------------------------------------------------------
create or replace function public.event_staff_valida_freela()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_motivo text;
  v_nome   text;
  v_outro  text;
  v_exigir boolean;
begin
  if new.freelancer_id is null or new.status in ('cancelado', 'faltou') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.freelancer_id is not distinct from old.freelancer_id
     and new.dia = old.dia
     and old.status not in ('cancelado', 'faltou') then
    return new;
  end if;

  select nome into v_nome from freelancers where id = new.freelancer_id;

  -- trava de documentos só com rule_params.exigir_docs_freela = true
  select coalesce((select valor from rule_params where chave = 'exigir_docs_freela') = 'true'::jsonb, false)
    into v_exigir;
  v_motivo := case when v_exigir then public.freelancer_motivo_inapto(new.freelancer_id, new.dia) end;
  if v_motivo is not null then
    raise exception '% não pode ser escalado em %: %. Registre contrato assinado e ASO válido em Freelancers.',
      coalesce(v_nome, 'Freelancer'), to_char(new.dia, 'DD/MM'), v_motivo
      using errcode = 'check_violation';
  end if;

  select e.nome into v_outro
    from event_staff s
    join events e on e.id = s.event_id
   where s.freelancer_id = new.freelancer_id
     and s.dia = new.dia
     and s.status in ('escalado', 'confirmado', 'presente')
     and s.id <> new.id
   limit 1;
  if v_outro is not null then
    raise exception '% já está escalado em "%" no dia % — a mesma pessoa não vai a dois eventos no mesmo dia.',
      coalesce(v_nome, 'Freelancer'), v_outro, to_char(new.dia, 'DD/MM')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists event_staff_valida_freela on public.event_staff;
create trigger event_staff_valida_freela
  before insert or update of freelancer_id, dia, status on public.event_staff
  for each row execute function public.event_staff_valida_freela();

-- ------------------------------------------------------------
-- 4. VAGAS DA ESCALA (a semana da Adriana)
-- ------------------------------------------------------------
create table if not exists public.escala_vagas (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  dia            date not null,
  funcao         text not null,
  quantidade     int not null default 1 check (quantidade > 0),
  horario_saida  time,
  obs            text,
  created_at     timestamptz not null default now()
);

create index if not exists escala_vagas_dia_idx on public.escala_vagas (dia, event_id);

comment on table public.escala_vagas is
  'Quantas pessoas de cada função o evento precisa no dia. Preenchida = escalado ativo (event_staff) da mesma função E apto no dia; escalado sem liberação é pendência. funcao = chave da lista FUNCOES (src/engine/freelas.ts).';

-- ------------------------------------------------------------
-- 5. CRM: cliente nasce sozinho
-- ------------------------------------------------------------
alter table public.clients
  add column if not exists contato                text,
  add column if not exists origem                 text not null default 'manual',
  add column if not exists criado_automaticamente boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_origem_check') then
    alter table public.clients
      add constraint clients_origem_check check (origem in ('manual', 'evento', 'briefing', 'pipedrive'));
  end if;
end $$;

comment on column public.clients.criado_automaticamente is
  'true = entrou sozinho no CRM (novo evento/briefing) e ainda não foi revisado. Selo "novo (automático)".';

/**
 * Acha o cliente pelo nome normalizado (sem acento, sem caixa, espaços
 * colapsados) ou cria marcado automático. Security definer: clients só
 * aceita escrita do admin (0001); esta é a única porta do comercial.
 */
create or replace function public.garantir_cliente_crm(
  p_nome     text,
  p_contato  text default null,
  p_telefone text default null,
  p_email    text default null,
  p_origem   text default 'evento'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g');
  v_id   uuid;
begin
  if v_nome = '' then
    raise exception 'Cliente sem nome — não dá para cadastrar no CRM.';
  end if;
  if not (public.is_admin() or public.pode_comercial()) then
    raise exception 'Só o comercial e o admin cadastram cliente.';
  end if;

  select id into v_id
    from clients
   where lower(regexp_replace(public.unaccent_simples(trim(nome)), '\s+', ' ', 'g'))
       = lower(public.unaccent_simples(v_nome))
   order by created_at
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into clients (nome, tipo, ativo, contato, telefone, email, origem, criado_automaticamente)
  values (v_nome, 'externo', true, nullif(trim(p_contato), ''), nullif(trim(p_telefone), ''),
          nullif(trim(p_email), ''),
          case when p_origem in ('manual', 'evento', 'briefing', 'pipedrive') then p_origem else 'evento' end,
          true)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.garantir_cliente_crm(text, text, text, text, text) from public;
grant execute on function public.garantir_cliente_crm(text, text, text, text, text) to authenticated;

/** Rede de segurança: evento com cliente digitado e sem client_id ganha o cadastro. */
create or replace function public.events_cliente_no_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text := regexp_replace(trim(coalesce(new.cliente_nome, '')), '\s+', ' ', 'g');
  v_id   uuid;
begin
  if new.client_id is not null or v_nome = '' then
    return new;
  end if;

  select id into v_id
    from clients
   where lower(regexp_replace(public.unaccent_simples(trim(nome)), '\s+', ' ', 'g'))
       = lower(public.unaccent_simples(v_nome))
   order by created_at
   limit 1;

  if v_id is null then
    insert into clients (nome, tipo, ativo, contato, telefone, email, origem, criado_automaticamente)
    values (v_nome, 'externo', true, new.contato, new.contato_telefone, new.contato_email, 'evento', true)
    returning id into v_id;
  end if;

  new.client_id := v_id;
  new.cliente_nome := null;
  return new;
end;
$$;

drop trigger if exists events_cliente_no_crm on public.events;
create trigger events_cliente_no_crm
  before insert or update of cliente_nome, client_id on public.events
  for each row execute function public.events_cliente_no_crm();

-- Eventos antigos com cliente só digitado: a tela do CRM tem o botão
-- "Cadastrar todos". Para fazer direto no banco, descomente:
-- update public.events set cliente_nome = cliente_nome
--  where client_id is null and nullif(trim(cliente_nome), '') is not null;

-- ------------------------------------------------------------
-- 6. RLS
-- ------------------------------------------------------------
alter table public.freelancer_documentos enable row level security;
alter table public.escala_vagas          enable row level security;

drop policy if exists "freelancer_documentos_select" on public.freelancer_documentos;
drop policy if exists "freelancer_documentos_insert" on public.freelancer_documentos;
drop policy if exists "freelancer_documentos_update" on public.freelancer_documentos;
drop policy if exists "freelancer_documentos_delete" on public.freelancer_documentos;

create policy "freelancer_documentos_select" on public.freelancer_documentos
  for select to authenticated using (public.pode_ver_equipe());
create policy "freelancer_documentos_insert" on public.freelancer_documentos
  for insert to authenticated with check (public.pode_escalar());
create policy "freelancer_documentos_update" on public.freelancer_documentos
  for update to authenticated using (public.pode_escalar()) with check (public.pode_escalar());
create policy "freelancer_documentos_delete" on public.freelancer_documentos
  for delete to authenticated using (public.pode_escalar());

drop policy if exists "escala_vagas_select" on public.escala_vagas;
drop policy if exists "escala_vagas_insert" on public.escala_vagas;
drop policy if exists "escala_vagas_update" on public.escala_vagas;
drop policy if exists "escala_vagas_delete" on public.escala_vagas;

-- a rua (pode_campo) + quem paga a equipe (o financeiro abre /rua/escala)
create policy "escala_vagas_select" on public.escala_vagas
  for select to authenticated using (public.pode_campo() or public.pode_ver_equipe());
create policy "escala_vagas_insert" on public.escala_vagas
  for insert to authenticated with check (public.pode_escalar());
create policy "escala_vagas_update" on public.escala_vagas
  for update to authenticated using (public.pode_escalar()) with check (public.pode_escalar());
create policy "escala_vagas_delete" on public.escala_vagas
  for delete to authenticated using (public.pode_escalar());

-- ------------------------------------------------------------
-- 7. ARQUIVOS — bucket privado 'pessoas'
-- caminho: <freelancer_id>/<contrato|aso>-<timestamp>.<ext>
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('pessoas', 'pessoas', false)
on conflict (id) do nothing;

drop policy if exists "pessoas_select" on storage.objects;
drop policy if exists "pessoas_insert" on storage.objects;
drop policy if exists "pessoas_delete" on storage.objects;

create policy "pessoas_select" on storage.objects
  for select to authenticated using (bucket_id = 'pessoas' and public.pode_ver_equipe());
create policy "pessoas_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'pessoas' and public.pode_escalar());
-- documento é prova: só o admin apaga o arquivo
create policy "pessoas_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'pessoas' and public.is_admin());
