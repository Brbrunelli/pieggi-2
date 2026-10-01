-- ============================================================
-- APLICAR — PARTE 7 de 8
--
-- Migration 0033: confirmação de endereço (andar, acesso de carga e
-- com quem) + rota do dia com retirada em fornecedor.
-- Rode SÓ DEPOIS da Parte 6. Pode rodar de novo sem erro.
--
-- ATENÇÃO: eventos de depois de amanhã em diante que estavam
-- "confirmados" sem acesso de carga voltam para "a confirmar".
-- ============================================================

-- ============================================================
-- SISTEMA PIEGGI — Migration 0033: confirmação de endereço + rota do dia
--
-- 1. ENDEREÇO
--    Pode ser editado a qualquer momento — mas confirmar passou a ser
--    um ato com conteúdo, não uma caixinha:
--      - andar / sala            (events.local_detalhe)
--      - como a carga entra      (events.acesso_carga: doca, portaria de
--                                  serviço, elevador de carga, horário)
--      - COM QUEM foi confirmado (nome do cliente que confirmou)
--    Quem confirmou e quando ficam carimbados. Mudou endereço, andar ou
--    acesso depois? A confirmação cai sozinha e a mudança vai para o
--    histórico (event_endereco_log) — é assim que se descobre quem
--    cadastra errado.
--    Pode ser feito na venda ou no pós-venda; a operação (comanda e
--    viagem) é que exige.
--
-- 2. ROTA
--    A viagem deixa de ser só "ida e volta do evento": vira PARADA da
--    rota do dia do motorista — inclusive retirada em fornecedor externo
--    (o que a página da Adriana na comanda manda buscar).
--
-- Depende da 0032. Pode rodar de novo sem erro.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENDEREÇO CONFIRMADO DE VERDADE
-- ------------------------------------------------------------
alter table public.events
  add column if not exists acesso_carga             text,
  add column if not exists endereco_confirmado_com  text,
  add column if not exists endereco_confirmado_por  uuid references public.profiles (id),
  add column if not exists endereco_confirmado_em   timestamptz;

comment on column public.events.acesso_carga is
  'Como a carga entra: doca (endereço/rua da doca), portaria de serviço, elevador de carga, horário permitido, cadastro prévio de placa.';
comment on column public.events.endereco_confirmado_com is
  'Nome de quem confirmou do lado do cliente — confirmação sem interlocutor não vale.';

-- clientes de endereço fixo (StartSe, WTC, Inteli): o acesso também é fixo
alter table public.clients
  add column if not exists acesso_carga text;

create table if not exists public.event_endereco_log (
  id         bigint generated always as identity primary key,
  event_id   uuid not null references public.events (id) on delete cascade,
  campo      text not null,
  de         text,
  para       text,
  user_id    uuid references public.profiles (id),
  criado_em  timestamptz not null default now()
);

create index if not exists event_endereco_log_idx on public.event_endereco_log (event_id, criado_em);

alter table public.event_endereco_log enable row level security;
drop policy if exists "event_endereco_log_select" on public.event_endereco_log;
create policy "event_endereco_log_select" on public.event_endereco_log
  for select to authenticated using (true);

create or replace function public.endereco_confirmacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_confirmando boolean;
begin
  if tg_op = 'UPDATE' then
    -- histórico de toda mudança de endereço/andar/acesso
    if new.endereco is distinct from old.endereco then
      insert into public.event_endereco_log (event_id, campo, de, para, user_id)
      values (new.id, 'endereco', old.endereco, new.endereco, auth.uid());
    end if;
    if new.local_detalhe is distinct from old.local_detalhe then
      insert into public.event_endereco_log (event_id, campo, de, para, user_id)
      values (new.id, 'andar/sala', old.local_detalhe, new.local_detalhe, auth.uid());
    end if;
    if new.acesso_carga is distinct from old.acesso_carga then
      insert into public.event_endereco_log (event_id, campo, de, para, user_id)
      values (new.id, 'acesso', old.acesso_carga, new.acesso_carga, auth.uid());
    end if;

    -- mudou e NÃO veio uma confirmação nova junto → a confirmação cai
    if (new.endereco, new.local_detalhe, new.acesso_carga)
         is distinct from (old.endereco, old.local_detalhe, old.acesso_carga)
       and new.endereco_confirmado_em is not distinct from old.endereco_confirmado_em then
      new.endereco_confirmado := false;
    end if;
  end if;

  if not new.endereco_confirmado then
    new.endereco_confirmado_em  := null;
    new.endereco_confirmado_por := null;
    new.endereco_confirmado_com := null;
    return new;
  end if;

  -- validação só quando está CONFIRMANDO agora (evento antigo já
  -- confirmado não trava ao mover o card no funil)
  v_confirmando := tg_op = 'INSERT'
                   or not old.endereco_confirmado
                   or new.endereco_confirmado_em is distinct from old.endereco_confirmado_em;
  if v_confirmando then
    if coalesce(trim(new.endereco), '') = ''
       or coalesce(trim(new.local_detalhe), '') = ''
       or coalesce(trim(new.acesso_carga), '') = ''
       or coalesce(trim(new.endereco_confirmado_com), '') = '' then
      raise exception 'Para confirmar o endereço: endereço, andar/sala, como a carga entra (doca/portaria) e com quem foi confirmado.'
        using errcode = 'check_violation';
    end if;
    new.endereco_confirmado_em  := coalesce(new.endereco_confirmado_em, now());
    new.endereco_confirmado_por := coalesce(auth.uid(), new.endereco_confirmado_por);
  end if;
  return new;
end;
$$;

drop trigger if exists on_event_endereco on public.events;
create trigger on_event_endereco
  before insert or update on public.events
  for each row execute function public.endereco_confirmacao();

-- Confirmar pelo pós-venda ou pela logística: a RLS de events só deixa
-- o comercial editar (0027), mas a Adriana também liga para o cliente.
create or replace function public.confirmar_endereco(
  p_event    uuid,
  p_endereco text,
  p_local    text,
  p_acesso   text,
  p_com      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.pode_comercial() or public.pode_escalar()) then
    raise exception 'Só o comercial, a logística ou o admin confirmam endereço.' using errcode = 'insufficient_privilege';
  end if;
  update public.events
  set endereco                = trim(p_endereco),
      local_detalhe           = nullif(trim(p_local), ''),
      acesso_carga            = nullif(trim(p_acesso), ''),
      endereco_confirmado     = true,
      endereco_confirmado_com = nullif(trim(p_com), ''),
      endereco_confirmado_em  = now(),
      endereco_confirmado_por = auth.uid()
  where id = p_event;
end;
$$;

grant execute on function public.confirmar_endereco(uuid, text, text, text, text) to authenticated;

-- Eventos que vêm aí (depois de amanhã em diante) confirmados SEM o
-- acesso de carga voltam para "a confirmar" — é exatamente o que a regra
-- nova quer perguntar. Hoje e amanhã ficam como estão para não travar
-- operação em andamento; a tela os mostra como "confirmado sem acesso".
update public.events e
set endereco_confirmado = false
where e.endereco_confirmado
  and coalesce(trim(e.acesso_carga), '') = ''
  and exists (select 1 from public.event_services s
              where s.event_id = e.id and s.dia > current_date + 1)
  and not exists (select 1 from public.event_services s
                  where s.event_id = e.id and s.dia <= current_date + 1);

-- ------------------------------------------------------------
-- 2. FORNECEDORES — onde o motorista busca
-- ------------------------------------------------------------
create table if not exists public.fornecedores (
  id          uuid primary key default gen_random_uuid(),
  /** casa com catalog_items.fornecedor ('leticia', 'leal'…) */
  chave       text unique,
  nome        text not null,
  endereco    text,
  complemento text,
  contato     text,
  telefone    text,
  /** quando dá para retirar: "seg–sex 7h–17h, sáb até 12h" */
  horario     text,
  obs         text,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- os fornecedores que a comanda já conhece (roteamento.ts). Endereço em
-- branco: o Bruno/Adriana preenchem — sem endereço não sai retirada.
insert into public.fornecedores (chave, nome) values
  ('leticia', 'Letícia'),
  ('leal', 'Leal'),
  ('luigi', 'Luigi'),
  ('arosa', 'Arosa'),
  ('mercado', 'Mercado'),
  ('rotisseria', 'Rotisseria')
on conflict (chave) do nothing;

alter table public.fornecedores enable row level security;
drop policy if exists "fornecedores_select" on public.fornecedores;
drop policy if exists "fornecedores_insert" on public.fornecedores;
drop policy if exists "fornecedores_update" on public.fornecedores;
drop policy if exists "fornecedores_delete" on public.fornecedores;
create policy "fornecedores_select" on public.fornecedores for select to authenticated using (true);
create policy "fornecedores_insert" on public.fornecedores for insert to authenticated with check (public.pode_escalar());
create policy "fornecedores_update" on public.fornecedores for update to authenticated
  using (public.pode_escalar()) with check (public.pode_escalar());
create policy "fornecedores_delete" on public.fornecedores for delete to authenticated using (public.is_admin());

-- ponto de partida da rota (para abrir a rota inteira no mapa)
insert into public.rule_params (chave, valor, descricao, categoria) values
  ('endereco_pieggi', '""',
   'Endereço de saída dos motoristas (a cozinha). Origem da rota do dia no mapa.',
   'comandas')
on conflict (chave) do nothing;

-- ------------------------------------------------------------
-- 3. VIAGEM VIRA PARADA DA ROTA
-- ------------------------------------------------------------
alter table public.viagens alter column event_id drop not null;
alter table public.viagens
  add column if not exists fornecedor_id uuid references public.fornecedores (id),
  -- o que buscar: [{"descricao": "Pão de batata", "qtd": "120 un", "evento": "Convenção X"}]
  add column if not exists itens jsonb not null default '[]'::jsonb;

alter table public.viagens drop constraint if exists viagens_tipo_check;
alter table public.viagens
  add constraint viagens_tipo_check check (tipo in ('entrega', 'recolhimento', 'retirada'));

alter table public.viagens drop constraint if exists viagens_destino_check;
alter table public.viagens
  add constraint viagens_destino_check check (
    (tipo = 'retirada' and fornecedor_id is not null)
    or (tipo <> 'retirada' and event_id is not null)
  );

create index if not exists viagens_fornecedor_idx on public.viagens (fornecedor_id);

-- retrato na programação: evento OU fornecedor
create or replace function public.viagem_retrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events%rowtype;
  f public.fornecedores%rowtype;
begin
  if new.tipo = 'retirada' then
    select * into f from public.fornecedores where id = new.fornecedor_id;
    if tg_op = 'INSERT' or new.fornecedor_id is distinct from old.fornecedor_id then
      if coalesce(trim(f.endereco), '') = '' then
        raise exception 'O fornecedor "%" está sem endereço — cadastre em Logística → Fornecedores.', f.nome
          using errcode = 'check_violation';
      end if;
      new.endereco         := f.endereco;
      new.local_detalhe    := f.complemento;
      new.hora_servico     := null;
      new.contato_nome     := coalesce(new.contato_nome, f.contato);
      new.contato_telefone := coalesce(new.contato_telefone, f.telefone);
    end if;
    return new;
  end if;

  select * into e from public.events where id = new.event_id;
  if tg_op = 'INSERT' then
    if not e.endereco_confirmado then
      raise exception 'O endereço do evento "%" não está confirmado (andar, acesso de carga e com quem) — confirme antes de programar a viagem.', e.nome
        using errcode = 'check_violation';
    end if;
    new.endereco         := e.endereco;
    new.local_detalhe    := e.local_detalhe;
    new.hora_servico     := public.hora_servico_viagem(new.event_id, new.dia, new.tipo);
    new.contato_telefone := coalesce(new.contato_telefone, e.contato_telefone);
    new.contato_nome     := coalesce(new.contato_nome, e.contato);
  elsif new.dia is distinct from old.dia or new.tipo is distinct from old.tipo then
    new.hora_servico := public.hora_servico_viagem(new.event_id, new.dia, new.tipo);
  end if;
  return new;
end;
$$;

-- a view ganha colunas no meio: precisa ser recriada
drop view if exists public.viagens_conferencia;
create view public.viagens_conferencia
with (security_invoker = true) as
  select v.*,
         case when v.tipo = 'retirada' then 'Retirada — ' || f.nome else e.nome end as evento_nome,
         case when v.tipo = 'retirada' then f.nome else coalesce(c.nome, e.cliente_nome) end as cliente,
         e.pax,
         case when v.tipo = 'retirada' then f.endereco else e.endereco end           as endereco_atual,
         case when v.tipo = 'retirada' then f.complemento else e.local_detalhe end   as local_atual,
         case when v.tipo = 'retirada' then f.obs else e.acesso_carga end            as acesso_atual,
         case when v.tipo = 'retirada' then coalesce(trim(f.endereco), '') <> ''
              else e.endereco_confirmado end                                         as endereco_confirmado,
         f.nome                                   as fornecedor_nome,
         f.horario                                as fornecedor_horario,
         h.hora                                   as hora_servico_atual,
         p.nome                                   as motorista_nome,
         case when v.tipo = 'retirada'
              then v.endereco is distinct from f.endereco or v.local_detalhe is distinct from f.complemento
              else v.endereco is distinct from e.endereco or v.local_detalhe is distinct from e.local_detalhe
         end                                                       as endereco_mudou,
         (v.tipo <> 'retirada' and v.hora_servico is distinct from h.hora) as horario_mudou,
         (v.tipo = 'entrega' and h.hora is not null and v.chegada_prevista is not null
            and v.chegada_prevista > h.hora - make_interval(mins => r.minutos)) as chegada_apertada,
         (v.tipo = 'entrega' and h.hora is not null
            and v.saida_prevista >= h.hora)                         as saida_depois_do_servico
  from public.viagens v
  left join public.events e on e.id = v.event_id
  left join public.clients c on c.id = e.client_id
  left join public.fornecedores f on f.id = v.fornecedor_id
  left join public.profiles p on p.id = v.motorista_id
  cross join lateral (
    select case when v.event_id is null then null
                else public.hora_servico_viagem(v.event_id, v.dia, v.tipo) end as hora
  ) h
  cross join lateral (
    select coalesce((select (valor #>> '{}')::int from public.rule_params where chave = 'chegada_min_antes'), 60) as minutos
  ) r;

create or replace function public.viagem_reconfirmar(p_viagem uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens%rowtype;
  e public.events%rowtype;
  f public.fornecedores%rowtype;
begin
  if not public.pode_escalar() then
    raise exception 'Só a logística ou o admin reconfirmam a viagem.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.viagens where id = p_viagem;
  if v.tipo = 'retirada' then
    select * into f from public.fornecedores where id = v.fornecedor_id;
    update public.viagens set endereco = f.endereco, local_detalhe = f.complemento where id = p_viagem;
    return;
  end if;
  select * into e from public.events where id = v.event_id;
  if not e.endereco_confirmado then
    raise exception 'O endereço do evento ainda não está confirmado.';
  end if;
  update public.viagens
  set endereco = e.endereco,
      local_detalhe = e.local_detalhe,
      hora_servico = public.hora_servico_viagem(v.event_id, v.dia, v.tipo)
  where id = p_viagem;
end;
$$;


select 'Parte 7 aplicada — endereço com acesso e rota do dia no ar.' as resultado;
