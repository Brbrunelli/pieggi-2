// ============================================================
// OPERAÇÃO — a única tela da operação
//
// Substituiu as duas "filas" por fase. Elas eram listas de eventos para
// escolher um, e quem clicava em "Programação" no menu caía nessa lista
// (com um link para o funil) em vez de na programação. Um lugar só,
// sem lista-para-chegar-na-lista.
//
// DUAS VISTAS, porque 70 eventos no mês não cabem num quadro:
//   QUADRO — colunas por prazo, para ler a semana de relance
//   LISTA  — uma linha por evento, densa, para trabalhar no volume
//
// As colunas são PRAZO, não fase: a pergunta da equipe é "o que vem
// agora", e num quadro por fase o evento de dezembro fica lado a lado
// com o de amanhã.
//
// Cada linha mostra os quatro artefatos (Programação, Comanda,
// Plaquinha, Compras) e abre a fase com um clique.
// ============================================================

import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import { ETAPA_FECHADO, nomeCliente, type PieggiEvent } from '@/types'
import { formatDiaMes } from '@/engine'
import { hojeLocal } from '@/engine/datas'

/** Prazo (dias antes do evento) para cada artefato estar pronto. */
const PRAZO = { programacao: 4, producao: 2, compras: 2 }

interface Feitos {
  programacao: boolean
  comanda: boolean
  plaquinha: boolean
  compras: boolean
}

interface ItemOperacao {
  evento: PieggiEvent & { clients: { nome: string } | null }
  cliente: string
  primeiraData: string | null
  diasAte: number | null
  servicosDoDia: { hora: string | null; tipo: string }[]
  qtdDias: number
  feitos: Feitos
  alertas: string[]
  atrasado: boolean
  baixas: number
  passou: boolean
  pendente: boolean
}

const TIPO_CURTO: Record<string, string> = {
  welcome_coffee: 'Welcome',
  coffee_break: 'Coffee',
  auditorio: 'Auditório',
  brunch: 'Brunch',
  coquetel: 'Coquetel',
  bar: 'Bar',
  almoco: 'Almoço',
  jantar: 'Jantar',
  coquetel_pizza: 'Pizza',
  kit: 'Kit',
}

type Vista = 'quadro' | 'lista'
type Filtro = 'todos' | 'pendentes' | 'prog' | 'producao' | 'compras'

const FILTROS: { key: Filtro; label: string; dica: string }[] = [
  { key: 'todos', label: 'Todos', dica: 'todos os eventos fechados' },
  { key: 'pendentes', label: 'Com pendência', dica: 'falta algum artefato' },
  { key: 'prog', label: 'Sem programação', dica: 'programação não aprovada' },
  { key: 'producao', label: 'Sem produção', dica: 'comanda/plaquinha não geradas' },
  { key: 'compras', label: 'Sem compras', dica: 'evento fora de qualquer lista de compras' },
]

export default function Quadro() {
  const qc = useQueryClient()
  const { editarOperacao, administrar } = usePermissoes()

  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [expandido, setExpandido] = useState<string | null>(null)

  // A escolha de vista fica no navegador: quem trabalha em volume prefere
  // lista e não quer reescolher a cada visita.
  const [vista, setVista] = useState<Vista>(() => {
    try {
      return (localStorage.getItem('pg-operacao-vista') as Vista) ?? 'quadro'
    } catch {
      return 'quadro'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('pg-operacao-vista', vista)
    } catch {
      /* navegador sem storage — só não lembra */
    }
  }, [vista])

  const { data, isLoading } = useQuery({
    queryKey: ['quadro-operacao'],
    queryFn: async (): Promise<ItemOperacao[]> => {
      const [evRes, servRes, schedRes, prodRes, plaqRes, comprasRes, baixaRes, pedRes] =
        await Promise.all([
          supabase
            .from('events')
            .select('*, clients(nome)')
            .eq('pipeline', ETAPA_FECHADO)
            .not('status', 'in', '("concluido","cancelado")'),
          supabase.from('event_services').select('event_id, dia, hora_inicio, service_type'),
          supabase.from('schedules').select('event_id, aprovado_em'),
          supabase.from('production_orders').select('event_id, aprovado_em'),
          supabase.from('signage_sets').select('event_id, aprovado_em'),
          supabase.from('purchase_lists').select('event_ids'),
          supabase.from('station_progress').select('event_id'),
          supabase
            .from('special_requests')
            .select('event_id, fases, verificacoes, resolvido')
            .eq('resolvido', false),
        ])
      if (evRes.error) throw evRes.error

      const hoje = hojeLocal()
      const servicos = (servRes.data ?? []) as {
        event_id: string
        dia: string
        hora_inicio: string | null
        service_type: string
      }[]
      const aprovados = (t: { event_id: string; aprovado_em: string | null }[] | null) =>
        new Set((t ?? []).filter((x) => x.aprovado_em).map((x) => x.event_id))

      const comProgramacao = aprovados(schedRes.data as never)
      const comComanda = aprovados(prodRes.data as never)
      const comPlaquinha = aprovados(plaqRes.data as never)
      const existeProgramacao = new Set(
        ((schedRes.data ?? []) as { event_id: string }[]).map((x) => x.event_id)
      )
      const comCompras = new Set(
        ((comprasRes.data ?? []) as { event_ids: string[] | null }[]).flatMap(
          (l) => l.event_ids ?? []
        )
      )
      const baixas = (baixaRes.data ?? []) as { event_id: string }[]
      const pedidos = (pedRes.data ?? []) as {
        event_id: string
        fases: string[]
        verificacoes: Record<string, unknown>
      }[]

      return (evRes.data as (PieggiEvent & { clients: { nome: string } | null })[]).map((e) => {
        const doEvento = servicos.filter((s) => s.event_id === e.id)
        const dias = Array.from(new Set(doEvento.map((s) => s.dia))).sort()
        const primeiraData = dias[0] ?? null
        const diasAte = primeiraData
          ? Math.round((new Date(primeiraData).getTime() - new Date(hoje).getTime()) / 86400000)
          : null

        const feitos: Feitos = {
          programacao: comProgramacao.has(e.id),
          comanda: comComanda.has(e.id),
          plaquinha: comPlaquinha.has(e.id),
          compras: comCompras.has(e.id),
        }

        const alertas: string[] = []
        if (!existeProgramacao.has(e.id)) alertas.push('programação não iniciada')
        else if (!feitos.programacao) alertas.push('programação sem aprovação')
        if (feitos.programacao && !feitos.comanda) alertas.push('produção não gerada')
        const pendVerif = pedidos
          .filter((p) => p.event_id === e.id)
          .reduce((a, p) => a + p.fases.filter((f) => !(f in p.verificacoes)).length, 0)
        if (pendVerif > 0) alertas.push(`${pendVerif} pedido(s) do cliente a verificar`)
        if (!e.pax) alertas.push('sem PAX definido')
        if (!e.endereco_confirmado) alertas.push('endereço não confirmado')

        // Atrasado = falta artefato E o prazo dele já passou. Evento com
        // tudo pronto nunca fica vermelho, mesmo sendo hoje.
        const atrasado =
          diasAte != null &&
          ((!feitos.programacao && diasAte <= PRAZO.programacao) ||
            (!feitos.comanda && diasAte <= PRAZO.producao) ||
            (!feitos.plaquinha && diasAte <= PRAZO.producao) ||
            (!feitos.compras && diasAte <= PRAZO.compras))

        return {
          evento: e,
          cliente: nomeCliente(e),
          primeiraData,
          diasAte,
          servicosDoDia: doEvento
            .filter((s) => s.dia === primeiraData)
            .sort((a, b) => (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))
            .map((s) => ({ hora: s.hora_inicio?.slice(0, 5) ?? null, tipo: s.service_type })),
          qtdDias: dias.length,
          feitos,
          alertas,
          atrasado,
          baixas: baixas.filter((b) => b.event_id === e.id).length,
          passou: diasAte != null && diasAte < 0,
          pendente:
            !feitos.programacao || !feitos.comanda || !feitos.plaquinha || !feitos.compras,
        }
      })
    },
  })

  // ---------- busca e filtro: é isto que faz 70 eventos serem trabalháveis ----------
  const filtrados = useMemo(() => {
    let l = data ?? []
    if (busca) {
      const b = busca.toLowerCase()
      l = l.filter(
        (i) => i.cliente.toLowerCase().includes(b) || i.evento.nome.toLowerCase().includes(b)
      )
    }
    switch (filtro) {
      case 'pendentes':
        l = l.filter((i) => i.pendente)
        break
      case 'prog':
        l = l.filter((i) => !i.feitos.programacao)
        break
      case 'producao':
        l = l.filter((i) => !i.feitos.comanda || !i.feitos.plaquinha)
        break
      case 'compras':
        l = l.filter((i) => !i.feitos.compras)
        break
    }
    return [...l].sort((a, b) => (a.diasAte ?? 9999) - (b.diasAte ?? 9999))
  }, [data, busca, filtro])

  const colunas = useMemo(() => {
    const faixa = (de: number, ate: number) =>
      filtrados.filter((c) => c.diasAte != null && c.diasAte >= de && c.diasAte <= ate)
    return [
      {
        key: 'agora',
        titulo: 'Em cima da hora',
        subtitulo: 'em até 3 dias',
        // inclui o que já passou: evento de ontem sem produção é o mais
        // urgente que existe, e sumir da tela seria pior
        cards: faixa(-3650, 3),
        tom: 'vermelho' as const,
      },
      {
        key: 'semana',
        titulo: 'Em até 7 dias',
        subtitulo: 'de 4 a 7 dias',
        cards: faixa(4, 7),
        tom: 'ambar' as const,
      },
      {
        key: 'quinze',
        titulo: 'Em até 15 dias',
        subtitulo: 'de 8 a 15 dias',
        cards: faixa(8, 15),
        tom: 'neutro' as const,
      },
      {
        key: 'longe',
        titulo: 'Acima de 15 dias',
        subtitulo: 'ainda dá tempo',
        cards: faixa(16, 3650),
        tom: 'neutro' as const,
      },
    ]
  }, [filtrados])

  const semData = (data ?? []).filter((c) => c.diasAte == null)
  const atrasados = (data ?? []).filter((c) => c.atrasado).length
  const paxSemana = (data ?? [])
    .filter((c) => c.diasAte != null && c.diasAte >= 0 && c.diasAte <= 7)
    .reduce((s, c) => s + (c.evento.pax ?? 0), 0)

  // ------------------------------------------------------------
  // Encerrar evento que já passou (ver comentário no card)
  // ------------------------------------------------------------
  async function mudarStatus(id: string, status: 'concluido' | 'cancelado', nome: string) {
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase.from('events').update({ status }).eq('id', id)
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setMsg(
        `✅ ${nome} marcado como ${status === 'concluido' ? 'concluído' : 'cancelado'} — saiu do quadro.`
      )
      await qc.invalidateQueries({ queryKey: ['quadro-operacao'] })
    }
    setOcupado(false)
  }

  async function excluir(id: string, nome: string) {
    if (
      !window.confirm(
        `Excluir "${nome}" de vez?\n\nApaga o evento, os serviços, a programação, a produção e o contrato. NÃO tem como desfazer.\n\nSe o evento apenas já aconteceu, prefira "concluir" — sai do quadro e o histórico fica.`
      )
    )
      return
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase.from('events').delete().eq('id', id)
    if (error) {
      // invoice_events referencia events com ON DELETE RESTRICT: evento
      // faturado não pode ser apagado, e isso é proteção, não bug.
      const fk = /violates foreign key|restrict/i.test(error.message)
      setMsg(
        fk
          ? `🛑 "${nome}" já está dentro de uma nota fiscal e não pode ser excluído. Cancele a nota primeiro, ou use "concluir".`
          : `🛑 ${error.message}`
      )
    } else {
      setMsg(`🗑 ${nome} foi excluído.`)
      await qc.invalidateQueries({ queryKey: ['quadro-operacao'] })
    }
    setOcupado(false)
  }

  const acoes = { podeResolver: editarOperacao, podeExcluir: administrar, ocupado, mudarStatus, excluir }

  return (
    <div>
      <PageTitle
        lead="OPERAÇÃO"
        actions={
          <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
            {(['quadro', 'lista'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                  vista === v
                    ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                    : 'text-neutral-500 hover:text-[var(--pg-text)]'
                }`}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        }
      >
        Operação
      </PageTitle>

      <p className="-mt-4 mb-4 text-xs leading-relaxed text-neutral-500">
        Tudo que tem <b>contrato assinado</b>. Cada linha mostra o que já foi feito —{' '}
        <b>Programação · Comanda · Plaquinha · Compras</b> — e abre a fase com um clique. O
        vermelho é só para o que falta e já passou do prazo: programação 4 dias antes, produção e
        compras 2.
      </p>

      {/* ---------- números ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-6 rounded-lg border border-[var(--pg-border)] bg-[var(--pg-surface)] px-5 py-3.5">
        <div>
          <div className="pg-key">Fora do prazo</div>
          <div className={`pg-metric text-[24px] leading-none ${atrasados ? 'text-red-700' : ''}`}>
            {atrasados}
          </div>
        </div>
        <div>
          <div className="pg-key">Eventos fechados</div>
          <div className="pg-metric text-[24px] leading-none">{data?.length ?? 0}</div>
        </div>
        <div>
          <div className="pg-key">Pessoas em 7 dias</div>
          <div className="pg-metric text-[24px] leading-none">
            {paxSemana.toLocaleString('pt-BR')}
          </div>
        </div>
        {semData.length > 0 && (
          <div>
            <div className="pg-key">Sem data de serviço</div>
            <div className="pg-metric text-[24px] leading-none text-amber-700">
              {semData.length}
            </div>
          </div>
        )}
        <Link to="/compras" className="ml-auto">
          <Button variant="secondary">Lista de compras</Button>
        </Link>
      </div>

      {/* ---------- busca e filtro ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="!w-72"
          placeholder="Buscar cliente ou evento…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTROS.map((f) => {
            const n =
              f.key === 'todos'
                ? (data?.length ?? 0)
                : (data ?? []).filter((i) =>
                    f.key === 'pendentes'
                      ? i.pendente
                      : f.key === 'prog'
                        ? !i.feitos.programacao
                        : f.key === 'producao'
                          ? !i.feitos.comanda || !i.feitos.plaquinha
                          : !i.feitos.compras
                  ).length
            return (
              <button
                key={f.key}
                title={f.dica}
                onClick={() => setFiltro(f.key)}
                className={`rounded-full border px-3 py-1 text-[11px] font-semibold tracking-[0.06em] transition-all duration-300 ${
                  filtro === f.key
                    ? 'border-[var(--pg-text)] bg-[var(--pg-text)] text-[var(--pg-bg)]'
                    : 'border-[var(--pg-border)] text-neutral-500 hover:border-[var(--pg-text)] hover:text-[var(--pg-text)]'
                }`}
              >
                {f.label} <span className="opacity-60">{n}</span>
              </button>
            )
          })}
        </div>
        {(busca || filtro !== 'todos') && (
          <span className="text-xs text-neutral-500">
            {filtrados.length} resultado(s)
            <button
              className="ml-2 underline decoration-dotted"
              onClick={() => {
                setBusca('')
                setFiltro('todos')
              }}
            >
              limpar
            </button>
          </span>
        )}
      </div>

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !data?.length ? (
        <Card>
          <EmptyState>
            Nenhum evento com contrato assinado. O evento aparece aqui no instante em que a
            assinatura volta — você não precisa buscá-lo em lugar nenhum.
          </EmptyState>
        </Card>
      ) : !filtrados.length ? (
        <Card>
          <EmptyState>Nenhum evento neste filtro.</EmptyState>
        </Card>
      ) : vista === 'lista' ? (
        <ListaOperacao
          itens={filtrados}
          expandido={expandido}
          setExpandido={setExpandido}
          {...acoes}
        />
      ) : (
        <div className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-2">
          {colunas.map((col) => (
            <div key={col.key} className="flex w-[300px] shrink-0 flex-col">
              <div
                className={`mb-3 border-t-[3px] pt-2.5 ${
                  col.tom === 'vermelho'
                    ? 'border-red-700'
                    : col.tom === 'ambar'
                      ? 'border-amber-600'
                      : 'border-[var(--pg-border)]'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{col.titulo}</span>
                  <span className="pg-key">{col.cards.length}</span>
                </div>
                <div className="pg-key !normal-case !text-neutral-400">{col.subtitulo}</div>
              </div>

              {/* rolagem DENTRO da coluna: com 70 eventos no mês, uma
                  coluna de 30 cards jogaria as outras três para fora da tela */}
              <div className="max-h-[68vh] space-y-2 overflow-y-auto pr-1">
                {col.cards.map((c) => (
                  <CardCompacto
                    key={c.evento.id}
                    c={c}
                    aberto={expandido === c.evento.id}
                    onAbrir={() =>
                      setExpandido(expandido === c.evento.id ? null : c.evento.id)
                    }
                    {...acoes}
                  />
                ))}
                {!col.cards.length && (
                  <p className="rounded-lg border border-dashed border-[var(--pg-border)] py-6 text-center text-xs text-neutral-300">
                    nada aqui
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Etiqueta de artefato
// ------------------------------------------------------------
function Chip({
  rotulo,
  feito,
  urgente,
  para,
}: {
  rotulo: string
  feito: boolean
  urgente: boolean
  para: string
}) {
  return (
    <Link
      to={para}
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide transition-colors ${
        feito
          ? 'bg-green-100 text-green-800'
          : urgente
            ? 'bg-red-100 text-red-700 hover:bg-red-200'
            : 'bg-[var(--pg-bg)] text-neutral-400 hover:text-neutral-700'
      }`}
      title={feito ? `${rotulo} pronta — abrir` : `${rotulo} pendente — abrir`}
    >
      {feito ? '✓' : '○'} {rotulo}
    </Link>
  )
}

function DataChip({ c }: { c: ItemOperacao }) {
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
        c.atrasado
          ? 'bg-red-100 text-red-700'
          : (c.diasAte ?? 99) <= 3
            ? 'bg-amber-100 text-amber-800'
            : 'bg-[var(--pg-bg)] text-neutral-500'
      }`}
    >
      {c.primeiraData ? formatDiaMes(c.primeiraData) : 'sem data'}
      {c.diasAte != null &&
        (c.diasAte < 0 ? ' · passou' : c.diasAte === 0 ? ' · hoje' : ` · ${c.diasAte}d`)}
    </span>
  )
}

interface Acoes {
  podeResolver: boolean
  podeExcluir: boolean
  ocupado: boolean
  mudarStatus: (id: string, status: 'concluido' | 'cancelado', nome: string) => void
  excluir: (id: string, nome: string) => void
}

/**
 * Encerrar evento que já passou e ficou pendente. Sem isso ele entope a
 * primeira coluna para sempre. Concluir é o caminho certo em quase todo
 * caso — sai da tela e o histórico fica.
 */
function Encerrar({
  c,
  podeResolver,
  podeExcluir,
  ocupado,
  mudarStatus,
  excluir,
}: { c: ItemOperacao } & Acoes) {
  if (!c.passou || !c.pendente || !podeResolver) return null
  const rotulo = `${c.cliente} — ${c.evento.nome}`
  return (
    <div className="mt-2 rounded-lg border border-dashed border-[var(--pg-border)] p-2">
      <p className="mb-1.5 text-[11px] text-neutral-500">Já passou e ficou pendente. Encerrar?</p>
      <div className="flex flex-wrap gap-1">
        <button
          disabled={ocupado}
          onClick={() => mudarStatus(c.evento.id, 'concluido', rotulo)}
          className="rounded bg-green-100 px-2 py-1 text-[11px] font-semibold text-green-800 hover:bg-green-200 disabled:opacity-50"
        >
          ✓ Concluir
        </button>
        <button
          disabled={ocupado}
          onClick={() => mudarStatus(c.evento.id, 'cancelado', rotulo)}
          className="rounded bg-[var(--pg-bg)] px-2 py-1 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
        >
          Cancelar evento
        </button>
        {podeExcluir && (
          <button
            disabled={ocupado}
            onClick={() => excluir(c.evento.id, rotulo)}
            className="rounded px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            🗑 Excluir
          </button>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// CARD COMPACTO — três linhas. O detalhe abre no clique, porque 30
// cards abertos numa coluna são 6 000 px de rolagem.
// ------------------------------------------------------------
function CardCompacto({
  c,
  aberto,
  onAbrir,
  ...acoes
}: { c: ItemOperacao; aberto: boolean; onAbrir: () => void } & Acoes) {
  const urg = (feito: boolean, prazo: number) =>
    !feito && c.diasAte != null && c.diasAte <= prazo

  return (
    <div
      className={`rounded-lg border bg-[var(--pg-surface)] p-2.5 transition-colors ${
        c.atrasado ? 'border-red-300' : 'border-[var(--pg-border)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <button onClick={onAbrir} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[13px] font-semibold leading-tight">{c.cliente}</div>
          <div className="truncate text-[11px] text-neutral-500">
            {c.evento.nome}
            {c.evento.pax ? ` · ${c.evento.pax} pax` : ''}
            {c.qtdDias > 1 ? ` · ${c.qtdDias} dias` : ''}
          </div>
        </button>
        <DataChip c={c} />
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <Chip
          rotulo="PROG"
          feito={c.feitos.programacao}
          urgente={urg(c.feitos.programacao, PRAZO.programacao)}
          para={`/eventos/${c.evento.id}/programacao`}
        />
        <Chip
          rotulo="COM"
          feito={c.feitos.comanda}
          urgente={urg(c.feitos.comanda, PRAZO.producao)}
          para={`/eventos/${c.evento.id}/producao`}
        />
        <Chip
          rotulo="PLAQ"
          feito={c.feitos.plaquinha}
          urgente={urg(c.feitos.plaquinha, PRAZO.producao)}
          para={`/eventos/${c.evento.id}/producao`}
        />
        <Chip
          rotulo="COMPRAS"
          feito={c.feitos.compras}
          urgente={urg(c.feitos.compras, PRAZO.compras)}
          para="/compras"
        />
      </div>

      {aberto && (
        <div className="mt-2.5 border-t border-[var(--pg-border)] pt-2.5">
          {c.servicosDoDia.length > 0 && (
            <div className="mb-2 space-y-0.5">
              {c.servicosDoDia.map((s, i) => (
                <div key={i} className="flex gap-2 text-[11px] text-neutral-600">
                  <span className="w-10 shrink-0 font-mono">{s.hora ?? '—'}</span>
                  <span>{TIPO_CURTO[s.tipo] ?? s.tipo}</span>
                </div>
              ))}
            </div>
          )}
          {c.alertas.length > 0 && (
            <ul className="mb-2 space-y-0.5">
              {c.alertas.map((a, i) => (
                <li
                  key={i}
                  className={`text-[11px] ${c.atrasado ? 'text-red-700' : 'text-amber-700'}`}
                >
                  • {a}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-1.5">
            <Link to={`/eventos/${c.evento.id}/programacao`} className="flex-1">
              <Button variant="secondary" className="w-full !px-2 !py-1.5 text-[11px]">
                Programação
              </Button>
            </Link>
            <Link to={`/eventos/${c.evento.id}/producao`} className="flex-1">
              <Button variant="secondary" className="w-full !px-2 !py-1.5 text-[11px]">
                Produção
              </Button>
            </Link>
          </div>
          <Encerrar c={c} {...acoes} />
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// LISTA — a vista para volume. Uma linha por evento, ~40 px: 70 eventos
// caem em três telas de rolagem, não em trinta.
// ------------------------------------------------------------
function ListaOperacao({
  itens,
  expandido,
  setExpandido,
  ...acoes
}: {
  itens: ItemOperacao[]
  expandido: string | null
  setExpandido: (id: string | null) => void
} & Acoes) {
  const urg = (c: ItemOperacao, feito: boolean, prazo: number) =>
    !feito && c.diasAte != null && c.diasAte <= prazo

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Cliente</Th>
              <Th>Evento</Th>
              <Th>Data</Th>
              <Th>Pax</Th>
              <Th>O que já foi feito</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {itens.map((c) => (
              // Fragment com key: duas linhas por evento (a linha e o
              // detalhe) precisam de uma chave só no pai
              <Fragment key={c.evento.id}>
                <tr
                  className={`transition-colors hover:bg-[var(--pg-bg)] ${
                    c.atrasado ? 'bg-red-50/60' : ''
                  }`}
                >
                  <Td>
                    <button
                      className="text-left font-medium hover:underline"
                      onClick={() =>
                        setExpandido(expandido === c.evento.id ? null : c.evento.id)
                      }
                    >
                      {c.cliente}
                    </button>
                  </Td>
                  <Td className="text-neutral-500">
                    {c.evento.nome}
                    {c.qtdDias > 1 && (
                      <span className="text-xs text-neutral-400"> · {c.qtdDias} dias</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <DataChip c={c} />
                  </Td>
                  <Td>{c.evento.pax ?? '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Chip
                        rotulo="PROG"
                        feito={c.feitos.programacao}
                        urgente={urg(c, c.feitos.programacao, PRAZO.programacao)}
                        para={`/eventos/${c.evento.id}/programacao`}
                      />
                      <Chip
                        rotulo="COM"
                        feito={c.feitos.comanda}
                        urgente={urg(c, c.feitos.comanda, PRAZO.producao)}
                        para={`/eventos/${c.evento.id}/producao`}
                      />
                      <Chip
                        rotulo="PLAQ"
                        feito={c.feitos.plaquinha}
                        urgente={urg(c, c.feitos.plaquinha, PRAZO.producao)}
                        para={`/eventos/${c.evento.id}/producao`}
                      />
                      <Chip
                        rotulo="COMPRAS"
                        feito={c.feitos.compras}
                        urgente={urg(c, c.feitos.compras, PRAZO.compras)}
                        para="/compras"
                      />
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <Link to={`/eventos/${c.evento.id}/programacao`}>
                      <Button variant="secondary" className="!px-3 !py-1.5 text-[11px]">
                        Programação
                      </Button>
                    </Link>{' '}
                    <Link to={`/eventos/${c.evento.id}/producao`}>
                      <Button variant="secondary" className="!px-3 !py-1.5 text-[11px]">
                        Produção
                      </Button>
                    </Link>
                  </Td>
                </tr>
                {expandido === c.evento.id && (
                  <tr>
                    <Td className="!py-2" />
                    <td colSpan={5} className="border-b border-[var(--pg-border)] px-4 py-2">
                      <div className="flex flex-wrap items-start gap-8">
                        {c.servicosDoDia.length > 0 && (
                          <div>
                            <div className="pg-key mb-1">Serviços do 1º dia</div>
                            {c.servicosDoDia.map((s, i) => (
                              <div key={i} className="flex gap-2 text-[11px] text-neutral-600">
                                <span className="w-10 shrink-0 font-mono">{s.hora ?? '—'}</span>
                                <span>{TIPO_CURTO[s.tipo] ?? s.tipo}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {c.alertas.length > 0 && (
                          <div>
                            <div className="pg-key mb-1">Pendências</div>
                            <ul>
                              {c.alertas.map((a, i) => (
                                <li
                                  key={i}
                                  className={`text-[11px] ${
                                    c.atrasado ? 'text-red-700' : 'text-amber-700'
                                  }`}
                                >
                                  • {a}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="min-w-[220px]">
                          <Encerrar c={c} {...acoes} />
                          <Link
                            to={`/eventos/${c.evento.id}`}
                            className="mt-2 inline-block text-[11px] underline decoration-dotted"
                          >
                            abrir o evento
                          </Link>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
