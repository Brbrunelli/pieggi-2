-- ============================================================
-- SISTEMA PIEGGI — Migration 0012: slide de orçamento comparativo
-- Prepara o mapa do template para o formato "pacotes lado a lado"
-- (Descritivo · PAX · Standard · Executive · Master).
--
-- Como usar: crie no template um slide de orçamento com uma coluna
-- de preço por pacote e informe o número dele em
-- template_proposta → orcamento_comparativo. Enquanto for null,
-- propostas com opções saem no formato de linhas (que já funciona).
-- ============================================================

update public.rule_params
set valor = valor || '{"orcamento_comparativo": null}'::jsonb,
    descricao = descricao || ' · "orcamento_comparativo" = slide com uma coluna de preço por pacote (null = usa o formato de linhas).'
where chave = 'template_proposta'
  and not (valor ? 'orcamento_comparativo');
