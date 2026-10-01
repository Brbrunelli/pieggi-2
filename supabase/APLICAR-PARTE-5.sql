-- ============================================================
-- APLICAR — PARTE 5 de 8
--
-- Rode SÓ DEPOIS da Parte 4. Transação separada de novo: o valor novo
-- do enum ('motorista') não pode ser usado na mesma transação em que
-- nasce — a Parte 6 usa.
-- ============================================================

alter type public.user_role add value if not exists 'motorista';

select 'Parte 5 aplicada. Agora rode APLICAR-PARTE-6.sql' as resultado;
