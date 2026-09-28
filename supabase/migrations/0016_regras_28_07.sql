-- ============================================================
-- SISTEMA PIEGGI — Migration 0016: regras da revisão 28/07/2026
--
-- Fonte: os 5 arquivos "CONFIG Claudinho ... (completa 28-07).md",
-- um por módulo. Onde havia conflito, vale sempre a revisão mais nova.
--
-- Também aplica o que o confronto ERP × cardápio revelou (ver o bloco
-- final "DIVERGÊNCIAS").
-- ============================================================

-- ============================================================
-- 1. PROIBIDOS — Red Velvet e Wrap de abacate voltaram
-- ============================================================
-- §14.6/§14.7 (Programação), §11.4/§11.5 (Proposta), §16.1/§16.2
-- (Plaquinhas), §17.4/§17.10 (Comanda). Atum CONTINUA proibido.

update public.catalog_items
set proibido = false, descontinuado = false,
    obs = coalesce(obs || ' · ', '') || 'Liberado na revisão 28/07/2026.'
where proibido
  and (
    lower(public.unaccent_simples(nome)) like '%red velvet%'
    or lower(public.unaccent_simples(nome)) like '%abacate%'
  );

-- o wrap de abacate exige montagem no local (discos + recheio + alface
-- separados) — a programação e a comanda precisam avisar
update public.catalog_items
set obs = coalesce(obs || ' · ', '') ||
      'MONTAGEM NO LOCAL: enviar discos + recheio + folhas de alface separados (copeiras montam).'
where lower(public.unaccent_simples(nome)) like '%abacate%'
  and categoria in ('wrap', 'envelope_gourmet');

-- ============================================================
-- 2. REGRAS NOVAS (rule_params)
-- ============================================================
insert into public.rule_params (chave, valor, descricao, categoria) values

-- §14.1 / §11.1 / §17.1 / §4 (Compras)
('agua_de_coco', '{"equivale_a": "cha_gelado", "ml_pax": 80}',
 'Água de coco é calculada como chá gelado: 80 ml/pax. Vale para programação, comanda e compras.',
 'quantidades'),

-- §14.2 / §11.2 / §17.2 — gramaturas fixas, mesmo quando "a gosto"
('coffee_acompanhamentos', '{"achocolatado_g_pax_periodo": 3, "sucrilhos_g_pax_periodo": 5, "sache_acucar_por_ml_cafe": 100, "cha_sache_pax": 0.5, "iogurte_ml_pax": 20, "granola_g_pax": 10, "aveia_g_pax": 10, "mel_g_pax": 5}',
 'Coffee — acompanhamentos com gramatura FIXA (rev. 28/07): achocolatado/Nescau 3 g/pax/período (pote de inox), sucrilhos 5 g/pax/período, 1 sachê de açúcar e 1 de adoçante por dose de 100 ml de café (auditório conta), chá 0,5 sachê/pax.',
 'quantidades'),

-- §14.3 / §11.3 / §6.7 — quantos itens a mais por linha
('coffee_itens_a_mais', '{"basic": 0, "standard": 1, "executive": 2, "master": 3, "master_extras": {"frutas_laminadas_g_pax": 50, "favo_de_mel": true}}',
 'Itens a mais do coffee (variedade além da base mini lanche + bebezinho + pão de queijo + salada + bebidas): Standard 1, Executive 2, Master 3 + frutas laminadas e favo de mel (50 g/pax). Manhã salgado, tarde doce; acima de ~50 pax divide 50/50 em 2 sabores.',
 'quantidades'),

-- §14.4 / §11.6 / §17.7 / §8 (Comanda)
('recipiente_verrine', '{"coffee_break": "copo_bolha", "welcome_coffee": "copo_bolha", "coquetel": "cup_vidro", "bar": "cup_vidro", "brunch": "cup_vidro", "almoco": "cup_vidro", "jantar": "cup_vidro", "coquetel_pizza": "cup_vidro", "regra": "escrever o recipiente ao lado do sabor; não explícito = PERGUNTAR; item já rotulado manda; copo bolha é descartável e NÃO conta como vidro"}',
 'Recipiente da verrine/doce por serviço (rev. 28/07). Coffee = copo bolha (descartável), salvo cliente que peça vidro. HH/Coquetel/Grazing/Brunch/Almoço/Jantar = SEMPRE cup de vidro. Na plaquinha o recipiente NÃO aparece (§16.4).',
 'expedicao'),

-- §2.7 / §14.15 / §11.9 / §17.15 / §2 (Compras)
('marcas_bebida', '{"startse": {"refri": "Pepsi", "cerveja": "Budweiser", "agua": "Minalba", "agua_fornecedor": "mercado"}, "inteli": {"refri": "Pepsi", "cerveja": "Budweiser", "agua": "Minalba", "agua_fornecedor": "mercado"}, "padrao": {"refri": "Coca-Cola", "cerveja": "Heineken", "agua": "Lindoia", "agua_fornecedor": "bebidas_imigrantes"}, "refri_normal_pax": 0.7, "refri_zero_pax": 1.3, "cerveja_pax_2h": 1.5, "nunca_1_litro": true, "guarana_so_avisado": true}',
 'Marcas por cliente (rev. 28/07): StartSe/Inteli = Pepsi + Budweiser + água Minalba (mercado). Demais = Coca-Cola + Heineken + água Lindóia (Bebidas Imigrantes). Outra marca só quando o cliente pedir — avisar. Refrigerante SEMPRE em lata, nunca 1 L. Guaraná Antarctica só quando avisado. Cerveja 1,5/pax por 2h, especificar LATA ou LONG NECK.',
 'compras'),

-- §14.12 / §11.11 / §17.6 / §4 (Compras)
('arranjo_flores', '{"todo_evento": true, "quantidade": 1, "rotulo": "Arranjo de flores — {DD/MM} — {evento}", "onde": ["programacao", "comanda_expedicao_estrutura", "compras"]}',
 'TODO evento leva 1 arranjo de flores (rev. 28/07). Entra na programação, na Expedição–Estrutura da comanda e na lista de compras.',
 'expedicao'),

-- §2.3 / §14.9 / §11.7 / §17.11 / §16.3
('regra_brioche', '{"com_carne": "brioche_tradicional", "sem_carne": "brioche_cenoura", "nunca": "pao_frances", "ajustar_aveia_alecrim": true, "marcar": "(ajustado da regra Pieggi)", "excecao": "pão específico pedido de propósito", "hamburguer_conta_como": "brioche_tradicional"}',
 'Pão do mini lanche: com carne = brioche tradicional; sem carne = brioche de cenoura, MESMO que o cardápio traga aveia (Veg II) ou alecrim (Veg III) — trocar e marcar "(ajustado da regra Pieggi)". NUNCA pão francês. Pão de hambúrguer soma no total de brioche tradicional (§4 Compras).',
 'cardapio'),

-- §11.10 / §2 e §5 (Compras)
('bebida_extra', '{"itens": ["vinho", "champagne", "espumante"], "categoria_compras": "Bebidas extras", "fornecedor": "bebidas_imigrantes", "sinalizar_na_proposta": true}',
 'Vinho, champagne, espumante ou qualquer bebida fora do padrão = "bebida extra": sinalizar na proposta e abrir categoria própria na lista de compras (fornecedor Bebidas Imigrantes).',
 'compras'),

-- §4 (Compras) — conversões de compra
('compras_conversoes', '{"wrap_discos_por_pacote": 10, "wraps_por_disco": 3, "gelo_pacote_kg": 3, "gelo_pax_por_pacote": 25, "guacamole_abacate_pct": 50, "guacamole_avocado_pct": 50, "agua_saborizada": ["agua_galao", "limao_siciliano", "alecrim"], "batata_frita": "congelada_mercado"}',
 'Conversões de compra (rev. 28/07): 1 pacote de disco de wrap = 10 discos, 1 disco = 3 wraps (lançar pacotes). Gelo 1 pacote de 3 kg a cada 25 pax quando houver bebida gelada. Guacamole = 50% abacate + 50% avocado. Água saborizada = galão + limão siciliano + alecrim separados (copeiras montam). Batata frita congelada, do mercado.',
 'compras'),

-- §3 (Compras) / §5 e §17.3 (Comanda)
('fornecedores', '{"leticia": ["quibe_frito", "salgadinho_festa", "bolinha_queijo", "esfiha", "mini_pizza", "empada", "frios_hh", "paes_hh"], "rotisseria": ["nhoque", "raviole"], "luigi": ["pizza"], "mercado": ["agua_minalba", "coalhada", "tabua_queijos_hh", "croutons", "batata_frita_congelada", "gelo", "flor_de_sal", "edamame", "mix_castanhas", "acucar_adocante_achocolatado", "granola_aveia_mel_sucrilhos", "discos_wrap", "aromaticos"], "bebidas_imigrantes": ["agua_lindoia", "bebidas_extras"], "producao_interna": ["croissant_de_queijo", "pao_de_batata", "pao_de_batata_com_catupiry", "confeitaria", "panificacao"]}',
 'Roteamento de compra por fornecedor (rev. 28/07). ATENÇÃO §17.3: croissant de queijo e pão de batata (incl. com catupiry) são PRODUÇÃO INTERNA Pieggi — nunca encomenda externa, nunca "a classificar". Leal só quando o Bruno avisar. O molho da massa é produção Pieggi (não entra na compra de massa).',
 'compras'),

-- §10.1 (Comanda)
('molhos_por_kg_massa', '{"pomodoro": 350, "bechamel": 400, "branco": 400, "funghi": 400, "pesto_tradicional": 200, "pesto_cremoso": 350, "unidade": "g por kg de massa pronta", "regra": "massa e molho em linhas separadas; molho = Cozinha Quente; parmesão à parte; molho fora da tabela = PERGUNTAR"}',
 'Molho por kg de massa pronta (rev. 28/07). Nunca somar molho ao peso da massa. Parmesão ralado (mercado, à parte) SEMPRE que houver massa + molho.',
 'quantidades'),

-- §17.8 / §14.5
('montagem_no_local', '{"cup_cake": "enviar SEM recheio + recheio em manga com bico à parte; copeiras montam (não destruir no transporte)", "wrap_abacate": "discos + recheio + folhas de alface separados", "canapes": "cozinha manda os componentes prontos; copeiras finalizam/montam no local (linha vermelha de finalização com o descritivo completo)", "cubinho_tapioca": "comprado congelado, Cozinha Quente frita, geleia de pimenta à parte", "banana_da_terra": "grelha na Cozinha Quente, copeiras montam o tartelete", "agua_saborizada": "água + aromáticos separados", "salada_frutas": "pedaços grandes, copeira pica no local"}',
 'O que sai desmontado e é finalizado no local pelas copeiras (rev. 28/07). Cada um vira linha vermelha de finalização na comanda, com o descritivo completo do cardápio.',
 'expedicao'),

-- §11 (Comanda)
('horario_saida', '{"formula": "horario_servir_menos_3h", "horas_antes": 3, "quando_indefinido": "deixar em branco para preencher à mão", "campo": "DIA E HORÁRIO DA SAÍDA"}',
 'Horário de saída da comanda (rev. 28/07): horário definido → servir − 3h. Horário "a confirmar"/"manhã" → deixar o campo em branco (linha para preencher à mão).',
 'expedicao'),

-- §14.10 / §11.8 / §17.18 / §16.5
('nao_misturar_servicos', '{"regra": "não colocar item de um serviço no cardápio de outro", "exemplos": {"mix_de_castanhas": "coffee, não vai no HH", "tartelete_de_salmao": "canapé de coquetel, não vai no coffee", "canape_coquetel_no_coffee": "proibido (shimeji, gorgonzola/pêra, carpaccio)"}}',
 'Cada serviço tem o seu cardápio (rev. 28/07). Não migrar item entre serviços — vale para proposta, programação, comanda e plaquinha.',
 'cardapio')

on conflict (chave) do update
  set valor = excluded.valor, descricao = excluded.descricao;

-- ============================================================
-- 3. ITENS OFICIAIS NOVOS (jul/2026) — §4.1 da Programação
-- ============================================================
insert into public.catalog_items (categoria, nome, base_sabor, servicos, periodos, selo, estacao, obs) values
('quiche', 'Quiche Lorraine', 'bacon', '{coquetel,brunch,almoco,jantar}', '{}', null, 'confeitaria',
 'HH Executive+, Brunch e Almoço/Jantar. Contraponto = mini quiche de queijo ou alho-poró. Sai pronto.'),
('quiche', 'Mini quiche de palmito', 'palmito', '{coffee_break}', '{tarde}', 'vegetariano', 'confeitaria',
 'Coffee Executive+, SÓ à tarde. Substitui a empadinha de palmito (não oferecer mais empadinha).'),
('doce_confeitaria', 'Croissant de queijo e goiabada', 'goiaba', '{coffee_break}', '{tarde}', 'vegetariano', 'confeitaria',
 'Coffee Break Executive+ (doces).'),
('doce_confeitaria', 'Mini cup cake bombocado', 'bombocado', '{coffee_break}', '{tarde}', 'vegetariano', 'confeitaria',
 'Coffee Break Executive+ (doces).'),
('shot_funcional', 'Verde Vital', 'couve', '{coffee_break}', '{}', 'vegano', 'confeitaria',
 'Couve, gengibre, limão, abacaxi e água de coco (§14.16).')
on conflict do nothing;

-- ============================================================
-- 4. DIVERGÊNCIAS DO CONFRONTO ERP × CARDÁPIO
-- ============================================================
-- Registradas como parâmetro para aparecerem no painel de admin em vez
-- de serem "resolvidas" no escuro. Bruno decide qual lado vale.
insert into public.rule_params (chave, valor, descricao, categoria) values
('divergencias_erp_cardapio',
 '{"conferido_em": "2026-07-29", "preco": [{"item": "Kit Açúcar e Adoçante", "cardapio": 10.00, "erp": 15.00}, {"item": "Chá Gelado na Refresqueira", "cardapio": 45.00, "erp": 30.00}], "no_erp_sem_cardapio": ["Favo de mel (R$ 270 / porção 100 pax)", "Frutas Laminadas (R$ 75 / porção)"], "no_cardapio_sem_erp": ["Locação Nespresso caseira (R$ 450 + cápsula R$ 11,50)", "Locação Nespresso profissional (à consultar)"], "pao_divergente": {"regra": "nunca pão francês (§2.3)", "erp_diz_pao_frances_ou_ciabatta": ["Peito de Peru", "Presunto Comum", "Provolone", "Lombo Canadense", "Salame Comum", "Copa", "Presunto Royale", "Pastrami Artesanal (ciabatta)", "Rosbife Artesanal"]}, "proibido_no_cardapio": [{"item": "Atum", "onde": "Cardápio Coffee Break 2026, R$ 13,50", "regra": "atum continua proibido em todos os 5 módulos"}], "familias_sem_erp": ["COQUETEL", "ALMOÇO", "JANTAR", "BRUNCH"]}',
 'Confronto da planilha de custos do ERP (137 produtos, só COFFEE BREAK) com o Cardápio Coffee Break 2026 e as regras da revisão 28/07. Cada item precisa de decisão do Bruno — nada foi alterado automaticamente.',
 'preco')
on conflict (chave) do update
  set valor = excluded.valor, descricao = excluded.descricao;
