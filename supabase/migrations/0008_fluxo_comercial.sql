-- ============================================================
-- SISTEMA PIEGGI — Migration 0008: fluxo comercial + agenda
--  • Proposta fica PENDENTE até o cliente responder
--  • Editável enquanto não fechar (montagem ou enviada)
--  • Cliente aprovou → sobe na agenda do Google (cor por cliente)
--     tangerina = Externos · azul (pavão) = StartSe
-- ============================================================

-- ---------- novos status da esteira ----------
-- (ALTER TYPE ... ADD VALUE não pode ser USADO na mesma transação —
--  por isso esta migration só declara os valores; o app passa a usá-los depois.)
alter type public.event_status add value if not exists 'proposta_enviada' after 'proposta_em_montagem';
alter type public.event_status add value if not exists 'proposta_recusada' after 'proposta_enviada';

-- ---------- proposta: ciclo comercial ----------
alter table public.proposals
  add column if not exists status_cliente text not null default 'rascunho',
  add column if not exists enviada_em     timestamptz,
  add column if not exists respondida_em  timestamptz,
  add column if not exists validade       date,
  add column if not exists motivo_recusa  text;

comment on column public.proposals.status_cliente is
  'rascunho (editando) | enviada (pendente do cliente) | aprovada | recusada';
comment on column public.proposals.validade is
  'Validade da proposta enviada ao cliente.';

-- ---------- agenda (Google Calendar) ----------
create table if not exists public.calendar_events (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events (id) on delete cascade,
  event_service_id  uuid references public.event_services (id) on delete cascade,
  google_event_id   text not null,
  calendar_id       text not null default 'primary',
  html_link         text,
  color_id          text,
  titulo            text,
  inicio            timestamptz,
  fim               timestamptz,
  sincronizado_em   timestamptz not null default now(),
  unique (event_service_id)
);

create index if not exists idx_calendar_events_event on public.calendar_events (event_id);

alter table public.calendar_events enable row level security;

create policy "calendar_events_select" on public.calendar_events
  for select to authenticated using (true);
create policy "calendar_events_insert" on public.calendar_events
  for insert to authenticated with check (true);
create policy "calendar_events_update" on public.calendar_events
  for update to authenticated using (true) with check (true);
create policy "calendar_events_delete" on public.calendar_events
  for delete to authenticated using (true);

-- ---------- cor da agenda por tipo de cliente ----------
-- IDs de cor do Google Calendar:
-- 1 Lavanda · 2 Sálvia · 3 Uva · 4 Flamingo · 5 Banana · 6 Tangerina
-- 7 Pavão (azul) · 8 Grafite · 9 Mirtilo (azul escuro) · 10 Manjericão · 11 Tomate
insert into public.rule_params (chave, valor, descricao, categoria) values
('agenda_cores',
 '{"startse": "7", "inteli": "7", "wtc": "7", "externo": "6", "sem_cliente": "6", "_labels": {"6": "Tangerina", "7": "Pavão (azul)", "9": "Mirtilo (azul escuro)", "11": "Tomate", "5": "Banana", "10": "Manjericão"}}',
 'Cor do evento na agenda do Google por tipo de cliente. Tangerina (6) = Externos · Pavão/azul (7) = StartSe, Inteli e WTC.',
 'agenda'),

('agenda_config',
 '{"calendar_id": "primary", "timezone": "America/Sao_Paulo", "minutos_antes": 0, "lembrete_minutos": 120, "prefixo_titulo": "PIEGGI"}',
 'Configuração da agenda: qual calendário recebe os eventos, fuso e lembrete.',
 'agenda'),

('proposta_validade_dias',
 '7',
 'Validade padrão (dias) da proposta enviada ao cliente.',
 'preco')

on conflict (chave) do nothing;
