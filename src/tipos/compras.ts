// ============================================================
// TIPOS — Compras e Financeiro (migration 0036)
//
// Fornecedor de COMPRA (o mesmo cadastro que a logística usa para a
// retirada, com os campos de pagamento), pedido de compra, conta a pagar.
// Os campos novos do fornecedor são opcionais de propósito: o cadastro
// antigo (0033) continua válido e a tela pede para completar.
// ============================================================

import type { Fornecedor } from '@/types'

// ---------- fornecedor ----------
export type CategoriaFornecedor =
  | 'hortifruti'
  | 'salgados'
  | 'frios'
  | 'bebidas'
  | 'descartaveis'
  | 'embalagens'
  | 'outros'

export const CATEGORIA_FORNECEDOR_LABEL: Record<CategoriaFornecedor, string> = {
  hortifruti: 'Hortifrúti',
  salgados: 'Salgados',
  frios: 'Frios',
  bebidas: 'Bebidas',
  descartaveis: 'Descartáveis',
  embalagens: 'Embalagens',
  outros: 'Outros',
}

export type FormaPagamento = 'pix' | 'boleto' | 'transferencia'

export const FORMA_PAGAMENTO_LABEL: Record<FormaPagamento, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  transferencia: 'Transferência',
}

export interface FornecedorCompra extends Fornecedor {
  cnpj?: string | null
  categoria?: CategoriaFornecedor | null
  /** 'avista' | '7' | '14' | '21' | '28' | '14/28' — ver CONDICOES em engine/financeiro */
  condicao_pagamento?: string | null
  forma_pagamento?: FormaPagamento | null
  pix?: string | null
}

// ---------- pedido de compra ----------
export type StatusPedido = 'rascunho' | 'enviado' | 'confirmado' | 'recebido' | 'cancelado'

export const STATUS_PEDIDO_LABEL: Record<StatusPedido, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  confirmado: 'Confirmado',
  recebido: 'Recebido',
  cancelado: 'Cancelado',
}

export type FormaEntrega = 'retirada' | 'entrega'

export interface PurchaseOrder {
  id: string
  numero: number | null
  fornecedor_id: string
  status: StatusPedido
  forma: FormaEntrega
  data_prevista: string | null
  condicao_pagamento: string | null
  forma_pagamento: FormaPagamento | null
  valor_total: number
  obs: string | null
  criado_por: string | null
  enviado_em: string | null
  confirmado_em: string | null
  recebido_em: string | null
  cancelado_em: string | null
  created_at: string
}

/** linha da view purchase_orders_resumo */
export interface PedidoResumo extends PurchaseOrder {
  fornecedor_nome: string | null
  fornecedor_telefone: string | null
  itens_qtd: number
  divergente: boolean
  parcelas_total: number
  parcelas_pagas: number
  valor_pago: number
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  descricao: string
  quantidade: number
  unidade: string
  preco_unitario: number | null
  event_id: string | null
  quantidade_recebida: number | null
  ordem?: number
}

// ---------- contas a pagar ----------
export type CategoriaPagar = 'insumos' | 'freelancer' | 'transporte' | 'aluguel' | 'impostos' | 'outros'

export const CATEGORIA_PAGAR_LABEL: Record<CategoriaPagar, string> = {
  insumos: 'Insumos',
  freelancer: 'Freelancer',
  transporte: 'Transporte',
  aluguel: 'Aluguel',
  impostos: 'Impostos',
  outros: 'Outros',
}

export type StatusPagar = 'a_pagar' | 'pago' | 'cancelado'

export interface Payable {
  id: string
  fornecedor_id: string | null
  purchase_order_id: string | null
  event_staff_id: string | null
  freelancer_id: string | null
  event_id: string | null
  categoria: CategoriaPagar
  descricao: string
  parcela: number
  parcelas: number
  valor: number
  vencimento: string
  status: StatusPagar
  valor_pago: number | null
  pago_em: string | null
  forma_pagamento: string | null
  obs: string | null
  // ---- só na view payables_abertos (derivados, nunca guardados) ----
  atrasado?: boolean
  dias_ate_vencer?: number
  fornecedor_nome?: string | null
  pedido_numero?: number | null
  pedido_divergente?: boolean
  freelancer_nome?: string | null
  evento_nome?: string | null
}

/** item que vem da Lista de compras para virar pedido (estado de navegação) */
export interface ItemDaLista {
  descricao: string
  quantidade: number
  unidade: string
  event_id: string | null
}

export interface NovoPedidoDaLista {
  origem: string
  itens: ItemDaLista[]
  /** sugestão de fornecedor pelo título da seção ("LETÍCIA" → fo-leticia) */
  fornecedorChave?: string | null
  /** os eventos que entraram NA LISTA consolidada (não a seleção atual) */
  eventosDaLista?: string[]
}
