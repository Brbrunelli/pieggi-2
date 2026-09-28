-- ============================================================
-- CONFERÊNCIA — cole no SQL Editor e clique em Run.
-- Não muda nada, só olha e mostra um relatório.
-- Cada linha tem ✅ (certo) ou ❌ (faltando).
-- ============================================================

with checagens as (

  -- ---------- receita 0015: produtos do ERP ----------
  select 1 as ordem, 'Produtos do ERP (custo e preço)' as item,
         '137' as esperado, count(*)::text as encontrado, count(*) = 137 as ok
  from public.erp_produtos

  -- ligação por nome IDÊNTICO. Casa pouco de propósito: o ERP escreve
  -- "Shot Verde Vital" e o cardápio, "Verde Vital". O sistema faz a
  -- ligação por semelhança na hora de calcular o CMV — aqui é só um piso.
  union all
  select 2, 'Produtos do ERP ligados ao cardápio (nome idêntico)',
         '1 ou mais', count(*)::text, count(*) >= 1
  from public.erp_produtos where catalog_item_id is not null

  -- ---------- receita 0014: venda por unidade ----------
  union all
  select 3, 'Preços por unidade (Externos)',
         '6', count(*)::text, count(*) = 6
  from public.price_units

  union all
  select 4, 'Coluna "modo_cobranca" nos eventos',
         'existe', coalesce(max('existe'), 'FALTANDO'), count(*) = 1
  from information_schema.columns
  where table_name = 'events' and column_name = 'modo_cobranca'

  union all
  select 5, 'Taxa de 10% NÃO incide sobre a logística',
         'false', coalesce((valor->>'taxa_incide_sobre_logistica'), 'FALTANDO'),
         (valor->>'taxa_incide_sobre_logistica') = 'false'
  from public.rule_params where chave = 'taxas_externos'

  -- ---------- receita 0013: template novo ----------
  union all
  select 6, 'Slides institucionais do template',
         '[14, 15, 16, 17]', coalesce((valor->>'institucional'), 'FALTANDO'),
         (valor->>'institucional') = '[14, 15, 16, 17]'
  from public.rule_params where chave = 'template_proposta'

  union all
  select 7, 'Slide do orçamento comparativo',
         '18', coalesce((valor->>'orcamento_comparativo'), 'FALTANDO'),
         (valor->>'orcamento_comparativo') = '18'
  from public.rule_params where chave = 'template_proposta'

  -- ---------- receita 0016: regras de 28/07 ----------
  union all
  select 8, 'Regras novas gravadas',
         '8 ou mais', count(*)::text, count(*) >= 8
  from public.rule_params
  where chave in ('agua_de_coco', 'coffee_acompanhamentos', 'coffee_itens_a_mais',
                  'recipiente_verrine', 'marcas_bebida', 'arranjo_flores',
                  'regra_brioche', 'bebida_extra', 'compras_conversoes',
                  'fornecedores', 'molhos_por_kg_massa', 'montagem_no_local',
                  'horario_saida', 'nao_misturar_servicos', 'venda_por_unidade',
                  'erp_markup', 'divergencias_erp_cardapio')

  union all
  select 9, 'Red Velvet liberado (não está mais proibido)',
         'liberado',
         case when count(*) filter (where proibido) > 0 then 'AINDA PROIBIDO'
              when count(*) = 0 then 'não achei o item'
              else 'liberado' end,
         count(*) > 0 and count(*) filter (where proibido) = 0
  from public.catalog_items
  where lower(nome) like '%red velvet%'

  union all
  select 10, 'Itens novos do cardápio (quiche, carolina, shot…)',
         '3 ou mais', count(*)::text, count(*) >= 3
  from public.catalog_items
  where nome in ('Quiche Lorraine', 'Mini quiche de palmito',
                 'Croissant de queijo e goiabada', 'Mini cup cake bombocado', 'Verde Vital')

  -- ---------- arquivos que você subiu ----------
  union all
  select 11, 'Template da proposta no Storage',
         'template-proposta.pptx', coalesce(max(name), 'FALTANDO'), count(*) = 1
  from storage.objects
  where bucket_id = 'assets' and name = 'template-proposta.pptx'

  -- arquivo repetido não atrapalha; o que importa é não faltar
  union all
  select 12, 'Selinhos das plaquinhas no Storage',
         '5 ou mais', count(*)::text, count(*) >= 5
  from storage.objects
  where bucket_id = 'assets' and name like 'selo-%'
)

select
  case when ok then '✅' else '❌' end        as "OK",
  item                                        as "O QUE",
  esperado                                    as "DEVERIA SER",
  encontrado                                  as "ESTÁ",
  case when ok then '' else '<<< OLHAR AQUI' end as "ATENCAO"
from checagens
order by ordem;
