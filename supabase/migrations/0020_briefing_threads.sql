-- ============================================================
-- SISTEMA PIEGGI — Migration 0020: histórico de conversas do Briefing
--
-- A conversa com o agente de proposta é o registro de COMO cada número
-- foi decidido — qual tabela, por que aquele sabor, o que o cliente pediu
-- e mudou no meio. Antes ela morria no F5; agora fica guardada, dá para
-- retomar dias depois e continua ligada ao evento que gerou.
--
-- Uma linha = uma conversa (thread). As mensagens ficam num jsonb só,
-- porque elas sempre são lidas e regravadas juntas — a conversa inteira
-- é o que vai para o modelo a cada turno.
-- ============================================================

create table if not exists public.briefing_threads (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null default 'Nova conversa',
  -- preenchido quando a conversa vira evento; on delete set null para o
  -- histórico sobreviver ao evento apagado (é ele que explica o porquê)
  event_id   uuid references public.events (id) on delete set null,
  /** [{ role: 'user' | 'assistant', content: text }] na ordem da conversa */
  mensagens  jsonb not null default '[]'::jsonb,
  /** último fechamento do agente (mesmo shape do structured output) */
  proposta   jsonb,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- a lista abre ordenada pela conversa mexida mais recentemente
create index if not exists briefing_threads_updated_idx
  on public.briefing_threads (updated_at desc);
create index if not exists briefing_threads_event_idx
  on public.briefing_threads (event_id);

drop trigger if exists on_briefing_thread_update on public.briefing_threads;
create trigger on_briefing_thread_update
  before update on public.briefing_threads
  for each row execute function public.touch_updated_at();

alter table public.briefing_threads enable row level security;

-- ------------------------------------------------------------
-- A conversa carrega preço, desconto e CMV — mesmo critério da 0019:
-- só quem pode ver valores (admin e comercial) enxerga.
-- ------------------------------------------------------------
create policy "briefing_threads_select" on public.briefing_threads
  for select to authenticated using (public.pode_ver_valores());

create policy "briefing_threads_insert" on public.briefing_threads
  for insert to authenticated with check (public.pode_ver_valores());

create policy "briefing_threads_update" on public.briefing_threads
  for update to authenticated
  using (public.pode_ver_valores()) with check (public.pode_ver_valores());

-- apagar conversa é decisão de admin: é registro de negociação
create policy "briefing_threads_delete" on public.briefing_threads
  for delete to authenticated using (public.is_admin());
