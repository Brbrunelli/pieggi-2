// ============================================================
// PEDIDOS DE COMPRA — o pedido ao fornecedor que vira conta a pagar
//
// "Compras e financeiro se conversam": o pedido é a ponte. Quem compra
// monta e manda; quando o fornecedor confirma, as parcelas nascem no
// contas a pagar sem ninguém redigitar; quando a mercadoria chega, a
// conferência marca divergência e o financeiro vê antes de pagar.
//
// Abre direto um pedido por ?id=, filtra por ?fornecedor= e recebe os
// itens da Lista de compras pelo estado de navegação (sem mudar o
// cálculo da lista).
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, PageTitle, Td, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import { dataBR, diasEntre, hojeISO, PEDIDO_ABERTO, rotuloCondicao } from '@/engine/financeiro'
import { useEventosParaLigar, usePedidosResumo } from '@/components/compras/dados'
import PedidoDetalhe from '@/components/compras/PedidoDetalhe'
import { StatusPedidoBadge } from '@/components/compras/StatusPedidoBadge'
import { useFornecedores } from '@/pages/compras/Fornecedores'
import type { NovoPedidoDaLista, PedidoResumo } from '@/tipos/compras'

type Filtro = 'abertos' | 'recebidos' | 'cancelados' | 'todos'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'abertos', label: 'Em aberto' },
  { key: 'recebidos', label: 'Recebidos' },
  { key: 'cancelados', label: 'Cancelados' },
  { key: 'todos', label: 'Todos' },
]

export default function Pedidos() {
  const { pedirCompra } = usePermissoes()
  const [busca, setBusca] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { data: pedidos, isLoading } = usePedidosResumo()
  const { data: fornecedores } = useFornecedores()
  const { data: eventos } = useEventosParaLigar()

  const daListaInicial = (location.state as { novoPedido?: NovoPedidoDaLista } | null)?.novoPedido ?? null
  const [daLista, setDaLista] = useState<NovoPedidoDaLista | null>(daListaInicial)
  const [novo, setNovo] = useState(Boolean(daListaInicial))
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [msg, setMsg] = useState<string | null>(null)

  // o estado de navegação é de uso único: some do histórico ao abrir
  useEffect(() => {
    if (daListaInicial) navigate(location.pathname + location.search, { replace: true, state: null })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const abertoId = busca.get('id')
  const fornecedorFiltro = busca.get('fornecedor')
  const aberto = (pedidos ?? []).find((p) => p.id === abertoId) ?? null

  function abrir(id: string | null) {
    const b = new URLSearchParams(busca)
    if (id) b.set('id', id)
    else b.delete('id')
    setBusca(b, { replace: true })
    setNovo(false)
    setDaLista(null)
    if (id) window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const hoje = hojeISO()
  const lista = useMemo(() => {
    let t = pedidos ?? []
    if (fornecedorFiltro) t = t.filter((p) => p.fornecedor_id === fornecedorFiltro)
    switch (filtro) {
      case 'abertos':
        return t.filter((p) => PEDIDO_ABERTO.includes(p.status)).sort((a, b) => (a.data_prevista ?? '9').localeCompare(b.data_prevista ?? '9'))
      case 'recebidos':
        return t.filter((p) => p.status === 'recebido')
      case 'cancelados':
        return t.filter((p) => p.status === 'cancelado')
      default:
        return t
    }
  }, [pedidos, filtro, fornecedorFiltro])

  const todos = pedidos ?? []
  const esperando = todos.filter((p) => p.status === 'enviado').length
  const rascunhos = todos.filter((p) => p.status === 'rascunho').length
  const chegando = todos.filter(
    (p) => p.status === 'confirmado' && p.data_prevista && diasEntre(hoje, p.data_prevista) <= 2
  ).length
  const divergentes = todos.filter((p) => p.status === 'recebido' && p.divergente).length
  const nomeFornecedorFiltro = fornecedorFiltro ? fornecedores?.find((f) => f.id === fornecedorFiltro)?.nome : null

  function quando(p: PedidoResumo) {
    if (!p.data_prevista) return <span className="text-neutral-400">sem data</span>
    const d = diasEntre(hoje, p.data_prevista)
    const atrasado = p.status === 'confirmado' && d < 0
    return (
      <span className={atrasado ? 'font-semibold text-red-700' : ''}>
        {dataBR(p.data_prevista)}
        {PEDIDO_ABERTO.includes(p.status) && (
          <span className="ml-1 text-neutral-400">· {d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d < 0 ? `${-d}d atrás` : `${d}d`}</span>
        )}
      </span>
    )
  }

  return (
    <div>
      <PageTitle
        lead="COMPRAS"
        actions={
          pedirCompra && (
            <Button
              onClick={() => {
                abrir(null)
                setNovo(true)
              }}
            >
              + Novo pedido
            </Button>
          )
        }
      >
        Pedidos de compra
      </PageTitle>

      {msg && (
        <p className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-900">
          {msg}
          <button className="text-xs text-green-700" onClick={() => setMsg(null)}>
            ✕
          </button>
        </p>
      )}

      {/* ---------- indicadores ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Card>
          <div className="pg-key">Rascunhos</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">{rascunhos}</div>
        </Card>
        <Card>
          <div className="pg-key">Esperando o fornecedor</div>
          <div className={`pg-metric mt-2 text-[28px] leading-none ${esperando ? 'text-amber-700' : ''}`}>{esperando}</div>
        </Card>
        <Card>
          <div className="pg-key">Chega em até 2 dias</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">{chegando}</div>
        </Card>
        <Card>
          <div className="pg-key">Recebidos com divergência</div>
          <div className={`pg-metric mt-2 text-[28px] leading-none ${divergentes ? 'text-red-700' : ''}`}>{divergentes}</div>
        </Card>
      </div>

      {(novo || aberto) && fornecedores && (
        <PedidoDetalhe
          key={aberto?.id ?? 'novo'}
          pedido={aberto}
          daLista={novo ? daLista : null}
          fornecedores={fornecedores}
          eventos={eventos ?? []}
          onFechar={() => abrir(null)}
          onSalvo={(id, m) => {
            setMsg(m)
            abrir(id)
          }}
        />
      )}

      {/* ---------- lista ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                filtro === f.key ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]' : 'text-neutral-500 hover:text-[var(--pg-text)]'
              }`}
            >
              {f.label.toUpperCase()}
            </button>
          ))}
        </div>
        {nomeFornecedorFiltro && (
          <button
            className="text-xs text-neutral-500 underline"
            onClick={() => {
              const b = new URLSearchParams(busca)
              b.delete('fornecedor')
              setBusca(b, { replace: true })
            }}
          >
            só {nomeFornecedorFiltro} ✕
          </button>
        )}
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !lista.length ? (
          <EmptyState>Nenhum pedido neste filtro.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Nº</Th>
                  <Th>Fornecedor</Th>
                  <Th>Quando</Th>
                  <Th>Total</Th>
                  <Th>Pagamento</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => abrir(p.id)}
                    className={`cursor-pointer hover:bg-neutral-50 ${p.id === abertoId ? 'bg-neutral-50' : ''}`}
                  >
                    <Td className="font-mono text-xs">{p.numero ?? '—'}</Td>
                    <Td>
                      <span className="font-medium">{p.fornecedor_nome}</span>
                      <div className="text-xs text-neutral-500">
                        {p.itens_qtd} item(ns) · {p.forma === 'retirada' ? 'Pieggi retira' : 'entrega'}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs">{quando(p)}</Td>
                    <Td className="whitespace-nowrap font-semibold">{formatBRL(Number(p.valor_total))}</Td>
                    <Td className="text-xs text-neutral-500">
                      {rotuloCondicao(p.condicao_pagamento)}
                      {p.parcelas_total > 0 && (
                        <div>
                          {p.parcelas_pagas}/{p.parcelas_total} paga(s)
                        </div>
                      )}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <StatusPedidoBadge status={p.status} />
                        {p.divergente && <Badge tone="red">divergência</Badge>}
                        {p.forma === 'retirada' && PEDIDO_ABERTO.includes(p.status) && <Badge>retirada</Badge>}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
