-- ============================================================
-- SISTEMA PIEGGI — Migration 0015: preços e custos do ERP
--
-- Fonte: modulo-propostas/"Cardápio Coffee Break  Planilha de Custos.xlsx"
-- Markup aplicado na planilha: 3× sobre o custo.
--
-- 137 produtos transcritos por script (nenhum digitado à mão).
-- É a primeira vez que o sistema tem CUSTO — dá para calcular CMV real
-- por proposta, não só o percentual de desconto.
--
-- ⚠️ A planilha cobre só a família COFFEE BREAK. Coquetel, almoço e jantar
--    seguem sem custo/preço unitário no ERP.
-- ============================================================

-- Comparar nome de produto ignorando acento, sem depender da extensão
-- `unaccent` (que nem sempre está habilitada no projeto Supabase).
create or replace function public.unaccent_simples(t text)
returns text
language sql
immutable
strict
parallel safe
as $$
  select translate(
    t,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

create table if not exists public.erp_produtos (
  id                uuid primary key default gen_random_uuid(),
  familia           text not null,
  grupo             text not null,
  grupo_base        text not null,
  tier              public.service_line,
  categoria         text,
  produto           text not null,
  ingredientes      text,
  unidade_comercial text not null default 'unidade',
  custo             numeric(10,4),
  preco             numeric(10,4),
  catalog_item_id   uuid references public.catalog_items (id) on delete set null,
  ativo             boolean not null default true,
  atualizado_em     timestamptz not null default now(),
  unique (familia, grupo, produto)
);

comment on table public.erp_produtos is
  'Espelho da planilha de custos do ERP: custo e preço de venda por produto e linha. Fonte da verdade do preço unitário na venda por unidade.';

alter table public.erp_produtos enable row level security;

drop policy if exists erp_leitura on public.erp_produtos;
create policy erp_leitura on public.erp_produtos
  for select to authenticated using (true);

drop policy if exists erp_escrita on public.erp_produtos;
create policy erp_escrita on public.erp_produtos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists erp_produtos_categoria_idx on public.erp_produtos (categoria, tier);

-- ---------- dados ----------
insert into public.erp_produtos
  (familia, grupo, grupo_base, tier, categoria, produto, ingredientes, unidade_comercial, custo, preco)
values
  ('COFFEE BREAK', 'MINI SANDUÍCHE BASIC', 'MINI SANDUÍCHE', 'basic', 'mini_lanche', 'Peito de Frango Defumado', 'Mini brioche; pasta mix de queijos Pieggi (requeijão e ervas finas); cenoura ralada; alface americana', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'MINI SANDUÍCHE BASIC', 'MINI SANDUÍCHE', 'basic', 'mini_lanche', 'Peito de Peru', 'Mini pão francês tradicional; pasta mix de queijos Pieggi (requeijão e ervas finas); alface; cenoura ralada fina', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'MINI SANDUÍCHE BASIC', 'MINI SANDUÍCHE', 'basic', 'mini_lanche', 'Presunto Comum', 'Mini pão francês tradicional; pasta mix de queijos Pieggi (requeijão e orégano); tomate; alface verde', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'MINI SANDUÍCHE BASIC', 'MINI SANDUÍCHE', 'basic', 'mini_lanche', 'Vegetariano I', 'Mini brioche integral, multigrãos ou aveia; pasta mix de queijos Pieggi (requeijão e ervas finas); alface; tomate; cenoura ralada', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'MINI SANDUÍCHE BASIC', 'MINI SANDUÍCHE', 'basic', 'mini_lanche', 'Vegetariano II', 'Mini brioche integral, multigrãos ou aveia; pasta mix de queijos Pieggi (iogurte e ervas finas); alface; tomate; maçã verde ralada', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'MINI SANDUÍCHE BASIC', 'MINI SANDUÍCHE', 'basic', 'mini_lanche', 'Vegetariano III', 'Mini brioche integral, multigrãos ou aveia; pasta mix de queijos Pieggi (requeijão); alface; tomate; pesto de rúcula com manjericão', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'MINI SANDUÍCHE STANDARD', 'MINI SANDUÍCHE', 'standard', 'mini_lanche', 'Blanquet', 'Mini brioche; pasta mix de queijos Pieggi (iogurte, mostarda e ervas finas); alface verde; pepino', 'unidade', 4.1670, 12.5010),
  ('COFFEE BREAK', 'MINI SANDUÍCHE STANDARD', 'MINI SANDUÍCHE', 'standard', 'mini_lanche', 'Lombo Canadense', 'Mini francês; pasta mix de queijos Pieggi (maionese e tomate seco); tomate fresco; alface', 'unidade', 4.1670, 12.5010),
  ('COFFEE BREAK', 'MINI SANDUÍCHE STANDARD', 'MINI SANDUÍCHE', 'standard', 'mini_lanche', 'Provolone', 'Mini francês com parmesão; pasta mix de queijos Pieggi (requeijão e azeitonas pretas); tomate fresco; alface verde', 'unidade', 4.1670, 12.5010),
  ('COFFEE BREAK', 'MINI SANDUÍCHE EXECUTIVE', 'MINI SANDUÍCHE', 'executive', 'mini_lanche', 'Atum', 'Mini brioche; pasta de atum; cenoura ralada; folhas', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'MINI SANDUÍCHE EXECUTIVE', 'MINI SANDUÍCHE', 'executive', 'mini_lanche', 'Peito de Frango Cozido Desfiado', 'Mini brioche; pasta mix de queijos Pieggi (maionese e ervas finas); milho verde; cenoura ralada; alface roxa', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'MINI SANDUÍCHE EXECUTIVE', 'MINI SANDUÍCHE', 'executive', 'mini_lanche', 'Salame Comum', 'Mini francês tradicional; pasta mix de queijos Pieggi (maionese e azeitonas pretas); alface roxa; cebola roxa', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'MINI SANDUÍCHE MASTER', 'MINI SANDUÍCHE', 'master', 'mini_lanche', 'Búfala', 'Mini brioche tradicional; pasta mix de queijos Pieggi (requeijão); pesto de rúcula e manjericão; tomate; alface verde', 'unidade', 5.5000, 16.5000),
  ('COFFEE BREAK', 'MINI SANDUÍCHE MASTER', 'MINI SANDUÍCHE', 'master', 'mini_lanche', 'Copa', 'Mini francês com parmesão; pasta mix de queijos Pieggi (maionese e ervas finas); tomate fresco; alface roxa', 'unidade', 5.5000, 16.5000),
  ('COFFEE BREAK', 'MINI SANDUÍCHE MASTER', 'MINI SANDUÍCHE', 'master', 'mini_lanche', 'Pastrami Artesanal', 'Mini ciabatta; pasta mix de queijos Pieggi (maionese e ervas finas); tomate fresco; agrião', 'unidade', 5.5000, 16.5000),
  ('COFFEE BREAK', 'MINI SANDUÍCHE MASTER', 'MINI SANDUÍCHE', 'master', 'mini_lanche', 'Presunto Royale', 'Mini francês tradicional; pasta mix de queijos Pieggi (requeijão e ervas finas); alface verde; tomate', 'unidade', 5.5000, 16.5000),
  ('COFFEE BREAK', 'MINI SANDUÍCHE MASTER', 'MINI SANDUÍCHE', 'master', 'mini_lanche', 'Rosbife Artesanal', 'Mini pão francês com parmesão; pasta mix de queijos Pieggi (maionese, mostarda dijon, limão-siciliano); maçã verde laminada; alface roxa', 'unidade', 5.5000, 16.5000),
  ('COFFEE BREAK', 'TRAMEZZINO STANDARD', 'TRAMEZZINO', 'standard', 'tramezzino', 'Tramezzino Creme de Abacate', 'Pão de forma tradicional ou integral; grão-de-bico; abacate; tahine; azeite; limão; sal; espinafre', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'TRAMEZZINO STANDARD', 'TRAMEZZINO', 'standard', 'tramezzino', 'Tramezzino Creme de Abóbora', 'Pão de forma tradicional ou integral; abóbora assada; tahine; azeite; limão; sal; pimenta; agrião', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'TRAMEZZINO STANDARD', 'TRAMEZZINO', 'standard', 'tramezzino', 'Tramezzino Creme de Beterraba', 'Pão de forma tradicional ou integral; grão-de-bico; beterraba; tahine; azeite; limão; sal; alface roxa', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'TRAMEZZINO STANDARD', 'TRAMEZZINO', 'standard', 'tramezzino', 'Tramezzino Pasta de Cenoura com Gengibre e Tahine', 'Pão de forma tradicional ou integral; pasta de cenoura com gengibre fresco e tahine', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'TRAMEZZINO STANDARD', 'TRAMEZZINO', 'standard', 'tramezzino', 'Tramezzino Pasta de Frango', 'Pão de forma tradicional ou integral; pasta de peito de frango', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'TRAMEZZINO STANDARD', 'TRAMEZZINO', 'standard', 'tramezzino', 'Tramezzino Creme de Abobrinha com Ervas', 'Pão de forma tradicional ou integral; abobrinha; tahine; azeite; limão; hortelã; sal; rúcula', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'TRAMEZZINO STANDARD', 'TRAMEZZINO', 'standard', 'tramezzino', 'Tramezzino Creme de Milho', 'Pão de forma tradicional ou integral; milho; tahine; azeite; limão; sal; alface', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'TRAMEZZINO EXECUTIVE', 'TRAMEZZINO', 'executive', 'tramezzino', 'Tramezzino Pasta de Atum', 'Pão de forma tradicional ou integral; pasta de atum', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'TRAMEZZINO EXECUTIVE', 'TRAMEZZINO', 'executive', 'tramezzino', 'Tramezzino Babaganoush (Berinjela Defumada)', 'Pão de forma tradicional ou integral; berinjela defumada; rúcula', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'TRAMEZZINO EXECUTIVE', 'TRAMEZZINO', 'executive', 'tramezzino', 'Tramezzino Creme de Amendoim com Ervas', 'Pão de forma tradicional ou integral; amendoim; tahine; azeite; limão; salsinha; sal; alface roxa', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'TRAMEZZINO EXECUTIVE', 'TRAMEZZINO', 'executive', 'tramezzino', 'Tramezzino Creme de Tomate Seco', 'Pão de forma tradicional ou integral; tomate seco; tahine; azeite; limão; alho; sal; manjericão; rúcula', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'TRAMEZZINO EXECUTIVE', 'TRAMEZZINO', 'executive', 'tramezzino', 'Tramezzino Homus', 'Pão de forma tradicional ou integral; grão-de-bico; tahine; azeite; limão; alho; sal; rúcula', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'TRAMEZZINO EXECUTIVE', 'TRAMEZZINO', 'executive', 'tramezzino', 'Tramezzino Pasta de Queijos com Pesto de Rúcula e Manjericão', 'Pão de forma tradicional ou integral; pasta mix de queijos Pieggi (requeijão); pesto de rúcula e manjericão', 'unidade', 4.5000, 13.5000),
  ('COFFEE BREAK', 'MINI WRAP STANDARD', 'MINI WRAP', 'standard', 'wrap', 'Wrap Abacate & Tomate (Vegano)', 'Purê de abacate; tomate em cubos; cebola roxa picada; linhaça tostada; alface; sal; limão-siciliano; pimenta-do-reino; azeite extravirgem', 'unidade', 3.1670, 9.5010),
  ('COFFEE BREAK', 'MINI WRAP STANDARD', 'MINI WRAP', 'standard', 'wrap', 'Wrap Cenoura & Ervas Finas (Vegetariano)', 'Pasta mix de queijos Pieggi (creme de leite); cenoura ralada; ervas finas; alface; sal; azeite; orégano; pimenta-do-reino branca', 'unidade', 3.1670, 9.5010),
  ('COFFEE BREAK', 'MINI WRAP EXECUTIVE', 'MINI WRAP', 'executive', 'wrap', 'Wrap Pepino, Maçã & Hortelã (Vegetariano)', 'Pasta mix de queijos Pieggi (iogurte); pepino laminado; maçã verde; hortelã; alface verde; azeite extravirgem; limão-siciliano; sal', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'MINI WRAP EXECUTIVE', 'MINI WRAP', 'executive', 'wrap', 'Wrap Uvas & Rúcula (Vegetariano)', 'Pasta mix de queijos Pieggi (creme de leite); uvas cortadas ao meio; cenoura ralada; rúcula; azeite extravirgem; pimenta-rosa moída; mel', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'MINI WRAP EXECUTIVE', 'MINI WRAP', 'executive', 'wrap', 'Wrap Azeitonas & Agrião (Vegetariano)', 'Pasta mix de queijos Pieggi (maionese); azeitonas pretas fatiadas; tomate fresco; agrião; orégano fresco; azeite; pimenta-do-reino', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'MINI WRAP STANDARD', 'MINI WRAP', 'standard', 'wrap', 'Wrap Tzatziki Pieggi (Vegetariano)', 'Pasta mix de queijos Pieggi (iogurte e iogurte grego); pepino; alho fresco; azeite; hortelã; cenoura ralada; folhas verdes; sal; limão-siciliano', 'unidade', 3.1670, 9.5010),
  ('COFFEE BREAK', 'MINI WRAP EXECUTIVE', 'MINI WRAP', 'executive', 'wrap', 'Wrap Manga & Rúcula (Vegetariano)', 'Pasta mix de queijos Pieggi (requeijão); manga fresca; tomate fresco; rúcula; azeite extravirgem; pimenta-rosa', 'unidade', 3.6670, 11.0010),
  ('COFFEE BREAK', 'MINI WRAP EXECUTIVE', 'MINI WRAP', 'executive', 'wrap', 'Wrap Pasta de Ricota com Pesto (Vegetariano)', 'Pasta mix de queijos Pieggi (creme de leite e pesto de manjericão); tomate seco; tomate fresco; rúcula; azeite extravirgem; pimenta-do-reino', 'unidade', 3.6670, 11.0010),
  ('COFFEE BREAK', 'ENVELOPE GOURMET STANDARD', 'ENVELOPE GOURMET', 'standard', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Abacate & Tomate (Vegano)', 'Purê de abacate; tomate em cubos; cebola roxa picada; linhaça tostada; alface; sal; limão-siciliano; pimenta-do-reino; azeite extravirgem', 'unidade', 3.6670, 11.0010),
  ('COFFEE BREAK', 'ENVELOPE GOURMET EXECUTIVE', 'ENVELOPE GOURMET', 'executive', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Azeitonas & Agrião (Vegetariano)', 'Pasta mix de queijos Pieggi (maionese); azeitonas pretas fatiadas; tomate fresco; agrião; orégano fresco; azeite; pimenta-do-reino', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'ENVELOPE GOURMET STANDARD', 'ENVELOPE GOURMET', 'standard', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Cenoura & Ervas Finas (Vegetariano)', 'Pasta mix de queijos Pieggi (creme de leite); cenoura ralada; ervas finas; alface; sal; azeite; orégano; pimenta-do-reino branca', 'unidade', 3.6670, 11.0010),
  ('COFFEE BREAK', 'ENVELOPE GOURMET EXECUTIVE', 'ENVELOPE GOURMET', 'executive', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Pepino, Maçã & Hortelã (Vegetariano)', 'Pasta mix de queijos Pieggi (iogurte); pepino laminado; maçã verde; hortelã; alface verde; azeite extravirgem; limão-siciliano; sal', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'ENVELOPE GOURMET STANDARD', 'ENVELOPE GOURMET', 'standard', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Tzatziki Pieggi (Vegetariano)', 'Pasta mix de queijos Pieggi (iogurte e iogurte grego); pepino; alho fresco; azeite; hortelã; cenoura ralada; folhas verdes; sal; limão-siciliano', 'unidade', 3.6670, 11.0010),
  ('COFFEE BREAK', 'ENVELOPE GOURMET EXECUTIVE', 'ENVELOPE GOURMET', 'executive', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Uvas & Rúcula (Vegetariano)', 'Pasta mix de queijos Pieggi (creme de leite); uvas cortadas ao meio; cenoura ralada; rúcula; azeite extravirgem; pimenta-rosa moída; mel', 'unidade', 3.8330, 11.4990),
  ('COFFEE BREAK', 'ENVELOPE GOURMET MASTER', 'ENVELOPE GOURMET', 'master', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Manga & Rúcula (Vegetariano)', 'Pasta mix de queijos Pieggi (requeijão); manga fresca; tomate fresco; rúcula; azeite extravirgem; pimenta-rosa', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'ENVELOPE GOURMET MASTER', 'ENVELOPE GOURMET', 'master', 'envelope_gourmet', 'Envelope Gourmet (com pregador) Pasta de Ricota com Pesto (Vegetariano)', 'Pasta mix de queijos Pieggi (creme de leite e pesto de manjericão); tomate seco; tomate fresco; rúcula; azeite extravirgem; pimenta-do-reino', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'BARQUETE DE TAPIOCA STANDARD', 'BARQUETE DE TAPIOCA', 'standard', 'barquete', 'Barquete Banana, Mel & Canela', 'Tapioca; banana; mel; canela', 'unidade', 2.8330, 8.4990),
  ('COFFEE BREAK', 'BARQUETE DE TAPIOCA STANDARD', 'BARQUETE DE TAPIOCA', 'standard', 'barquete', 'Barquete Creme de queijo, Mel & Alecrim', 'Tapioca; queijo; mel; alecrim', 'unidade', 2.8330, 8.4990),
  ('COFFEE BREAK', 'BARQUETE DE TAPIOCA STANDARD', 'BARQUETE DE TAPIOCA', 'standard', 'barquete', 'Barquete Creme de queijo, Tomate & Manjericão', 'Tapioca; queijo; tomate; manjericão', 'unidade', 2.8330, 8.4990),
  ('COFFEE BREAK', 'BARQUETE DE TAPIOCA STANDARD', 'BARQUETE DE TAPIOCA', 'standard', 'barquete', 'Barquete Maçã, Mel & Canela', 'Tapioca; maçã; mel; canela', 'unidade', 2.8330, 8.4990),
  ('COFFEE BREAK', 'BARQUETE DE TAPIOCA EXECUTIVE', 'BARQUETE DE TAPIOCA', 'executive', 'barquete', 'Barquete Creme de queijo & Geleia de Frutas', 'Tapioca; queijo; geleia de frutas', 'unidade', 3.1670, 9.5010),
  ('COFFEE BREAK', 'BARQUETE DE TAPIOCA MASTER', 'BARQUETE DE TAPIOCA', 'master', 'barquete', 'Barquete Ricota com Geleia de Damasco & Nozes', 'Tapioca; ricota; geleia de damasco; nozes', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'SHOT FUNCIONAL STANDARD', 'SHOT FUNCIONAL', 'standard', 'shot_funcional', 'Shot Calm & Relax', 'Maracujá; camomila; mel', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'SHOT FUNCIONAL STANDARD', 'SHOT FUNCIONAL', 'standard', 'shot_funcional', 'Shot Energia Rosa', 'Melancia; beterraba; gengibre', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'SHOT FUNCIONAL STANDARD', 'SHOT FUNCIONAL', 'standard', 'shot_funcional', 'Shot Fresh Detox', 'Maçã verde; pepino; espinafre; hortelã', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'SHOT FUNCIONAL STANDARD', 'SHOT FUNCIONAL', 'standard', 'shot_funcional', 'Shot Hidra Mix', 'Melancia; pepino; hortelã', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'SHOT FUNCIONAL STANDARD', 'SHOT FUNCIONAL', 'standard', 'shot_funcional', 'Shot Imuno Power', 'Couve; laranja; acerola; gengibre', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'SHOT FUNCIONAL STANDARD', 'SHOT FUNCIONAL', 'standard', 'shot_funcional', 'Shot Verde Vital', 'Água de coco; couve; abacaxi; gengibre', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'SHOT VITAMINADO EXECUTIVE', 'SHOT VITAMINADO', 'executive', 'shot_vitaminado', 'Shot Banana Fit', 'Banana; chia; cacau em pó', 'unidade', 4.3330, 12.9990),
  ('COFFEE BREAK', 'SHOT VITAMINADO EXECUTIVE', 'SHOT VITAMINADO', 'executive', 'shot_vitaminado', 'Shot Energia Solar', 'Manga; gengibre; chia; leite vegetal', 'unidade', 4.3330, 12.9990),
  ('COFFEE BREAK', 'SHOT VITAMINADO EXECUTIVE', 'SHOT VITAMINADO', 'executive', 'shot_vitaminado', 'Shot Pele Bonita', 'Mamão; laranja; chia; leite vegetal', 'unidade', 4.3330, 12.9990),
  ('COFFEE BREAK', 'SHOT VITAMINADO EXECUTIVE', 'SHOT VITAMINADO', 'executive', 'shot_vitaminado', 'Shot Pink Fresh', 'Morango; manga; chia', 'unidade', 4.3330, 12.9990),
  ('COFFEE BREAK', 'SHOT VITAMINADO EXECUTIVE', 'SHOT VITAMINADO', 'executive', 'shot_vitaminado', 'Shot Verde Força', 'Abacate; maçã verde; chia', 'unidade', 4.3330, 12.9990),
  ('COFFEE BREAK', 'TARTELETE EXECUTIVE', 'TARTELETE', 'executive', 'tartelete', 'Tartelete Creme de Queijo com Abacaxi Caramelizado', 'Massa de tartelete; creme de queijo; calda de abacaxi caramelizado', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'TARTELETE EXECUTIVE', 'TARTELETE', 'executive', 'tartelete', 'Tartelete Creme de Queijo com Geleia de Goiaba', 'Massa de tartelete; creme de queijo; geleia artesanal de goiaba', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'TARTELETE EXECUTIVE', 'TARTELETE', 'executive', 'tartelete', 'Tartelete Doce de Leite com Banana e Flor de Sal', 'Massa de tartelete; doce de leite; banana; flor de sal', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'TARTELETE EXECUTIVE', 'TARTELETE', 'executive', 'tartelete', 'Tartelete Ganache de Chocolate Branco com Morango', 'Massa de tartelete; ganache de chocolate branco; calda de morango fresco', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'TARTELETE EXECUTIVE', 'TARTELETE', 'executive', 'tartelete', 'Tartelete Ganache de Chocolate ao Leite com Maracujá', 'Massa de tartelete; ganache de chocolate ao leite; calda de maracujá fresco', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'TARTELETE MASTER', 'TARTELETE', 'master', 'tartelete', 'Tartelete Cottage com Maçã, Mel e Canela', 'Massa de tartelete; creme de cottage; maçã cozida; mel; canela', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'TARTELETE MASTER', 'TARTELETE', 'master', 'tartelete', 'Tartelete Ganache de Chocolate ao Leite com Amêndoas', 'Massa de tartelete; ganache de chocolate ao leite; amêndoas tostadas', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'TARTELETE MASTER', 'TARTELETE', 'master', 'tartelete', 'Tartelete Purê de Manga, Queijo Branco e Pimenta-Rosa', 'Massa de tartelete; purê de manga; queijo branco; pimenta-rosa', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'MINI CUP SALGADO EXECUTIVE', 'MINI CUP SALGADO', 'executive', 'mini_cup_salgado', 'Mini Cup Crudités com Coalhada Temperada', 'Crudités de vegetais coloridos; coalhada temperada', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'MINI CUP SALGADO EXECUTIVE', 'MINI CUP SALGADO', 'executive', 'mini_cup_salgado', 'Mini Cup Guacamole com Grissini', 'Guacamole; grissini', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'MINI CUP SALGADO EXECUTIVE', 'MINI CUP SALGADO', 'executive', 'mini_cup_salgado', 'Mini Cup Homus com Grissini', 'Homus; grissini', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'MINI CUP SALGADO MASTER', 'MINI CUP SALGADO', 'master', 'mini_cup_salgado', 'Mini Cup Mix de Castanhas', 'Amêndoas defumadas; castanha-de-caju; castanha-do-pará; uvas-passas', 'unidade', 4.8330, 14.4990),
  ('COFFEE BREAK', 'VERRINE DOCE STANDARD', 'VERRINE DOCE', 'standard', 'verrine', 'Verrine Brigadeiro de Colher', 'Brigadeiro de chocolate ao leite', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'VERRINE DOCE STANDARD', 'VERRINE DOCE', 'standard', 'verrine', 'Verrine Cocada de Colher', 'Cocada cremosa', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'VERRINE DOCE STANDARD', 'VERRINE DOCE', 'standard', 'verrine', 'Verrine Mousse de Maracujá', 'Mousse de maracujá; calda de maracujá fresco', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'VERRINE DOCE STANDARD', 'VERRINE DOCE', 'standard', 'verrine', 'Verrine Tortinha de Limão Desconstruída', 'Massa farofada; creme de limão; merengue', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'VERRINE DOCE EXECUTIVE', 'VERRINE DOCE', 'executive', 'verrine', 'Verrine Banoffee Desconstruída', 'Banana; doce de leite; chantilly; biscoito', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'VERRINE DOCE EXECUTIVE', 'VERRINE DOCE', 'executive', 'verrine', 'Verrine Brigadeiro Branco com Uva Verde', 'Brigadeiro branco; uva verde', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'VERRINE DOCE EXECUTIVE', 'VERRINE DOCE', 'executive', 'verrine', 'Verrine Merengue de Morango Desconstruído', 'Merengue; morango; creme', 'unidade', 3.5000, 10.5000),
  ('COFFEE BREAK', 'VERRINE DOCE MASTER', 'VERRINE DOCE', 'master', 'verrine', 'Verrine Cottage com Mel, Manga e Granola', 'Cottage; mel; purê de manga; granola artesanal', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'VERRINE DOCE MASTER', 'VERRINE DOCE', 'master', 'verrine', 'Verrine Franui Desconstruído', 'Ganache de chocolate ao leite; ganache de chocolate branco; calda de frutas vermelhas frescas', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'VERRINE DOCE MASTER', 'VERRINE DOCE', 'master', 'verrine', 'Verrine Mousse de Frutas Vermelhas com Mirtilo', 'Mousse de frutas vermelhas; mirtilo fresco', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'VERRINE DOCE MASTER', 'VERRINE DOCE', 'master', 'verrine', 'Verrine Mousse de Limão com Coulis de Frutas Vermelhas', 'Mousse de limão; coulis de frutas vermelhas', 'unidade', 4.0000, 12.0000),
  ('COFFEE BREAK', 'PIEGGI BOARD EXECUTIVE', 'PIEGGI BOARD', 'executive', 'pasta_board', 'Pasta Mix de Queijos Pieggi Alho-Poró & Limão-Siciliano', 'Mix de queijos Pieggi; alho-poró; limão-siciliano; acompanha mini pão sueco', 'travessa (~10 pax)', 40.0000, 120.0000),
  ('COFFEE BREAK', 'PIEGGI BOARD EXECUTIVE', 'PIEGGI BOARD', 'executive', 'pasta_board', 'Tzatziki Pieggi', 'Iogurte; pepino; alho; hortelã; azeite; acompanha mini pão sueco', 'travessa (~10 pax)', 40.0000, 120.0000),
  ('COFFEE BREAK', 'PIEGGI BOARD MASTER', 'PIEGGI BOARD', 'master', 'pasta_board', 'Catupiry com Alho Frito, Azeite & Mel', 'Catupiry; alho frito; azeite; mel; acompanha mini pão sueco', 'travessa (~10 pax)', 63.3330, 189.9990),
  ('COFFEE BREAK', 'PIEGGI BOARD MASTER', 'PIEGGI BOARD', 'master', 'pasta_board', 'Pasta Mix de Queijos Pieggi & Pesto de Azeitonas Pretas', 'Mix de queijos Pieggi; pesto de azeitonas pretas; acompanha mini pão sueco', 'travessa (~10 pax)', 63.3330, 189.9990),
  ('COFFEE BREAK', 'PIEGGI BOARD MASTER', 'PIEGGI BOARD', 'master', 'pasta_board', 'Pasta Mix de Queijos Pieggi Pera & Nozes', 'Mix de queijos Pieggi; pera; nozes; acompanha mini pão sueco', 'travessa (~10 pax)', 63.3330, 189.9990),
  ('COFFEE BREAK', 'SALGADOS CASEIROS EXECUTIVE', 'SALGADOS CASEIROS', 'executive', 'salgado_caseiro', 'Croissant de queijo', null, 'unidade', 1.9667, 5.9000),
  ('COFFEE BREAK', 'SALGADOS CASEIROS EXECUTIVE', 'SALGADOS CASEIROS', 'executive', 'salgado_caseiro', 'Croissant de calabresa', null, 'unidade', 2.3000, 6.9000),
  ('COFFEE BREAK', 'SALGADOS CASEIROS EXECUTIVE', 'SALGADOS CASEIROS', 'executive', 'salgado_caseiro', 'Croissant de presunto e queijo', null, 'unidade', 2.3000, 6.9000),
  ('COFFEE BREAK', 'SALGADOS CASEIROS MASTER', 'SALGADOS CASEIROS', 'master', 'salgado_caseiro', 'Pão de batata com catupiry', null, 'unidade', 2.9667, 8.9000),
  ('COFFEE BREAK', 'SALGADOS CASEIROS MASTER', 'SALGADOS CASEIROS', 'master', 'salgado_caseiro', 'Pão de batata com calabresa', null, 'unidade', 2.8333, 8.5000),
  ('COFFEE BREAK', 'SALGADOS CASEIROS MASTER', 'SALGADOS CASEIROS', 'master', 'salgado_caseiro', 'Pão de batata com presunto e queijo', null, 'unidade', 2.8333, 8.5000),
  ('COFFEE BREAK', 'BOLO INTEIRO BASIC', 'BOLO INTEIRO', 'basic', 'bolo_inteiro', 'Bolo Inteiro Fubá com Goiabada', 'Fubá; ovos; leite; açúcar; manteiga; goiabada', 'bolo inteiro (~12 pax)', 25.0000, 75.0000),
  ('COFFEE BREAK', 'BOLO INTEIRO BASIC', 'BOLO INTEIRO', 'basic', 'bolo_inteiro', 'Bolo Inteiro Milho na Folha', 'Milho verde; ovos; leite; açúcar; manteiga; folha de bananeira', 'bolo inteiro (~12 pax)', 25.0000, 75.0000),
  ('COFFEE BREAK', 'BOLO INTEIRO BASIC', 'BOLO INTEIRO', 'basic', 'bolo_inteiro', 'Bolo Inteiro de Banana', 'Banana; farinha; ovos; açúcar; canela', 'bolo inteiro (~12 pax)', 25.0000, 75.0000),
  ('COFFEE BREAK', 'BOLO INTEIRO EXECUTIVE', 'BOLO INTEIRO', 'executive', 'bolo_inteiro', 'Bolo Inteiro Bem-Casado', 'Massa de bem-casado; doce de leite', 'bolo inteiro (~12 pax)', 28.3330, 84.9990),
  ('COFFEE BREAK', 'BOLO INTEIRO BASIC', 'BOLO INTEIRO', 'basic', 'bolo_inteiro', 'Bolo Inteiro Brigadeiro', 'Massa de chocolate; brigadeiro', 'bolo inteiro (~12 pax)', 25.0000, 75.0000),
  ('COFFEE BREAK', 'BOLO INTEIRO BASIC', 'BOLO INTEIRO', 'basic', 'bolo_inteiro', 'Bolo Inteiro Cenoura com Chocolate', 'Cenoura; ovos; óleo; açúcar; farinha; calda de chocolate', 'bolo inteiro (~12 pax)', 25.0000, 75.0000),
  ('COFFEE BREAK', 'BOLO INTEIRO EXECUTIVE', 'BOLO INTEIRO', 'executive', 'bolo_inteiro', 'Bolo Inteiro Iogurte', 'Iogurte; ovos; farinha; açúcar; óleo', 'bolo inteiro (~12 pax)', 28.3330, 84.9990),
  ('COFFEE BREAK', 'BOLO INTEIRO EXECUTIVE', 'BOLO INTEIRO', 'executive', 'bolo_inteiro', 'Bolo Inteiro Laranja', 'Laranja; ovos; farinha; açúcar; óleo', 'bolo inteiro (~12 pax)', 28.3330, 84.9990),
  ('COFFEE BREAK', 'BOLO INTEIRO EXECUTIVE', 'BOLO INTEIRO', 'executive', 'bolo_inteiro', 'Bolo Piscina Limão', 'Limão; ovos; farinha; açúcar; manteiga', 'bolo inteiro (~12 pax)', 28.3330, 84.9990),
  ('COFFEE BREAK', 'BOLO INTEIRO MASTER', 'BOLO INTEIRO', 'master', 'bolo_inteiro', 'Bolo Inteiro Coco Cremoso', 'Coco; leite condensado; leite de coco; ovos', 'bolo inteiro (~12 pax)', 30.0000, 90.0000),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) BASIC', 'BEBEZINHO (CUP CAKE)', 'basic', 'bebezinho', 'Bebezinho Cenoura com Recheio de Chocolate', 'Massa de cenoura; recheio de chocolate', 'unidade', 2.3330, 6.9990),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) BASIC', 'BEBEZINHO (CUP CAKE)', 'basic', 'bebezinho', 'Bebezinho Chocolate com Recheio de Chocolate', 'Massa de chocolate; recheio de chocolate', 'unidade', 2.3330, 6.9990),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) BASIC', 'BEBEZINHO (CUP CAKE)', 'basic', 'bebezinho', 'Bebezinho Churros Recheado', 'Massa de churros; recheio de doce de leite; canela; açúcar', 'unidade', 2.3330, 6.9990),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) BASIC', 'BEBEZINHO (CUP CAKE)', 'basic', 'bebezinho', 'Bebezinho Laranja com Recheio de Chocolate', 'Massa de laranja; recheio de chocolate', 'unidade', 2.3330, 6.9990),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) BASIC', 'BEBEZINHO (CUP CAKE)', 'basic', 'bebezinho', 'Bebezinho Limão Recheado', 'Massa de limão; recheio de creme de limão', 'unidade', 2.3330, 6.9990),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) BASIC', 'BEBEZINHO (CUP CAKE)', 'basic', 'bebezinho', 'Fuba com Goiabada', null, 'unidade', 2.3330, 6.9990),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) EXECUTIVE', 'BEBEZINHO (CUP CAKE)', 'executive', 'bebezinho', 'Leite Ninho Com Nutella', null, 'unidade', 2.5000, 7.5000),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) EXECUTIVE', 'BEBEZINHO (CUP CAKE)', 'executive', 'bebezinho', 'Maracujá', null, 'unidade', 2.5000, 7.5000),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) EXECUTIVE', 'BEBEZINHO (CUP CAKE)', 'executive', 'bebezinho', 'Nhá Benta', null, 'unidade', 2.5000, 7.5000),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) EXECUTIVE', 'BEBEZINHO (CUP CAKE)', 'executive', 'bebezinho', 'Prestigio', null, 'unidade', 2.5000, 7.5000),
  ('COFFEE BREAK', 'BEBEZINHO (CUP CAKE) EXECUTIVE', 'BEBEZINHO (CUP CAKE)', 'executive', 'bebezinho', 'Red Velvet', null, 'unidade', 2.5000, 7.5000),
  ('COFFEE BREAK', 'MINI DOCE EXTRA MASTER', 'MINI DOCE EXTRA', 'master', 'doce_confeitaria', 'Bombom de Chocolate Meio Amargo', 'Chocolate meio amargo; recheio', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'MINI DOCE EXTRA MASTER', 'MINI DOCE EXTRA', 'master', 'doce_confeitaria', 'Bombom de Chocolate ao Leite', 'Chocolate ao leite; recheio', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'MINI DOCE EXTRA MASTER', 'MINI DOCE EXTRA', 'master', 'doce_confeitaria', 'Bombom de Limão', 'Chocolate branco; recheio de limão', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'MINI DOCE EXTRA MASTER', 'MINI DOCE EXTRA', 'master', 'doce_confeitaria', 'Mini Queijadinha', 'Coco; queijo; leite condensado; ovos', 'unidade', 3.0000, 9.0000),
  ('COFFEE BREAK', 'MINI DOCE EXTRA MASTER', 'MINI DOCE EXTRA', 'master', 'doce_confeitaria', 'Mini Carolina Tradicional', 'Recheio de doce de leite', 'unidade', 2.8333, 8.5000),
  ('COFFEE BREAK', 'MINI DOCE EXTRA MASTER', 'MINI DOCE EXTRA', 'master', 'doce_confeitaria', 'Mini Carolina de Limão', 'Recheio de limão', 'unidade', 2.8333, 8.5000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Café Tradicional', 'Café torrado e moído; água', 'garrafa 1,5L (~10 pax)', 23.3330, 69.9990),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Kit de Chá em Sachê com Água Quente', 'Sachês variados; água quente', 'sachê + água (~10 pax)', 15.0000, 45.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Kit Adoçante e Açúcar', 'Adoçante e açúcar', 'kit (~10 pax)', 5.0000, 15.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Kit de Descartáveis', null, 'kit (~10 pax)', 5.0000, 15.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Leite', 'Leite integral', 'garrafa 2L (~10 pax)', 15.0000, 45.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Pão de Queijo Multigrãos', 'Polvilho; queijo; ovos; leite; óleo; mix de grãos', 'unidade', 1.0000, 3.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Pão de Queijo Tradicional', 'Polvilho; queijo; ovos; leite; óleo', 'unidade', 0.8330, 2.4990),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Salada de Frutas com Iogurte e Granola', 'Salada de frutas; iogurte; granola; aveia; Sucrilhos; mel', 'pote (40 pax)', 50.0000, 150.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Suco na Refresqueira', 'Suco natural (sabor a definir)', 'garrafa 1L (~20 pax)', 15.0000, 45.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE', 'ITEM BASE COFFEE', null, 'item_base', 'Água Minalba', null, 'unidade', 2.3000, 6.9000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE STANDARD+', 'ITEM BASE COFFEE', 'standard', 'item_base', 'Chá Gelado na Refresqueira', 'Chá gelado (sabor a definir)', 'garrafa 1L (~20 pax)', 10.0000, 30.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE MASTER', 'ITEM BASE COFFEE', 'master', 'item_base', 'Favo de mel', 'Favo de mel', 'porção 100 pax', 90.0000, 270.0000),
  ('COFFEE BREAK', 'ITEM BASE COFFEE MASTER', 'ITEM BASE COFFEE', 'master', 'item_base', 'Frutas Laminadas', 'Frutas laminadas variadas;', 'porção', 25.0000, 75.0000)
on conflict (familia, grupo, produto) do update
  set custo = excluded.custo,
      preco = excluded.preco,
      ingredientes = excluded.ingredientes,
      unidade_comercial = excluded.unidade_comercial,
      categoria = excluded.categoria,
      tier = excluded.tier,
      atualizado_em = now();

-- ---------- amarra no catálogo pelo nome (ignorando acento e caixa) ----------
update public.erp_produtos e
set catalog_item_id = c.id
from public.catalog_items c
where e.catalog_item_id is null
  and e.categoria = c.categoria
  and lower(public.unaccent_simples(c.nome)) = lower(public.unaccent_simples(e.produto));

-- ---------- markup usado na planilha, para o painel ----------
insert into public.rule_params (chave, valor, descricao, categoria) values
('erp_markup', '{"markup": 3}',
 'Markup aplicado na planilha de custos do ERP (preço = custo × markup). Base do CMV: CMV% = custo / preço.',
 'preco')
on conflict (chave) do update set valor = excluded.valor;
