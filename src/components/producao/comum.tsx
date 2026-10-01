// ============================================================
// PRODUÇÃO E EXPEDIÇÃO — o que as duas telas leem igual
//
// A TV de cada praça e o checklist da expedição partem da MESMA
// pergunta: "quais eventos têm comanda aprovada para este dia, e a que
// horas o carro sai?". Responder em dois lugares abria a porta para a
// praça ver um horário e a expedição outro — por isso a consulta mora
// aqui, uma vez só.
//
//   comanda → a versão mais nova APROVADA de production_orders, só de
//             evento com contrato assinado (events.pipeline 'aprovado');
//   saída   → a viagem de ENTREGA programada para o dia (Rotas do dia);
//             sem viagem, o horário que a própria comanda calculou
//             (servir −3h), marcado como "da comanda";
//   compras → os pedidos de compra do evento que ainda não chegaram
//             (Compras amarra cada item ao evento) — aviso, não trava.
// ============================================================

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DiaComandas, EstadoComandas } from '@/engine/producao'
import { diaLocal, horaDaSaidaComanda, pedidosPendentes, type ItemCompraEvento, type PedidoPendente } from '@/engine/expedicao'
import { formatDiaMes } from '@/engine'

/**
 * Dia de hoje + offset no fuso LOCAL (São Paulo). Não use toISOString():
 * é UTC, e das 21h em diante já seria amanhã — a TV escreveria "HOJE" em
 * cima do evento de amanhã bem na hora em que a madrugada começa.
 */
export function isoDia(offset: number): string {
  return diaLocal(offset)
}

export function rotuloDia(d: string): string {
  if (d === isoDia(0)) return 'HOJE'
  if (d === isoDia(1)) return 'AMANHÃ'
  if (d === isoDia(-1)) return 'ONTEM'
  return formatDiaMes(d)
}

export interface EventoDoDia {
  eventId: string
  nome: string
  cliente: string
  pax: number | null
  campoEtapa: string | null
  versao: number
  snapshot: EstadoComandas
  dia: DiaComandas
  /** "HH:MM" */
  saida: string | null
  saidaFonte: 'viagem' | 'comanda' | null
  /** a entrega já saiu da Pieggi (motorista marcou) */
  saiuEm: string | null
}

interface LinhaPO {
  event_id: string
  versao: number
  snapshot: EstadoComandas | null
  events: {
    id: string
    nome: string
    pax: number | null
    cliente_nome: string | null
    campo_etapa: string | null
    clients: { nome: string } | null
  } | null
}

interface LinhaViagem {
  event_id: string | null
  saida_prevista: string | null
  saiu_em: string | null
}

/**
 * Eventos com comanda aprovada que têm este dia na comanda, em ordem de
 * saída. `refetch` em ms (a TV atualiza sozinha).
 */
export function useEventosDoDia(diaISO: string, refetch: number | false = false) {
  return useQuery({
    queryKey: ['producao-dia', diaISO],
    refetchInterval: refetch,
    queryFn: async (): Promise<EventoDoDia[]> => {
      // 1. quem tem serviço no dia
      const { data: servs, error: e1 } = await supabase.from('event_services').select('event_id').eq('dia', diaISO)
      if (e1) throw e1
      const ids = Array.from(new Set((servs ?? []).map((s) => s.event_id as string)))
      if (!ids.length) return []

      // 2. a comanda aprovada mais nova de cada um (contrato assinado)
      const { data: pos, error: e2 } = await supabase
        .from('production_orders')
        .select('event_id, versao, snapshot, events!inner(id, nome, pax, pipeline, cliente_nome, campo_etapa, clients(nome))')
        .in('event_id', ids)
        .not('aprovado_em', 'is', null)
        .eq('events.pipeline', 'aprovado')
        .order('versao', { ascending: false })
      if (e2) throw e2
      const maisNova = new Map<string, LinhaPO>()
      for (const po of (pos ?? []) as unknown as LinhaPO[]) if (!maisNova.has(po.event_id)) maisNova.set(po.event_id, po)

      // 3. a entrega programada do dia
      const { data: vgs, error: e3 } = await supabase
        .from('viagens')
        .select('event_id, saida_prevista, saiu_em')
        .eq('dia', diaISO)
        .eq('tipo', 'entrega')
        .neq('status', 'cancelada')
        .in('event_id', ids)
        .order('saida_prevista')
      if (e3) throw e3
      const entrega = new Map<string, LinhaViagem>()
      for (const v of (vgs ?? []) as LinhaViagem[]) if (v.event_id && !entrega.has(v.event_id)) entrega.set(v.event_id, v)

      const out: EventoDoDia[] = []
      for (const po of maisNova.values()) {
        const dia = po.snapshot?.dias?.find((d) => d.diaISO === diaISO)
        if (!po.snapshot || !dia || !po.events) continue
        const v = entrega.get(po.event_id)
        const daViagem = v?.saida_prevista?.slice(0, 5) ?? null
        const daComanda = horaDaSaidaComanda(dia.saida)
        out.push({
          eventId: po.event_id,
          nome: po.events.nome,
          cliente: po.events.clients?.nome ?? po.events.cliente_nome ?? '—',
          pax: po.events.pax,
          campoEtapa: po.events.campo_etapa,
          versao: po.versao,
          snapshot: po.snapshot,
          dia,
          saida: daViagem ?? daComanda,
          saidaFonte: daViagem ? 'viagem' : daComanda ? 'comanda' : null,
          saiuEm: v?.saiu_em ?? null,
        })
      }
      return out.sort((a, b) => (a.saida ?? '99').localeCompare(b.saida ?? '99'))
    },
  })
}

/**
 * Pedidos de COMPRA dos eventos do dia que ainda não chegaram (Compras
 * amarra cada item ao evento em purchase_order_items.event_id). Só
 * informa — quem recebe o pedido é Compras, em /compras/pedidos.
 * Devolve uma função: pendentes(eventId) → pedidos daquele evento.
 */
export function usePedidosPendentes(diaISO: string, eventIds: string[], refetch: number | false = false) {
  const ids = [...eventIds].sort()
  const q = useQuery({
    queryKey: ['producao-compras', diaISO, ids.join(',')],
    enabled: ids.length > 0,
    refetchInterval: refetch,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(
          'event_id, descricao, purchase_orders!inner(id, numero, status, forma, data_prevista, fornecedores:fornecedor_id (nome))'
        )
        .in('event_id', ids)
        .in('purchase_orders.status', ['rascunho', 'enviado', 'confirmado'])
      if (error) throw error
      return (data ?? []) as unknown as ItemCompraEvento[]
    },
  })
  const linhas = q.data ?? []
  return {
    erro: q.error as Error | null,
    pendentes: (eventId: string): PedidoPendente[] => pedidosPendentes(linhas, eventId, diaISO),
  }
}

const STATUS_PEDIDO: Record<string, string> = {
  rascunho: 'ainda em rascunho',
  enviado: 'enviado, sem confirmação',
  confirmado: 'confirmado',
}

/** Faixa âmbar: "Compras ainda não recebidas" — informa, não trava. */
export function FaixaCompras({ pedidos, compacta = false }: { pedidos: PedidoPendente[]; compacta?: boolean }) {
  if (!pedidos.length) return null
  if (compacta) {
    return (
      <p className="mb-3 rounded-md bg-amber-500/15 px-3 py-2 text-xs">
        <b>Compras ainda não recebidas:</b>{' '}
        {pedidos
          .map((p) => `Pedido ${p.numero} (${p.fornecedor}) — ${p.itens.slice(0, 2).join(', ')}${p.itens.length > 2 ? '…' : ''}`)
          .join(' · ')}
      </p>
    )
  }
  return (
    <div className="mb-3 rounded-md border border-amber-500 bg-amber-500/10 px-3 py-2 text-sm">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <b>🛒 Compras deste evento ainda não recebidas</b>
        <Link to="/compras/pedidos" className="text-xs font-semibold underline">
          Ver em Compras →
        </Link>
      </div>
      <ul className="flex flex-col gap-1 text-xs">
        {pedidos.map((p) => (
          <li key={p.pedidoId}>
            <b>Pedido {p.numero}</b> · {p.fornecedor} — {STATUS_PEDIDO[p.status] ?? p.status}
            {p.dataPrevista
              ? `, ${p.retirada ? 'retirada' : 'previsto'} ${formatDiaMes(p.dataPrevista)}`
              : ', sem data prevista'}
            {p.chegaDepois && <span className="font-semibold text-red-700"> · chega DEPOIS desta saída</span>}
            <span className="block text-neutral-500">{p.itens.join(' · ')}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Hoje / Amanhã / +2 e uma data qualquer. */
export function SeletorDia({
  valor,
  onChange,
  atalhos = [0, 1, 2],
  grande = false,
}: {
  valor: string
  onChange: (d: string) => void
  atalhos?: number[]
  grande?: boolean
}) {
  const nome = (o: number) => (o === 0 ? 'Hoje' : o === 1 ? 'Amanhã' : `+${o} dias`)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {atalhos.map((o) => {
        const d = isoDia(o)
        const ativo = d === valor
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(d)}
            className={
              `rounded-full border font-semibold transition-colors ${grande ? 'px-5 py-3 text-sm' : 'px-4 py-2 text-xs'} ` +
              (ativo
                ? 'border-[var(--pg-text)] bg-[var(--pg-text)] text-[var(--pg-bg)]'
                : 'border-[var(--pg-border)] hover:border-[var(--pg-text)]')
            }
          >
            {nome(o)}
          </button>
        )
      })}
      <input
        type="date"
        value={valor}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="rounded-full border border-[var(--pg-border)] bg-transparent px-3 py-1.5 text-xs"
        aria-label="Escolher outro dia"
      />
    </div>
  )
}

/** Barra fina de progresso; cor própria (a da praça) ou verde quando completa. */
export function BarraProgresso({ pct, cor, alta = false }: { pct: number; cor?: string; alta?: boolean }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-[var(--pg-border)] ${alta ? 'h-3' : 'h-1.5'}`}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: pct >= 100 ? '#15803d' : (cor ?? 'var(--pg-text)') }}
      />
    </div>
  )
}

/** "hh:mm" de um timestamp, no fuso de quem está olhando. */
export function horaMarcada(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
