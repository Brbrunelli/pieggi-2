-- ============================================================
-- SISTEMA PIEGGI — Migration 0032: transporte (viagens do motorista)
--
-- A queixa: a rua erra endereço e horário. De onde vinha o erro:
--
--   1. o horário de saída da comanda era uma ESTIMATIVA ("servir −3h,
--      conferir Adriana") que ninguém confirmava por escrito;
--   2. o endereço ia no papel impresso — se o comercial corrigia o
--      evento depois, o papel continuava com o endereço velho;
--   3. dava para imprimir com o endereço ainda não confirmado.
--
-- O que muda:
--
--   - Cada ida (entrega) e volta (recolhimento) vira uma VIAGEM com
--     motorista, saída e chegada explícitas, programada pela Adriana.
--   - Não se programa viagem para evento com endereço não confirmado.
--   - A viagem guarda o endereço e o horário do serviço do momento em
--     que foi programada. Se o evento mudar depois, a view acusa
--     (endereco_mudou / horario_mudou) na tela da Adriana e na do
--     motorista — até alguém reconfirmar.
--   - O motorista marca saí / cheguei (com localização) / concluí.
-- ============================================================

-- ---------- 0. regra como dado ----------
insert into public.rule_params (chave, valor, descricao, categoria) values
  ('chegada_min_antes', '60',
   'Entrega: o motorista precisa chegar pelo menos N minutos antes do serviço (tempo de montagem). Menos que isso, a viagem é sinalizada.',
   'comandas')
on conflict (chave) do nothing;

-- ---------- 1. quem dirige ----------
create or replace function public.is_motorista()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() = 'motorista';
$$;

-- ---------- 2. viagens ----------
create table if not exists public.viagens (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events (id) on delete cascade,
  dia              date not null,
  tipo             text not null default 'entrega'
                   check (tipo in ('entrega', 'recolhimento')),
  motorista_id     uuid references public.profiles (id),
  veiculo          text,
  saida_prevista   time not null,
  chegada_prevista time,

  -- retrato do evento NO MOMENTO em que a viagem foi programada.
  -- Preenchido pelo trigger; a view compara com o evento atual.
  endereco         text,
  local_detalhe    text,
  hora_servico     time,

  contato_nome     text,
  contato_telefone text,
  obs              text,

  status           text not null default 'programada'
                   check (status in ('programada', 'a_caminho', 'no_local', 'concluida', 'cancelada')),
  saiu_em          timestamptz,
  chegou_em        timestamptz,
  concluida_em     timestamptz,
  chegada_lat      double precision,
  chegada_lng      double precision,

  created_by       uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists viagens_dia_idx on public.viagens (dia, saida_prevista);
create index if not exists viagens_event_idx on public.viagens (event_id);
create index if not exists viagens_motorista_idx on public.viagens (motorista_id, dia);

drop trigger if exists on_viagem_update on public.viagens;
create trigger on_viagem_update
  before update on public.viagens
  for each row execute function public.touch_updated_at();

-- horário do serviço que a viagem atende: a entrega mira o PRIMEIRO
-- serviço do dia; o recolhimento, o FIM do último
create or replace function public.hora_servico_viagem(p_event uuid, p_dia date, p_tipo text)
returns time
language sql
stable
security definer
set search_path = public
as $$
  select case when p_tipo = 'entrega' then min(hora_inicio) else max(hora_fim) end
  from public.event_services
  where event_id = p_event and dia = p_dia;
$$;

-- ---------- 3. programar = conferir ----------
create or replace function public.viagem_retrato()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  e public.events%rowtype;
begin
  select * into e from public.events where id = new.event_id;

  if tg_op = 'INSERT' then
    if not e.endereco_confirmado or coalesce(trim(e.endereco), '') = '' then
      raise exception 'O endereço do evento "%" não está confirmado — confirme no cadastro do evento antes de programar a viagem.', e.nome
        using errcode = 'check_violation';
    end if;
    new.endereco      := e.endereco;
    new.local_detalhe := e.local_detalhe;
    new.hora_servico  := public.hora_servico_viagem(new.event_id, new.dia, new.tipo);
    new.contato_telefone := coalesce(new.contato_telefone, e.contato_telefone);
    new.contato_nome     := coalesce(new.contato_nome, e.contato);
  elsif new.dia is distinct from old.dia or new.tipo is distinct from old.tipo then
    -- mudou o dia/tipo da viagem: o retrato antigo não vale mais
    new.hora_servico := public.hora_servico_viagem(new.event_id, new.dia, new.tipo);
  end if;
  return new;
end;
$$;

drop trigger if exists on_viagem_retrato on public.viagens;
create trigger on_viagem_retrato
  before insert or update on public.viagens
  for each row execute function public.viagem_retrato();

-- ---------- 4. a conferência ----------
-- Divergência é DERIVADA: comparar o retrato com o evento agora.
-- Nada para "lembrar de atualizar" — corrigiu o evento, a viagem acusa.
create or replace view public.viagens_conferencia
with (security_invoker = true) as
  select v.*,
         e.nome                                   as evento_nome,
         coalesce(c.nome, e.cliente_nome)         as cliente,
         e.pax,
         e.endereco                               as endereco_atual,
         e.local_detalhe                          as local_atual,
         e.endereco_confirmado,
         h.hora                                   as hora_servico_atual,
         p.nome                                   as motorista_nome,
         (v.endereco is distinct from e.endereco
            or v.local_detalhe is distinct from e.local_detalhe) as endereco_mudou,
         (v.hora_servico is distinct from h.hora)                  as horario_mudou,
         (v.tipo = 'entrega' and h.hora is not null and v.chegada_prevista is not null
            and v.chegada_prevista > h.hora - make_interval(mins => r.minutos)) as chegada_apertada,
         (v.tipo = 'entrega' and h.hora is not null
            and v.saida_prevista >= h.hora)                         as saida_depois_do_servico
  from public.viagens v
  join public.events e on e.id = v.event_id
  left join public.clients c on c.id = e.client_id
  left join public.profiles p on p.id = v.motorista_id
  cross join lateral (select public.hora_servico_viagem(v.event_id, v.dia, v.tipo) as hora) h
  cross join lateral (
    select coalesce((select (valor #>> '{}')::int from public.rule_params where chave = 'chegada_min_antes'), 60) as minutos
  ) r;

-- ---------- 5. reconfirmar (Adriana viu a mudança e ajustou) ----------
create or replace function public.viagem_reconfirmar(p_viagem uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens%rowtype;
  e public.events%rowtype;
begin
  if not public.pode_escalar() then
    raise exception 'Só a logística ou o admin reconfirmam a viagem.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.viagens where id = p_viagem;
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

-- ---------- 6. o motorista marca o andamento ----------
create or replace function public.viagem_marcar(
  p_viagem uuid,
  p_passo  text,
  p_lat    double precision default null,
  p_lng    double precision default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.viagens%rowtype;
begin
  select * into v from public.viagens where id = p_viagem for update;
  if v.id is null then
    raise exception 'Viagem não encontrada.';
  end if;
  if not (v.motorista_id = auth.uid() or public.pode_escalar()) then
    raise exception 'Esta viagem não é sua.' using errcode = 'insufficient_privilege';
  end if;
  if v.status in ('concluida', 'cancelada') then
    raise exception 'A viagem já está %.', v.status;
  end if;

  if p_passo = 'saiu' then
    update public.viagens set status = 'a_caminho', saiu_em = now() where id = p_viagem;
    return 'a_caminho';
  elsif p_passo = 'chegou' then
    update public.viagens
    set status = 'no_local', chegou_em = now(),
        saiu_em = coalesce(saiu_em, now()),
        chegada_lat = p_lat, chegada_lng = p_lng
    where id = p_viagem;
    return 'no_local';
  elsif p_passo = 'concluiu' then
    update public.viagens
    set status = 'concluida', concluida_em = now(),
        chegou_em = coalesce(chegou_em, now())
    where id = p_viagem;
    return 'concluida';
  end if;
  raise exception 'Passo inválido: %', p_passo;
end;
$$;

grant execute on function public.hora_servico_viagem(uuid, date, text) to authenticated;
grant execute on function public.viagem_reconfirmar(uuid) to authenticated;
grant execute on function public.viagem_marcar(uuid, text, double precision, double precision) to authenticated;

-- ---------- 7. RLS ----------
alter table public.viagens enable row level security;

drop policy if exists "viagens_select" on public.viagens;
drop policy if exists "viagens_insert" on public.viagens;
drop policy if exists "viagens_update" on public.viagens;
drop policy if exists "viagens_delete" on public.viagens;

-- o motorista vê só as dele; a rua e a expedição veem todas
create policy "viagens_select" on public.viagens for select to authenticated
  using (public.pode_campo() or public.pode_ver_equipe() or motorista_id = auth.uid());
-- programar é da Adriana; o motorista anda a viagem pela função viagem_marcar
create policy "viagens_insert" on public.viagens for insert to authenticated
  with check (public.pode_escalar());
create policy "viagens_update" on public.viagens for update to authenticated
  using (public.pode_escalar()) with check (public.pode_escalar());
create policy "viagens_delete" on public.viagens for delete to authenticated
  using (public.pode_escalar());

-- ---------- 8. ocorrência de endereço e de horário ----------
-- O motorista que chega no endereço errado registra na hora — é assim
-- que se descobre QUEM está cadastrando errado.
alter table public.event_ocorrencias drop constraint if exists event_ocorrencias_tipo_check;
alter table public.event_ocorrencias
  add constraint event_ocorrencias_tipo_check
  check (tipo in ('quebra', 'atraso', 'reclamacao', 'falta', 'acidente', 'endereco', 'horario', 'outro'));

-- o motorista precisa subir a foto da fachada/portaria
-- (a policy de insert do bucket 'campo' já aceita qualquer logado)
