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
