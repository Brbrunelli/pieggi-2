// ============================================================
// RECEBER MERCADORIA — a porta da cozinha
//
// Decisão do Bruno (01/10): a Bia recebe. A produção não vê preço de
// nada, então esta tela não lê os pedidos: chama compras_a_receber(),
// que devolve só fornecedor, data e itens com quantidade. Quem confere
// digita o que chegou; divergência vira aviso para compras e financeiro.
// ============================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, PageTitle } from '@/components/ui'
import Recebimento from '@/components/compras/Recebimento'
import { formatDiaMes } from '@/engine'
import { hojeLocal } from '@/engine/datas'
import type { PurchaseOrderItem } from '@/tipos/compras'

interface PedidoPorta {
  id: string
  numero: number | null
  forma: 'retirada' | 'entrega'
  data_prevista: string | null
  fornecedor_nome: string | null
  itens: PurchaseOrderItem[]
}

export default function Receber() {
  const { verCompras } = usePermissoes()
  const [aberto, setAberto] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const hoje = hojeLocal()

  const { data, isLoading } = useQuery({
    queryKey: ['a-receber-porta'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('compras_a_receber')
      if (error) throw error
      return ((data ?? []) as PedidoPorta[]).map((p) => ({
        ...p,
        itens: p.itens.map((i) => ({ ...i, preco_unitario: null })),
      }))
    },
  })

  const pedido = (data ?? []).find((p) => p.id === aberto)

  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle lead="COMPRAS">Receber mercadoria</PageTitle>
      {msg && <p className="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">✅ {msg}</p>}

      {pedido ? (
        <>
          <Button variant="ghost" className="mb-3 !px-0" onClick={() => setAberto(null)}>
            ← Voltar para a lista
          </Button>
          <p className="mb-3 text-sm text-neutral-600">
            <b>{pedido.fornecedor_nome ?? 'Fornecedor'}</b>
            {pedido.data_prevista && ` · previsto para ${formatDiaMes(pedido.data_prevista)}`}
          </p>
          <Recebimento
            pedidoId={pedido.id}
            numero={pedido.numero}
            itens={pedido.itens}
            semPreco={!verCompras}
            onPronto={(m) => {
              setMsg(m)
              setAberto(null)
            }}
          />
        </>
      ) : isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !data?.length ? (
        <EmptyState>Nenhuma mercadoria esperada. Pedido só aparece aqui depois de confirmado com o fornecedor.</EmptyState>
      ) : (
        <Card>
          <div className="flex flex-col divide-y divide-[var(--pg-border)]">
            {data.map((p) => {
              const atrasado = p.data_prevista != null && p.data_prevista < hoje
              return (
                <button
                  key={p.id}
                  onClick={() => {
                    setMsg(null)
                    setAberto(p.id)
                  }}
                  className="flex items-center gap-3 py-3 text-left hover:bg-[var(--pg-border)]/30"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">
                      {p.fornecedor_nome ?? 'Fornecedor'} <span className="font-normal text-neutral-400">· pedido {p.numero ?? '—'}</span>
                    </div>
                    <div className="truncate text-xs text-neutral-500">
                      {p.itens.map((i) => `${Number(i.quantidade).toLocaleString('pt-BR')} ${i.unidade} ${i.descricao}`).join(' · ')}
                    </div>
                  </div>
                  {p.forma === 'retirada' && <Badge tone="neutral">retirada</Badge>}
                  <Badge tone={atrasado ? 'red' : p.data_prevista === hoje ? 'amber' : 'neutral'}>
                    {p.data_prevista ? (p.data_prevista === hoje ? 'hoje' : formatDiaMes(p.data_prevista)) : 'sem data'}
                  </Badge>
                </button>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
