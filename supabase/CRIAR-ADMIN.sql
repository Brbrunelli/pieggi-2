-- ============================================================
-- VIRAR ADMIN
--
-- Rode DEPOIS de criar o usuário em Authentication > Users.
--
-- Quando alguém é criado no Auth, o sistema cria o perfil sozinho —
-- mas com o papel "comercial", que não enxerga preços nem parâmetros.
-- Este comando promove o Bruno a admin.
--
-- Para promover outra pessoa depois, troque o e-mail na linha do where.
-- ============================================================

update public.profiles p
set role  = 'admin',
    ativo = true,
    nome  = coalesce(nullif(p.nome, ''), 'Bruno Brunelli'),
    email = u.email
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('bruno@pieggi.com.br');

-- confere — tem que aparecer role = admin e ativo = true
select p.email, p.nome, p.role, p.ativo
from public.profiles p
order by p.created_at desc;
