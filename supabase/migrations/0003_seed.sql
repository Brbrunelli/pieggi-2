-- ============================================================
-- SISTEMA PIEGGI — Migration 0003: Seed
-- Parâmetros de regra (rev. 27/07/2026 — sempre a mais recente),
-- clientes fixos, tabelas de preço e catálogo inicial.
-- ⚠️ Catálogo e preços = ponto de partida extraído dos documentos;
--    conferir/completar no admin com o cardápio MAIO2026 oficial.
-- ============================================================

-- ------------------------------------------------------------
-- PARÂMETROS DE REGRA
-- ------------------------------------------------------------
insert into public.rule_params (chave, valor, descricao, categoria) values

-- Fatores gerais
('fator_geral', '{"unitario": 1.1}',
 'Fator geral de quantidade para itens unitários (mini lanche, wrap, tapioca, tartelete, bolo): pax × 1,1', 'quantidades'),

('duracao_base_min', '{"welcome_coffee": 30, "coffee_break": 60, "coquetel": 120, "bar": 120, "brunch": 120, "almoco": 120, "jantar": 120, "coquetel_pizza": 120}',
 'Duração base de cada serviço em minutos (para cálculo de reposição)', 'reposicao'),

('reposicao_pct', '{"coffee_break": {"30": 30, "60": 80, "90": 100, "120": 150}, "coquetel": {"30": 0, "60": 30, "90": 60, "120": 80}, "brunch": {"30": 0, "60": 30, "90": 60, "120": 80}, "almoco": {"30": 0, "60": 30, "90": 60, "120": 80}, "jantar": {"30": 0, "60": 30, "90": 60, "120": 80}, "coquetel_pizza": {"30": 0, "60": 30, "90": 60, "120": 80}, "welcome_coffee": null}',
 'Percentual de reposição por minutos extras (incide em preço E quantidade). Welcome Coffee NUNCA estende. >120min extra = escalar diretor.', 'reposicao'),

-- CMV / trava de desconto
('cmv', '{"teto": 30, "base_startse_externos": 20, "base_wtc": 22.7, "teto_desconto_startse_externos": 33.3, "teto_desconto_wtc": 24, "alerta_startse_externos": [16, 30], "alerta_wtc": [6, 20], "ok_startse_externos": [0, 15], "ok_wtc": [0, 5]}',
 'Trava de desconto por CMV: CMV_result = CMV_base / (1 - X/100). Nunca citar no slide.', 'preco'),

('wtc_repasse_pct', '12',
 'Repasse WTC embutido no preço — mostrar só internamente, nunca no slide', 'preco'),

('verba_pct', '8',
 'Verba da página da Adriana = 8% do orçamento. Nunca exibir o valor do orçamento no documento.', 'comandas'),

('saida_horas_antes', '3',
 'Horário de saída = horário de servir - 3h (com nota "conferir Adriana")', 'comandas'),

-- Bebidas
('bebidas', '{"cerveja_un_pax_2h": 1.5, "refri_lata_normal_pax": 0.7, "refri_lata_zero_pax": 1.3, "refri_apenas_lata": true, "guarana_somente_com_aviso": true, "suco_refresqueira_ml_pax": 150, "agua_refresqueira_ml_pax": 150}',
 'Regras de bebida: cerveja 1,5 un/pax por 2h (arredondar p/ cima); refri SEMPRE lata; Guaraná só quando o Bruno avisar', 'bebidas'),

('sucos_oficiais', '["Abacaxi com hortelã", "Maracujá", "Laranja com frutas vermelhas", "Melão com limão"]',
 'Opções oficiais de suco em Almoço/Jantar/HH (150 ml/pax, dividir entre sabores com contraponto)', 'bebidas'),

('bebidas_conversao', '{"cafe_garrafa_servir_l": 1.7, "cafe_garrafa_compra_l": 1.8, "suco_garrafa_l": 1.0, "cha_garrafa_l": 1.0, "cafe_po_g_por_garrafa": 50, "cafe_pacote_g": 500, "filtro_por_garrafa": 1, "dose_cafe_ml": 100}',
 'Conversões: litros → garrafas (arredondar p/ cima). Dose de café = 100 ml (p/ sachês).', 'conversoes'),

-- Welcome Coffee
('welcome_coffee', '{"pao_queijo_pax": 2, "pao_queijo_split": {"tradicional": 0.7, "integral": 0.3}, "petit_four_salgado_pax": 1, "petit_four_doce_pax": 1, "petit_four_doce_sabores": 2, "cafe_ml": 50, "leite_ml": 15, "agua_quente_ml": 15}',
 'Welcome Coffee (Executive) — quantidades por pax. NUNCA admite extensão.', 'quantidades'),

-- Auditório
('auditorio', '{"cafe_ml_pax_periodo": 150, "agua_garrafas_pax_periodo": 1.5, "agua_split": {"sem_gas": 0.6, "com_gas": 0.4}, "cortesia": {"cafe_ml_pax_periodo": 150, "agua_refresqueira_ml_pax_periodo": 150}}',
 'Auditório por período. Cortesia: só café + água refresqueira (sem suco/chá/garrafinha).', 'quantidades'),

-- Coffee Break
('coffee_break_base', '{"bolo_bebezinho_pax": 1.1, "suco_laranja_ml": 130, "cha_gelado_ml": 80, "cafe_ml": 100, "leite_ml": 30, "agua_quente_ml": 30, "salada_frutas_g": 100, "iogurte_ml": 20, "granola_g": 10, "aveia_g": 10, "mel_g": 5, "sucrilhos_g": 10, "pao_queijo_tradicional_pax": 1.5, "pao_queijo_integral_pax": 0.5}',
 'Coffee Break — base comum a todas as linhas (por pax)', 'quantidades'),

('coffee_break_linhas', '{"basic": {"mini_lanche_total_pax": 1.5, "itens_a_mais": 0}, "standard": {"mini_lanche_pax": 1.1, "wrap_tapioca_tartelete_pax": 1.1, "itens_a_mais": 1}, "executive": {"mini_lanche_pax": 1.1, "mini_lanche_split": {"mini_lanche": 0.7, "envelope_gourmet": 0.3, "tramezzino": 0.3}, "wrap_tapioca_tartelete_pax": 1.1, "verrine_shot_pax": 1.1, "itens_a_mais": 2}, "master": {"mini_lanche_pax": 1.1, "wrap_tapioca_qtd_opcoes": 2, "wrap_tapioca_pax_cada": 1.3, "verrine_shot_pax": 1.0, "itens_a_mais": 3, "adicionais_fixos": ["favo_de_mel", "frutas_laminadas"]}}',
 'Coffee Break por linha. Itens a mais: Standard +1 / Executive +2 / Master +3 (split manhã salgado / tarde doce; ~50 pax divide 50/50).', 'quantidades'),

('mini_lanche', '{"split_carne": 0.8, "split_veg": 0.2, "sabores_fixos": {"carne": 1, "veg": 1}, "novo_sabor_a_cada_pax": 100, "pao_carne": "brioche tradicional", "pao_veg": "brioche de cenoura"}',
 'Mini lanche: 80% carne (brioche tradicional) + 20% veg (brioche de cenoura). +1 sabor de cada a cada 100 pax.', 'quantidades'),

('bebezinho', '{"pax_fator": 1.1, "sabores_50_50": true, "max_sabores": 3, "escalona_sabor_a_cada_pax": 30, "nunca_2_chocolates_mesmo_periodo": true, "laranja_puro": true, "plaquinha_nome": "cup cake"}',
 'Bebezinho/cup cake: sempre 2 sabores 50/50 (mesmo <30 pax); máx 3 sabores; nunca red velvet.', 'quantidades'),

('escalonamento_sabores', '{"acima_50_pax": 2, "acima_120_pax": 3}',
 'Divisão de sabores por tamanho: >50 pax = 2 sabores; >120 pax = 3 sabores (mesmo produto)', 'quantidades'),

-- Coquetel / HH
('coquetel_linhas', '{"basic": {"salgados_tipos": 4, "salgado_pax": 1.1}, "standard": {"hamburguer_pax": 2, "frios_g_pax": 6, "frios_split": {"salame_comum": 0.5, "pastrami": 0.25, "copa": 0.25}, "queijos_g_pax": 6, "queijos_split": {"provolone": 0.5, "gruyere": 0.3, "gorgonzola": 0.2}}, "executive": {"hamburguer_pax": 2, "canapes_tipos": 3, "canape_pax": 1.1, "frios_g_pax": 6, "frios_split": {"parma": 0.4, "salame_espanhol": 0.3, "pastrami": 0.3}, "queijos_g_pax": 6, "queijos_split": {"provolone": 0.5, "gruyere": 0.3, "gorgonzola": 0.2}, "pasta_board_g_pax": 20, "pao_sueco_pax_por_pacote": 20}, "master": {"canapes_tipos": 4, "canape_pax": 2.5, "burrata_a_cada_pax": 15, "terrine_g_pax": 7, "frios_g_pax": 6, "frios_split": {"salame_espanhol": 0.3, "pastrami": 0.3, "parma": 0.4}, "queijos_g_pax": 6, "queijos_split": {"parmesao": 0.4, "gruyere": 0.15, "gorgonzola": 0.15, "brie": 0.3}, "camafeu_pax": 1, "camafeu_split": {"branco": 0.5, "chocolate": 0.5}, "adicionais_fixos": ["favo_de_mel", "frutas_laminadas"]}, "premium": {"canapes_tipos": 5, "canape_pax": 2, "burrata_a_cada_pax": 15, "massa_g_pax": 150, "salada_g_pax": 70, "brie_folhado_a_cada_pax": 30, "camafeu_pax": 1, "adicionais_fixos": ["favo_de_mel", "frutas_laminadas"]}}',
 'Coquetel/HH por linha. Executive usa PASTRAMI, nunca rosbife.', 'quantidades'),

('dips', '{"homus": {"piso_g": 600, "ate_pax": 30, "extra_g_pax": 12, "acompanha": "pão sírio"}, "guacamole": {"piso_g": 600, "ate_pax": 30, "extra_g_pax": 15, "split": {"avocado": 0.5, "abacate": 0.5}, "acompanha": "doritos/crocante de milho"}, "coalhada_repolho_g_pax": 7, "pates_g_pax": 5}',
 'Dips: piso de produção 600 g até 30 pax; acima soma por excedente. Fórmula: 600 + extra × (pax - 30).', 'quantidades'),

('verrine_doce', '{"fator_padrao": 1.1, "fator_reposicao_continua": 1.65, "dividir_entre_sabores": true}',
 'Doce no verrine: PADRÃO pax × 1,1. O 1,65 é EXCEÇÃO (só reposição contínua). Decisão travada 23/07/2026.', 'quantidades'),

('mini_hamburguer_acomp', '{"batata_frita_g_pax": 20, "maionese_verde_g_pax": 5, "alface_g_pax": 3, "heinz_a_cada_pax": 30, "nomenclatura": "Mini hambúrguer com queijo, alface e maionese verde caseira", "molhos_nome": "Maionese, catchup e mostarda (Heinz)"}',
 'Mini hambúrguer sempre acompanha (automático)', 'quantidades'),

('paes_hh', '{"a_cada_pax": 40, "itens": ["1 baguel filão fatiado", "1 italiano filão fatiado", "1 integral filão fatiado", "5 bisquit calabresa", "5 bisquit parmesão"]}',
 'Pães de HH a cada 40 pax (fornecedor Letícia)', 'quantidades'),

('coquetel_pizza', '{"pedacos_pax": 3, "fatias_por_pizza": 10, "sabores": 3, "agua_com_gas_pax": 1, "agua_sem_gas_pax": 2}',
 'Coquetel de Pizza: 3 pedaços/pax, pizza fatiada em 10, 3 sabores', 'quantidades'),

('frutas_laminadas', '{"g_pax": 50, "compra_g_pax": 60, "breaks_hh_master_com_favo": true, "almoco_jantar_sem_favo": true}',
 'Frutas laminadas 50 g/pax (compra 60 g/pax). Breaks/HH Master+ geralmente com favo; almoço/jantar SEM favo.', 'quantidades'),

-- Almoço / Jantar (modelo por item — rev. 27/07/2026, substitui 800 g/pax)
('almoco_gramaturas', '{"proteina_g": 140, "proteina_min_g": 1000, "vegetariano_g": 100, "vegetariano_min_g": 1000, "massa_g": 130, "massa_min_g": 1000, "molho_massa_g": 40, "arroz_g": 200, "arroz_min_g": 1200, "feijao_g": 300, "pure_g": 200, "pure_min_g": 1200, "salada1_folhas_g": 80, "molho_salada_ml": 20, "salada2_composta_g": 60, "tomate_cereja_g": 30, "cenoura_ralada_g": 20, "sobremesa_1_g": 120, "sobremesa_2_g_cada": 60, "sobremesa_producao_extra_pct": 20}',
 'Almoço/Jantar — peso SERVIDO por item, com pisos de produção (não corrigir!). Massa e molho SEMPRE em linhas separadas. Ilha fria = 3 apresentações (190 g/pax).', 'quantidades'),

('almoco_estrutura', '{"executive": {"carboidratos": 2, "proteinas": 2, "vegetariano": 1, "massa": 1, "ilha_fria_apresentacoes": 3, "sobremesas": 2}, "ordem_fixa": ["Proteína 1", "Proteína 2", "Vegetariano", "Massa", "Molho da massa", "Arroz", "Feijão", "Purê", "Salada 1 (folhas)", "Molho da salada 1", "Salada 2 (composta)", "Molho da salada 2", "Tomate-cereja", "Cenoura ralada", "Sobremesa 1", "Sobremesa 2"]}',
 'Estrutura fixa do Almoço/Jantar Executive e ordem fixa de resposta', 'quantidades'),

('cafe_final', '{"cafe_ml_pax": 50, "leite_ml_pax": 15, "petit_four_pax": 1, "carolina_doce_pax": 1}',
 'Café final do almoço (só quando o Bruno pedir) — itens à parte', 'quantidades'),

('mix_folhas', '{"servido_g_pax": 80, "compra_g_pax": {"alface_americana": 25, "alface_crespa": 20, "alface_roxa": 15, "rucula": 12, "agriao": 8, "broto_beterraba": 0.5, "flor_comestivel": 0.5}, "saco1": ["alface_americana", "alface_crespa", "alface_roxa", "rucula", "agriao"], "saco2": ["broto_beterraba", "flor_comestivel"], "montagem": "Misturar SÓ as 5 folhas; finalizar SOMENTE no local com broto de beterraba + flores comestíveis"}',
 'Salada 1 = Mix de Folhas (SÓ quando for este o cardápio): programação sem gramatura; comanda com composição + Saco 1/Saco 2', 'quantidades'),

-- Conversões cru × pronto (Comandas)
('conversao_cru', '{"file_mignon": 1.33, "carne_bovina": 1.33, "frango_peito": 1.25, "salmao": 1.25, "peixe_branco": 1.33, "arroz": 0.33, "feijao": 0.43, "massa_seca": 0.45, "pure_batata": 1.35, "pure_mandioquinha": 1.25, "pure_abobora": 1.20, "panache": 1.15, "legumes_salteados": 1.20, "moqueca_palmito": 1.30, "escondidinho": 1.10, "ravioli": 0.95, "nhoque": 1.0, "lasanha": 1.0, "folhas_saladas": 1.25}',
 'Peso pronto × fator = peso cru/compra. Comanda mostra SEMPRE os dois pesos.', 'conversoes'),

('molhos_massa', '{"pomodoro": 350, "bechamel": 400, "branco": 400, "funghi": 400, "pesto_tradicional": 200, "pesto_cremoso": 350}',
 'Molho por kg de massa PRONTA (g). Massa e molho em linhas separadas. Molho fora da lista → perguntar. Massa+molho → parmesão ralado à parte.', 'conversoes'),

-- Estrutura / expedição (Comandas)
('estrutura', '{"copo_descartavel_quente_pax": 1.5, "copo_vidro_frio_pax": 1.1, "cup_shot_vidro_pax": 1.1, "prato_louca_pax": 1.2, "garfo_bolo_pax": 1.2, "colherinha_verrine_pax": 1.2, "rechaud_por_travessas_quentes": 2, "bandeja_preta_por_evento": 2, "gelo_pacote_kg": 3, "gelo_pax_por_pacote": 25, "sache_acucar_adocante_pax_servico": 2, "sache_cha_pax_coffee": 0.5, "achocolatado_pote_a_cada_pax": 30, "mesa_posta_fator": 1.2, "palito_lanche_un": 1, "palito_wrap_un": 1, "placa_eletrica_pratos_por_placa": 2}',
 'Multiplicadores de estrutura/expedição. Mesa posta: SEMPRE 1,2/pax em todos os itens de couvert.', 'comandas'),

('caixas_plasticas', '["CAIXA LOUÇAS", "CAIXA PEGADORES E UTENSÍLIOS", "CAIXA DESCARTÁVEIS", "CAIXA BEBIDAS", "CAIXA IDENTIFICAÇÃO E APOIO"]',
 '5 caixas etiquetadas obrigatórias na expedição', 'comandas'),

('kit_saladas', '["1 vinagreiro", "1 azeiteiro", "1 moedor de sal himalaia rosa", "1 moedor de sal grosso branco", "1 pote de cristal com croutons + pegador", "1 molho caseiro no pote de cristal + mini concha", "2 travessas de cristal por salada"]',
 'Kit saladas: todo serviço com salada. Croutons = mercado; molho caseiro = Cozinha Fria.', 'comandas'),

('almoco_fixos_mesa', '["Galheteiro (vinagre, sal, azeite) → Expedição Estrutura", "Molho de salada caseiro → produção Cozinha Fria", "Pimenta Tabasco → comanda de Alimentação"]',
 'Fixos obrigatórios de todo almoço/jantar (mesmo sem estar na programação)', 'comandas'),

('startse_ponto_fixo', '{"nao_enviar": ["kit_limpeza", "luvas", "toucas", "uniforme", "transformador"], "gelo_somente_hh": true, "manter_blocos_ticaveis": true}',
 'StartSe = ponto fixo: não enviar kit limpeza/uniforme/transformador; gelo SÓ em HH', 'comandas'),

('sai_pronto', '{"finaliza_no_local": ["pão de queijo congelado", "batata frita congelada"], "sai_pronto": ["quiche", "croissant", "pão de batata"], "finalizacao_local_permitida": ["frutas laminadas", "parmesão do penne", "salada de frutas", "verrine/tartelete FINALIZAR CONFORME IMAGEM"]}',
 'Regra de ouro: só pão de queijo/batata congelados são finalizados no local. Resto sai pronto.', 'comandas'),

-- Compras
('compras_brioche', '{"principal_g": 15, "mucarela_g": 10, "ricota_g": 10}',
 'Mini brioche = 15 g principal + 10 g muçarela + 10 g ricota (3 linhas de compra)', 'compras'),

('compras_frango', '{"peito_fresco": ["peito de frango", "frango cozido", "frango cozido desfiado", "frango desfiado"], "defumado_frios": ["frango defumado", "peito de frango defumado"]}',
 'Frango em DUAS compras separadas: fresco (mercado) × defumado (frios)', 'compras'),

('compras_tramezzino', '{"fatias_por_4_tramezzinos": 3, "fatias_por_pacote": 20}',
 'Tramezzino: fatias = tramezzinos × 3/4 (arred. cima); pacotes = fatias ÷ 20', 'compras'),

('compras_mesa', '{"nescau_g_pax_periodo": 3, "sucrilhos_g_pax_periodo": 5, "acucar_sache_por_dose": 1, "adocante_sache_por_dose": 1}',
 'Nescau 3 g/pax/período; sucrilhos 5 g/pax/período; açúcar/adoçante 1 sachê por dose de 100 ml', 'compras'),

('salada_frutas_receita', '{"mamao": 17.5, "melao": 17.5, "manga": 17.5, "abacaxi": 17.5, "uva": 15, "morango": 10, "kiwi": 5}',
 'Receita padrão da salada de frutas (%) — cada fruta em uma linha', 'compras'),

('compras_dips', '{"guacamole": {"abacate": 50, "avocado": 50}, "homus": {"grao_de_bico": 80, "tahine": 20}}',
 'Composição de compra dos dips (%)', 'compras'),

('tabua_queijos_compra', '{"g_por_sabor_pax": 15, "minimo_g_por_sabor": 150}',
 'Tábua de queijos: 15 g de cada sabor por pax (mín ~150 g/sabor, arredondar p/ cima)', 'compras'),

('itens_basicos', '{"hortifruti": ["cebola", "alho", "gengibre", "tomate", "cenoura", "beterraba", "pepino", "alface crespa", "couve", "melancia"], "ervas_frescas": ["ciboulette", "cebolinha", "salsinha", "coentro", "manjericão", "hortelã", "alecrim"], "mercearia": ["arroz", "feijão preto", "feijão carioca", "farinha de mandioca", "tahine", "nozes", "azeitonas", "sachês de chá", "vinagre", "shoyo", "mel"], "oleos_gorduras_secos": ["azeite", "óleo", "manteiga", "margarina", "sal refinado", "pimenta do reino", "louro"], "condimentos_ovos": ["maionese", "mostarda", "ovos"], "almoco_funcionarios": ["carnes", "frangos", "batatas", "arroz", "feijão preto", "feijão carioca", "farinha de mandioca"]}',
 'Itens básicos que não podem faltar — sempre no final de toda lista de compras', 'compras'),

('compras_condicionais', '{"sal_grosso_himalaia": ["almoco", "jantar", "brunch"], "alface_maionese_heinz": ["hamburguer"], "pimenta_tabasco": ["almoco", "jantar", "coquetel"]}',
 'Itens condicionais: entram quando o serviço/item ocorre', 'compras'),

-- Regras de cliente
('inteli', '{"reposicao_fator": 1.6, "cortesia_restricao_pax": 10, "refresqueira_agua_extra_por_periodo": 1, "pao_queijo_split": {"tradicional": 0.3, "multigraos": 0.3, "croissant_ou_pao_batata": 0.4}, "salada_frutas_fator_com_reposicao": 1.6}',
 'Inteli: reposição sempre ×1,6 nos sólidos; cortesia 10 pax p/ restrições; pão de queijo próprio', 'clientes'),

-- Proibições globais
('proibidos', '["atum", "wrap de abacate", "red velvet", "brioche integral", "pão francês (mini lanche)", "rosbife em tábua de frios", "refrigerante 1L/PET", "empadinha de palmito"]',
 'Itens proibidos globalmente (rosbife OK em mini lanche se o orçamento pedir; empadinha → mini quiche de palmito)', 'cardapio'),

-- Plaquinhas
('plaquinhas', '{"grade": "2x3", "por_pagina": 6, "margem_mm": 5, "dobra": "50/50 — conteúdo só na metade de baixo, padding 2.5mm", "titulo_pt": 18, "titulo_piso": 13, "sub_pt": 10, "sub_piso": 9, "enes_pt": 8, "nao_geram_card": ["água em garrafinha", "refrigerante", "cerveja", "vinho", "molhos de marca (Heinz)", "frutas laminadas", "açúcar/adoçante/sachês/mexedores", "kit em sacola rotulado"], "dedup_por_dia": true, "par_site_no_fim": true}',
 'Regras de layout e conteúdo das plaquinhas', 'plaquinhas'),

('kits', '{"kit_pax": 1, "entrega_dia_anterior": true, "itens_padrao": ["suco de caixinha", "barra de cereal", "mix de castanhas em sachê", "sacola kraft + guardanapo"]}',
 'Kit sobrevivência/deslocamento: 1/pax, entregar SEMPRE no dia anterior', 'quantidades'),

('cup_castanhas_samix', '{"cup_ml": 50, "base": "amendoim sem pele ~80%", "topo": ["1 castanha-do-pará", "1 caju", "2 amêndoas defumadas", "2 uvas-passas pretas", "2 uvas-passas brancas"], "amendoim_kg_por_100_cups": 2.3}',
 'Cup Mix de Castanhas — padrão SAMIX (sempre, independente da programação)', 'quantidades');

-- ------------------------------------------------------------
-- CLIENTES FIXOS
-- ------------------------------------------------------------
insert into public.clients (nome, tipo, endereco, endereco_fixo, marca_agua, marca_refri, marca_cerveja, isento_logistica, isento_taxa_servico, regras) values
('StartSe', 'startse',
 'Av. das Nações Unidas, 12901 – CENU Torre Norte, 9º andar – Cidade Monções, São Paulo/SP, 04578-910',
 true, 'Minalba', 'Pepsi (normal/zero)', 'Budweiser (lata ou long neck)', true, true,
 '{"ponto_fixo": true, "nao_enviar": ["kit_limpeza", "luvas", "toucas", "uniforme", "transformador"], "gelo_somente_hh": true, "obs": "Coca/Heineken só quando o Bruno avisar. Único endereço StartSe — não existe StartSe WTC."}'),

('Inteli', 'inteli',
 'Av. Prof. Almeida Prado, 520, São Paulo/SP',
 true, 'Minalba', 'Pepsi (normal/zero)', 'Budweiser (lata ou long neck)', true, true,
 '{"reposicao_fator": 1.6, "cortesia_restricao_pax": 10, "refresqueira_agua_extra_por_periodo": 1, "pao_queijo_split": {"tradicional": 0.3, "multigraos": 0.3, "croissant_ou_pao_batata": 0.4}, "obs": "Reposição SEMPRE presente. Nunca perguntar se é StartSe. Coca/Heineken só quando o Bruno avisar."}'),

('WTC', 'wtc',
 'Av. das Nações Unidas, 12551 – 6º andar, Brooklin Novo, São Paulo/SP',
 true, 'qualquer', 'Coca-Cola', 'Heineken', true, true,
 '{"repasse_pct": 12, "sem_copeira": true, "unidade_startse": true, "obs": "12% de repasse embutido no preço — nunca no slide. Ponto fixo StartSe (WTC 12.551)."}');

-- ------------------------------------------------------------
-- TABELAS DE PREÇO (valores documentados — CONFERIR no admin)
-- ------------------------------------------------------------
insert into public.price_tables (kind, nome, obs) values
('startse_atual',      'StartSe e Inteli — Atual',      'Isento logística/taxa'),
('startse_negociacao', 'StartSe e Inteli — Negociação', 'Proposta de aumento'),
('externos',           'Externos',                      'Logística R$250 + Serviço 10%'),
('wtc',                'WTC',                           '12% de repasse embutido; sem logística/taxa/copeira');

-- StartSe Atual
insert into public.price_items (price_table_id, service_type, service_line, variante, preco_pax)
select id, v.st::public.service_type, v.sl::public.service_line, v.va, v.p
from public.price_tables, (values
  ('welcome_coffee', 'basic',     '',   13.00),
  ('welcome_coffee', 'standard',  '',   17.00),
  ('welcome_coffee', 'executive', '',   18.00),
  ('welcome_coffee', 'master',    '',   22.00),
  ('coffee_break',   'executive', '',   44.00),
  ('coffee_break',   'master',    '',   50.00),
  ('auditorio',      'executive', '4h', 12.00),
  ('auditorio',      'executive', '8h', 17.00),
  ('auditorio',      'master',    '4h', 22.00),
  ('auditorio',      'master',    '8h', 31.00)
) as v(st, sl, va, p)
where kind = 'startse_atual';

-- StartSe Negociação
insert into public.price_items (price_table_id, service_type, service_line, variante, preco_pax)
select id, v.st::public.service_type, v.sl::public.service_line, v.va, v.p
from public.price_tables, (values
  ('welcome_coffee', 'executive', '', 19.00),
  ('welcome_coffee', 'master',    '', 22.00),
  ('coffee_break',   'executive', '', 46.00),
  ('coffee_break',   'master',    '', 53.00)
) as v(st, sl, va, p)
where kind = 'startse_negociacao';

-- Externos
insert into public.price_items (price_table_id, service_type, service_line, variante, preco_pax)
select id, v.st::public.service_type, v.sl::public.service_line, v.va, v.p
from public.price_tables, (values
  ('welcome_coffee', 'basic',     '',            14.00),
  ('welcome_coffee', 'standard',  '',            19.00),
  ('welcome_coffee', 'executive', '',            21.00),
  ('welcome_coffee', 'master',    '',            24.00),
  ('coffee_break',   'executive', '',            50.00),
  ('coffee_break',   'master',    '',            56.00),
  ('auditorio',      'executive', '4h',          14.00),
  ('auditorio',      'executive', '8h',          19.00),
  ('auditorio',      'master',    '4h',          25.00),
  ('auditorio',      'master',    '8h',          35.00),
  ('coquetel',       'basic',     'sem_cerveja', 80.00),
  ('coquetel',       'basic',     'lata',        95.00),
  ('coquetel',       'basic',     'long_neck',  100.00),
  ('coquetel',       'standard',  'sem_cerveja', 95.00),
  ('coquetel',       'standard',  'lata',       109.00),
  ('coquetel',       'standard',  'long_neck',  114.00),
  ('coquetel',       'executive', 'sem_cerveja',115.00),
  ('coquetel',       'executive', 'lata',       130.00),
  ('coquetel',       'executive', 'long_neck',  135.00),
  ('coquetel',       'master',    'sem_cerveja',130.00),
  ('coquetel',       'master',    'lata',       145.00),
  ('coquetel',       'master',    'long_neck',  150.00),
  ('coquetel',       'premium',   'sem_cerveja',180.00),
  ('coquetel',       'premium',   'lata',       195.00),
  ('coquetel',       'premium',   'long_neck',  200.00),
  ('coquetel_pizza', 'pizza',     'sem_cerveja',135.00),
  ('coquetel_pizza', 'pizza',     'lata',       150.00),
  ('coquetel_pizza', 'pizza',     'long_neck',  155.00),
  ('bar',            'basic',     'sem_cerveja', 95.00),
  ('bar',            'basic',     'long_neck',  105.00),
  ('bar',            'standard',  'sem_cerveja',110.00),
  ('bar',            'standard',  'long_neck',  120.00),
  ('bar',            'master',    'sem_cerveja',120.00),
  ('bar',            'master',    'long_neck',  130.00)
) as v(st, sl, va, p)
where kind = 'externos';

-- WTC (coquetel documentado)
insert into public.price_items (price_table_id, service_type, service_line, variante, preco_pax)
select id, v.st::public.service_type, v.sl::public.service_line, v.va, v.p
from public.price_tables, (values
  ('coquetel',       'basic',     'sem_cerveja', 89.00),
  ('coquetel',       'basic',     'lata',       105.00),
  ('coquetel',       'basic',     'long_neck',  110.00),
  ('coquetel',       'standard',  'sem_cerveja',109.00),
  ('coquetel',       'standard',  'lata',       124.00),
  ('coquetel',       'standard',  'long_neck',  129.00),
  ('coquetel',       'executive', 'sem_cerveja',130.00),
  ('coquetel',       'executive', 'lata',       145.00),
  ('coquetel',       'executive', 'long_neck',  150.00),
  ('coquetel',       'master',    'sem_cerveja',150.00),
  ('coquetel',       'master',    'lata',       165.00),
  ('coquetel',       'master',    'long_neck',  170.00),
  ('coquetel',       'premium',   'sem_cerveja',198.00),
  ('coquetel',       'premium',   'lata',       213.00),
  ('coquetel',       'premium',   'long_neck',  218.00),
  ('coquetel_pizza', 'pizza',     'sem_cerveja',150.00),
  ('coquetel_pizza', 'pizza',     'lata',       165.00),
  ('coquetel_pizza', 'pizza',     'long_neck',  170.00)
) as v(st, sl, va, p)
where kind = 'wtc';

-- ------------------------------------------------------------
-- GLOSSÁRIO DE TRADUÇÕES (Plaquinhas)
-- ------------------------------------------------------------
insert into public.term_translations (pt, en, es, tipo) values
('MINI LANCHE',      'SANDWICH',      'SÁNDWICH',           'categoria'),
('CUP CAKE',         'CUPCAKE',       'CUPCAKE',            'categoria'),
('PETIT FOUR',       'PETIT FOUR',    'PETIT FOUR',         'categoria'),
('PÃO DE QUEIJO',    'CHEESE BREAD',  'PAN DE QUESO',       'categoria'),
('CROISSANT',        'CROISSANT',     'CROISSANT',          'categoria'),
('CAROLINA',         'CREAM PUFF',    'CAROLINA',           'categoria'),
('TÁBUA DE FRIOS',   'COLD CUTS',     'TABLA DE FIAMBRES',  'categoria'),
('TÁBUA DE QUEIJOS', 'CHEESE BOARD',  'TABLA DE QUESOS',    'categoria'),
('FRUTAS DA TÁBUA',  'FRUIT BOARD',   'TABLA DE FRUTAS',    'categoria'),
('SALADA DE FRUTAS', 'FRUIT SALAD',   'ENSALADA DE FRUTAS', 'categoria'),
('TAPIOCA',          'TAPIOCA',       'TAPIOCA',            'categoria'),
('GUACAMOLE',        'GUACAMOLE',     'GUACAMOLE',          'categoria'),
('HOMUS',            'HUMMUS',        'HUMUS',              'categoria'),
('TRAMEZZINO',       'TRAMEZZINO',    'TRAMEZZINO',         'categoria'),
('VERRINE',          'VERRINE',       'VERRINE',            'categoria'),
('SHOT',             'SHOT',          'SHOT',               'categoria'),
('CANAPÉ',           'CANAPÉ',        'CANAPÉ',             'categoria'),
('BARQUETE',         'TAPIOCA BOAT',  'BARQUETA',           'categoria'),
('TARTELETE',        'TARTLET',       'TARTALETA',          'categoria'),
('QUICHE',           'QUICHE',        'QUICHE',             'categoria'),
('SUCO',             'JUICE',         'JUGO',               'categoria'),
('CHÁ',              'TEA',           'TÉ',                 'categoria'),
('CAFÉ',             'COFFEE',        'CAFÉ',               'categoria'),
('LEITE',            'MILK',          'LECHE',              'categoria'),
('ÁGUA QUENTE',      'HOT WATER',     'AGUA CALIENTE',      'categoria'),
('ACHOCOLATADO',     'CHOCOLATE MILK','ACHOCOLATADO',       'categoria'),
('Cenoura',          'Carrot',        'Zanahoria',          'sabor'),
('Limão',            'Lemon',         'Limón',              'sabor'),
('Maracujá',         'Passion Fruit', 'Maracuyá',           'sabor'),
('Goiaba',           'Guava',         'Guayaba',            'sabor'),
('Fubá',             'Cornmeal',      'Maíz',               'sabor'),
('Coco',             'Coconut',       'Coco',               'sabor'),
('Frango',           'Chicken',       'Pollo',              'sabor'),
('Peru',             'Turkey',        'Pavo',               'sabor'),
('Presunto',         'Ham',           'Jamón',              'sabor'),
('Lombo canadense',  'Canadian Pork Loin', 'Lomo Canadiense', 'sabor'),
('Frango defumado',  'Smoked Chicken','Pollo Ahumado',      'sabor'),
('Peito de peru',    'Turkey Breast', 'Pechuga de Pavo',    'sabor'),
('Blanquet',         'Turkey Ham',    'Jamón de Pavo',      'sabor'),
('Frango desfiado',  'Shredded Chicken', 'Pollo Deshilachado', 'sabor'),
('Salame',           'Salami',        'Salami',             'sabor'),
('Laranja',          'Orange',        'Naranja',            'sabor');
