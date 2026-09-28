-- ============================================================
-- SISTEMA PIEGGI — Migration 0004: Catálogo inicial
-- Itens extraídos dos documentos de regras (jul/2026).
-- ⚠️ Ponto de partida — conferir e completar com o cardápio
--    oficial MAIO2026 no painel de administração.
-- ============================================================

-- MINI LANCHES (Cozinha Fria) — carne = brioche tradicional / veg = brioche de cenoura
insert into public.catalog_items (categoria, nome, base_sabor, servicos, periodos, selo, estacao, ficha_compra, obs) values
('mini_lanche', 'Peito de peru',          'peru',    '{coffee_break}', '{}',        null,          'cozinha_fria', '{"principal": "peito de peru", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'Brioche tradicional'),
('mini_lanche', 'Blanquet de peru',       'peru',    '{coffee_break}', '{manha}',   null,          'cozinha_fria', '{"principal": "blanquet de peru", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'SÓ MANHÃ. Brioche tradicional'),
('mini_lanche', 'Lombo canadense',        'lombo',   '{coffee_break}', '{}',        null,          'cozinha_fria', '{"principal": "lombo canadense", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'Brioche tradicional'),
('mini_lanche', 'Frango defumado',        'frango',  '{coffee_break}', '{}',        null,          'cozinha_fria', '{"principal": "frango defumado", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'Brioche tradicional. Compra: frios'),
('mini_lanche', 'Frango cozido desfiado', 'frango',  '{coffee_break}', '{tarde}',   null,          'cozinha_fria', '{"principal": "peito de frango", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'SÓ TARDE. Brioche tradicional. Compra: fresco'),
('mini_lanche', 'Presunto',               'presunto','{coffee_break}', '{}',        null,          'cozinha_fria', '{"principal": "presunto", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'Brioche tradicional'),
('mini_lanche', 'Salame',                 'salame',  '{coffee_break}', '{}',        null,          'cozinha_fria', '{"principal": "salame", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'Brioche tradicional'),
('mini_lanche', 'Provolone',              'queijo',  '{coffee_break}', '{}',        'vegetariano', 'cozinha_fria', '{"principal": "provolone", "principal_g": 15, "mucarela_g": 10, "ricota_g": 10}', 'Brioche de cenoura. Inclui "provolone com tomate seco"'),
('mini_lanche', 'Vegetariano I — Queijos e cenoura',     'queijo', '{coffee_break}', '{}', 'vegetariano', 'cozinha_fria', '{"mucarela_g": 10, "ricota_g": 10}', 'Brioche de cenoura. Plaquinha: QUEIJOS E CENOURA'),
('mini_lanche', 'Vegetariano II — Queijos e maçã verde', 'queijo', '{coffee_break}', '{}', 'vegetariano', 'cozinha_fria', '{"mucarela_g": 10, "ricota_g": 10}', 'Brioche de cenoura. Plaquinha: QUEIJOS E MAÇÃ VERDE'),
('mini_lanche', 'Vegetariano III — Queijos e manjericão','queijo', '{coffee_break}', '{}', 'vegetariano', 'cozinha_fria', '{"mucarela_g": 10, "ricota_g": 10}', 'Brioche de cenoura. Plaquinha: QUEIJOS E MANJERICÃO');

-- PETIT FOURS (Confeitaria)
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao) values
('petit_four_salgado', 'Gergelim',          'gergelim', '{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_salgado', 'Quinoa',            'quinoa',   '{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_salgado', 'Parmesão',          'queijo',   '{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_doce',    'Ferradura',         'ferradura','{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_doce',    'Serquilho',         'serquilho','{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_doce',    'Cristal de goiaba', 'goiaba',   '{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_doce',    'Unha de gato',      'unha_gato','{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_doce',    'Dedo de moça',      'dedo_moca','{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria'),
('petit_four_doce',    'Mentirinha',        'mentirinha','{welcome_coffee,almoco,jantar}', 'vegetariano', 'confeitaria');

-- BEBEZINHOS / CUP CAKES (Confeitaria) — sempre 2 sabores 50/50; plaquinha = "cup cake"
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, proibido, obs) values
('bebezinho', 'Laranja e chocolate',   'laranja',   '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Churros',               'churros',   '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Cenoura com chocolate', 'cenoura',   '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Chocolate duplo',       'chocolate', '{coffee_break}', 'vegetariano', 'confeitaria', false, 'Nunca 2 chocolates no mesmo período'),
('bebezinho', 'Limão',                 'limao',     '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Fubá com goiabada',     'fuba',      '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Ninho com Nutella',     'ninho',     '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Prestígio',             'coco',      '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Nhá Benta',             'chocolate', '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Maracujá',              'maracuja',  '{coffee_break}', 'vegetariano', 'confeitaria', false, null),
('bebezinho', 'Red Velvet',            'red_velvet','{coffee_break}', 'vegetariano', 'confeitaria', true,  'PROIBIDO — saiu do cardápio');

-- SHOTS (Confeitaria) — todos veganos; vitaminado sempre leite vegetal
insert into public.catalog_items (categoria, nome, servicos, selo, estacao, obs) values
('shot_funcional',  'Verde Vital',   '{coffee_break}', 'vegano', 'confeitaria', null),
('shot_funcional',  'Imuno Power',   '{coffee_break}', 'vegano', 'confeitaria', 'Couve, laranja, acerola e gengibre'),
('shot_funcional',  'Fresh Detox',   '{coffee_break}', 'vegano', 'confeitaria', null),
('shot_funcional',  'Calm & Relax',  '{coffee_break}', 'vegano', 'confeitaria', null),
('shot_funcional',  'Energia Rosa',  '{coffee_break}', 'vegano', 'confeitaria', 'Melancia, beterraba, gengibre'),
('shot_funcional',  'Hidra Mix',     '{coffee_break}', 'vegano', 'confeitaria', null),
('shot_vitaminado', 'Energia Solar', '{coffee_break}', 'vegano', 'confeitaria', 'Sempre leite vegetal'),
('shot_vitaminado', 'Pele Bonita',   '{coffee_break}', 'vegano', 'confeitaria', 'Com mamão. Sempre leite vegetal'),
('shot_vitaminado', 'Verde Força',   '{coffee_break}', 'vegano', 'confeitaria', 'Sempre leite vegetal'),
('shot_vitaminado', 'Pink Fresh',    '{coffee_break}', 'vegano', 'confeitaria', 'Sempre leite vegetal'),
('shot_vitaminado', 'Banana Fit',    '{coffee_break}', 'vegano', 'confeitaria', 'Sempre leite vegetal');

-- PÃO DE QUEIJO — CONGELADO, direto na Expedição-Alimentação (única finalização no local)
insert into public.catalog_items (categoria, nome, servicos, selo, estacao, obs) values
('pao_de_queijo', 'Pão de queijo tradicional',  '{welcome_coffee,coffee_break}', 'vegetariano', 'congelado', 'Copeira assa no local'),
('pao_de_queijo', 'Pão de queijo multigrãos',   '{welcome_coffee,coffee_break}', 'vegetariano', 'congelado', '= integral (mesmo produto). Nunca marcar sem glúten'),
('pao_de_queijo', 'Pão de queijo vegano',       '{welcome_coffee,coffee_break}', 'vegano',      'congelado', 'Cortesia p/ restrições'),
('pao_de_queijo', 'Pão de queijo sem lactose',  '{welcome_coffee,coffee_break}', 'sem_lactose', 'congelado', 'Cortesia p/ restrições');

-- CROISSANTS (Confeitaria — SAEM PRONTOS)
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, ficha_compra, obs) values
('croissant', 'Croissant de queijo',            'queijo',    '{coffee_break}', 'vegetariano', 'confeitaria', '{"recheio_g": 15}', 'Sai pronto'),
('croissant', 'Croissant presunto e queijo',    'presunto',  '{coffee_break}', null,          'confeitaria', '{"recheio_g": 15, "split": {"queijo": 0.5, "presunto": 0.5}}', 'Sai pronto'),
('croissant', 'Croissant de calabresa',         'calabresa', '{coffee_break}', null,          'confeitaria', '{}', 'Sai pronto'),
('croissant', 'Croissant queijo e goiabada',    'goiaba',    '{coffee_break}', 'vegetariano', 'confeitaria', '{}', 'Executive+ (doce/confeitaria). Sai pronto'),
('croissant', 'Mini croissant de chocolate',    'chocolate', '{coffee_break}', 'vegetariano', 'confeitaria', '{}', 'Sai pronto');

-- TRAMEZZINOS (Cozinha Fria) — Executive+
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, proibido) values
('tramezzino', 'Queijos e pesto',        'queijo',    '{coffee_break}', 'vegetariano', 'cozinha_fria', false),
('tramezzino', 'Homus',                  'homus',     '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Creme de tomate seco',   'tomate',    '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Cenoura e tahine',       'cenoura',   '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Creme de abacate',       'abacate',   '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Creme de abóbora',       'abobora',   '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Creme de beterraba',     'beterraba', '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Milho',                  'milho',     '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Abobrinha',              'abobrinha', '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Babaganoush',            'berinjela', '{coffee_break}', 'vegano',      'cozinha_fria', false),
('tramezzino', 'Amendoim com ervas',     'amendoim',  '{coffee_break}', 'vegetariano', 'cozinha_fria', false),
('tramezzino', 'Pasta de frango',        'frango',    '{coffee_break}', null,          'cozinha_fria', false),
('tramezzino', 'Pasta de atum',          'atum',      '{coffee_break}', null,          'cozinha_fria', true);

-- BARQUETES DE TAPIOCA (todas vegetarianas; naturalmente SG mas NUNCA marcar sem a ficha pedir)
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, obs) values
('barquete', 'Queijo e geleia',   'queijo', '{coffee_break}', 'vegetariano', 'cozinha_fria', 'Salgada (tem queijo) → Cozinha'),
('barquete', 'Queijo e tomate',   'queijo', '{coffee_break}', 'vegetariano', 'cozinha_fria', null),
('barquete', 'Queijo e alecrim',  'queijo', '{coffee_break}', 'vegetariano', 'cozinha_fria', null),
('barquete', 'Banana e mel',      'banana', '{coffee_break}', 'vegetariano', 'confeitaria',  'Doce → Confeitaria'),
('barquete', 'Maçã e canela',     'maca',   '{coffee_break}', 'vegetariano', 'confeitaria',  'Doce → Confeitaria'),
('barquete', 'Ricota e damasco',  'ricota', '{coffee_break}', 'vegetariano', 'cozinha_fria', null);

-- TARTELETES DOCES (Confeitaria — cascas Arosa) — FINALIZAR CONFORME IMAGEM
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, fornecedor, obs) values
('tartelete', 'Ganache e maracujá',        'chocolate', '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM'),
('tartelete', 'Ganache branco e morango',  'morango',   '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM'),
('tartelete', 'Doce de leite e banana',    'banana',    '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM'),
('tartelete', 'Queijo e goiaba',           'goiaba',    '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM'),
('tartelete', 'Queijo e abacaxi',          'abacaxi',   '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM'),
('tartelete', 'Manga e pimenta-rosa',      'manga',     '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM'),
('tartelete', 'Ganache e amêndoas',        'chocolate', '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM'),
('tartelete', 'Cottage e maçã',            'maca',      '{coffee_break,coquetel}', 'vegetariano', 'confeitaria', 'arosa', 'FINALIZAR CONFORME IMAGEM');

-- VERRINES (Confeitaria) — Master+ sempre copo de VIDRO
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, obs) values
('verrine', 'Tortinha de limão',           'limao',     '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Mousse de maracujá',          'maracuja',  '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Brigadeiro de colher',        'chocolate', '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Cocada de colher',            'coco',      '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Banoffee',                    'banana',    '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Brigadeiro branco e uva',     'uva',       '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Merengue de morango',         'morango',   '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Franui',                      'framboesa', '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Cottage tropical',            'cottage',   '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM'),
('verrine', 'Frutas vermelhas e mirtilo',  'frutas_vermelhas', '{coffee_break,coquetel,almoco,jantar}', 'vegetariano', 'confeitaria', 'FINALIZAR CONFORME IMAGEM');

-- QUICHES (mini = Confeitaria; grandes = Cozinha Quente) — mini quiches: Coffee Executive+ só à tarde
insert into public.catalog_items (categoria, nome, base_sabor, servicos, periodos, selo, estacao, fornecedor, obs) values
('quiche', 'Mini quiche Lorraine',   'bacon',   '{coffee_break,coquetel,brunch,almoco,jantar}', '{tarde}', null,          'confeitaria', 'arosa', 'Bacon, queijo, cebola. Contraponto = queijo ou alho-poró. Sai pronta'),
('quiche', 'Mini quiche de queijo',  'queijo',  '{coffee_break,coquetel,brunch,almoco,jantar}', '{tarde}', 'vegetariano', 'confeitaria', 'arosa', 'Sai pronta'),
('quiche', 'Mini quiche alho-poró',  'alho_poro','{coffee_break,coquetel,brunch,almoco,jantar}', '{tarde}', 'vegetariano', 'confeitaria', 'arosa', 'Sai pronta'),
('quiche', 'Mini quiche de palmito', 'palmito', '{coquetel}', '{}', 'vegetariano', 'confeitaria', 'arosa', 'Substitui a empadinha de palmito (descontinuada)');

-- CANAPÉS (base sempre indicada) — componentes comprados; cozinha só produz o recheio da venda
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, obs) values
('canape', 'Shimeji e cream cheese — tartelete',        'cogumelo',   '{coquetel}', 'vegetariano', 'cozinha_quente', 'Base: TARTELETE (Arosa). Cozinha produz o shimeji salteado'),
('canape', 'Gorgonzola e pera caramelizada — tartelete','gorgonzola', '{coquetel}', 'vegetariano', 'cozinha_quente', 'Base: TARTELETE (Arosa). Cozinha produz a pera caramelizada'),
('canape', 'Brie e geleia de damasco — vol-au-vent',    'brie',       '{coquetel}', 'vegetariano', 'cozinha_quente', 'Base: VOL-AU-VENT (Arosa). Caprichar na geleia, reduzir o brie'),
('canape', 'Carpaccio — mini torrada',                  'carne',      '{coquetel}', null,          'cozinha_fria',   'Carpaccio = mercado. Finalização: parmesão + alcaparra + Dijon'),
('canape', 'Rosbife — mini torrada',                    'carne',      '{coquetel}', null,          'cozinha_fria',   'Rosbife = fornecedor Letícia'),
('canape', 'Salmão defumado — mini torrada',            'salmao',     '{coquetel}', null,          'cozinha_fria',   'Salmão = mercado (+ cream cheese)');

-- PASTAS BOARD (Executive+, 20 g/pax + mini pão sueco 1 pct/20 pax)
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, obs) values
('pasta_board', 'Pasta na tábua Catupiry',           'catupiry', '{coquetel}', 'vegetariano', 'cozinha_fria', 'Catupiry, lascas de alho, mel e azeite'),
('pasta_board', 'Pasta de queijo e pesto de azeitonas','queijo', '{coquetel}', 'vegetariano', 'cozinha_fria', null),
('pasta_board', 'Pasta de queijo e alho-poró',        'queijo',  '{coquetel}', 'vegetariano', 'cozinha_fria', null);

-- DIPS (Cozinha Fria)
insert into public.catalog_items (categoria, nome, servicos, selo, estacao, obs) values
('dip', 'Guacamole',                 '{coquetel}', 'vegano',      'cozinha_fria', '50% avocado + 50% abacate. Finalização: coentro + crocante de milho'),
('dip', 'Homus',                     '{coquetel}', 'vegano',      'cozinha_fria', 'Acompanha pão sírio. Finalização: páprica + azeite + grãos (enfeite) + hortelã'),
('dip', 'Coalhada no repolho roxo',  '{coquetel}', 'vegetariano', 'cozinha_fria', '7 g/pax. Servida no repolho roxo. Finalização: hortelã + azeite');

-- DOCES COFFEE EXECUTIVE+ (Confeitaria)
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao) values
('doce_confeitaria', 'Carolina tradicional',   'carolina',  '{coffee_break,almoco,jantar}', 'vegetariano', 'confeitaria'),
('doce_confeitaria', 'Carolina de limão',      'limao',     '{coffee_break,almoco,jantar}', 'vegetariano', 'confeitaria'),
('doce_confeitaria', 'Mini cup cake bombocado','coco',      '{coffee_break}',               'vegetariano', 'confeitaria'),
('doce_confeitaria', 'Mini bombocado',         'coco',      '{coffee_break}',               'vegetariano', 'confeitaria'),
('doce_confeitaria', 'Camafeu branco',         'camafeu',   '{coquetel}',                   'vegetariano', 'confeitaria'),
('doce_confeitaria', 'Camafeu de chocolate',   'chocolate', '{coquetel}',                   'vegetariano', 'confeitaria'),
('doce_confeitaria', 'Mini queijadinha',       'coco',      '{coffee_break}',               'vegetariano', 'confeitaria');

-- SALGADOS DE FESTA (Fornecedor Letícia — página da Adriana)
insert into public.catalog_items (categoria, nome, servicos, selo, estacao, fornecedor) values
('salgado_festa', 'Coxinha',           '{coquetel}', null, 'fornecedor', 'leticia'),
('salgado_festa', 'Bolinha de queijo', '{coquetel}', 'vegetariano', 'fornecedor', 'leticia'),
('salgado_festa', 'Kibe frito',        '{coquetel}', null, 'fornecedor', 'leticia'),
('salgado_festa', 'Esfiha',            '{coquetel}', null, 'fornecedor', 'leticia'),
('salgado_festa', 'Empada',            '{coquetel}', null, 'fornecedor', 'leticia'),
('salgado_festa', 'Mini pizza',        '{coquetel}', null, 'fornecedor', 'leticia');

-- OUTROS ITENS DE COQUETEL
insert into public.catalog_items (categoria, nome, servicos, selo, estacao, obs) values
('coquetel_item', 'Mini hambúrguer com queijo, alface e maionese verde caseira', '{coquetel}', null, 'cozinha_quente', 'Sempre acompanha: batata 20g/pax + maionese verde 5g + alface 3g + Heinz 1/30pax'),
('coquetel_item', 'Kibe com coalhada e crudité', '{coquetel}', null, 'fornecedor', 'Kibe = Letícia; coalhada e crudité = Cozinha Fria. Conta como 1 salgado'),
('coquetel_item', 'Burrata',                    '{coquetel}', 'vegetariano', 'cozinha_fria', '1 a cada 15 pax (Master+)'),
('coquetel_item', 'Brie folhado',               '{coquetel}', 'vegetariano', 'cozinha_quente', '1 a cada 30 pax (Premium). Caramelo salgado ou calda de frutas vermelhas. Massa folhada = mercado'),
('coquetel_item', 'Dadinho de tapioca',         '{coquetel}', 'vegetariano', 'cozinha_quente', 'Dadinho = mercado; cozinha FRITA (nunca cru); geleia de pimenta à parte');

-- BEBIDAS (Expedição Bebidas)
insert into public.catalog_items (categoria, nome, base_sabor, servicos, selo, estacao, obs) values
('bebida', 'Café',                          null,       '{welcome_coffee,coffee_break,auditorio,almoco,jantar}', null,     'expedicao_bebidas', 'Garrafa térmica escaldada (1,7 L) ou pó+coador como insumo'),
('bebida', 'Leite',                         null,       '{welcome_coffee,coffee_break}', 'vegetariano', 'expedicao_bebidas', null),
('bebida', 'Leite sem lactose',             null,       '{coffee_break}', 'sem_lactose', 'expedicao_bebidas', 'Cortesia p/ restrições'),
('bebida', 'Leite vegetal (aveia)',         null,       '{coffee_break}', 'vegano',      'expedicao_bebidas', 'Cortesia p/ restrições'),
('bebida', 'Água quente para chá',          null,       '{welcome_coffee,coffee_break}', null, 'expedicao_bebidas', 'Acompanha sachês de chá'),
('bebida', 'Chá mate gelado',               null,       '{coffee_break}', 'vegano', 'expedicao_bebidas', 'Nunca especificar sabor — só "chá mate gelado"'),
('bebida', 'Suco de laranja',               'laranja',  '{coffee_break,coquetel}', 'vegano', 'expedicao_bebidas', 'Padrão do coffee (130 ml/pax)'),
('bebida', 'Suco de abacaxi com hortelã',   'abacaxi',  '{almoco,jantar,coquetel}', 'vegano', 'expedicao_bebidas', null),
('bebida', 'Suco de maracujá',              'maracuja', '{almoco,jantar,coquetel}', 'vegano', 'expedicao_bebidas', null),
('bebida', 'Suco de laranja com frutas vermelhas', 'laranja', '{almoco,jantar,coquetel}', 'vegano', 'expedicao_bebidas', null),
('bebida', 'Suco de melão com limão',       'melao',    '{almoco,jantar,coquetel}', 'vegano', 'expedicao_bebidas', null),
('bebida', 'Achocolatado',                  null,       '{coffee_break}', 'vegetariano', 'expedicao_bebidas', 'Pote inox 1/30 pax/período. 3 g/pax na compra');

-- OUTROS FIXOS
insert into public.catalog_items (categoria, nome, servicos, selo, estacao, obs) values
('acompanhamento', 'Salada de frutas',       '{coffee_break,brunch}', 'vegano', 'confeitaria', '100 g/pax. Frutas em pedaços grandes; copeira finaliza no local. Receita padrão na compra'),
('acompanhamento', 'Favo de mel com frutas laminadas', '{coffee_break,coquetel}', 'vegano', 'confeitaria', 'Master+: 50 g/pax de frutas laminadas + favo'),
('acompanhamento', 'Frutas laminadas',       '{almoco,jantar}', 'vegano', 'confeitaria', '50 g/pax SEM favo (todo almoço/jantar). NÃO gera plaquinha'),
('acompanhamento', 'Cup Mix de Castanhas',   '{coffee_break}', 'vegano', 'cozinha_fria', 'Padrão SAMIX sempre'),
('proibido',       'Atum (qualquer uso)',    '{}', null, null, 'PROIBIDO — saiu do cardápio'),
('proibido',       'Wrap de abacate',        '{}', null, null, 'PROIBIDO — umedece o pão');

update public.catalog_items set proibido = true where categoria = 'proibido';
