// ============================================================
// EDGE FUNCTION: agenda
// Publica os serviços de um evento aprovado na agenda do Google,
// com cor por tipo de cliente (tangerina = Externos · azul = StartSe).
// Idempotente: re-executar atualiza os eventos já criados.
//
// Ações:  { event_id, acao: "sincronizar" | "remover" }
//
// Deploy:  supabase functions deploy agenda
// Secret:  supabase secrets set GOOGLE_SERVICE_ACCOUNT='<json da conta de serviço>'
// Depois:  compartilhe a agenda do Google com o client_email da conta
//          de serviço, com permissão "Fazer alterações nos eventos".
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ------------------------------------------------------------
// Autenticação: conta de serviço → JWT assinado → access token
// ------------------------------------------------------------
function pemParaArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const bin = atob(b64)
  const buf = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
  return buf.buffer
}

function base64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * `subject` ativa a delegação de domínio: a conta de serviço passa a agir
 * como esse usuário. É o que permite CONVIDAR pessoas — sem isso o Google
 * responde 403 "Service accounts cannot invite attendees".
 */
async function obterAccessToken(
  sa: { client_email: string; private_key: string },
  subject?: string
): Promise<string> {
  const agora = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      ...(subject ? { sub: subject } : {}),
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
      exp: agora + 3600,
      iat: agora,
    })
  )
  const conteudo = `${header}.${claim}`

  const chave = await crypto.subtle.importKey(
    'pkcs8',
    pemParaArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const assinatura = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, new TextEncoder().encode(conteudo))
  )
  const jwt = `${conteudo}.${base64url(assinatura)}`

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const json = await resp.json()
  if (!resp.ok) throw new Error(`Google OAuth: ${json.error_description ?? json.error ?? resp.status}`)
  return json.access_token as string
}

// ------------------------------------------------------------
// Rótulos (mesmos do app)
// ------------------------------------------------------------
const TIPO_LABEL: Record<string, string> = {
  welcome_coffee: 'Welcome Coffee',
  coffee_break: 'Coffee Break',
  auditorio: 'Auditório',
  brunch: 'Brunch',
  coquetel: 'Coquetel / HH',
  bar: 'Bar',
  almoco: 'Almoço',
  jantar: 'Jantar',
  coquetel_pizza: 'Coquetel de Pizza',
  kit: 'Kit',
}
const LINHA_LABEL: Record<string, string> = {
  basic: 'Basic',
  standard: 'Standard',
  executive: 'Executive',
  master: 'Master',
  premium: 'Premium',
  pizza: 'Pizza',
  cortesia: 'Cortesia',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT')
    if (!raw) {
      return Response.json(
        {
          erro:
            'GOOGLE_SERVICE_ACCOUNT não configurada. Rode: supabase secrets set GOOGLE_SERVICE_ACCOUNT=\'<json>\' (ver supabase/README.md).',
        },
        { status: 500, headers: CORS }
      )
    }
    const sa = JSON.parse(raw)

    const { event_id, acao = 'sincronizar' } = await req.json()
    if (!event_id) return Response.json({ erro: 'Informe o event_id.' }, { status: 400, headers: CORS })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ---------- dados ----------
    const [evRes, servRes, calRes, paramsRes] = await Promise.all([
      supabase.from('events').select('*, clients(nome, tipo)').eq('id', event_id).single(),
      supabase.from('event_services').select('*').eq('event_id', event_id).order('dia'),
      supabase.from('calendar_events').select('*').eq('event_id', event_id),
      supabase
        .from('rule_params')
        .select('chave, valor')
        .in('chave', ['agenda_cores', 'agenda_config', 'agenda_convidados']),
    ])

    if (evRes.error || !evRes.data) throw new Error('Evento não encontrado.')
    const evento = evRes.data as Record<string, unknown> & {
      clients: { nome: string; tipo: string } | null
    }
    const servicos = servRes.data ?? []
    const jaCriados = calRes.data ?? []

    const params = Object.fromEntries((paramsRes.data ?? []).map((p) => [p.chave, p.valor]))
    const cores = (params.agenda_cores ?? {}) as Record<string, string>
    const cfg = (params.agenda_config ?? {}) as {
      calendar_id?: string
      timezone?: string
      lembrete_minutos?: number
      prefixo_titulo?: string
      enviar_convite_ao_criar?: string
      enviar_convite_ao_atualizar?: string
    }
    const convidados = (params.agenda_convidados ?? []) as string[]

    const calendarId = cfg.calendar_id || 'primary'
    const timezone = cfg.timezone || 'America/Sao_Paulo'
    // delegação de domínio (opcional) — necessária para convidar pessoas
    const subject = Deno.env.get('GOOGLE_IMPERSONATE_SUBJECT') || undefined
    const token = await obterAccessToken(sa, subject)
    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`

    /** true enquanto o Google aceitar convidados nesta execução. */
    let podeConvidar = convidados.length > 0
    let avisoConvidados: string | null = null

    // ---------- remover ----------
    if (acao === 'remover') {
      for (const c of jaCriados) {
        await fetch(`${base}/${c.google_event_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      await supabase.from('calendar_events').delete().eq('event_id', event_id)
      return Response.json({ ok: true, removidos: jaCriados.length }, { headers: CORS })
    }

    // ---------- sincronizar ----------
    const tipoCliente = evento.clients?.tipo ?? 'sem_cliente'
    const colorId = cores[tipoCliente] ?? cores.externo ?? '6'
    const nomeCliente = evento.clients?.nome ?? (evento.cliente_nome as string) ?? 'Cliente'
    const prefixo = cfg.prefixo_titulo || 'PIEGGI'
    const resultados: { servico: string; status: string; link?: string }[] = []

    for (const s of servicos) {
      if (!s.dia) continue
      const inicio = s.hora_inicio ? `${s.dia}T${String(s.hora_inicio).slice(0, 8)}` : null
      const fim = s.hora_fim ? `${s.dia}T${String(s.hora_fim).slice(0, 8)}` : null
      const pax = s.pax ?? evento.pax ?? '?'

      const titulo = `${prefixo} · ${TIPO_LABEL[s.service_type] ?? s.service_type}${
        s.service_line ? ` ${LINHA_LABEL[s.service_line] ?? s.service_line}` : ''
      } — ${nomeCliente} (${pax} pax)`

      const descricao = [
        `Evento: ${evento.nome}`,
        `Cliente: ${nomeCliente}`,
        evento.contato ? `Contato: ${evento.contato}` : null,
        `PAX: ${pax}`,
        Number(s.reposicao_pct) > 0 ? `Reposição: +${Number(s.reposicao_pct)}%` : null,
        s.obs ? `Obs: ${s.obs}` : null,
        '',
        `Sistema Pieggi · evento ${event_id}`,
      ]
        .filter(Boolean)
        .join('\n')

      const corpo: Record<string, unknown> = {
        summary: titulo,
        description: descricao,
        location: [evento.endereco, evento.local_detalhe].filter(Boolean).join(' — ') || undefined,
        colorId,
        // sem horário → evento de dia inteiro
        start: inicio ? { dateTime: inicio, timeZone: timezone } : { date: s.dia },
        end: fim
          ? { dateTime: fim, timeZone: timezone }
          : inicio
            ? { dateTime: inicio, timeZone: timezone }
            : { date: s.dia },
        reminders: {
          useDefault: false,
          overrides: [{ method: 'popup', minutes: cfg.lembrete_minutos ?? 120 }],
        },
      }

      const existente = jaCriados.find((c) => c.event_service_id === s.id)
      const metodo = existente ? 'PATCH' : 'POST'
      // convite por e-mail só na criação (evita spam a cada ressincronização)
      const sendUpdates = existente
        ? cfg.enviar_convite_ao_atualizar || 'none'
        : cfg.enviar_convite_ao_criar || 'all'
      const url = `${existente ? `${base}/${existente.google_event_id}` : base}?sendUpdates=${sendUpdates}`

      async function publicar(comConvidados: boolean) {
        const payload = comConvidados
          ? { ...corpo, attendees: convidados.map((email) => ({ email })) }
          : corpo
        const r = await fetch(url, {
          method: metodo,
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        return { ok: r.ok, status: r.status, json: await r.json() }
      }

      let resp = await publicar(podeConvidar)

      // conta de serviço sem delegação de domínio não pode convidar —
      // republica sem convidados para não travar a agenda inteira
      if (!resp.ok && podeConvidar && /attendee|delegation/i.test(resp.json?.error?.message ?? '')) {
        podeConvidar = false
        avisoConvidados =
          'Convidados NÃO adicionados: a conta de serviço precisa de delegação de domínio. ' +
          'Configure GOOGLE_IMPERSONATE_SUBJECT (ver supabase/README.md). Os compromissos foram criados sem convidados.'
        resp = await publicar(false)
      }

      const json = resp.json
      if (!resp.ok) {
        resultados.push({
          servico: titulo,
          status: `erro: ${json.error?.message ?? resp.status}`,
        })
        continue
      }

      const registro = {
        event_id,
        event_service_id: s.id,
        google_event_id: json.id,
        calendar_id: calendarId,
        html_link: json.htmlLink,
        color_id: colorId,
        titulo,
        inicio: inicio ? new Date(`${inicio}-03:00`).toISOString() : null,
        fim: fim ? new Date(`${fim}-03:00`).toISOString() : null,
        sincronizado_em: new Date().toISOString(),
      }
      if (existente) {
        await supabase.from('calendar_events').update(registro).eq('id', existente.id)
      } else {
        await supabase.from('calendar_events').insert(registro)
      }

      resultados.push({
        servico: titulo,
        status: existente ? 'atualizado' : 'criado',
        link: json.htmlLink,
      })
    }

    // serviços removidos do evento → apagar da agenda
    const idsAtuais = new Set(servicos.map((s) => s.id))
    for (const c of jaCriados) {
      if (c.event_service_id && !idsAtuais.has(c.event_service_id)) {
        await fetch(`${base}/${c.google_event_id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
        await supabase.from('calendar_events').delete().eq('id', c.id)
      }
    }

    return Response.json(
      {
        ok: true,
        cor: colorId,
        convidados: podeConvidar ? convidados : [],
        aviso: avisoConvidados,
        resultados,
      },
      { headers: CORS }
    )
  } catch (e) {
    console.error(e)
    return Response.json(
      { erro: e instanceof Error ? e.message : 'Erro ao sincronizar a agenda.' },
      { status: 500, headers: CORS }
    )
  }
})
