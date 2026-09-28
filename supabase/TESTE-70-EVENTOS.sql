-- ============================================================
-- TESTE DE VOLUME — 70 eventos num mês
--
-- Eu não consigo clicar na tela: não tenho navegador aqui. O que consigo
-- é te dar o volume para VOCÊ estressar de verdade, e um comando para
-- apagar tudo depois.
--
-- Todos os eventos criados têm o nome começando com "[TESTE]" e é por
-- isso que a limpeza no fim do arquivo é segura.
--
-- Gera:
--   · 70 eventos com contrato assinado (pipeline = aprovado)
--   · datas espalhadas de 5 dias atrás a 40 dias à frente
--   · 1 a 3 serviços por evento, com horários
--   · ~1/3 com programação aprovada, ~1/5 com produção gerada,
--     ~1/6 dentro de uma lista de compras
--
-- Ou seja: as quatro colunas ficam cheias, com pendências espalhadas —
-- que é exatamente o cenário que você quer ver.
--
-- RODE EM HOMOLOGAÇÃO/TESTE. Se rodar no banco de produção, use a
-- limpeza do fim assim que terminar de olhar.
-- ============================================================

-- ---------- 1. eventos ----------
insert into public.events (
  nome, cliente_nome, contato, contato_telefone, contato_email,
  pax, endereco, endereco_confirmado, local_detalhe,
  orcamento_valor, pipeline, status, restricoes
)
select
  '[TESTE] Evento ' || lpad(n::text, 2, '0'),
  (array['Alfa Corp','Beta Tech','Gama Seguros','Delta Bank','Épsilon Educação',
         'Zeta Saúde','Eta Energia','Teta Varejo'])[1 + (n % 8)],
  (array['Ana Paula','Bruno Dias','Carla Mendes','Diego Rocha','Elisa Prado'])[1 + (n % 5)],
  '1198' || lpad(((n * 7919) % 10000000)::text, 7, '0'),
  'contato' || n || '@exemplo.com.br',
  (array[25, 40, 60, 90, 120, 180, 300])[1 + (n % 7)],
  'Av. das Nações Unidas, ' || (10000 + n * 13) || ' — São Paulo',
  (n % 5) <> 0,                                   -- 1 em 5 sem endereço confirmado
  (array['9º andar','Auditório','Torre Norte','Sala 302'])[1 + (n % 4)],
  round((3000 + (n * 617) % 42000)::numeric, 2),
  'aprovado',
  'proposta_aprovada',
  case when n % 11 = 0
       then '[{"tipo":"lactose","pax":2,"critico":false}]'::jsonb
       else '[]'::jsonb end
from generate_series(1, 70) as n;

-- ---------- 2. serviços (1 a 3 por evento) ----------
insert into public.event_services (
  event_id, service_type, service_line, dia, periodo,
  hora_inicio, hora_fim, reposicao_pct, pax, ordem
)
select
  e.id,
  (array['coffee_break','welcome_coffee','almoco','coquetel','auditorio'])[1 + ((i + x) % 5)]::public.service_type,
  (array['basic','standard','executive','master'])[1 + ((i + x) % 4)]::public.service_line,
  -- 5 dias atrás até 40 dias à frente, espalhado
  (current_date + ((i * 7919) % 46) - 5)::date,
  (array['manha','tarde','noite'])[1 + (x % 3)]::public.day_period,
  (array['08:00','09:30','12:00','14:00','18:30'])[1 + ((i + x) % 5)]::time,
  (array['10:00','11:00','14:00','16:00','21:00'])[1 + ((i + x) % 5)]::time,
  0,
  null,
  x
from (
  select id, row_number() over (order by nome) as i
  from public.events
  where nome like '[TESTE]%'
) e
cross join generate_series(0, 2) as x
where x <= (e.i % 3);   -- 1, 2 ou 3 serviços

-- ---------- 3. programação aprovada em ~1/3 ----------
insert into public.schedules (event_id, versao, snapshot, aprovado_em)
select id, 1, '{"blocos":[]}'::jsonb, now() - interval '2 days'
from public.events
where nome like '[TESTE]%'
  and (right(nome, 2)::int % 3) = 0;

-- ---------- 4. produção gerada em ~1/5 (comanda + plaquinha) ----------
insert into public.production_orders (event_id, versao, snapshot, aprovado_em)
select id, 1, '{"dias":[]}'::jsonb, now() - interval '1 day'
from public.events
where nome like '[TESTE]%'
  and (right(nome, 2)::int % 5) = 0;

insert into public.signage_sets (event_id, versao, cards, aprovado_em)
select id, 1, '[]'::jsonb, now() - interval '1 day'
from public.events
where nome like '[TESTE]%'
  and (right(nome, 2)::int % 5) = 0;

-- ---------- 5. uma lista de compras cobrindo ~1/6 ----------
insert into public.purchase_lists (nome, event_ids, snapshot)
select
  '[TESTE] Consolidado da semana',
  array_agg(id),
  '{"secoes":[]}'::jsonb
from public.events
where nome like '[TESTE]%'
  and (right(nome, 2)::int % 6) = 0;

-- ---------- conferência ----------
select
  (select count(*) from public.events where nome like '[TESTE]%')          as eventos,
  (select count(*) from public.event_services s
     join public.events e on e.id = s.event_id
    where e.nome like '[TESTE]%')                                          as servicos,
  (select count(*) from public.schedules s
     join public.events e on e.id = s.event_id
    where e.nome like '[TESTE]%')                                          as com_programacao,
  (select count(*) from public.production_orders p
     join public.events e on e.id = p.event_id
    where e.nome like '[TESTE]%')                                          as com_producao;


-- ============================================================
-- LIMPEZA — rode isto quando terminar de testar
-- ============================================================
-- delete from public.purchase_lists where nome like '[TESTE]%';
-- delete from public.events where nome like '[TESTE]%';
--   (serviços, programação, produção e plaquinhas caem junto por
--    ON DELETE CASCADE; a lista de compras não referencia evento por FK,
--    então ela precisa ser apagada à parte — por isso as duas linhas.)
