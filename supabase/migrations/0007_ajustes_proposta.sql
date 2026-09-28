-- ============================================================
-- SISTEMA PIEGGI — Migration 0007: ajustes da Proposta
--  • cliente avulso com nome livre (cliente novo, sem cadastro)
--  • PAX por serviço (coffee 30 × almoço 45 no mesmo evento)
--  • "preço a definir" (cliente que ainda não conhece a casa)
--  • observações com DESTINO (cozinha/expedição/…) e IMPACTO em R$
--  • orçamento deixa de ser digitado: vem do total da proposta
--  • mapa de slides do template configurável (institucional p/ externos)
-- ============================================================

-- ---------- eventos ----------
alter table public.events
  add column if not exists cliente_nome    text,
  add column if not exists preco_a_definir boolean not null default false;

comment on column public.events.cliente_nome is
  'Nome do cliente quando não há cadastro (cliente novo/avulso). Se client_id existir, prevalece o cadastro.';
comment on column public.events.orcamento_valor is
  'AUTOMÁTICO: total da proposta salva. Base da verba 8% da página da Adriana — nunca digitado à mão.';

-- ---------- PAX por serviço ----------
alter table public.event_services
  add column if not exists pax int check (pax is null or pax > 0);

comment on column public.event_services.pax is
  'PAX específico deste serviço. NULL = usa o PAX do evento.';

-- ---------- observações / pedidos com destino e impacto ----------
alter table public.special_requests
  add column if not exists destino       text not null default 'comercial',
  add column if not exists impacto_valor numeric(12,2);

comment on column public.special_requests.destino is
  'Onde o pedido precisa aparecer: comercial | cozinha | expedicao | adriana | copeiras';
comment on column public.special_requests.impacto_valor is
  'Impacto financeiro do pedido (entra como linha extra no orçamento da proposta).';

-- ---------- parâmetros novos ----------
insert into public.rule_params (chave, valor, descricao, categoria) values

('template_proposta',
 '{"sempre": [1, 13], "institucional": [], "dados": 2, "orcamento": 3, "cardapio": [{"n": 4, "label": "Coffee Break Basic / Standard"}, {"n": 5, "label": "Coquetel Executive — Ilha estática"}, {"n": 6, "label": "Coquetel Executive — Serviço volante"}, {"n": 7, "label": "Coquetel Executive — Ilha estática (variação)"}, {"n": 8, "label": "Coquetel Master — Serviço volante"}, {"n": 9, "label": "Coquetel Master — Ilha estática"}, {"n": 10, "label": "Coquetel Master — Volante + massa/salada"}, {"n": 11, "label": "Coquetel Master — Ilha estática (favo de mel)"}, {"n": 12, "label": "Coffee Break Executive + Bar de drinks"}]}',
 'Mapa dos slides do template-proposta.pptx. "sempre" = capas · "institucional" = slides de apresentação da casa (para cliente novo/externo — preencher com os números depois de subir o deck completo) · "dados"/"orcamento" = slides de preenchimento · "cardapio" = slides opcionais por serviço.',
 'proposta'),

('taxas_externos',
 '{"logistica_valor": 250, "taxa_servico_pct": 10, "taxa_incide_sobre_logistica": true, "isentos": ["startse", "inteli", "wtc"]}',
 'Externos: Logística R$ 250 + Taxa de serviço 10% (incide sobre subtotal + logística). StartSe/Inteli/WTC/IPT são isentos.',
 'preco')

on conflict (chave) do nothing;
