-- ============================================================
-- SISTEMA PIEGGI — Migration 0026: resposta e NPS do cliente
--
-- Até aqui o CS só sabia o que a casa MANDOU. Faltava a metade que
-- importa: o cliente respondeu? deu quantos? o que disse?
--
-- A resposta fica na própria linha do envio (`cs_envios`), não numa
-- tabela nova, porque resposta sem pergunta não existe — é sempre "a
-- resposta daquele contato". Assim a linha do tempo do cliente sai em
-- ordem sem juntar duas tabelas.
-- ============================================================

alter table public.cs_envios
  add column if not exists respondido_em timestamptz,
  /** 0 a 10 — a pergunta de recomendação. null = não respondeu (ou não perguntou) */
  add column if not exists nps int check (nps is null or (nps >= 0 and nps <= 10)),
  add column if not exists resposta text;

comment on column public.cs_envios.nps is
  'Nota 0–10 de recomendação. Promotor 9–10 · neutro 7–8 · detrator 0–6.';

create index if not exists cs_envios_nps_idx
  on public.cs_envios (nps) where nps is not null;

-- Registrar resposta é editar o envio: precisa de UPDATE, que a 0023
-- não tinha dado (lá o envio era só histórico imutável).
drop policy if exists "cs_envios_update" on public.cs_envios;
create policy "cs_envios_update" on public.cs_envios
  for update to authenticated
  using (public.pode_comercial()) with check (public.pode_comercial());

-- ------------------------------------------------------------
-- Contato avulso: "liguei para o cliente" não vem de template nenhum.
-- Sem isso a linha do tempo mentiria por omissão — mostraria só o que o
-- sistema mandou, e não a conversa real.
-- ------------------------------------------------------------
alter table public.cs_envios
  alter column template_id drop not null;

alter table public.cs_envios
  add column if not exists titulo text;

comment on column public.cs_envios.titulo is
  'Rótulo do contato quando não vem de template (ligação, reunião, visita). Para contato de cadência, o nome sai do template.';

-- A restrição de unicidade impedia dois contatos avulsos no mesmo
-- evento (ambos com template_id nulo). Passa a valer só para cadência.
alter table public.cs_envios drop constraint if exists cs_envios_event_id_template_id_key;
create unique index if not exists cs_envios_cadencia_unica
  on public.cs_envios (event_id, template_id)
  where template_id is not null;
