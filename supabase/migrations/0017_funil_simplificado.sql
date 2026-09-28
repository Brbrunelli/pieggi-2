-- ============================================================
-- SISTEMA PIEGGI — Migration 0017: funil simplificado
--
-- O funil de vendas passa a viver no PIPEDRIVE. Aqui ficam só as
-- etapas que a operação precisa enxergar:
--
--   negociação → aprovado → (perdido)
--
-- "Aprovado" é a chave: é ela que libera Programação, Comandas,
-- Plaquinhas e Compras. A assinatura de contrato fica para depois,
-- como funcionalidade própria — hoje o aceite do cliente basta.
--
-- Etapas antigas (frio/morno/quente/contrato p/ assinatura) são
-- reagrupadas em "negociação"; contrato assinado vira "aprovado".
-- Nenhum evento é perdido no caminho.
-- ============================================================

-- ---------- 1. solta as travas antigas ----------
alter table public.events   drop constraint if exists events_pipeline_check;
alter table public.pipeline_log drop constraint if exists pipeline_log_de_check;
alter table public.pipeline_log drop constraint if exists pipeline_log_para_check;

-- ---------- 2. reagrupa o que já existe ----------
update public.events
set pipeline = case
      when pipeline in ('frio', 'morno', 'quente', 'contrato_assinatura') then 'negociacao'
      when pipeline = 'contrato_assinado' then 'aprovado'
      else pipeline
    end
where pipeline is not null;

update public.pipeline_log
set de = case
      when de in ('frio', 'morno', 'quente', 'contrato_assinatura') then 'negociacao'
      when de = 'contrato_assinado' then 'aprovado'
      else de
    end,
    para = case
      when para in ('frio', 'morno', 'quente', 'contrato_assinatura') then 'negociacao'
      when para = 'contrato_assinado' then 'aprovado'
      else para
    end;

-- ---------- 3. novo padrão e nova trava ----------
alter table public.events
  alter column pipeline set default 'negociacao';

alter table public.events
  add constraint events_pipeline_check
  check (pipeline in ('negociacao', 'aprovado', 'perdido'));

comment on column public.events.pipeline is
  'Etapa local. O funil comercial completo vive no Pipedrive; aqui só: negociacao → aprovado (libera a operação) → perdido.';

-- ---------- 4. de onde veio o negócio ----------
-- Guardar o link do negócio no Pipedrive evita procurar de novo:
-- do evento você abre o Pipedrive e vice-versa.
alter table public.events
  add column if not exists pipedrive_url text;

comment on column public.events.pipedrive_url is
  'Link do negócio correspondente no Pipedrive (opcional).';
