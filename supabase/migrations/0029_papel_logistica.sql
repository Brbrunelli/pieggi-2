-- ============================================================
-- SISTEMA PIEGGI — Migration 0029: papel 'logistica'
--
-- A rua (Adriana + coordenadores de evento) passa a usar o sistema:
-- escala de freelancers, conferência de material, checklist com foto e
-- termo de sobras. Não é cozinha (não produz) nem comercial (não vende):
-- é um papel próprio.
--
-- ATENÇÃO: só o ADD VALUE nesta migration, em transação separada — usar
-- o valor novo na mesma transação em que ele nasce falha no Postgres.
-- As funções que comparam com 'logistica' ficam na 0030.
-- ============================================================

alter type public.user_role add value if not exists 'logistica';
