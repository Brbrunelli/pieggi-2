// ============================================================
// EDGE FUNCTION: alerta-travados
// Roda agendada (ex.: a cada hora). Detecta eventos TRAVADOS com a
// mesma régua do Dashboard CEO e dispara:
//   • E-mail (Resend)  — secret RESEND_API_KEY
//   • WhatsApp (Twilio, opcional) — secrets TWILIO_ACCOUNT_SID,
//     TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM (ex.: whatsapp:+14155238886)
// Dedupe: cada alerta de cada evento sai 1× por dia por destino
// (índice único em notification_log).
//
// Deploy:  supabase functions deploy alerta-travados --no-verify-jwt
// Teste:   invocar com body {"teste": true} (ignora dedupe)
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2'

// Régua de prazo (mesma do Dashboard): fase concluída até N dias antes
const PRAZO_FASE = [
  { idx: 0, dias: 7, nome: 'Proposta aprovada' },
  { idx: 1, dias: 4, nome: 'Programação aprovada' },
  { idx: 2, dias: 2, nome: 'Comandas geradas' },
  { idx: 3, dias: 1, nome: 'Plaquinhas geradas' },
]

function faseIdx(status: string): number {
  switch (status) {
    case 'rascunho':
    case 'proposta_em_montagem':
      return 0
    case 'proposta_aprovada':
    case 'programacao_em_montagem':
      return 1
    case 'programacao_aprovada':
      return 2
    case 'comandas_geradas':
      return 3
    case 'plaquinhas_geradas':
      return 4
    default:
      return 5
  }
}

interface Alerta {
  eventId: string
  evento: string
  cliente: string
  data: string | null
  diasAte: number | null
  texto: string
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let teste = false
  try {
    const body = await req.json()
    teste = Boolean(body?.teste)
  } catch {
    /* sem body */
  }

  // ---------- coleta ----------
  const [evRes, servRes, pedRes, destRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, nome, status, endereco_confirmado, orcamento_valor, clients(nome)')
      .not('status', 'in', '("concluido","cancelado")'),
    supabase.from('event_services').select('event_id, dia'),
    supabase
      .from('special_requests')
      .select('event_id, fases, verificacoes')
      .eq('resolvido', false),
    supabase.from('notification_settings').select('*').eq('ativo', true),
  ])

  const eventos = evRes.data ?? []
  const servicos = (servRes.data ?? []) as { event_id: string; dia: string }[]
  const pedidos = (pedRes.data ?? []) as {
    event_id: string
    fases: string[]
    verificacoes: Record<string, unknown>
  }[]
  const destinos = destRes.data ?? []

  if (!destinos.length) {
    return Response.json({ ok: true, msg: 'Nenhum destinatário ativo configurado.' })
  }

  const hoje = new Date().toISOString().slice(0, 10)

  // ---------- detecção de travados ----------
  const alertas: Alerta[] = []
  for (const e of eventos) {
    const dias = servicos
      .filter((s) => s.event_id === e.id)
      .map((s) => s.dia)
      .sort()
    const primeira = dias[0] ?? null
    const diasAte = primeira
      ? Math.round((new Date(primeira).getTime() - new Date(hoje).getTime()) / 86400000)
      : null
    const idx = faseIdx(e.status)
    const cliente =
      (e.clients as { nome?: string } | { nome?: string }[] | null as { nome?: string } | null)
        ?.nome ?? ''

    // evento já passou → ignora
    if (diasAte != null && diasAte < 0) continue

    if (diasAte != null) {
      for (const p of PRAZO_FASE) {
        if (idx <= p.idx && diasAte <= p.dias) {
          alertas.push({
            eventId: e.id,
            evento: e.nome,
            cliente,
            data: primeira,
            diasAte,
            texto: `TRAVADO: faltam ${diasAte} dia(s) e "${p.nome}" ainda não aconteceu`,
          })
          break
        }
      }
    }

    const pend = pedidos
      .filter((p) => p.event_id === e.id)
      .reduce((a, p) => a + p.fases.filter((f) => !(f in p.verificacoes)).length, 0)
    if (pend > 0 && diasAte != null && diasAte <= 7) {
      alertas.push({
        eventId: e.id,
        evento: e.nome,
        cliente,
        data: primeira,
        diasAte,
        texto: `${pend} verificação(ões) de pedido especial pendente(s)`,
      })
    }
  }

  if (!alertas.length) {
    return Response.json({ ok: true, msg: 'Nenhum evento travado. 🎉' })
  }

  // ---------- dedupe (1× por dia por destino) ----------
  const { data: logHoje } = await supabase
    .from('notification_log')
    .select('event_id, alerta, destino')
    .gte('enviado_em', `${hoje}T00:00:00Z`)
  const jaEnviado = new Set(
    (logHoje ?? []).map((l) => `${l.event_id}|${l.alerta}|${l.destino}`)
  )

  const resultados: Record<string, unknown>[] = []

  for (const destino of destinos) {
    const novos = teste
      ? alertas
      : alertas.filter((a) => !jaEnviado.has(`${a.eventId}|${a.texto}|${destino.destino}`))
    if (!novos.length) {
      resultados.push({ destino: destino.destino, enviados: 0, msg: 'já notificado hoje' })
      continue
    }

    const linhas = novos
      .map(
        (a) =>
          `• ${a.evento}${a.cliente ? ` (${a.cliente})` : ''}${
            a.data ? ` — ${a.data.split('-').reverse().slice(0, 2).join('/')}` : ''
          }: ${a.texto}`
      )
      .join('\n')

    let enviado = false

    // ---------- e-mail (Resend) ----------
    if (destino.canal === 'email') {
      const key = Deno.env.get('RESEND_API_KEY')
      if (!key) {
        resultados.push({ destino: destino.destino, erro: 'RESEND_API_KEY não configurada' })
        continue
      }
      const html =
        `<h2>🔴 Sistema Pieggi — ${novos.length} alerta(s) de evento travado</h2>` +
        '<ul>' +
        novos
          .map(
            (a) =>
              `<li><b>${a.evento}</b>${a.cliente ? ` (${a.cliente})` : ''}${
                a.data ? ` — ${a.data.split('-').reverse().slice(0, 2).join('/')}` : ''
              }<br/>${a.texto}</li>`
          )
          .join('') +
        '</ul><p>Abra o painel gerencial para resolver.</p>'
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: Deno.env.get('ALERTA_EMAIL_FROM') ?? 'Sistema Pieggi <onboarding@resend.dev>',
          to: [destino.destino],
          subject: `🔴 Pieggi: ${novos.length} evento(s) travado(s)`,
          html,
        }),
      })
      enviado = r.ok
      resultados.push({ destino: destino.destino, canal: 'email', status: r.status })
    }

    // ---------- WhatsApp (Twilio — opcional) ----------
    if (destino.canal === 'whatsapp') {
      const sid = Deno.env.get('TWILIO_ACCOUNT_SID')
      const token = Deno.env.get('TWILIO_AUTH_TOKEN')
      const from = Deno.env.get('TWILIO_WHATSAPP_FROM')
      if (!sid || !token || !from) {
        resultados.push({ destino: destino.destino, erro: 'Secrets do Twilio não configuradas' })
        continue
      }
      const corpo = `🔴 Pieggi — ${novos.length} evento(s) travado(s):\n${linhas}`
      const r = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + btoa(`${sid}:${token}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            From: from,
            To: `whatsapp:${destino.destino}`,
            Body: corpo.slice(0, 1500),
          }),
        }
      )
      enviado = r.ok
      resultados.push({ destino: destino.destino, canal: 'whatsapp', status: r.status })
    }

    // ---------- log (dedupe) ----------
    if (enviado && !teste) {
      await supabase.from('notification_log').insert(
        novos.map((a) => ({
          event_id: a.eventId,
          alerta: a.texto,
          canal: destino.canal,
          destino: destino.destino,
        }))
      )
    }
  }

  return Response.json({ ok: true, alertas: alertas.length, resultados })
})
