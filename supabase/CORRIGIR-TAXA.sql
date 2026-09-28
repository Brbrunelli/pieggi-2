-- ============================================================
-- CORREÇÃO — taxa de serviço não incide sobre a logística
--
-- A receita 0014 já trazia este ajuste, mas naquele momento a
-- configuração "taxas_externos" ainda não existia (ela é criada pela
-- 0007). Quando a 0007 rodou depois, recriou o valor antigo.
--
-- Regra certa (conferida nos 4 orçamentos da ITAM):
--   10% sobre o subtotal de alimentos e bebidas
--   + R$ 250 de logística somados DEPOIS, sem taxa
-- ============================================================

update public.rule_params
set valor = jsonb_set(valor, '{taxa_incide_sobre_logistica}', 'false'::jsonb),
    descricao = 'Externos: Taxa de serviço 10% sobre o subtotal (alimentos e bebidas) + Logística R$ 250 somada depois, sem taxa. StartSe/Inteli/WTC/IPT são isentos dos dois.'
where chave = 'taxas_externos';

-- confere o resultado — tem que aparecer "false"
select chave, valor->>'taxa_incide_sobre_logistica' as taxa_sobre_logistica
from public.rule_params
where chave = 'taxas_externos';
