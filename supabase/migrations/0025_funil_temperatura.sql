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
