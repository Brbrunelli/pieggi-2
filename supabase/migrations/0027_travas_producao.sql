-- ============================================================
-- SISTEMA PIEGGI — Migration 0027: travas antes de abrir para o time
--
-- A 0001 liberou insert/update/delete das tabelas operacionais para
-- QUALQUER usuário autenticado, porque na época só o Bruno usava. Antes
-- de entregar login para a cozinha, isso precisa fechar: hoje um usuário
-- de produção consegue APAGAR qualquer evento chamando a API direto — o
-- botão está escondido na tela, e esconder botão não protege dado.
--
-- O que muda:
--   events           → apagar é só ADMIN (evento apagado leva serviços,
--                      programação, produção e contrato com ele)
--   event_services   → mexer é do comercial e do admin
--   service_items    → idem (é o cardápio da proposta)
--   special_requests → idem (é registro de combinado com o cliente)
--
-- Ninguém perde LEITURA: a cozinha continua vendo tudo que precisa.
-- ============================================================

-- ------------------------------------------------------------
-- events: cozinha e financeiro não criam nem apagam evento.
-- O UPDATE segue no comercial + admin porque é ele que move o funil, e a
-- esteira (status) é mexida pelo admin.
-- ------------------------------------------------------------
drop policy if exists "events_insert" on public.events;
drop policy if exists "events_update" on public.events;
drop policy if exists "events_delete" on public.events;

create policy "events_insert" on public.events
  for insert to authenticated with check (public.pode_comercial());
create policy "events_update" on public.events
  for update to authenticated
  using (public.pode_comercial()) with check (public.pode_comercial());
create policy "events_delete" on public.events
  for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------
-- event_services / service_items / special_requests
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['event_services', 'service_items', 'special_requests']
  loop
    execute format('drop policy if exists "%1$s_insert" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$s', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$s', t);

    execute format(
      'create policy "%1$s_insert" on public.%1$s for insert to authenticated
         with check (public.pode_comercial())', t);
    execute format(
      'create policy "%1$s_update" on public.%1$s for update to authenticated
         using (public.pode_comercial()) with check (public.pode_comercial())', t);
    execute format(
      'create policy "%1$s_delete" on public.%1$s for delete to authenticated
         using (public.pode_comercial())', t);
  end loop;
end $$;

-- ------------------------------------------------------------
-- LEMBRETE do que continua aberto de propósito
--
-- documents  — quem gera um .docx/PDF registra o arquivo. Fechar aqui
--              quebraria a geração feita pelo admin sem ganhar nada: o
--              bucket 'documentos' já exige usuário autenticado.
-- station_progress — a cozinha PRECISA escrever: é a baixa dela. Já está
--              restrita a admin + equipe na 0018, com pronto_por = auth.uid().
-- ------------------------------------------------------------

-- Conferência: liste as políticas de escrita que sobraram abertas.
-- O resultado esperado é VAZIO fora de documents/approvals/pipeline_log.
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and cmd in ('INSERT', 'UPDATE', 'DELETE')
  and (qual = 'true' or with_check = 'true')
order by tablename, policyname;
