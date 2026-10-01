// Situação do pedido de compra — a mesma cor em Pedidos, Fornecedores e
// no detalhe. Âmbar = esperando alguém (fornecedor responder).

import { Badge } from '@/components/ui'
import { STATUS_PEDIDO_LABEL, type StatusPedido } from '@/tipos/compras'

const TOM: Record<StatusPedido, 'neutral' | 'green' | 'amber' | 'red' | 'blue'> = {
  rascunho: 'neutral',
  enviado: 'amber',
  confirmado: 'blue',
  recebido: 'green',
  cancelado: 'red',
}

export function StatusPedidoBadge({ status }: { status: StatusPedido }) {
  return <Badge tone={TOM[status]}>{STATUS_PEDIDO_LABEL[status]}</Badge>
}
