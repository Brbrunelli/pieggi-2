-- ============================================================
-- SISTEMA PIEGGI — Migration 0009: convidados da agenda
-- Quem recebe o compromisso quando a proposta é aprovada.
-- Editável em Admin → Parâmetros de regra → agenda_convidados.
-- ============================================================

insert into public.rule_params (chave, valor, descricao, categoria) values
('agenda_convidados',
 '["pieggieventos@gmail.com", "administrativo@pieggi.com.br", "adrianaoliveira120383@gmail.com", "atendimento@pieggi.com.br", "bruno@pieggi.com.br", "luiz@pieggi.com.br"]',
 'E-mails convidados em todo compromisso publicado na agenda. Exige delegação de domínio na conta de serviço (GOOGLE_IMPERSONATE_SUBJECT) — sem ela o Google recusa convidados e o evento é criado sem eles.',
 'agenda')
on conflict (chave) do nothing;

-- convite por e-mail: "all" ao criar, "none" ao atualizar (evita spam a cada ressincronização)
update public.rule_params
set valor = valor || '{"enviar_convite_ao_criar": "all", "enviar_convite_ao_atualizar": "none"}'::jsonb
where chave = 'agenda_config';
