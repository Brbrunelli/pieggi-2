-- ============================================================
-- SISTEMA PIEGGI — Migration 0013: template completo
--
-- O template oficial passou a ser a junção de:
--   • 00. Pieggi - Orçamento - Template.pptx  (capas, dados, orçamento,
--     9 slides de cardápio)
--   • template_proposta.pptx  (4 slides institucionais + orçamento
--     comparativo em colunas)
--
-- Master e layouts dos dois arquivos são idênticos, então os slides
-- importados entraram no fim, virando 14–18. A ORDEM do deck não depende
-- mais da posição no arquivo: o gerador remonta o sldIdLst como
-- capa → institucional → dados → orçamento → cardápios → capa final.
--
-- ⚠️ Requer subir o novo "template-proposta.pptx" no bucket `assets`
--    (modulo-propostas/template-proposta.pptx).
-- ============================================================

update public.rule_params
set valor = valor
      || '{"institucional": [14, 15, 16, 17]}'::jsonb
      || '{"orcamento_comparativo": 18}'::jsonb,
    descricao =
      'Mapa dos slides do template-proposta.pptx (18 slides). "sempre" = [capa inicial, capa final] · '
      || '"institucional" = [14,15,16,17], apresentação da casa — entra automaticamente para cliente externo '
      || 'e fica de fora para StartSe/Inteli/WTC · "dados" = 2 · "orcamento" = 3 (composição única) · '
      || '"orcamento_comparativo" = 18 (uma coluna de preço por pacote) · "cardapio" = slides opcionais por serviço.'
where chave = 'template_proposta';
