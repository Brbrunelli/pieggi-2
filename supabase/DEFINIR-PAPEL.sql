-- ============================================================
-- DEFINIR O PAPEL DE UM USUÁRIO
--
-- Rode DEPOIS de criar a pessoa em Authentication > Users.
-- Quem é criado no Auth nasce com o papel 'comercial' — ou seja, VENDO
-- TODOS OS VALORES. Trocar para 'producao'/'compras' é obrigatório para
-- quem trabalha na cozinha/expedição.
--
--   admin      → tudo: edita e aprova a esteira, cadastros e preços
--   comercial  → vê todos os valores (preço, custo, proposta, CMV) e toca o
--                funil; na operação (programação/comanda/plaquinha) só lê
--   producao   → COZINHA: vê a operação, imprime e dá baixa do que ficou
--                pronto — e não enxerga nada de dinheiro
--   compras    → COZINHA + lista de compras (a lista não tem valores)
--   financeiro → NF, contas a receber e cadastro fiscal
--   motorista  → só as próprias viagens (endereço, horário, contato)
--   logistica  → RUA (Adriana + coordenadores): escala de freelancers,
--                conferência de material, checklist com foto, sobras e
--                encerramento do evento. Não vê preço de venda
-- ============================================================

-- 1) troque o e-mail e o papel e rode:
update public.profiles p
set role  = 'producao',      -- admin | comercial | producao | compras | financeiro | logistica | motorista
    ativo = true,
    email = u.email
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('fulano@pieggi.com.br');

-- 2) confere quem é o quê:
select p.email, p.nome, p.role, p.ativo
from public.profiles p
order by p.role, p.email;

-- Para tirar o acesso de alguém que saiu, sem apagar o histórico de quem
-- aprovou/deu baixa: ativo = false (os helpers papel()/is_admin() só
-- consideram perfil ativo).
-- update public.profiles set ativo = false where lower(email) = lower('fulano@pieggi.com.br');
