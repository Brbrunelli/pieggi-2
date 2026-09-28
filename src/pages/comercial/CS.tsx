// ============================================================
// SUCESSO DO CLIENTE — nutrição e NPS por cliente
//
// A unidade desta tela é o CLIENTE, não a tarefa. A pergunta que ela
// responde é "como está a minha relação com essa empresa": quantos
// eventos já entreguei, qual a última nota que me deram, se responderam
// a pesquisa, quando falei com eles pela última vez, e o que está
// pendente de contato.
//
// Duas versões anteriores desta tela (lista de tarefas e quadro kanban)
// respondiam "o que fazer hoje" — e essa não era a pergunta.
//
// A fila de contatos continua sendo derivada de (eventos fechados ×
// templates × data do evento); `cs_envios` guarda o que foi enviado E a
// resposta do cliente (nota + texto), porque resposta sem pergunta não
// existe.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Textarea } from '@/components/ui'
import {
  classeNps,
  ETAPA_FECHADO,
  nomeCliente,
  type CsCanal,
  type CsEnvio,
  type CsTemplate,
  type PieggiEvent,
} from '@/types'
import { formatBRL, formatDiaMes } from '@/engine'

interface EventoCS extends PieggiEvent {
  clients: { id: string; nome: string; telefone: string | null; email: string | null } | null
  primeiraData: string | null
  local: string | null
  assinadoEm: string | null
}

interface Tarefa {
  template: CsTemplate
  evento: EventoCS
  quando: string
  /** > 0 já passou do dia · 0 hoje · < 0 futuro */
  atraso: number
  destinatario: string
  mensagem: string
  assunto: string | null
}

interface ClienteCS {
  chave: string
  nome: string
  eventos: EventoCS[]
  entregues: EventoCS[]
  proximo: EventoCS | null
  faturado: number
  envios: CsEnvio[]
  respostas: CsEnvio[]
  /** pesquisas pós-evento enviadas (base da taxa de resposta) */
  pesquisas: number
  ultimaNota: number | null
  mediaNota: number | null
  ultimoContato: CsEnvio | null
  pendentes: Tarefa[]
  /** pendências que já venceram ou são de hoje */
  acionaveis: Tarefa[]
}

const hojeISO = () => new Date().toISOString().slice(0, 10)

function somaDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  return Math.round(
    (new Date(ate + 'T12:00').getTime() - new Date(de + 'T12:00').getTime()) / 86400000
  )
}

function renderizar(texto: string, e: EventoCS): string {
  const mapa: Record<string, string> = {
    cliente: nomeCliente(e),
    evento: e.nome,
    contato: (e.contato ?? '').split(' ')[0] || 'tudo bem',
    data: e.primeiraData ? formatDiaMes(e.primeiraData) : 'a definir',
    pax: e.pax ? String(e.pax) : 'a confirmar',
    local: e.local ?? 'no local combinado',
  }
  return texto.replace(/\{\{(\w+)\}\}/g, (_, k) => mapa[k] ?? `{{${k}}}`)
}

function paraWhatsapp(tel: string): string {
  const d = tel.replace(/\D/g, '')
  return d ? (d.startsWith('55') ? d : `55${d}`) : ''
}

const TOM_NPS = {
  promotor: 'text-green-700',
  neutro: 'text-amber-700',
  detrator: 'text-red-700',
} as const

type Filtro = 'todos' | 'pendente' | 'detrator' | 'sem_resposta'

export default function CS() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { administrar } = usePermissoes()

  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)
  const [mostrarTemplates, setMostrarTemplates] = useState(false)

  // modais
  const [compondo, setCompondo] = useState<Tarefa | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [respondendo, setRespondendo] = useState<CsEnvio | null>(null)
  const [resposta, setResposta] = useState({ nps: '', texto: '' })
  const [anotando, setAnotando] = useState<ClienteCS | null>(null)
  const [nota, setNota] = useState({ titulo: '', canal: 'whatsapp' as CsCanal, texto: '', eventoId: '' })

  const { data: templates } = useQuery({
    queryKey: ['cs-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cs_templates')
        .select('*')
        .order('momento')
        .order('ordem')
      if (error) throw error
      return data as CsTemplate[]
    },
  })

  const { data: envios } = useQuery({
    queryKey: ['cs-envios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cs_envios')
        .select('*')
        .order('enviado_em', { ascending: false })
      if (error) throw error
      return data as CsEnvio[]
    },
  })

  const { data: eventos } = useQuery({
    queryKey: ['cs-eventos'],
    queryFn: async (): Promise<EventoCS[]> => {
      const [evRes, servRes, contratosRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, clients(id, nome, telefone, email)')
          .eq('pipeline', ETAPA_FECHADO)
          .neq('status', 'cancelado'),
        supabase.from('event_services').select('event_id, dia'),
        supabase.from('contracts').select('event_id, assinado_em').eq('status', 'assinado'),
      ])
      if (evRes.error) throw evRes.error
      const servicos = (servRes.data ?? []) as { event_id: string; dia: string }[]
      const assinados = new Map(
        ((contratosRes.data ?? []) as { event_id: string; assinado_em: string | null }[]).map(
          (c) => [c.event_id, c.assinado_em]
        )
      )
      return (
        evRes.data as (PieggiEvent & {
          clients: { id: string; nome: string; telefone: string | null; email: string | null } | null
        })[]
      ).map((e) => {
        const dias = servicos.filter((s) => s.event_id === e.id).map((s) => s.dia).sort()
        return {
          ...e,
          primeiraData: dias[0] ?? null,
          local: e.local_detalhe ?? e.endereco ?? null,
          assinadoEm: assinados.get(e.id) ?? null,
        }
      })
    },
  })

  // ------------------------------------------------------------
  // agrupa por cliente
  // ------------------------------------------------------------
  const clientes = useMemo((): ClienteCS[] => {
    if (!eventos || !templates) return []
    const hoje = hojeISO()
    const feitos = new Set(
      (envios ?? []).filter((e) => e.template_id).map((e) => `${e.event_id}|${e.template_id}`)
    )
    const porPost = new Map(templates.map((t) => [t.id, t]))

    const grupos = new Map<string, EventoCS[]>()
    for (const e of eventos) {
      // cliente avulso não tem cadastro: agrupa pelo nome, senão cada
      // evento dele viraria um "cliente" diferente
      const chave = e.clients?.id ?? `avulso:${(e.cliente_nome ?? 'sem nome').toLowerCase()}`
      if (!grupos.has(chave)) grupos.set(chave, [])
      grupos.get(chave)!.push(e)
    }

    return [...grupos].map(([chave, evs]) => {
      const idsDoCliente = new Set(evs.map((e) => e.id))
      const meusEnvios = (envios ?? []).filter((x) => idsDoCliente.has(x.event_id))
      const respostas = meusEnvios.filter((x) => x.nps != null)
      const pesquisas = meusEnvios.filter(
        (x) => x.template_id && porPost.get(x.template_id)?.momento === 'pos' && x.status === 'enviado'
      ).length

      const notas = respostas.map((r) => r.nps!).filter((n) => Number.isFinite(n))
      const entregues = evs
        .filter((e) => e.primeiraData && diasEntre(hoje, e.primeiraData) < 0)
        .sort((a, b) => (b.primeiraData ?? '').localeCompare(a.primeiraData ?? ''))
      const futuros = evs
        .filter((e) => e.primeiraData && diasEntre(hoje, e.primeiraData) >= 0)
        .sort((a, b) => (a.primeiraData ?? '').localeCompare(b.primeiraData ?? ''))

      // fila de contatos derivada
      const pendentes: Tarefa[] = []
      for (const ev of evs) {
        if (!ev.primeiraData) continue
        for (const t of templates) {
          if (!t.ativo) continue
          if (feitos.has(`${ev.id}|${t.id}`)) continue
          if (t.momento === 'pre' && t.min_antecedencia_dias > 0) {
            const base = (ev.assinadoEm ?? ev.pipeline_em ?? '').slice(0, 10)
            if (!base || diasEntre(base, ev.primeiraData) < t.min_antecedencia_dias) continue
          }
          const quando = somaDias(ev.primeiraData, t.dias)
          pendentes.push({
            template: t,
            evento: ev,
            quando,
            atraso: diasEntre(quando, hoje),
            destinatario:
              t.canal === 'whatsapp'
                ? ev.contato_telefone || ev.clients?.telefone || ''
                : ev.contato_email || ev.clients?.email || '',
            mensagem: renderizar(t.corpo, ev),
            assunto: t.assunto ? renderizar(t.assunto, ev) : null,
          })
        }
      }
      pendentes.sort((a, b) => b.atraso - a.atraso)

      return {
        chave,
        nome: nomeCliente(evs[0]),
        eventos: evs,
        entregues,
        proximo: futuros[0] ?? null,
        faturado: evs.reduce((s, e) => s + Number(e.orcamento_valor ?? 0), 0),
        envios: meusEnvios,
        respostas,
        pesquisas,
        ultimaNota: respostas[0]?.nps ?? null,
        mediaNota: notas.length ? notas.reduce((s, n) => s + n, 0) / notas.length : null,
        ultimoContato: meusEnvios[0] ?? null,
        pendentes,
        acionaveis: pendentes.filter((p) => p.atraso >= 0),
      }
    })
  }, [eventos, templates, envios])

  const lista = useMemo(() => {
    let l = clientes
    if (busca) {
      const b = busca.toLowerCase()
      l = l.filter((c) => c.nome.toLowerCase().includes(b))
    }
    if (filtro === 'pendente') l = l.filter((c) => c.acionaveis.length > 0)
    if (filtro === 'detrator')
      l = l.filter((c) => c.ultimaNota != null && classeNps(c.ultimaNota) === 'detrator')
    if (filtro === 'sem_resposta') l = l.filter((c) => c.pesquisas > 0 && !c.respostas.length)
    // quem precisa de ação primeiro; depois quem tem evento mais próximo
    return [...l].sort((a, b) => {
      if (a.acionaveis.length !== b.acionaveis.length)
        return b.acionaveis.length - a.acionaveis.length
      return (a.proximo?.primeiraData ?? '9999').localeCompare(b.proximo?.primeiraData ?? '9999')
    })
  }, [clientes, busca, filtro])

  // ---------- NPS da casa ----------
  const todasRespostas = clientes.flatMap((c) => c.respostas)
  const totalPesquisas = clientes.reduce((s, c) => s + c.pesquisas, 0)
  const nps = useMemo(() => {
    const notas = todasRespostas.map((r) => r.nps!).filter((n) => Number.isFinite(n))
    if (!notas.length) return null
    const prom = notas.filter((n) => n >= 9).length
    const det = notas.filter((n) => n <= 6).length
    return Math.round(((prom - det) / notas.length) * 100)
  }, [todasRespostas])

  // ------------------------------------------------------------
  // ações
  // ------------------------------------------------------------
  async function registrarEnvio(t: Tarefa, status: 'enviado' | 'dispensado', texto?: string) {
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase.from('cs_envios').insert({
      event_id: t.evento.id,
      template_id: t.template.id,
      canal: t.template.canal,
      status,
      destinatario: t.destinatario || null,
      mensagem: texto ?? t.mensagem,
      enviado_por: session?.user.id,
    })
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setCompondo(null)
      await qc.invalidateQueries({ queryKey: ['cs-envios'] })
    }
    setOcupado(false)
  }

  /**
   * Abre o canal já preenchido e registra. A ordem importa: registra
   * DEPOIS de abrir, para uma falha de gravação não esconder a mensagem
   * que a pessoa já mandou.
   */
  async function enviar(t: Tarefa, texto: string) {
    if (!t.destinatario) {
      setMsg(
        t.template.canal === 'whatsapp'
          ? '🛑 Sem telefone de contato neste evento. Cadastre no evento ou no cliente.'
          : '🛑 Sem e-mail de contato neste evento. Cadastre no evento ou no cliente.'
      )
      return
    }
    if (t.template.canal === 'whatsapp') {
      window.open(
        `https://wa.me/${paraWhatsapp(t.destinatario)}?text=${encodeURIComponent(texto)}`,
        '_blank'
      )
    } else {
      const assunto = encodeURIComponent(t.assunto ?? 'Pieggi Catering')
      window.location.href = `mailto:${t.destinatario}?subject=${assunto}&body=${encodeURIComponent(texto)}`
    }
    await registrarEnvio(t, 'enviado', texto)
  }

  async function salvarResposta() {
    if (!respondendo) return
    const n = resposta.nps === '' ? null : Number(resposta.nps)
    if (n != null && (n < 0 || n > 10)) {
      setMsg('🛑 A nota vai de 0 a 10.')
      return
    }
    setOcupado(true)
    const { error } = await supabase
      .from('cs_envios')
      .update({
        nps: n,
        resposta: resposta.texto || null,
        respondido_em: new Date().toISOString(),
      })
      .eq('id', respondendo.id)
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setRespondendo(null)
      setResposta({ nps: '', texto: '' })
      setMsg('✅ Resposta registrada.')
      await qc.invalidateQueries({ queryKey: ['cs-envios'] })
    }
    setOcupado(false)
  }

  /** Contato que não veio de cadência: ligação, reunião, visita. */
  async function salvarContatoAvulso() {
    if (!anotando || !nota.eventoId || !nota.titulo) {
      setMsg('🛑 Escolha o evento e dê um título ao contato.')
      return
    }
    setOcupado(true)
    const { error } = await supabase.from('cs_envios').insert({
      event_id: nota.eventoId,
      template_id: null,
      titulo: nota.titulo,
      canal: nota.canal,
      status: 'enviado',
      mensagem: nota.texto || null,
      enviado_por: session?.user.id,
    })
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setAnotando(null)
      setNota({ titulo: '', canal: 'whatsapp', texto: '', eventoId: '' })
      setMsg('✅ Contato registrado na linha do tempo.')
      await qc.invalidateQueries({ queryKey: ['cs-envios'] })
    }
    setOcupado(false)
  }

  const nomeTemplate = (id: string | null) =>
    id ? (templates?.find((t) => t.id === id)?.nome ?? 'cadência') : null

  return (
    <div className="max-w-6xl">
      <PageTitle
        lead="COMERCIAL"
        actions={
          administrar && (
            <Button variant="secondary" onClick={() => setMostrarTemplates(!mostrarTemplates)}>
              {mostrarTemplates ? 'Fechar cadência' : 'Editar cadência'}
            </Button>
          )
        }
      >
        Sucesso do cliente
      </PageTitle>

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {/* ---------- termômetro da casa ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Card>
          <div className="pg-key">NPS</div>
          <div
            className={`pg-metric mt-2 text-[30px] leading-none ${
              nps == null
                ? 'text-neutral-300'
                : nps >= 50
                  ? 'text-green-700'
                  : nps >= 0
                    ? 'text-amber-700'
                    : 'text-red-700'
            }`}
          >
            {nps == null ? '—' : nps > 0 ? `+${nps}` : nps}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {todasRespostas.length
              ? `${todasRespostas.length} resposta(s)`
              : 'nenhuma resposta ainda'}
          </div>
        </Card>
        <Card>
          <div className="pg-key">Taxa de resposta</div>
          <div className="pg-metric mt-2 text-[30px] leading-none">
            {totalPesquisas
              ? `${Math.round((todasRespostas.length / totalPesquisas) * 100)}%`
              : '—'}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {todasRespostas.length} de {totalPesquisas} pesquisa(s)
          </div>
        </Card>
        <Card>
          <div className="pg-key">Clientes a contatar</div>
          <div
            className={`pg-metric mt-2 text-[30px] leading-none ${
              clientes.some((c) => c.acionaveis.length) ? 'text-red-700' : ''
            }`}
          >
            {clientes.filter((c) => c.acionaveis.length > 0).length}
          </div>
          <div className="mt-1 text-xs text-neutral-500">contato vencido ou de hoje</div>
        </Card>
        <Card>
          <div className="pg-key">Detratores</div>
          <div className="pg-metric mt-2 text-[30px] leading-none">
            {
              clientes.filter((c) => c.ultimaNota != null && classeNps(c.ultimaNota) === 'detrator')
                .length
            }
          </div>
          <div className="mt-1 text-xs text-neutral-500">última nota 6 ou menos</div>
        </Card>
      </div>

      {mostrarTemplates && <EditorTemplates templates={templates ?? []} />}

      {/* ---------- filtros ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
          {(
            [
              ['todos', 'Todos'],
              ['pendente', 'A contatar'],
              ['sem_resposta', 'Sem resposta'],
              ['detrator', 'Detratores'],
            ] as const
          ).map(([k, rotulo]) => (
            <button
              key={k}
              onClick={() => setFiltro(k)}
              className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                filtro === k
                  ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                  : 'text-neutral-500 hover:text-[var(--pg-text)]'
              }`}
            >
              {rotulo.toUpperCase()}
            </button>
          ))}
        </div>
        <Input
          className="!w-64"
          placeholder="Buscar cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* ---------- clientes ---------- */}
      {!lista.length ? (
        <Card>
          <EmptyState>
            {clientes.length
              ? 'Nenhum cliente neste filtro.'
              : 'Nenhum cliente com evento fechado ainda. Esta tela se preenche quando o primeiro contrato é assinado.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => {
            const expandido = aberto === c.chave
            return (
              <Card key={c.chave}>
                {/* cabeçalho do cliente */}
                <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">{c.nome}</span>
                      {c.acionaveis.length > 0 && (
                        <Badge tone="red">{c.acionaveis.length} a contatar</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-neutral-500">
                      {c.eventos.length} evento(s) · {c.entregues.length} entregue(s)
                      {c.faturado > 0 && ` · ${formatBRL(c.faturado)}`}
                    </div>
                  </div>

                  <Metrica rotulo="Última nota">
                    {c.ultimaNota != null ? (
                      <span className={TOM_NPS[classeNps(c.ultimaNota)]}>{c.ultimaNota}/10</span>
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                    {c.mediaNota != null && c.respostas.length > 1 && (
                      <span className="ml-1 text-[11px] font-normal text-neutral-400">
                        média {c.mediaNota.toFixed(1)}
                      </span>
                    )}
                  </Metrica>

                  <Metrica rotulo="Pesquisa">
                    {c.pesquisas === 0 ? (
                      <span className="text-[13px] font-normal text-neutral-400">
                        não enviada
                      </span>
                    ) : c.respostas.length ? (
                      <span className="text-[13px] font-normal text-green-700">
                        respondeu {c.respostas.length}/{c.pesquisas}
                      </span>
                    ) : (
                      <span className="text-[13px] font-normal text-amber-700">
                        sem resposta ({c.pesquisas} enviada(s))
                      </span>
                    )}
                  </Metrica>

                  <Metrica rotulo="Último evento entregue">
                    {c.entregues[0]?.primeiraData ? (
                      <span className="text-[13px] font-normal">
                        {formatDiaMes(c.entregues[0].primeiraData)}
                      </span>
                    ) : (
                      <span className="text-[13px] font-normal text-neutral-400">nenhum</span>
                    )}
                  </Metrica>

                  <Metrica rotulo="Último contato">
                    {c.ultimoContato ? (
                      <span className="text-[13px] font-normal">
                        {new Date(c.ultimoContato.enviado_em).toLocaleDateString('pt-BR')}
                        <span className="text-neutral-400"> · {c.ultimoContato.canal}</span>
                      </span>
                    ) : (
                      <span className="text-[13px] font-normal text-amber-700">nunca</span>
                    )}
                  </Metrica>

                  <Metrica rotulo="Próximo evento">
                    {c.proximo?.primeiraData ? (
                      <span className="text-[13px] font-normal">
                        {formatDiaMes(c.proximo.primeiraData)}
                      </span>
                    ) : (
                      <span className="text-[13px] font-normal text-neutral-400">—</span>
                    )}
                  </Metrica>

                  <Button
                    variant="secondary"
                    onClick={() => setAberto(expandido ? null : c.chave)}
                  >
                    {expandido ? 'Fechar' : 'Ver nutrição'}
                  </Button>
                </div>

                {/* ---------- contatos pendentes ---------- */}
                {c.acionaveis.length > 0 && (
                  <div className="mt-4 space-y-1.5 rounded-lg border border-red-200 bg-red-50/50 p-3">
                    {c.acionaveis.map((t) => (
                      <div
                        key={`${t.evento.id}|${t.template.id}`}
                        className="flex flex-wrap items-center gap-2 text-sm"
                      >
                        <Badge tone={t.template.canal === 'whatsapp' ? 'green' : 'blue'}>
                          {t.template.canal === 'whatsapp' ? '☎' : '✉'}
                        </Badge>
                        <span className="font-medium">{t.template.nome}</span>
                        <span className="text-neutral-500">{t.evento.nome}</span>
                        <span className="text-xs text-red-700">
                          {t.atraso > 0 ? `${t.atraso}d atrás` : 'hoje'}
                        </span>
                        {!t.destinatario && (
                          <span className="text-xs text-amber-700">
                            ⚠️ sem {t.template.canal === 'whatsapp' ? 'telefone' : 'e-mail'}
                          </span>
                        )}
                        <Button
                          variant="secondary"
                          className="ml-auto !px-3 !py-1.5"
                          onClick={() => {
                            setCompondo(t)
                            setRascunho(t.mensagem)
                          }}
                        >
                          Contatar
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* ---------- nutrição: a linha do tempo ---------- */}
                {expandido && (
                  <div className="mt-5 border-t border-[var(--pg-border)] pt-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="pg-key">Linha do tempo do relacionamento</span>
                      <Button
                        variant="secondary"
                        className="!px-3 !py-1.5"
                        onClick={() => {
                          setAnotando(c)
                          setNota({
                            titulo: '',
                            canal: 'whatsapp',
                            texto: '',
                            eventoId: c.proximo?.id ?? c.eventos[0]?.id ?? '',
                          })
                        }}
                      >
                        + Registrar contato
                      </Button>
                    </div>

                    {!c.envios.length ? (
                      <p className="text-sm text-neutral-400">
                        Nenhum contato registrado com este cliente ainda.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {c.envios.map((e) => {
                          const ev = c.eventos.find((x) => x.id === e.event_id)
                          return (
                            <li key={e.id} className="flex gap-3 text-sm">
                              <span className="pg-key !normal-case w-20 shrink-0 pt-0.5">
                                {new Date(e.enviado_em).toLocaleDateString('pt-BR')}
                              </span>
                              <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge tone={e.status === 'enviado' ? 'neutral' : 'neutral'}>
                                    {e.canal}
                                  </Badge>
                                  <span className="font-medium">
                                    {e.titulo ?? nomeTemplate(e.template_id)}
                                  </span>
                                  {e.status === 'dispensado' && (
                                    <span className="text-xs text-neutral-400">(dispensado)</span>
                                  )}
                                  {ev && <span className="text-xs text-neutral-500">{ev.nome}</span>}
                                  {e.nps == null && e.status === 'enviado' && (
                                    <button
                                      className="ml-auto text-xs text-neutral-400 underline decoration-dotted hover:text-green-700"
                                      onClick={() => {
                                        setRespondendo(e)
                                        setResposta({ nps: '', texto: '' })
                                      }}
                                    >
                                      registrar resposta
                                    </button>
                                  )}
                                </div>

                                {e.nps != null && (
                                  <div className="mt-1 rounded-lg bg-[var(--pg-bg)] px-3 py-2">
                                    <span
                                      className={`text-sm font-bold ${TOM_NPS[classeNps(e.nps)]}`}
                                    >
                                      Nota {e.nps}/10
                                    </span>
                                    <span className="ml-2 text-xs text-neutral-400">
                                      {classeNps(e.nps)}
                                      {e.respondido_em &&
                                        ` · respondeu em ${new Date(e.respondido_em).toLocaleDateString('pt-BR')}`}
                                    </span>
                                    {e.resposta && (
                                      <p className="mt-1 text-sm italic">“{e.resposta}”</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}

                    {/* eventos do cliente */}
                    <div className="mt-4">
                      <span className="pg-key mb-1.5 block">Eventos</span>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        {c.eventos
                          .slice()
                          .sort((a, b) => (b.primeiraData ?? '').localeCompare(a.primeiraData ?? ''))
                          .map((ev) => (
                            <Link
                              key={ev.id}
                              to={`/eventos/${ev.id}`}
                              className="hover:underline"
                            >
                              {ev.primeiraData ? formatDiaMes(ev.primeiraData) : 'sem data'} ·{' '}
                              <span className="text-neutral-500">{ev.nome}</span>
                            </Link>
                          ))}
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ---------- modal: enviar ---------- */}
      {compondo && (
        <Modal onFechar={() => setCompondo(null)}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <Badge tone={compondo.template.canal === 'whatsapp' ? 'green' : 'blue'}>
              {compondo.template.canal === 'whatsapp' ? 'WhatsApp' : 'E-mail'}
            </Badge>
            <span className="text-sm font-semibold">{nomeCliente(compondo.evento)}</span>
            <span className="text-sm text-neutral-500">{compondo.evento.nome}</span>
          </div>
          <p className="pg-key !normal-case mb-4">
            {compondo.template.nome} · para{' '}
            {compondo.destinatario || <span className="text-red-700">sem contato</span>}
          </p>
          {compondo.assunto && (
            <div className="mb-3">
              <span className="pg-key mb-1.5 block">Assunto</span>
              <p className="text-sm">{compondo.assunto}</p>
            </div>
          )}
          <Textarea
            rows={compondo.template.canal === 'email' ? 12 : 6}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
          />
          <p className="mt-1 text-xs text-neutral-400">Vai como está aqui.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => enviar(compondo, rascunho)} disabled={ocupado}>
              {compondo.template.canal === 'whatsapp'
                ? 'Abrir WhatsApp e registrar'
                : 'Abrir e-mail e registrar'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => registrarEnvio(compondo, 'enviado', rascunho)}
              disabled={ocupado}
            >
              Já enviei por fora
            </Button>
            <Button
              variant="ghost"
              onClick={() => registrarEnvio(compondo, 'dispensado')}
              disabled={ocupado}
            >
              Dispensar
            </Button>
          </div>
        </Modal>
      )}

      {/* ---------- modal: registrar resposta ---------- */}
      {respondendo && (
        <Modal onFechar={() => setRespondendo(null)}>
          <p className="mb-4 text-sm font-semibold">Resposta do cliente</p>
          <div className="mb-3">
            <span className="pg-key mb-2 block">
              Nota de recomendação (0 a 10) — 9–10 promotor · 7–8 neutro · 0–6 detrator
            </span>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 11 }, (_, n) => (
                <button
                  key={n}
                  onClick={() => setResposta({ ...resposta, nps: String(n) })}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-colors ${
                    resposta.nps === String(n)
                      ? 'border-[var(--pg-text)] bg-[var(--pg-text)] text-[var(--pg-bg)]'
                      : 'border-[var(--pg-border)] hover:border-[var(--pg-text)]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            label="O que ele disse"
            rows={4}
            value={resposta.texto}
            onChange={(e) => setResposta({ ...resposta, texto: e.target.value })}
          />
          <div className="mt-4 flex gap-2">
            <Button onClick={salvarResposta} disabled={ocupado}>
              Salvar resposta
            </Button>
            <Button variant="ghost" onClick={() => setRespondendo(null)}>
              Cancelar
            </Button>
          </div>
        </Modal>
      )}

      {/* ---------- modal: contato avulso ---------- */}
      {anotando && (
        <Modal onFechar={() => setAnotando(null)}>
          <p className="mb-1 text-sm font-semibold">Registrar contato — {anotando.nome}</p>
          <p className="mb-4 text-xs text-neutral-500">
            Ligação, reunião, visita: entra na linha do tempo junto com a cadência, para o
            histórico contar a conversa real e não só o que o sistema mandou.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label="O que foi"
              placeholder="Ligação sobre o cardápio"
              value={nota.titulo}
              onChange={(e) => setNota({ ...nota, titulo: e.target.value })}
            />
            <Select
              label="Canal"
              value={nota.canal}
              onChange={(e) => setNota({ ...nota, canal: e.target.value as CsCanal })}
            >
              <option value="whatsapp">WhatsApp / telefone</option>
              <option value="email">E-mail</option>
            </Select>
            <div className="md:col-span-2">
              <Select
                label="Evento"
                value={nota.eventoId}
                onChange={(e) => setNota({ ...nota, eventoId: e.target.value })}
              >
                <option value="">— escolha —</option>
                {anotando.eventos.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.primeiraData ? formatDiaMes(ev.primeiraData) : 'sem data'} · {ev.nome}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Textarea
                label="Anotação"
                rows={4}
                value={nota.texto}
                onChange={(e) => setNota({ ...nota, texto: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={salvarContatoAvulso} disabled={ocupado}>
              Registrar
            </Button>
            <Button variant="ghost" onClick={() => setAnotando(null)}>
              Cancelar
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ------------------------------------------------------------

function Metrica({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[110px]">
      <div className="pg-key">{rotulo}</div>
      <div className="mt-1 text-[15px] font-semibold leading-none">{children}</div>
    </div>
  )
}

function Modal({
  children,
  onFechar,
}: {
  children: React.ReactNode
  onFechar: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onFechar}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Editor da cadência (admin)
// ------------------------------------------------------------
function EditorTemplates({ templates }: { templates: CsTemplate[] }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<CsTemplate | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function salvar() {
    if (!editando) return
    const { error } = await supabase
      .from('cs_templates')
      .update({
        nome: editando.nome,
        canal: editando.canal,
        momento: editando.momento,
        dias: Number(editando.dias),
        min_antecedencia_dias: Number(editando.min_antecedencia_dias),
        assunto: editando.assunto,
        corpo: editando.corpo,
        ativo: editando.ativo,
      })
      .eq('id', editando.id)
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setEditando(null)
      setMsg('✅ Cadência salva.')
      await qc.invalidateQueries({ queryKey: ['cs-templates'] })
    }
  }

  return (
    <Card title="Cadência — mensagens e prazos" className="mb-6">
      {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}
      <p className="mb-3 text-xs text-neutral-500">
        Campos na mensagem:{' '}
        <code>{'{{cliente}} {{evento}} {{contato}} {{data}} {{pax}} {{local}}'}</code>.{' '}
        <b>Dias</b> é relativo ao 1º dia do evento (negativo = antes). <b>Folga</b> só vale na
        cadência pré: 30 = só mandar se o contrato foi assinado 30+ dias antes do evento.
      </p>

      <div className="divide-y divide-[var(--pg-border)]">
        {templates.map((t) => (
          <div key={t.id} className="py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={t.momento === 'pre' ? 'blue' : 'green'}>
                {t.momento === 'pre' ? 'PRÉ' : 'PÓS'}
              </Badge>
              <span className="font-medium">{t.nome}</span>
              <span className="text-neutral-500">
                {t.canal} · D{t.dias >= 0 ? '+' : ''}
                {t.dias}
                {t.min_antecedencia_dias > 0 ? ` · folga ${t.min_antecedencia_dias}d` : ''}
              </span>
              {!t.ativo && <Badge tone="neutral">inativa</Badge>}
              <Button
                variant="ghost"
                className="!px-2 !py-1 text-xs"
                onClick={() => setEditando(editando?.id === t.id ? null : t)}
              >
                {editando?.id === t.id ? 'fechar' : 'editar'}
              </Button>
            </div>

            {editando?.id === t.id && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <Input
                    label="Nome"
                    value={editando.nome}
                    onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                  />
                  <Select
                    label="Canal"
                    value={editando.canal}
                    onChange={(e) =>
                      setEditando({ ...editando, canal: e.target.value as CsTemplate['canal'] })
                    }
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="email">E-mail</option>
                  </Select>
                  <Input
                    label="Dias (rel. ao evento)"
                    type="number"
                    value={String(editando.dias)}
                    onChange={(e) => setEditando({ ...editando, dias: Number(e.target.value) })}
                  />
                  <Input
                    label="Folga mínima (pré)"
                    type="number"
                    value={String(editando.min_antecedencia_dias)}
                    onChange={(e) =>
                      setEditando({ ...editando, min_antecedencia_dias: Number(e.target.value) })
                    }
                  />
                </div>
                {editando.canal === 'email' && (
                  <Input
                    label="Assunto"
                    value={editando.assunto ?? ''}
                    onChange={(e) => setEditando({ ...editando, assunto: e.target.value })}
                  />
                )}
                <Textarea
                  label="Mensagem"
                  rows={8}
                  value={editando.corpo}
                  onChange={(e) => setEditando({ ...editando, corpo: e.target.value })}
                />
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={editando.ativo}
                    onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })}
                  />
                  Cadência ativa
                </label>
                <Button onClick={salvar}>Salvar</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
