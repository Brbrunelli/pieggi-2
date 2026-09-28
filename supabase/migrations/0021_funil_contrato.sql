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
alter type public.user_role add value if not exists 'financeiro';

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
