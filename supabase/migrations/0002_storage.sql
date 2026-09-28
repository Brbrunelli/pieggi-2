-- ============================================================
-- SISTEMA PIEGGI — Migration 0002: Storage
-- Buckets: documentos (privado) e assets (público)
-- ============================================================

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- documentos: qualquer usuário autenticado lê/escreve
create policy "documentos_select" on storage.objects
  for select to authenticated using (bucket_id = 'documentos');
create policy "documentos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'documentos');
create policy "documentos_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos') with check (bucket_id = 'documentos');
create policy "documentos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'documentos');

-- assets (logos, selos, QR, template): leitura pública; escrita só admin
create policy "assets_public_select" on storage.objects
  for select using (bucket_id = 'assets');
create policy "assets_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'assets' and public.is_admin());
create policy "assets_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'assets' and public.is_admin())
  with check (bucket_id = 'assets' and public.is_admin());
create policy "assets_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'assets' and public.is_admin());
