-- ============================================================
-- SISTEMA PIEGGI — Migration 0011: descrições de cardápio
-- Descrições completas dos itens, extraídas das 96 propostas
-- reais da pasta modulo-propostas/Orçamentos. É o que sai escrito
-- no slide do cliente ("Peito de peru — mini brioche, pasta de
-- queijos Pieggi, cenoura ralada e alface americana").
-- ============================================================

-- ---------- mini lanches ----------
update public.catalog_items set descricao = 'mini brioche, pasta de queijos Pieggi com ervas finas, cenoura ralada e alface americana'
  where categoria = 'mini_lanche' and nome = 'Peito de peru';
update public.catalog_items set descricao = 'mini brioche, pasta de queijos Pieggi, alface e pepino'
  where categoria = 'mini_lanche' and nome = 'Blanquet de peru';
update public.catalog_items set descricao = 'mini brioche, pasta de queijos Pieggi, cenoura e alface'
  where categoria = 'mini_lanche' and nome = 'Lombo canadense';
update public.catalog_items set descricao = 'mini brioche, pasta de queijos Pieggi com ervas finas, cenoura ralada e alface americana'
  where categoria = 'mini_lanche' and nome = 'Frango defumado';
update public.catalog_items set descricao = 'mini brioche, pasta de queijos Pieggi, milho e cenoura'
  where categoria = 'mini_lanche' and nome = 'Frango cozido desfiado';
update public.catalog_items set descricao = 'mini brioche, pasta de queijos Pieggi, alface e tomate'
  where categoria = 'mini_lanche' and nome = 'Presunto';
update public.catalog_items set descricao = 'mini brioche, pasta de queijos Pieggi, rúcula e tomate seco'
  where categoria = 'mini_lanche' and nome = 'Salame';
update public.catalog_items set descricao = 'mini pão de cenoura, pasta de queijos Pieggi, alface e tomate'
  where categoria = 'mini_lanche' and nome = 'Provolone';
update public.catalog_items set descricao = 'mini pão de cenoura, pasta de queijos Pieggi com ervas finas, alface, tomate e cenoura ralada'
  where categoria = 'mini_lanche' and nome like 'Vegetariano I %';
update public.catalog_items set descricao = 'mini pão de cenoura, pasta de queijos com iogurte e ervas finas, maçã verde e folhas'
  where categoria = 'mini_lanche' and nome like 'Vegetariano II %';
update public.catalog_items set descricao = 'mini pão de cenoura, pasta de queijos Pieggi, pesto de manjericão e tomate'
  where categoria = 'mini_lanche' and nome like 'Vegetariano III %';

-- ---------- barquetes de tapioca ----------
update public.catalog_items set descricao = 'creme de queijo e geleia de frutas' where categoria = 'barquete' and nome = 'Queijo e geleia';
update public.catalog_items set descricao = 'creme de queijo, tomate e manjericão' where categoria = 'barquete' and nome = 'Queijo e tomate';
update public.catalog_items set descricao = 'creme de queijo, mel e alecrim' where categoria = 'barquete' and nome = 'Queijo e alecrim';
update public.catalog_items set descricao = 'banana, mel e canela' where categoria = 'barquete' and nome = 'Banana e mel';
update public.catalog_items set descricao = 'maçã, mel e canela' where categoria = 'barquete' and nome = 'Maçã e canela';
update public.catalog_items set descricao = 'ricota com geleia de damasco e nozes' where categoria = 'barquete' and nome = 'Ricota e damasco';

-- ---------- shots ----------
update public.catalog_items set descricao = 'água de coco, couve, abacaxi e gengibre' where nome = 'Verde Vital';
update public.catalog_items set descricao = 'couve, laranja, acerola e gengibre'      where nome = 'Imuno Power';
update public.catalog_items set descricao = 'abacaxi, hortelã e limão'                where nome = 'Fresh Detox';
update public.catalog_items set descricao = 'maracujá, camomila e mel'                where nome = 'Calm & Relax';
update public.catalog_items set descricao = 'melancia, beterraba e gengibre'          where nome = 'Energia Rosa';
update public.catalog_items set descricao = 'melão, água de coco e limão'             where nome = 'Hidra Mix';
update public.catalog_items set descricao = 'morango, manga e chia'                   where nome = 'Pink Fresh';
update public.catalog_items set descricao = 'mamão, leite vegetal e mel'              where nome = 'Pele Bonita';
update public.catalog_items set descricao = 'banana, aveia e leite vegetal'           where nome = 'Banana Fit';
update public.catalog_items set descricao = 'laranja, cenoura e leite vegetal'        where nome = 'Energia Solar';
update public.catalog_items set descricao = 'couve, abacaxi e leite vegetal'          where nome = 'Verde Força';

-- ---------- verrines ----------
update public.catalog_items set descricao = 'creme de limão com merengue'                    where categoria = 'verrine' and nome = 'Tortinha de limão';
update public.catalog_items set descricao = 'mousse aerado de maracujá com calda da fruta'   where categoria = 'verrine' and nome = 'Mousse de maracujá';
update public.catalog_items set descricao = 'brigadeiro cremoso com granulado belga'         where categoria = 'verrine' and nome = 'Brigadeiro de colher';
update public.catalog_items set descricao = 'cocada cremosa de colher'                       where categoria = 'verrine' and nome = 'Cocada de colher';
update public.catalog_items set descricao = 'doce de leite, banana e chantilly'              where categoria = 'verrine' and nome = 'Banoffee';
update public.catalog_items set descricao = 'brigadeiro branco com uva verde'                where categoria = 'verrine' and nome = 'Brigadeiro branco e uva';
update public.catalog_items set descricao = 'merengue com morangos frescos'                  where categoria = 'verrine' and nome = 'Merengue de morango';
update public.catalog_items set descricao = 'uva e morango com ganache de chocolate'         where categoria = 'verrine' and nome = 'Franui';
update public.catalog_items set descricao = 'cottage com frutas tropicais'                   where categoria = 'verrine' and nome = 'Cottage tropical';
update public.catalog_items set descricao = 'mousse de frutas vermelhas com mirtilo'         where categoria = 'verrine' and nome = 'Frutas vermelhas e mirtilo';

-- ---------- croissants e quiches ----------
update public.catalog_items set descricao = 'recheio de queijo, servido quentinho' where categoria = 'croissant' and nome = 'Croissant de queijo';
update public.catalog_items set descricao = 'presunto e queijo'                    where categoria = 'croissant' and nome = 'Croissant presunto e queijo';
update public.catalog_items set descricao = 'calabresa artesanal'                  where categoria = 'croissant' and nome = 'Croissant de calabresa';
update public.catalog_items set descricao = 'queijo com goiabada cremosa'          where categoria = 'croissant' and nome = 'Croissant queijo e goiabada';
update public.catalog_items set descricao = 'recheio de chocolate meio amargo'     where categoria = 'croissant' and nome = 'Mini croissant de chocolate';
update public.catalog_items set descricao = 'bacon, queijo e cebola'               where categoria = 'quiche'    and nome = 'Mini quiche Lorraine';
update public.catalog_items set descricao = 'queijos selecionados'                 where categoria = 'quiche'    and nome = 'Mini quiche de queijo';
update public.catalog_items set descricao = 'alho-poró refogado com creme'         where categoria = 'quiche'    and nome = 'Mini quiche alho-poró';
update public.catalog_items set descricao = 'palmito cremoso'                      where categoria = 'quiche'    and nome = 'Mini quiche de palmito';

-- ---------- tramezzinos ----------
update public.catalog_items set descricao = 'pasta de queijos com pesto de manjericão' where categoria = 'tramezzino' and nome = 'Queijos e pesto';
update public.catalog_items set descricao = 'grão-de-bico e tahine'                    where categoria = 'tramezzino' and nome = 'Homus';
update public.catalog_items set descricao = 'creme de tomate seco e ervas'             where categoria = 'tramezzino' and nome = 'Creme de tomate seco';
update public.catalog_items set descricao = 'cenoura com tahine e limão'               where categoria = 'tramezzino' and nome = 'Cenoura e tahine';
update public.catalog_items set descricao = 'amendoim com ervas finas'                 where categoria = 'tramezzino' and nome = 'Amendoim com ervas';

-- ---------- canapés ----------
update public.catalog_items set descricao = 'tartelete com shimeji salteado e cream cheese'  where categoria = 'canape' and nome like 'Shimeji%';
update public.catalog_items set descricao = 'tartelete com gorgonzola e pera caramelizada'   where categoria = 'canape' and nome like 'Gorgonzola%';
update public.catalog_items set descricao = 'vol-au-vent com brie e geleia de damasco'       where categoria = 'canape' and nome like 'Brie%';
update public.catalog_items set descricao = 'mini torrada com carpaccio, parmesão e alcaparras' where categoria = 'canape' and nome like 'Carpaccio%';
update public.catalog_items set descricao = 'mini torrada com rosbife e mostarda Dijon'      where categoria = 'canape' and nome like 'Rosbife%';
update public.catalog_items set descricao = 'mini torrada com salmão defumado e cream cheese' where categoria = 'canape' and nome like 'Salm%';

-- ---------- pastas na tábua ----------
update public.catalog_items set descricao = 'catupiry, lascas de alho, mel e azeite · acompanha mini pão sueco'
  where categoria = 'pasta_board' and nome like 'Pasta na tábua Catupiry%';
update public.catalog_items set descricao = 'pasta de queijo com pesto de azeitonas · acompanha mini pão sueco'
  where categoria = 'pasta_board' and nome like '%pesto de azeitonas%';
update public.catalog_items set descricao = 'pasta de queijo com alho-poró · acompanha mini pão sueco'
  where categoria = 'pasta_board' and nome like '%alho-poró%';

-- ---------- bebezinhos / bolos ----------
update public.catalog_items set descricao = 'massa de laranja com recheio de chocolate' where categoria = 'bebezinho' and nome = 'Laranja e chocolate';
update public.catalog_items set descricao = 'recheio de doce de leite'                  where categoria = 'bebezinho' and nome = 'Churros';
update public.catalog_items set descricao = 'massa de cenoura com recheio de chocolate' where categoria = 'bebezinho' and nome = 'Cenoura com chocolate';
update public.catalog_items set descricao = 'massa e recheio de chocolate belga'        where categoria = 'bebezinho' and nome = 'Chocolate duplo';
update public.catalog_items set descricao = 'recheio de creme de limão'                 where categoria = 'bebezinho' and nome = 'Limão';
update public.catalog_items set descricao = 'massa de fubá com goiabada cremosa'        where categoria = 'bebezinho' and nome = 'Fubá com goiabada';
update public.catalog_items set descricao = 'recheio de leite Ninho com Nutella'        where categoria = 'bebezinho' and nome = 'Ninho com Nutella';
update public.catalog_items set descricao = 'coco com cobertura de chocolate'           where categoria = 'bebezinho' and nome = 'Prestígio';
update public.catalog_items set descricao = 'marshmallow com chocolate'                 where categoria = 'bebezinho' and nome = 'Nhá Benta';
update public.catalog_items set descricao = 'recheio de creme de maracujá'              where categoria = 'bebezinho' and nome = 'Maracujá';

-- ---------- itens de bloco fixo (aparecem no "Da casa" do slide) ----------
update public.catalog_items set descricao = 'com iogurte, granola, aveia, sucrilhos e mel'
  where categoria = 'acompanhamento' and nome = 'Salada de frutas';
update public.catalog_items set descricao = 'tradicional e multigrãos, assados na hora'
  where categoria = 'pao_de_queijo' and nome = 'Pão de queijo tradicional';
