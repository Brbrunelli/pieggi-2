// ============================================================
// 💬 BRIEFING — o agente de proposta da casa, em conversa
//
// Tudo num lugar só: à esquerda o histórico de conversas, à direita a
// conversa aberta e a proposta que ela fechou. O agente conhece o
// cardápio oficial, as 4 tabelas de preço e as regras versionadas do
// banco — pergunta o que falta, sugere sabores, calcula reposição e
// preço. Quando você aprova, "Gerar proposta" fecha e "Criar evento"
// grava evento, serviços, cardápio, restrições e pedidos de uma vez.
//
// A conversa é salva a cada turno (briefing_threads), então dá para
// fechar a aba e retomar dias depois — e ela fica ligada ao evento que
// gerou, que é o registro de POR QUE cada número é aquele.
//
// A chave da API fica na Edge Function `briefing`, nunca no front.
// ============================================================

import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Input, PageTitle, Select, Textarea } from '@/components/ui'
import {
  SERVICE_LINE_LABEL,
  SERVICE_TYPE_LABEL,
  type BriefingMensagem,
  type BriefingThread,
  type CatalogItem,
  type Client,
  type DayPeriod,
  type PipelineStage,
  type PriceTable,
  type ServiceLine,
  type ServiceType,
} from '@/types'
import { calcReposicao, duracaoMin, formatBRL } from '@/engine'

interface ItemProposto {
  catalog_item_id: string
  descricao_livre: string
  quantidade: number
  unidade: string
}

interface ServicoProposto {
  service_type: ServiceType
  service_line: ServiceLine | ''
  dia: string
  periodo: DayPeriod | ''
  hora_inicio: string
  hora_fim: string
  pax: number
  reposicao_pct: number
  preco_pax: number
  total: number
  itens: ItemProposto[]
  obs: string
}

interface Proposta {
  cliente_cadastrado: string
  cliente_nome: string
  evento: string
  contato: string
  pax: number
  endereco: string
  local_detalhe: string
  preco_a_definir: boolean
  tabela_sugerida: string
  incluir_institucional: boolean
  servicos: ServicoProposto[]
  opcoes: { nome: string; linha: ServiceLine }[]
  formato_orcamento: 'simples' | 'opcoes' | 'comparativo'
  orcamento_total: number
  observacoes: string[]
  restricoes: { tipo: string; pax: number; critico: boolean }[]
  pedidos_especiais: { descricao: string; destino: string; impacto_valor: number }[]
  pendencias: string[]
  avisos_de_regra: string[]
  resumo: string
}

const EXEMPLO = `Preciso de proposta pra Fundação Otorrinolaringologia, evento Work Lanche do curso FORL, dia 12/08, 30 pessoas, contato Derek Pascuinelli. Coffee break de manhã. Cliente novo.`

/** Título da conversa = começo do que o comercial escreveu primeiro. */
function tituloDe(mensagens: BriefingMensagem[]): string {
  const primeira = mensagens.find((m) => m.role === 'user')?.content.trim() ?? ''
  const limpo = primeira.replace(/\s+/g, ' ')
  return limpo.length > 70 ? `${limpo.slice(0, 70)}…` : limpo || 'Nova conversa'
}

function quando(iso: string): string {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** O agente escreve em markdown leve — só o negrito vale a pena renderizar. */
function Balao({ m }: { m: BriefingMensagem }) {
  const eu = m.role === 'user'
  return (
    <div className={`flex ${eu ? 'justify-end' : 'justify-start'}`}>
      <div
        className={
          'max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ' +
          (eu
            ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
            : 'border border-[var(--pg-border)] bg-[var(--pg-surface)]')
        }
      >
        {m.content.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
          p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p
        )}
      </div>
    </div>
  )
}

export default function Briefing() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const { session } = useAuth()

  const [threadId, setThreadId] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<BriefingMensagem[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [fechando, setFechando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [proposta, setProposta] = useState<Proposta | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)

  // Evento que nasce do briefing entra FRIO no funil: houve pedido, não
  // houve proposta enviada ainda. Quem esquenta é o comercial.
  const etapa: PipelineStage = 'frio'

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens.length, pensando])

  const { data: threads } = useQuery({
    queryKey: ['briefing-threads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('briefing_threads')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as BriefingThread[]
    },
  })

  const { data: clientes } = useQuery({
    queryKey: ['clientes-ativos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').eq('ativo', true)
      if (error) throw error
      return data as Client[]
    },
  })

  const { data: tabelas } = useQuery({
    queryKey: ['price-tables'],
    queryFn: async () => {
      const { data, error } = await supabase.from('price_tables').select('*').eq('vigente', true)
      if (error) throw error
      return data as PriceTable[]
    },
  })

  // só para mostrar o nome do sabor escolhido na revisão
  const { data: catalogo } = useQuery({
    queryKey: ['catalogo-nomes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('id, nome, categoria')
      if (error) throw error
      return data as Pick<CatalogItem, 'id' | 'nome' | 'categoria'>[]
    },
  })

  function erroDeChamada(e: unknown): string {
    const m = e instanceof Error ? e.message : 'Erro ao falar com o agente'
    // 404 na função aparece assim — é a pegadinha mais comum
    if (m.includes('Failed to send a request')) {
      return `🛑 ${m} — a Edge Function "briefing" não respondeu. Ela já foi publicada? (ver supabase/README.md)`
    }
    return `🛑 ${m}`
  }

  /**
   * Grava a conversa. Devolve o id da thread (cria na primeira vez).
   * Falha em salvar NÃO derruba a conversa na tela — o agente já respondeu,
   * e perder a resposta por causa do histórico seria o pior dos mundos.
   */
  async function salvar(
    msgs: BriefingMensagem[],
    extras: { proposta?: Proposta | null; event_id?: string } = {}
  ): Promise<string | null> {
    const payload = {
      titulo: tituloDe(msgs),
      mensagens: msgs,
      ...(extras.proposta !== undefined ? { proposta: extras.proposta } : {}),
      ...(extras.event_id ? { event_id: extras.event_id } : {}),
    }
    try {
      if (threadId) {
        const { error } = await supabase.from('briefing_threads').update(payload).eq('id', threadId)
        if (error) throw error
        await qc.invalidateQueries({ queryKey: ['briefing-threads'] })
        return threadId
      }
      const { data, error } = await supabase
        .from('briefing_threads')
        .insert({ ...payload, created_by: session?.user.id })
        .select('id')
        .single()
      if (error) throw error
      setThreadId(data.id)
      await qc.invalidateQueries({ queryKey: ['briefing-threads'] })
      return data.id
    } catch (e) {
      setMsg(
        `⚠️ A conversa continua na tela, mas não consegui salvá-la no histórico: ${
          e instanceof Error ? e.message : 'erro'
        }`
      )
      return threadId
    }
  }

  function abrir(t: BriefingThread) {
    setThreadId(t.id)
    setMensagens(t.mensagens ?? [])
    setProposta((t.proposta as Proposta | null) ?? null)
    setTexto('')
    setMsg(null)
  }

  function nova() {
    setThreadId(null)
    setMensagens([])
    setProposta(null)
    setTexto('')
    setMsg(null)
  }

  async function enviar() {
    const conteudo = texto.trim()
    if (!conteudo || pensando) return
    setMsg(null)
    setTexto('')
    const historico: BriefingMensagem[] = [...mensagens, { role: 'user', content: conteudo }]
    setMensagens(historico)
    setPensando(true)
    try {
      const { data, error } = await supabase.functions.invoke('briefing', {
        body: {
          acao: 'conversar',
          mensagens: historico,
          hoje: new Date().toISOString().slice(0, 10),
        },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      const completo: BriefingMensagem[] = [
        ...historico,
        { role: 'assistant', content: data.resposta as string },
      ]
      setMensagens(completo)
      await salvar(completo)
    } catch (e) {
      setMsg(erroDeChamada(e))
      // devolve o texto para o campo — a mensagem não foi processada
      setTexto(conteudo)
      setMensagens(mensagens)
    } finally {
      setPensando(false)
    }
  }

  async function gerarProposta() {
    if (!mensagens.length) return
    setMsg(null)
    setFechando(true)
    try {
      const { data, error } = await supabase.functions.invoke('briefing', {
        body: {
          acao: 'finalizar',
          mensagens,
          hoje: new Date().toISOString().slice(0, 10),
        },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      const fechada = data.dados as Proposta
      setProposta(fechada)
      await salvar(mensagens, { proposta: fechada })
    } catch (e) {
      setMsg(erroDeChamada(e))
    } finally {
      setFechando(false)
    }
  }

  async function criarEvento() {
    if (!proposta) return
    setCriando(true)
    setMsg(null)
    try {
      const cliente = clientes?.find(
        (c) => c.nome.toLowerCase() === proposta.cliente_cadastrado.toLowerCase()
      )
      const tabela = tabelas?.find((t) => t.kind === proposta.tabela_sugerida)

      const { data: evento, error } = await supabase
        .from('events')
        .insert({
          nome: proposta.evento || 'Evento sem nome',
          contato: proposta.contato || null,
          client_id: cliente?.id ?? null,
          cliente_nome: cliente ? null : proposta.cliente_nome || null,
          price_table_id: tabela?.id ?? null,
          pax: proposta.pax || null,
          endereco: proposta.endereco || cliente?.endereco || null,
          endereco_confirmado: Boolean(cliente?.endereco_fixo),
          local_detalhe: proposta.local_detalhe || null,
          preco_a_definir: proposta.preco_a_definir,
          orcamento_valor: proposta.orcamento_total > 0 ? proposta.orcamento_total : null,
          pipeline: etapa,
          restricoes: proposta.restricoes ?? [],
          obs: proposta.resumo || null,
          created_by: session?.user.id,
        })
        .select('id')
        .single()
      if (error) throw error

      // ---- serviços (a reposição do engine manda: é ela que a esteira usa) ----
      const comDia = (proposta.servicos ?? []).filter((s) => s.dia)
      if (comDia.length) {
        const { data: criados, error: eServ } = await supabase
          .from('event_services')
          .insert(
            comDia.map((s) => {
              const repo =
                s.hora_inicio && s.hora_fim
                  ? calcReposicao(s.service_type, duracaoMin(s.hora_inicio, s.hora_fim))
                  : null
              return {
                event_id: evento.id,
                service_type: s.service_type,
                service_line: s.service_line || null,
                dia: s.dia,
                periodo: s.periodo || null,
                hora_inicio: s.hora_inicio || null,
                hora_fim: s.hora_fim || null,
                reposicao_pct: repo?.status === 'ok' ? repo.pct : s.reposicao_pct || 0,
                pax: s.pax || null,
                obs: s.obs || null,
              }
            })
          )
          .select('id')
        if (eServ) throw eServ

        // ---- cardápio escolhido de cada serviço ----
        // O insert devolve as linhas na ordem em que foram enviadas, então o
        // índice casa serviço ↔ id recém-criado.
        const itens = (criados ?? []).flatMap((linha, i) =>
          (comDia[i].itens ?? [])
            .filter((it) => it.catalog_item_id || it.descricao_livre)
            .map((it, ordem) => ({
              event_service_id: linha.id,
              catalog_item_id: it.catalog_item_id || null,
              descricao_livre: it.catalog_item_id ? null : it.descricao_livre || null,
              quantidade: it.quantidade || null,
              unidade: it.unidade || 'un',
              ordem,
            }))
        )
        if (itens.length) {
          const r = await supabase.from('service_items').insert(itens)
          if (r.error) throw r.error
        }
      }

      // ---- pedidos especiais e pendências (travam a aprovação das fases) ----
      const pedidos = [
        ...(proposta.pedidos_especiais ?? []).map((p) => ({
          event_id: evento.id,
          descricao: p.descricao,
          destino: p.destino,
          impacto_valor: p.impacto_valor || null,
          created_by: session?.user.id,
        })),
        ...(proposta.pendencias ?? []).map((p) => ({
          event_id: evento.id,
          descricao: `PENDÊNCIA: ${p}`,
          destino: 'comercial',
          impacto_valor: null,
          created_by: session?.user.id,
        })),
      ]
      if (pedidos.length) await supabase.from('special_requests').insert(pedidos)

      // ---- proposta: guarda o combinado E a conversa que gerou ----
      await supabase.from('proposals').insert({
        event_id: evento.id,
        versao: 1,
        preco_total: proposta.orcamento_total > 0 ? proposta.orcamento_total : null,
        dados: {
          opcoes: (proposta.opcoes ?? []).map((o, i) => ({
            id: `op-briefing-${i}`,
            nome: o.nome,
            linha: o.linha,
            precos: {},
            cardapios: {},
          })),
          formato: proposta.formato_orcamento ?? 'simples',
          observacoes: proposta.observacoes ?? [],
          avisos_de_regra: proposta.avisos_de_regra ?? [],
          conversa: mensagens,
        },
      })

      // liga a conversa ao evento que ela gerou
      await salvar(mensagens, { proposta, event_id: evento.id })

      nav(`/eventos/${evento.id}`)
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao criar o evento'}`)
    } finally {
      setCriando(false)
    }
  }

  const nomeDoItem = (it: ItemProposto) =>
    it.catalog_item_id
      ? (catalogo?.find((c) => c.id === it.catalog_item_id)?.nome ?? it.catalog_item_id)
      : it.descricao_livre

  const clienteEncontrado = clientes?.find(
    (c) => c.nome.toLowerCase() === proposta?.cliente_cadastrado.toLowerCase()
  )
  const threadAberta = threads?.find((t) => t.id === threadId)

  return (
    <div className="max-w-[1200px]">
      <PageTitle
        actions={
          <Button variant="secondary" onClick={nova} disabled={pensando}>
            + Nova conversa
          </Button>
        }
      >
        💬 Briefing
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        {/* ---------------- histórico ---------------- */}
        <aside>
          <div className="pg-key mb-2">Conversas</div>
          {!threads?.length ? (
            <p className="text-xs text-neutral-400">
              Nenhuma ainda. A primeira mensagem já cria o histórico.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {threads.map((t) => (
                <button
                  key={t.id}
                  onClick={() => abrir(t)}
                  className={
                    'rounded-lg border px-3 py-2 text-left text-xs transition-all duration-300 ' +
                    (t.id === threadId
                      ? 'border-[var(--pg-text)] bg-[var(--pg-surface)]'
                      : 'border-transparent hover:border-[var(--pg-border)]')
                  }
                >
                  <div className="line-clamp-2 leading-snug">{t.titulo}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-[10px] text-neutral-400">
                    <span>{quando(t.updated_at)}</span>
                    <span>·</span>
                    <span>{t.mensagens?.length ?? 0} msg</span>
                    {t.event_id && <Badge tone="green">evento</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </aside>

        {/* ---------------- conversa + proposta ---------------- */}
        <div>
          <p className="mb-4 text-sm text-neutral-500">
            Converse com o agente como você conversaria com o comercial. Ele conhece o cardápio
            oficial, as tabelas de preço e as regras — pergunta o que falta, sugere sabores e
            calcula. Quando estiver de acordo, clique em <b>Gerar proposta</b>.
          </p>

          {threadAberta?.event_id && (
            <div className="mb-4 rounded-lg border border-[var(--pg-border)] bg-[var(--pg-surface)] px-4 py-3 text-sm">
              Esta conversa já virou evento.{' '}
              <Link to={`/eventos/${threadAberta.event_id}`} className="font-semibold underline">
                Abrir o evento
              </Link>
            </div>
          )}

          <Card className="mb-4">
            <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
              {!mensagens.length && (
                <div className="rounded-lg border border-dashed border-[var(--pg-border)] p-8 text-center text-sm text-neutral-500">
                  Comece contando o pedido do cliente como ele chegou — WhatsApp, e-mail,
                  transcrição.
                  <button
                    className="mt-3 block w-full text-left text-xs italic text-neutral-400 underline decoration-dotted"
                    onClick={() => setTexto(EXEMPLO)}
                  >
                    usar um exemplo: “{EXEMPLO.slice(0, 70)}…”
                  </button>
                </div>
              )}
              {mensagens.map((m, i) => (
                <Balao key={i} m={m} />
              ))}
              {pensando && (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-[var(--pg-border)] px-4 py-3 text-sm text-neutral-400">
                    calculando…
                  </div>
                </div>
              )}
              <div ref={fim} />
            </div>

            <div className="mt-4 border-t border-[var(--pg-border)] pt-4">
              <Textarea
                rows={3}
                className="!text-base"
                placeholder="Escreva aqui… (Enter envia, Shift+Enter quebra linha)"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar()
                  }
                }}
              />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button onClick={enviar} disabled={pensando || texto.trim().length < 2}>
                  {pensando ? 'Calculando…' : 'Enviar'}
                </Button>
                {mensagens.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={gerarProposta}
                    disabled={fechando || pensando}
                  >
                    {fechando ? 'Fechando a proposta…' : '📋 Gerar proposta'}
                  </Button>
                )}
              </div>
              {msg && (
                <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{msg}</p>
              )}
            </div>
          </Card>

          {/* ---------------- proposta fechada ---------------- */}
          {proposta && (
            <div className="space-y-6">
              <div className="pg-headline">
                <b>PROPOSTA</b>
                <i>Confira antes de criar</i>
              </div>

              {proposta.resumo && (
                <div className="rounded-xl border border-[var(--pg-border)] bg-[var(--pg-surface)] p-4 text-sm">
                  {proposta.resumo}
                </div>
              )}

              {proposta.pendencias?.length > 0 && (
                <Card title="❓ Perguntar ao cliente (trava o cálculo)">
                  <ul className="space-y-1 text-sm">
                    {proposta.pendencias.map((p, i) => (
                      <li key={i} className="text-amber-800">• {p}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-neutral-500">
                    Cada pendência vira um pedido de verificação no evento e bloqueia a aprovação
                    das fases até ser resolvida.
                  </p>
                </Card>
              )}

              {proposta.avisos_de_regra?.length > 0 && (
                <Card title="⚠️ Avisos de regra">
                  <ul className="space-y-1 text-sm">
                    {proposta.avisos_de_regra.map((a, i) => (
                      <li key={i} className="text-red-700">• {a}</li>
                    ))}
                  </ul>
                </Card>
              )}

              <Card title="Dados do evento (confira e ajuste)">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Input
                    label="Evento"
                    value={proposta.evento}
                    onChange={(e) => setProposta({ ...proposta, evento: e.target.value })}
                  />
                  <Input
                    label="Contato"
                    value={proposta.contato}
                    onChange={(e) => setProposta({ ...proposta, contato: e.target.value })}
                  />
                  <div>
                    <span className="pg-key mb-1.5 block">Cliente</span>
                    {clienteEncontrado ? (
                      <div className="flex items-center gap-2 py-2">
                        <Badge tone="green">cadastrado</Badge>
                        <span className="font-medium">{clienteEncontrado.nome}</span>
                      </div>
                    ) : (
                      <Input
                        value={proposta.cliente_nome}
                        placeholder="Nome do cliente novo"
                        onChange={(e) => setProposta({ ...proposta, cliente_nome: e.target.value })}
                      />
                    )}
                  </div>
                  <Input
                    label="PAX"
                    type="number"
                    value={proposta.pax || ''}
                    onChange={(e) => setProposta({ ...proposta, pax: Number(e.target.value) || 0 })}
                  />
                  <Select
                    label="Tabela de preço"
                    value={proposta.tabela_sugerida}
                    onChange={(e) => setProposta({ ...proposta, tabela_sugerida: e.target.value })}
                  >
                    <option value="">— definir depois —</option>
                    {tabelas?.map((t) => (
                      <option key={t.id} value={t.kind}>{t.nome}</option>
                    ))}
                  </Select>
                  <Input
                    label="Local (andar/sala)"
                    value={proposta.local_detalhe}
                    onChange={(e) => setProposta({ ...proposta, local_detalhe: e.target.value })}
                  />
                  <div className="md:col-span-2">
                    <Input
                      label="Endereço"
                      value={proposta.endereco || clienteEncontrado?.endereco || ''}
                      onChange={(e) => setProposta({ ...proposta, endereco: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={proposta.preco_a_definir}
                      onChange={(e) =>
                        setProposta({ ...proposta, preco_a_definir: e.target.checked })
                      }
                    />
                    Preço a definir (cliente novo)
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={proposta.incluir_institucional}
                      onChange={(e) =>
                        setProposta({ ...proposta, incluir_institucional: e.target.checked })
                      }
                    />
                    Incluir apresentação institucional
                  </label>
                </div>
              </Card>

              {/* serviços com cardápio e preço */}
              {proposta.servicos?.map((s, i) => {
                const repo =
                  s.hora_inicio && s.hora_fim
                    ? calcReposicao(s.service_type, duracaoMin(s.hora_inicio, s.hora_fim))
                    : null
                const divergeRepo =
                  repo?.status === 'ok' && s.reposicao_pct > 0 && repo.pct !== s.reposicao_pct
                return (
                  <Card
                    key={i}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        {SERVICE_TYPE_LABEL[s.service_type]}
                        {s.service_line && (
                          <Badge tone="blue">{SERVICE_LINE_LABEL[s.service_line]}</Badge>
                        )}
                        <span className="font-normal normal-case tracking-normal text-neutral-500">
                          {s.dia ? s.dia.split('-').reverse().slice(0, 2).join('/') : 'sem data'}
                          {s.hora_inicio && ` · ${s.hora_inicio}–${s.hora_fim}`}
                          {` · ${s.pax || proposta.pax} pax`}
                        </span>
                        {repo?.status === 'ok' && repo.pct > 0 && (
                          <Badge tone="amber">reposição +{repo.pct}%</Badge>
                        )}
                        {repo && repo.status !== 'ok' && <Badge tone="red">{repo.mensagem}</Badge>}
                      </span>
                    }
                    actions={
                      s.total > 0 ? (
                        <span className="text-sm font-semibold">{formatBRL(s.total)}</span>
                      ) : (
                        <span className="text-xs text-neutral-400">a definir</span>
                      )
                    }
                  >
                    {divergeRepo && (
                      <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        O agente calculou +{s.reposicao_pct}% de reposição e o engine calculou +
                        {repo!.pct}%. Vale o do engine — é ele que a programação e as comandas vão
                        usar.
                      </p>
                    )}
                    {!s.itens?.length ? (
                      <p className="text-sm text-neutral-400">
                        Sem cardápio definido — dá para montar na tela da Proposta.
                      </p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {s.itens.map((it, j) => (
                          <li key={j} className="flex justify-between gap-4">
                            <span>{nomeDoItem(it)}</span>
                            <span className="shrink-0 font-mono text-xs text-neutral-500">
                              {it.quantidade} {it.unidade}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.obs && <p className="mt-3 text-xs text-neutral-500">{s.obs}</p>}
                  </Card>
                )
              })}

              {proposta.orcamento_total > 0 && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--pg-border)] bg-[var(--pg-surface)] px-5 py-4">
                  <span className="pg-key">Total da proposta</span>
                  <span className="pg-metric text-2xl">{formatBRL(proposta.orcamento_total)}</span>
                </div>
              )}

              {proposta.observacoes?.length > 0 && (
                <Card title="📝 Observações do orçamento">
                  <ul className="space-y-1 text-sm text-neutral-600">
                    {proposta.observacoes.map((o, i) => (
                      <li key={i}>• {o}</li>
                    ))}
                  </ul>
                </Card>
              )}

              {(proposta.restricoes?.length > 0 || proposta.pedidos_especiais?.length > 0) && (
                <Card title="Restrições e pedidos especiais">
                  {proposta.restricoes?.map((r, i) => (
                    <div key={i} className="text-sm">
                      🍽 {r.tipo} — {r.pax} pax {r.critico && <Badge tone="red">CRÍTICO</Badge>}
                    </div>
                  ))}
                  {proposta.pedidos_especiais?.map((p, i) => (
                    <div key={i} className="mt-1 text-sm">
                      ⚠️ {p.descricao} <Badge tone="neutral">{p.destino}</Badge>
                      {p.impacto_valor > 0 && (
                        <Badge tone="green">+{formatBRL(p.impacto_valor)}</Badge>
                      )}
                    </div>
                  ))}
                </Card>
              )}

              <div className="flex flex-wrap items-center gap-3 pb-6">
                <Button
                  onClick={criarEvento}
                  disabled={criando || !proposta.evento || Boolean(threadAberta?.event_id)}
                >
                  {criando ? 'Criando…' : '✓ Criar evento com esta proposta'}
                </Button>
                <span className="text-xs text-neutral-500">
                  {threadAberta?.event_id
                    ? 'Esta conversa já gerou um evento — abra o evento acima para continuar.'
                    : 'Cria o evento, os serviços, o cardápio de cada um, as restrições e os pedidos — e liga tudo a esta conversa.'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
