-- ============================================================
-- SISTEMA PIEGGI — Migration 0006: Notificações de eventos travados
-- Destinatários (e-mail/WhatsApp) + log de envios (dedupe diário).
-- O envio é feito pela Edge Function `alerta-travados` (agendada).
-- ============================================================

create table public.notification_settings (
  id         uuid primary key default gen_random_uuid(),
  canal      text not null default 'email',   -- 'email' | 'whatsapp'
  destino    text not null,                   -- e-mail ou telefone +55...
  ativo      boolean not null default true,
  created_at timestamptz not null default now(),
  unique (canal, destino)
);

create table public.notification_log (
  id         bigint generated always as identity primary key,
  event_id   uuid references public.events (id) on delete cascade,
  alerta     text not null,   -- texto do alerta enviado
  canal      text not null,
  destino    text not null,
  enviado_em timestamptz not null default now()
);

-- dedupe: o mesmo alerta do mesmo evento não repete no mesmo dia p/ o mesmo destino
-- (timezone() com fuso fixo é IMMUTABLE — date(timestamptz) direto não é)
create unique index idx_notification_dedupe
  on public.notification_log (
    event_id, alerta, destino,
    (date(timezone('America/Sao_Paulo', enviado_em)))
  );

alter table public.notification_settings enable row level security;
alter table public.notification_log enable row level security;

create policy "notif_settings_select" on public.notification_settings
  for select to authenticated using (true);
create policy "notif_settings_admin" on public.notification_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "notif_log_select" on public.notification_log
  for select to authenticated using (true);
-- inserts do log são feitos pela Edge Function com service role (ignora RLS)
