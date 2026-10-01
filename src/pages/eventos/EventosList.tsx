// ============================================================
// FUNIL COMERCIAL (Kanban) — aba Eventos
//
//   Briefing → Proposta enviada → Contrato para assinar → Contrato
//   assinado, + a zona de Perdidos.
//
// Arrastar o card muda a etapa. Soltar em "Contrato assinado" fecha o
// evento: aprova a proposta, libera a operação (Programação → Produção →
// Compras), publica na agenda do Google e a NF entra na fila do
// financeiro.
//
// O caminho normal é a assinatura voltar do DocuSign e o trigger do
// banco mover o card sozinho. Arrastar à mão continua valendo como
// saída de emergência — contrato assinado no papel, por exemplo.
// ============================================================

import { useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import {
  EVENT_STATUS_LABEL,
  PIPELINE,
  nomeCliente,
  type EventStatus,
  type PieggiEvent,
  type PipelineStage,
} from '@/types'
import { formatBRL, formatDiaMes } from '@/engine'
import { hojeLocal } from '@/engine/datas'

type EventoLista = PieggiEvent & {
  clients: { nome: string; tipo: string } | null
  primeiraData: string | null
  diasAte: number | null
}

const tone: Record<EventStatus, 'neutral' | 'green' | 'amber' | 'red' | 'blue'> = {
  rascunho: 'neutral',
  proposta_em_montagem: 'amber',
  proposta_enviada: 'amber',
  proposta_recusada: 'red',
  proposta_aprovada: 'blue',
  programacao_em_montagem: 'amber',
  programacao_aprovada: 'blue',
  comandas_geradas: 'blue',
  plaquinhas_geradas: 'blue',
  compras_consolidadas: 'green',
  concluido: 'green',
  cancelado: 'red',
}

export default function EventosList() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const [vista, setVista] = useState<'kanban' | 'lista'>('kanban')
  const [busca, setBusca] = useState('')
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<PipelineStage | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [mostrarPerdidos, setMostrarPerdidos] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['eventos-pipeline'],
    queryFn: async (): Promise<EventoLista[]> => {
      const [evRes, servRes] = await Promise.all([
        supabase.from('events').select('*, clients(nome, tipo)').order('updated_at', { ascending: false }),
        supabase.from('event_services').select('event_id, dia'),
      ])
      if (evRes.error) throw evRes.error
      const hoje = hojeLocal()
      const servicos = (servRes.data ?? []) as { event_id: string; dia: string }[]

      return (evRes.data as (PieggiEvent & { clients: { nome: string; tipo: string } | null })[]).map(
        (e) => {
          const dias = servicos.filter((s) => s.event_id === e.id).map((s) => s.dia).sort()
          const primeiraData = dias[0] ?? null
          return {
            ...e,
            primeiraData,
            diasAte: primeiraData
              ? Math.round((new Date(primeiraData).getTime() - new Date(hoje).getTime()) / 86400000)
              : null,
          }
        }
      )
    },
  })

  const filtrados = useMemo(
    () =>
      (data ?? []).filter(
        (e) =>
          !busca ||
          e.nome.toLowerCase().includes(busca.toLowerCase()) ||
          nomeCliente(e).toLowerCase().includes(busca.toLowerCase())
      ),
    [data, busca]
  )

  // ---------- mover de etapa ----------
  async function mover(evento: EventoLista, destino: PipelineStage) {
    if (evento.pipeline === destino) return
    setMsg(null)
    const origem = evento.pipeline

    const patch: Record<string, unknown> = { pipeline: destino }

    // A etapa arrasta o status da esteira junto. Só mexe no status
    // enquanto o evento está na fase comercial: evento que já tem
    // programação aprovada não volta a "proposta em montagem" porque
    // alguém arrastou o card.
    const aindaComercial = [
      'rascunho',
      'proposta_em_montagem',
      'proposta_enviada',
      'proposta_recusada',
      'proposta_aprovada',
    ].includes(evento.status)

    if (destino === 'aprovado') patch.status = 'proposta_aprovada'
    else if (destino === 'perdido') patch.status = 'proposta_recusada'
    else if (aindaComercial) {
      if (destino === 'frio') patch.status = 'proposta_em_montagem'
      else if (destino === 'morno') patch.status = 'proposta_enviada'
      else if (destino === 'quente') patch.status = 'proposta_aprovada'
      // contrato_enviado: a proposta já foi aceita, o status não muda
    }

    const { error } = await supabase.from('events').update(patch).eq('id', evento.id)
    if (error) return setMsg(`🛑 ${error.message}`)

    await supabase.from('pipeline_log').insert({
      event_id: evento.id,
      de: origem,
      para: destino,
      user_id: session?.user.id,
    })

    // sincroniza a proposta e a agenda
    const { data: props } = await supabase
      .from('proposals')
      .select('id, dados')
      .eq('event_id', evento.id)
      .order('versao', { ascending: false })
      .limit(5)
    const oficial = (props ?? []).find((p) => (p.dados as { modo?: string })?.modo !== 'estudio')

    // Perdidos e "cliente recusou" são o mesmo fato — mantém os dois lados
    // em sincronia, senão o funil diz perdido e a proposta segue em rascunho.
    if (destino === 'perdido' && oficial) {
      await supabase
        .from('proposals')
        .update({ status_cliente: 'recusada', respondida_em: new Date().toISOString() })
        .eq('id', oficial.id)
    }
    // saiu de Perdidos: destrava a proposta para uma nova versão
    if (origem === 'perdido' && destino !== 'perdido') {
      if (oficial) {
        await supabase
          .from('proposals')
          .update({ status_cliente: 'rascunho', respondida_em: null, motivo_recusa: null })
          .eq('id', oficial.id)
      }
      await supabase.from('events').update({ motivo_perda: null }).eq('id', evento.id)
    }

    if (destino === 'aprovado') {
      if (oficial) {
        await supabase
          .from('proposals')
          .update({
            status_cliente: 'aprovada',
            respondida_em: new Date().toISOString(),
            aprovado_por: session?.user.id,
            aprovado_em: new Date().toISOString(),
          })
          .eq('id', oficial.id)
      }
      await supabase.from('approvals').insert({
        event_id: evento.id,
        fase: 'proposta',
        user_id: session?.user.id,
        obs: 'Contrato assinado (Kanban)',
      })
      setMsg(`✅ ${evento.nome}: contrato assinado — operação liberada. Publicando na agenda…`)
      try {
        const { data: r, error: err } = await supabase.functions.invoke('agenda', {
          body: { event_id: evento.id, acao: 'sincronizar' },
        })
        if (err) throw err
        if (r?.erro) throw new Error(r.erro)
        setMsg(
          `✅ ${evento.nome}: contrato assinado, operação liberada e ${
            (r?.resultados ?? []).length
          } compromisso(s) na agenda.${r?.aviso ? ` ⚠️ ${r.aviso}` : ''}`
        )
      } catch (e) {
        setMsg(
          `✅ ${evento.nome}: contrato assinado e operação liberada. ⚠️ Agenda não sincronizou: ${
            e instanceof Error ? e.message : 'erro'
          }`
        )
      }
    } else {
      // O ciclo da proposta acompanha a coluna do funil — as duas contam a
      // mesma história e ficavam dessincronizadas quando só uma mudava.
      const statusProposta: Record<string, string> = {
        frio: 'rascunho',
        morno: 'enviada',
        quente: 'aprovada', // aceitou o valor; falta fechar o contrato
        contrato_enviado: 'aprovada',
        perdido: 'recusada',
      }
      if (oficial && statusProposta[destino]) {
        await supabase
          .from('proposals')
          .update({ status_cliente: statusProposta[destino] })
          .eq('id', oficial.id)
      }
      // saiu de "aprovado" → tira da agenda
      if (origem === 'aprovado') {
        try {
          await supabase.functions.invoke('agenda', {
            body: { event_id: evento.id, acao: 'remover' },
          })
          setMsg(`↩ ${evento.nome}: voltou para ${rotulo(destino)} — removido da agenda.`)
        } catch {
          setMsg(`↩ ${evento.nome}: voltou para ${rotulo(destino)}.`)
        }
      } else {
        setMsg(`${evento.nome} → ${rotulo(destino)}`)
      }
    }

    await qc.invalidateQueries({ queryKey: ['eventos-pipeline'] })
    await qc.invalidateQueries({ queryKey: ['dashboard-ceo'] })
  }

  function rotulo(p: PipelineStage) {
    return PIPELINE.find((x) => x.key === p)?.label ?? 'Perdido'
  }

  function aoSoltar(e: DragEvent, destino: PipelineStage) {
    e.preventDefault()
    setSobre(null)
    const id = e.dataTransfer.getData('text/plain') || arrastando
    setArrastando(null)
    const evento = filtrados.find((x) => x.id === id)
    if (evento) mover(evento, destino)
  }

  const perdidos = filtrados.filter((e) => e.pipeline === 'perdido')

  return (
    <div>
      <PageTitle
        lead="COMERCIAL"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
              {(['lista', 'kanban'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                    vista === v
                      ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                      : 'text-neutral-500 hover:text-[var(--pg-text)]'
                  }`}
                >
                  {v === 'lista' ? 'LISTA' : 'KANBAN'}
                </button>
              ))}
            </div>
            <Link to="/briefing">
              <Button variant="secondary">Briefing</Button>
            </Link>
            <Link to="/eventos/novo">
              <Button>+ Novo evento</Button>
            </Link>
          </div>
        }
      >
        Eventos
      </PageTitle>

      <p className="-mt-4 mb-5 text-xs leading-relaxed text-neutral-500">
        Arraste o card para mudar a etapa. <b>Contrato assinado</b> é o portão: libera
        Programação → Produção → Compras, publica na agenda e manda a NF para o financeiro.
        No caminho normal quem move esse card é a assinatura voltando do DocuSign — arrastar à
        mão fica para a exceção (contrato assinado no papel, por exemplo).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="!w-72"
          placeholder="Buscar evento ou cliente…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        {msg && (
          <span className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm">{msg}</span>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : vista === 'kanban' ? (
        <>
          {/* colunas largas com rolagem horizontal: card de funil precisa
              caber valor, data, contato e o que falta — apertado não se lê */}
          <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
            {PIPELINE.map((col) => {
              const doFunil = filtrados
                .filter((e) => e.pipeline === col.key)
                .sort((a, b) => (a.diasAte ?? 9999) - (b.diasAte ?? 9999))
              const valor = doFunil.reduce((s, e) => s + Number(e.orcamento_valor ?? 0), 0)
              return (
                <div
                  key={col.key}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setSobre(col.key)
                  }}
                  onDragLeave={() => setSobre((s) => (s === col.key ? null : s))}
                  onDrop={(e) => aoSoltar(e, col.key)}
                  className={`w-[300px] shrink-0 rounded-lg p-1 transition ${
                    sobre === col.key ? 'bg-[var(--pg-bg)] ring-2 ring-[var(--pg-text)]' : ''
                  }`}
                >
                  <div className={`mb-3 border-t-[3px] pt-2.5 ${col.cor}`}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-sm font-semibold">{col.label}</span>
                      <span className="pg-key">{doFunil.length}</span>
                    </div>
                    <div className="pg-key !normal-case !text-neutral-400">
                      {valor > 0 ? formatBRL(valor) : col.descricao}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {doFunil.map((e) => (
                      <CardEvento
                        key={e.id}
                        evento={e}
                        arrastando={arrastando === e.id}
                        onDragStart={(ev) => {
                          ev.dataTransfer.setData('text/plain', e.id)
                          ev.dataTransfer.effectAllowed = 'move'
                          setArrastando(e.id)
                        }}
                        onDragEnd={() => setArrastando(null)}
                      />
                    ))}
                    {!doFunil.length && (
                      <p className="rounded-lg border border-dashed border-[var(--pg-border)] py-8 text-center text-xs text-neutral-300">
                        arraste um card para cá
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* zona de perdidos */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setSobre('perdido')
            }}
            onDragLeave={() => setSobre((s) => (s === 'perdido' ? null : s))}
            onDrop={(e) => aoSoltar(e, 'perdido')}
            className={`mt-4 rounded-xl border border-dashed p-3 transition ${
              sobre === 'perdido' ? 'border-red-400 bg-red-50' : 'border-neutral-300'
            }`}
          >
            <button
              className="text-sm font-semibold text-neutral-600"
              onClick={() => setMostrarPerdidos(!mostrarPerdidos)}
            >
              🗑 Perdidos ({perdidos.length}) {mostrarPerdidos ? '▾' : '▸'}
              <span className="ml-2 text-xs font-normal text-neutral-400">
                arraste um card para cá para marcar como perdido
              </span>
            </button>
            {mostrarPerdidos && perdidos.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-4">
                {perdidos.map((e) => (
                  <CardEvento
                    key={e.id}
                    evento={e}
                    arrastando={arrastando === e.id}
                    onDragStart={(ev) => {
                      ev.dataTransfer.setData('text/plain', e.id)
                      setArrastando(e.id)
                    }}
                    onDragEnd={() => setArrastando(null)}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="mt-4 text-xs text-neutral-400">
            Comanda e plaquinha saem juntas na fase <b>Produção</b>, geradas da programação
            aprovada — a programação é o único ponto editável da operação.
          </p>
        </>
      ) : (
        <Card>
          {!filtrados.length ? (
            <EmptyState>Nenhum evento encontrado.</EmptyState>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Evento</Th>
                  <Th>Cliente</Th>
                  <Th>Etapa</Th>
                  <Th>Data</Th>
                  <Th>Pax</Th>
                  <Th>Valor</Th>
                  <Th>Status da esteira</Th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((e) => (
                  <tr key={e.id} className="hover:bg-neutral-50">
                    <Td>
                      <Link to={`/eventos/${e.id}`} className="font-medium hover:underline">
                        {e.nome}
                      </Link>
                    </Td>
                    <Td>{nomeCliente(e)}</Td>
                    <Td>
                      <Badge tone={e.pipeline === 'aprovado' ? 'green' : e.pipeline === 'perdido' ? 'red' : 'neutral'}>
                        {rotulo(e.pipeline)}
                      </Badge>
                    </Td>
                    <Td>{e.primeiraData ? formatDiaMes(e.primeiraData) : '—'}</Td>
                    <Td>{e.pax ?? '—'}</Td>
                    <Td>{e.orcamento_valor ? formatBRL(Number(e.orcamento_valor)) : '—'}</Td>
                    <Td>
                      <Badge tone={tone[e.status]}>{EVENT_STATUS_LABEL[e.status]}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Card do Kanban
// ------------------------------------------------------------
function CardEvento({
  evento,
  arrastando,
  onDragStart,
  onDragEnd,
}: {
  evento: EventoLista
  arrastando: boolean
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
}) {
  const urgente = evento.diasAte != null && evento.diasAte >= 0 && evento.diasAte <= 3
  const proximo = evento.diasAte != null && evento.diasAte >= 0 && evento.diasAte <= 7

  // Quanto tempo o card está parado na etapa. É o sinal mais útil de um
  // funil e o que ninguém percebe olhando só a coluna.
  const paradoDias = evento.pipeline_em
    ? Math.round((Date.now() - new Date(evento.pipeline_em).getTime()) / 86400000)
    : null
  const esfriando = paradoDias != null && paradoDias >= 7 && evento.pipeline !== 'aprovado'

  const faltas: string[] = []
  if (!evento.orcamento_valor && !evento.preco_a_definir) faltas.push('sem valor de proposta')
  if (!evento.pax) faltas.push('sem PAX')
  if (!evento.primeiraData) faltas.push('sem data de serviço')
  if (!evento.endereco_confirmado) faltas.push('endereço não confirmado')

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`cursor-grab rounded-lg border bg-[var(--pg-surface)] p-3 transition-all duration-300 [transition-timing-function:cubic-bezier(.16,1,.3,1)] active:cursor-grabbing ${
        arrastando
          ? 'opacity-40'
          : 'hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,.07)]'
      } ${urgente ? 'border-red-300' : 'border-[var(--pg-border)]'}`}
    >
      <Link to={`/eventos/${evento.id}`} className="block">
        {/* cliente primeiro: é por ele que o comercial procura */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-[13px] font-semibold leading-tight">{nomeCliente(evento)}</span>
          {evento.primeiraData && (
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                urgente
                  ? 'bg-red-100 text-red-700'
                  : proximo
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-[var(--pg-bg)] text-neutral-500'
              }`}
            >
              {formatDiaMes(evento.primeiraData)}
              {evento.diasAte != null && evento.diasAte >= 0 && ` · ${evento.diasAte}d`}
            </span>
          )}
        </div>

        <div className="mt-0.5 text-xs text-neutral-500">{evento.nome}</div>

        {/* o valor é a informação central de um funil — tamanho de métrica */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="pg-metric text-[19px] leading-none">
            {evento.orcamento_valor ? (
              formatBRL(Number(evento.orcamento_valor))
            ) : evento.preco_a_definir ? (
              <span className="text-[13px] font-normal text-violet-700">a definir</span>
            ) : (
              <span className="text-[13px] font-normal text-neutral-400">sem valor</span>
            )}
          </span>
          {evento.pax && (
            <span className="text-[11px] text-neutral-500">{evento.pax} pax</span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--pg-border)] pt-2 text-[11px] text-neutral-500">
          {evento.contato && <span>👤 {evento.contato}</span>}
          {paradoDias != null && (
            <span className={esfriando ? 'font-semibold text-amber-700' : ''}>
              {esfriando ? '⏳ ' : ''}
              {paradoDias === 0 ? 'movido hoje' : `${paradoDias}d nesta etapa`}
            </span>
          )}
        </div>

        {faltas.length > 0 && (
          <div className="mt-1.5 text-[11px] text-amber-700">⚠ {faltas.join(' · ')}</div>
        )}
      </Link>
    </div>
  )
}
