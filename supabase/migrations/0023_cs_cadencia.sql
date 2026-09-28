-- ============================================================
-- SISTEMA PIEGGI — Migration 0023: cadência de CS
--
-- Duas cadências, dentro do comercial:
--   PRÉ  — cliente que fechou com antecedência não pode ficar no silêncio
--          até a véspera. Só entra na fila quem assinou com folga
--          (`min_antecedencia_dias`), senão vira spam em cima do evento.
--   PÓS  — perguntar como foi a experiência, por WhatsApp e e-mail.
--
-- DESENHO: a fila NÃO é uma tabela. Ela é derivada de
-- (eventos aprovados × templates ativos × data do evento) e o banco só
-- guarda o que JÁ foi enviado ou dispensado (`cs_envios`). Fila
-- materializada envelheceria sozinha: evento que muda de data deixaria
-- tarefa órfã apontando para o dia errado.
-- ============================================================

-- ---------- 1. quem cuida do CS ----------
create or replace function public.pode_comercial()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.papel() in ('admin', 'comercial');
$$;

-- ---------- 2. templates da cadência ----------
create table if not exists public.cs_templates (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null,
  canal     text not null check (canal in ('whatsapp', 'email')),
  momento   text not null check (momento in ('pre', 'pos')),
  /** dias em relação ao 1º dia do evento: negativo = antes, positivo = depois */
  dias      int not null,
  /**
   * Só para a cadência PRÉ: quantos dias de folga entre a assinatura e o
   * evento para valer a pena aquecer o cliente. 0 = sempre.
   */
  min_antecedencia_dias int not null default 0,
  assunto   text,
  /** aceita {{cliente}} {{evento}} {{contato}} {{data}} {{pax}} {{local}} */
  corpo     text not null,
  ativo     boolean not null default true,
  ordem     int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists cs_templates_ativo_idx on public.cs_templates (ativo, momento, dias);

-- ---------- 3. log do que foi enviado ----------
-- A presença da linha é o "já tratei". Sem update: quem enviou e quando
-- é histórico de relacionamento, não campo editável.
create table if not exists public.cs_envios (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events (id) on delete cascade,
  template_id  uuid not null references public.cs_templates (id) on delete cascade,
  canal        text not null check (canal in ('whatsapp', 'email')),
  status       text not null default 'enviado' check (status in ('enviado', 'dispensado')),
  destinatario text,
  /** a mensagem como foi realmente enviada, já com os dados trocados */
  mensagem     text,
  enviado_em   timestamptz not null default now(),
  enviado_por  uuid references public.profiles (id),
  unique (event_id, template_id)
);

create index if not exists cs_envios_event_idx on public.cs_envios (event_id);

-- ---------- 4. contato do cliente (a cadência precisa para onde mandar) ----------
alter table public.clients
  add column if not exists telefone text,
  add column if not exists email    text;

alter table public.events
  add column if not exists contato_telefone text,
  add column if not exists contato_email    text;

comment on column public.events.contato_telefone is
  'Telefone de quem contratou este evento. Tem prioridade sobre o do cadastro do cliente: é a pessoa do evento que responde a pesquisa, não a empresa.';

-- ---------- 5. RLS ----------
alter table public.cs_templates enable row level security;
alter table public.cs_envios    enable row level security;

-- drop antes de criar: a migration precisa poder rodar de novo sem erro
drop policy if exists "cs_templates_select" on public.cs_templates;
drop policy if exists "cs_templates_write"  on public.cs_templates;
drop policy if exists "cs_envios_select"    on public.cs_envios;
drop policy if exists "cs_envios_insert"    on public.cs_envios;
drop policy if exists "cs_envios_delete"    on public.cs_envios;

create policy "cs_templates_select" on public.cs_templates
  for select to authenticated using (public.pode_comercial());
create policy "cs_templates_write" on public.cs_templates
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "cs_envios_select" on public.cs_envios
  for select to authenticated using (public.pode_comercial());
create policy "cs_envios_insert" on public.cs_envios
  for insert to authenticated
  with check (public.pode_comercial() and enviado_por = auth.uid());
create policy "cs_envios_delete" on public.cs_envios
  for delete to authenticated using (public.pode_comercial());

-- ---------- 6. cadência inicial ----------
-- Ponto de partida editável em Administração → Cadência de CS.
insert into public.cs_templates (nome, canal, momento, dias, min_antecedencia_dias, assunto, corpo, ordem)
values
  (
    'Pré · confirmação com folga', 'whatsapp', 'pre', -15, 30, null,
    'Oi {{contato}}, tudo bem? Aqui é da Pieggi. Passando para dizer que o {{evento}} do dia {{data}} já está na nossa agenda e caminhando bem. Qualquer ajuste de cardápio ou número de pessoas, temos tempo de sobra para acomodar — só me avisar.',
    1
  ),
  (
    'Pré · alinhamento final', 'email', 'pre', -5, 0,
    'Seu evento na Pieggi está chegando — {{evento}}',
    'Olá {{contato}},' || chr(10) || chr(10) ||
    'O {{evento}} acontece em {{data}}, para {{pax}} pessoas, em {{local}}.' || chr(10) || chr(10) ||
    'Nesta semana fechamos a produção. Se houver qualquer mudança de número de pessoas, restrição alimentar ou horário, este é o melhor momento para nos contar.' || chr(10) || chr(10) ||
    'Qualquer coisa, estamos à disposição.' || chr(10) ||
    'Equipe Pieggi Catering, Coffee & Eventos',
    2
  ),
  (
    'Pós · como foi', 'whatsapp', 'pos', 1, 0, null,
    'Oi {{contato}}! Como foi o {{evento}} ontem? Queria muito saber a sua impressão e a do time — o que funcionou bem e o que a gente pode fazer melhor na próxima. Sua resposta vai direto para a nossa cozinha.',
    3
  ),
  (
    'Pós · pesquisa de experiência', 'email', 'pos', 3,  0,
    'Como foi a sua experiência com a Pieggi?',
    'Olá {{contato}},' || chr(10) || chr(10) ||
    'Obrigado por confiar na Pieggi para o {{evento}}, no dia {{data}}.' || chr(10) || chr(10) ||
    'Em uma escala de 0 a 10, o quanto você recomendaria a Pieggi para outra área da {{cliente}}?' || chr(10) || chr(10) ||
    'E, se puder, conte em uma linha o que mais e o que menos agradou. Lemos todas as respostas.' || chr(10) || chr(10) ||
    'Equipe Pieggi Catering, Coffee & Eventos',
    4
  )
on conflict do nothing;
