// ============================================================
// DADOS DE COMPRAS — consultas que mais de uma tela usa
//
// Pedidos (Fornecedores mostra o resumo; Pedidos lista) e contas a pagar
// (Pagar e Caixa). A chave do React Query é a mesma em todas as telas:
// confirmar um pedido invalida 'pedidos' e 'pagar' e as duas pontas se
// atualizam juntas — é assim que compras e financeiro "conversam".
// ============================================================

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PedidoResumo, Payable, PurchaseOrderItem } from '@/tipos/compras'

export const CHAVE_PEDIDOS = ['pedidos'] as const
export const CHAVE_PAGAR = ['pagar'] as const

export function usePedidosResumo(enabled = true) {
  return useQuery({
    queryKey: CHAVE_PEDIDOS,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders_resumo')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PedidoResumo[]
    },
  })
}

export function useItensPedido(pedidoId: string | null) {
  return useQuery({
    queryKey: ['pedido-itens', pedidoId],
    enabled: Boolean(pedidoId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', pedidoId!)
        .order('ordem')
      if (error) throw error
      return (data ?? []) as PurchaseOrderItem[]
    },
  })
}

export function usePagarAbertos(enabled = true) {
  return useQuery({
    queryKey: CHAVE_PAGAR,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('payables_abertos').select('*').order('vencimento')
      if (error) throw error
      return (data ?? []) as Payable[]
    },
  })
}

/** eventos que ainda vão acontecer (ou aconteceram há pouco) para ligar item/conta */
export function useEventosParaLigar() {
  return useQuery({
    queryKey: ['eventos-para-ligar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, nome, pipeline, status, event_services(dia)')
        .neq('status', 'cancelado')
        .order('nome')
      if (error) throw error
      return ((data ?? []) as { id: string; nome: string; pipeline: string; event_services: { dia: string }[] | null }[]).map((e) => ({
        id: e.id,
        nome: e.nome,
        pipeline: e.pipeline,
        primeiroDia: (e.event_services ?? []).map((s) => s.dia).sort()[0] ?? null,
      }))
    },
  })
}
