-- ============================================================
-- SISTEMA PIEGGI — Migration 0014: venda por unidade
--
-- Até aqui o orçamento só sabia vender PACOTE: preço por pax × pax.
-- Feiras e stands (ITAM/Intersolar, Beauty Fair) são vendidos por
-- QUANTIDADE: "Salgados artesanais — 2 un/pax", R$ 11,499 a unidade,
-- multiplicado por pax e por número de dias.
--
-- Preços conferidos nas 4 versões do orçamento ITAM (Essencial,
-- Intermediária, Completa e 2 tipos × 2 un): todas fecham no mesmo
-- preço unitário, mudando só a quantidade.
-- ============================================================

-- ---------- preço por unidade, por tabela de preço ----------
create table if not exists public.price_units (
  id             uuid primary key default gen_random_uuid(),
  price_table_id uuid not null references public.price_tables (id) on delete cascade,
  -- grupo de venda: 'salgado_artesanal', 'pao_de_queijo', 'bebidas_coffee'…
  grupo          text not null,
  -- como o preço é cobrado
  base           text not null default 'unidade' check (base in ('unidade', 'pax_dia')),
  preco          numeric(10,4) not null,
  obs            text,
  ativo          boolean not null default true,
  unique (price_table_id, grupo)
);

alter table public.price_units enable row level security;

drop policy if exists price_units_leitura on public.price_units;
create policy price_units_leitura on public.price_units
  for select to authenticated using (true);

drop policy if exists price_units_escrita on public.price_units;
create policy price_units_escrita on public.price_units
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- como cada evento é cobrado ----------
alter table public.events
  add column if not exists modo_cobranca text not null default 'pacote'
    check (modo_cobranca in ('pacote', 'unidade'));

comment on column public.events.modo_cobranca is
  'pacote = preço por pax da linha contratada · unidade = preço por unidade × un/pax × pax × dias (feira/stand, modelo ITAM)';

-- ---------- de que grupo de venda é cada categoria do catálogo ----------
insert into public.rule_params (chave, valor, descricao, categoria) values
('venda_por_unidade',
 '{"grupos": {"mini_lanche": "salgado_artesanal", "tramezzino": "salgado_artesanal", "croissant": "salgado_artesanal", "quiche": "salgado_artesanal", "barquete": "salgado_artesanal", "tartelete": "salgado_artesanal", "canape": "salgado_artesanal", "salgado_festa": "salgado_artesanal", "petit_four_salgado": "salgado_artesanal", "coquetel_item": "salgado_artesanal", "bebezinho": "doce_artesanal", "petit_four_doce": "doce_artesanal", "doce_confeitaria": "doce_artesanal", "verrine": "doce_artesanal", "pao_de_queijo": "pao_de_queijo", "bebida": "bebidas_coffee", "shot_funcional": "shot", "shot_vitaminado": "shot", "acompanhamento": "ilha_da_casa", "dip": "ilha_da_casa", "pasta_board": "ilha_da_casa", "tabua": "ilha_da_casa", "salada": "ilha_da_casa"}, "rotulos": {"salgado_artesanal": "Salgados artesanais", "doce_artesanal": "Doces artesanais", "pao_de_queijo": "Pão de queijo", "bebidas_coffee": "Café, suco de laranja e água", "shot": "Shots funcionais", "ilha_da_casa": "Ilha da casa — frutas, iogurte e granola"}}',
 'Venda por unidade: "grupos" liga a categoria do catálogo ao grupo cobrado; "rotulos" é como o grupo aparece no orçamento do cliente. Os preços ficam em price_units.',
 'preco')
on conflict (chave) do update
  set valor = excluded.valor, descricao = excluded.descricao;

-- ---------- preços unitários dos Externos ----------
-- CONFERIDOS: os três primeiros saem do orçamento ITAM/Intersolar (25-08) —
-- as 4 versões (Essencial, Intermediária, Completa e 2 tipos × 2 un) fecham
-- todas no mesmo preço unitário.
-- ⚠️ ESTIMADOS: os marcados com "CONFERIR" são chute com base na proporção
--    do pacote; Bruno precisa validar antes de mandar proposta.
insert into public.price_units (price_table_id, grupo, base, preco, obs)
select id, v.g, v.b, v.p, v.o
from public.price_tables, (values
  ('salgado_artesanal', 'unidade', 11.4990, 'CONFERIDO (ITAM 25-08). Mini lanche, tramezzino, croissant, quiche, barquete, tartelete, canapé'),
  ('pao_de_queijo',     'unidade',  2.4990, 'CONFERIDO (ITAM 25-08). Tradicional e multigrãos'),
  ('bebidas_coffee',    'pax_dia', 23.2999, 'CONFERIDO (ITAM 25-08). Café, suco de laranja e água — bloco por pessoa/dia'),
  ('doce_artesanal',    'unidade',  9.9990, '⚠️ CONFERIR — estimado. Bolo bebezinho, petit four doce, verrine'),
  ('shot',              'unidade',  7.9990, '⚠️ CONFERIR — estimado. Shot funcional e vitaminado'),
  ('ilha_da_casa',      'pax_dia',  9.9990, '⚠️ CONFERIR — estimado. Frutas da estação, iogurte, granola, dips e tábuas')
) as v(g, b, p, o)
where kind = 'externos'
on conflict (price_table_id, grupo) do nothing;

-- ---------- taxa de serviço não incide sobre a logística ----------
-- Conferido nas propostas reais: 10% sobre o subtotal de alimentos e
-- bebidas; a logística de R$ 250 é somada depois, sem taxa.
update public.rule_params
set valor = jsonb_set(valor, '{taxa_incide_sobre_logistica}', 'false'::jsonb),
    descricao = 'Externos: Taxa de serviço 10% sobre o subtotal (alimentos e bebidas) + Logística R$ 250 somada depois, sem taxa. StartSe/Inteli/WTC/IPT são isentos dos dois.'
where chave = 'taxas_externos';
