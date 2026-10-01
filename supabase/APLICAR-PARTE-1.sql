-- ============================================================
-- APLICAR — PARTE 1 de 2
--
-- Só isto. É uma linha, e precisa ser uma transação separada: no
-- Postgres, usar um valor novo de enum na mesma transação em que ele é
-- criado dá erro. A Parte 2 usa 'financeiro' nas funções de permissão.
--
-- Rode, espere "Success", e só então abra a PARTE 2.
-- ============================================================

alter type public.user_role add value if not exists 'financeiro';

select 'Parte 1 aplicada. Agora rode APLICAR-PARTE-2.sql' as resultado;