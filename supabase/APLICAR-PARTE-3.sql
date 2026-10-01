-- ============================================================
-- APLICAR — PARTE 3 de 8
--
-- Rode SÓ DEPOIS das Partes 1 e 2 (0021–0027).
--
-- Só isto, de novo em transação separada: no Postgres, usar um valor
-- novo de enum na mesma transação em que ele é criado dá erro. A Parte 4
-- usa 'logistica' nas funções de permissão da rua.
--
-- Rode, espere "Success", e só então abra a PARTE 4.
-- ============================================================

alter type public.user_role add value if not exists 'logistica';

select 'Parte 3 aplicada. Agora rode APLICAR-PARTE-4.sql' as resultado;
