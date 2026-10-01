-- ============================================================
-- SISTEMA PIEGGI — Migration 0034: checklist da copeira e termo
--
-- Revisão de 24/09/2026 (programação "IA para Negócios"): o que a
-- copeira faz no local entra no checklist do celular — com a regra do
-- suco, as garrafas do Natural One, gelar tudo, bebida que sobra volta.
-- O termo de sobras ganha os campos do papel: documento/telefone de
-- quem recebe e quem entregou pela Pieggi.
--
-- Depende da 0030. Pode rodar de novo sem erro.
-- ============================================================

alter table public.event_sobras
  add column if not exists entregue_por text,
  add column if not exists aceite_texto text;

comment on column public.event_sobras.entregue_por is
  'Quem entregou pela Pieggi (nome da copeira/coordenador), como no termo de papel.';
comment on column public.event_sobras.aceite_texto is
  'Cópia do texto do termo no momento da assinatura — se o texto mudar depois, o que o cliente assinou continua guardado.';

comment on column public.event_sobras.recebedor_contato is
  'Documento ou telefone de quem recebeu.';

-- itens da copeira — entram só se ainda não existirem (pelo texto)
insert into public.checklist_templates (momento, texto, detalhe, service_types, exige_foto, obrigatorio, ordem)
select v.momento, v.texto, v.detalhe, v.service_types, v.exige_foto, v.obrigatorio, v.ordem
from (values
  ('montagem', 'Encadernado da biblioteca Pieggi + kit de finalização em mãos',
     'Fichas OP/PA/BAS/MQ/CAN/TR/BF.', null::public.service_type[], false, true, 1),
  ('montagem', 'Bancada, utensílios e mãos higienizados antes de montar',
     'Uniforme completo.', null, false, true, 2),
  ('montagem', 'Toda a bebida gelada assim que chegou',
     'Suco, chá gelado e água. Nada vai para a mesa sem estar gelado.', null, false, true, 35),
  ('montagem', 'Suco montado: receita pronta + gelo, SEM ÁGUA',
     '500 g de gelo na suqueira → 1 receita pronta → não adicionar água → misturar antes de abrir. Nunca misturar sabores na sobra.',
     array['coffee_break', 'brunch', 'almoco', 'jantar', 'coquetel', 'bar']::public.service_type[], true, true, 36),
  ('reposicao', 'Café e água repostos durante todo o serviço de sala', null, null, false, true, 20),
  ('reposicao', 'Reposição de suco = nova receita pronta + gelo',
     'Nunca completar com água.',
     array['coffee_break', 'brunch', 'almoco', 'jantar', 'coquetel', 'bar']::public.service_type[], false, true, 21),
  ('desmontagem', 'Bebida que sobrou conferida e devolvida FECHADA ao buffet',
     'A Pieggi manda a mais de propósito. Cliente pediu para ficar? Não combinar nada — ligar ANTES para o Luiz.', null, false, true, 20),
  ('desmontagem', 'Garrafas de 1,7 L do suco Natural One separadas para voltar',
     'Se o evento teve Natural One.', null, false, false, 21),
  ('desmontagem', 'Louças, térmicas e refresqueiras lavadas e devolvidas',
     'Ao fim de cada serviço.', null, false, true, 30)
) as v(momento, texto, detalhe, service_types, exige_foto, obrigatorio, ordem)
where not exists (select 1 from public.checklist_templates t where t.texto = v.texto);
