-- ============================================================
-- SISTEMA PIEGGI — Migration 0019: quem enxerga dinheiro
--
--   ADMIN     → tudo
--   COMERCIAL → vê todos os valores (preço, custo, proposta, CMV);
--               NÃO edita programação, comanda nem plaquinha
--   COZINHA   → producao/compras: não vê nada de valor
--
-- Fecha o SELECT das tabelas que existem para guardar dinheiro:
-- price_tables, price_items (preço/pax), erp_produtos (custo) e
-- proposals (preco_total + o jsonb `dados` com o orçamento inteiro).
-- ============================================================

create or replace function public.pode_ver_valores()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'comercial');
$$;

-- ------------------------------------------------------------
-- Tabelas de dinheiro: leitura só para admin e comercial.
-- A escrita continua como estava (0001 já restringe a admin nos
-- dados mestres; proposals ficou com admin na 0018).
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['price_tables', 'price_items', 'proposals']
  loop
    execute format('drop policy if exists "%1$s_select" on public.%1$s', t);
    execute format(
      'create policy "%1$s_select" on public.%1$s for select to authenticated
         using (public.pode_ver_valores())', t);
  end loop;
end $$;

drop policy if exists erp_leitura on public.erp_produtos;
create policy erp_leitura on public.erp_produtos
  for select to authenticated using (public.pode_ver_valores());

-- ------------------------------------------------------------
-- LIMITE CONHECIDO
--
-- `events.orcamento_valor` e `special_requests.impacto_valor` são COLUNAS
-- de tabelas que a cozinha precisa ler inteiras (o evento, o pedido
-- especial). RLS filtra linha, não coluna — e no PostgREST todo mundo
-- entra com o mesmo papel de banco, então GRANT por coluna também não
-- separa admin de cozinha. Nessas duas a trava é de tela (verValores em
-- src/lib/permissoes.ts): some do app, mas quem souber chamar a API com
-- a anon key ainda leria o número.
--
-- Fechar isso de verdade exige mover a leitura de eventos para uma view
-- sem as colunas de dinheiro (ou uma RPC), trocando as telas junto. Fica
-- registrado aqui para não passar por seguro o que ainda não é.
-- ------------------------------------------------------------
