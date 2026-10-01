-- ============================================================
-- SISTEMA PIEGGI — Migration 0031: papel 'motorista'
--
-- O motorista passa a receber a viagem no celular (endereço, horário,
-- contato no local) em vez de depender do papel impresso. Não é
-- logística: não vê escala, PIX nem valor de freelancer.
--
-- ATENÇÃO: só o ADD VALUE, em transação separada (ver 0021/0029).
-- ============================================================

alter type public.user_role add value if not exists 'motorista';
