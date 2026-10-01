// ============================================================
// CENÁRIOS — Compras e Financeiro — fornecedores, pedidos de compra,
// contas a pagar e fluxo de caixa
//
// A semana hipotética, do lado do dinheiro:
//   #1 Treinamento Aurora (há 5 dias): hortifrúti recebido e PAGO.
//   #2 IA para Negócios: descartáveis recebidos com DIVERGÊNCIA (vieram
//      8 caixas de copo em vez de 10) — a conta a pagar ainda está aberta.
//   #3 Convenção Aurora: bebidas CONFIRMADO em 14/28 dias → 2 parcelas.
//   #4 Convenção Aurora: 450 coxinhas na Letícia, RETIRADA amanhã, à vista.
//   #5 Convenção Aurora: queijos na Leal ENVIADO, esperando confirmação.
//   #6 Convenção Aurora: frutas no Ceagesp em RASCUNHO, dois itens sem
//      preço — não deixa confirmar.
//   Contas a pagar: manutenção da câmara fria ATRASADA; aluguel, folha e
//   impostos no começo da semana que vem → o fluxo de caixa (saldo inicial
//   em branco) fica NEGATIVO a partir de hoje+6 até o saldo do IA entrar.
//   Diárias do Treinamento Aurora já pagas (Joana); as do IA de hoje
//   ainda não → o botão "Gerar pagamento das diárias" tem o que fazer.
//
// Valores são de CENÁRIO (para a tela ficar viva), não regra de negócio.
// Os fornecedores da rua (Letícia, Leal…) não têm os campos novos: a
// tela mostra "completar cadastro" — de propósito.
// ============================================================

import type { Linha, Tabelas } from '../banco'
import { novoId } from '../banco'
import { getSessaoDemoId } from '../sessao'
import { agruparDiarias, gerarParcelas, pendenciasConfirmar, totalItens } from '@/engine/financeiro'
import { dia, E, quando, U, type AreaCenario } from './tipos'
import { hojeLocal } from '@/engine/datas'

type Args = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

// ---------- fornecedores novos (já com os campos de compra) ----------
const fornecedores: Linha[] = [
  {
    id: 'fo-ceagesp', chave: 'ceagesp', nome: 'Hortifrúti Ceagesp — Box 14',
    endereco: 'Av. Dr. Gastão Vidigal, 1.946 — Vila Leopoldina, SP', complemento: 'Pavilhão MLP, box 14',
    contato: 'Seu Toninho', telefone: '(11) 93333-1401', horario: 'seg–sáb 5h–11h', obs: 'Chegar antes das 8h.',
    cnpj: '11.222.333/0001-44', categoria: 'hortifruti', condicao_pagamento: '7', forma_pagamento: 'boleto', pix: null,
  },
  {
    id: 'fo-descart', chave: 'descartaveis', nome: 'Descartáveis Paulista',
    endereco: 'Rua da Mooca, 2.300 — Mooca, SP', complemento: null,
    contato: 'Cláudia', telefone: '(11) 93333-2202', horario: 'seg–sex 8h–17h', obs: 'Entrega em até 2 dias úteis.',
    cnpj: '22.333.444/0001-55', categoria: 'descartaveis', condicao_pagamento: '28', forma_pagamento: 'boleto', pix: null,
  },
  {
    id: 'fo-bebidas', chave: 'bebidas', nome: 'Bebidas Distribuidora SP',
    endereco: 'Av. Presidente Wilson, 4.500 — Ipiranga, SP', complemento: 'Doca 3',
    contato: 'Rodrigo', telefone: '(11) 93333-3303', horario: 'seg–sex 7h–16h', obs: null,
    cnpj: '33.444.555/0001-66', categoria: 'bebidas', condicao_pagamento: '14/28', forma_pagamento: 'boleto', pix: null,
  },
  {
    id: 'fo-embala', chave: 'embalagens', nome: 'Embala Fácil',
    endereco: null, complemento: null,
    contato: 'Vendas', telefone: '(11) 93333-4404', horario: null, obs: 'Só entrega — não tem balcão.',
    cnpj: '44.555.666/0001-77', categoria: 'embalagens', condicao_pagamento: 'avista', forma_pagamento: 'pix', pix: '44.555.666/0001-77',
  },
].map((f) => ({ ...f, ativo: true, created_at: quando(-40) }))

// ---------- pedidos ----------
const pedido = (id: string, numero: number, extra: Linha): Linha => ({
  id,
  numero,
  status: 'rascunho',
  forma: 'entrega',
  data_prevista: null,
  condicao_pagamento: 'avista',
  forma_pagamento: 'boleto',
  valor_total: 0,
  obs: null,
  criado_por: U.compras,
  enviado_em: null,
  confirmado_em: null,
  recebido_em: null,
  cancelado_em: null,
  created_at: quando(-10),
  updated_at: quando(-1),
  ...extra,
})

const item = (
  po: string,
  ordem: number,
  descricao: string,
  quantidade: number,
  unidade: string,
  preco: number | null,
  event_id: string | null,
  recebida: number | null = null
): Linha => ({
  id: `${po}-i${ordem}`,
  purchase_order_id: po,
  descricao,
  quantidade,
  unidade,
  preco_unitario: preco,
  event_id,
  quantidade_recebida: recebida,
  ordem,
  created_at: quando(-10),
})

const purchase_order_items: Linha[] = [
  // #1 Treinamento Aurora — recebido certinho
  item('po-1', 1, 'Abacaxi pérola', 8, 'un', 9.5, E.treino, 8),
  item('po-1', 2, 'Mamão formosa', 6, 'un', 12, E.treino, 6),
  item('po-1', 3, 'Uva sem semente', 4, 'kg', 18, E.treino, 4),
  // #2 IA para Negócios — copo veio a menos
  item('po-2', 1, 'Guardanapo de papel 22x22', 20, 'pct', 6.9, E.ia, 20),
  item('po-2', 2, 'Copo descartável 200 ml (cx 2.500)', 10, 'cx', 89, E.ia, 8),
  item('po-2', 3, 'Mexedor de madeira', 5, 'pct', 14, E.ia, 5),
  // #3 Convenção Aurora — bebidas
  item('po-3', 1, 'Coca-Cola lata 350 ml (fardo 12)', 25, 'fardo', 42, E.aurora),
  item('po-3', 2, 'Coca-Cola Zero lata 350 ml (fardo 12)', 15, 'fardo', 42, E.aurora),
  item('po-3', 3, 'Água Lindóia 500 ml (fardo 12)', 30, 'fardo', 18.5, E.aurora),
  item('po-3', 4, 'Suco Natural One 1,7 L', 24, 'un', 26.9, E.aurora),
  // #4 Letícia — retirada
  item('po-4', 1, 'Mini coxinha de frango', 450, 'un', 1.2, E.aurora),
  item('po-4', 2, 'Mini quibe', 150, 'un', 1.1, E.aurora),
  // #5 Leal — enviado
  item('po-5', 1, 'Queijo minas frescal', 6, 'kg', 38, E.aurora),
  item('po-5', 2, 'Peito de peru defumado fatiado', 4, 'kg', 64, E.aurora),
  // #6 Ceagesp — rascunho, preço a passar
  item('po-6', 1, 'Abacaxi pérola', 14, 'un', 9.5, E.aurora),
  item('po-6', 2, 'Mamão formosa', 10, 'un', null, E.aurora),
  item('po-6', 3, 'Morango (bandeja 250 g)', 24, 'bdj', null, E.aurora),
]

const total = (po: string) => totalItens(purchase_order_items.filter((i) => i.purchase_order_id === po) as never)

const purchase_orders: Linha[] = [
  pedido('po-1', 1, {
    fornecedor_id: 'fo-ceagesp', status: 'recebido', data_prevista: dia(-6), condicao_pagamento: 'avista',
    valor_total: total('po-1'), enviado_em: quando(-9), confirmado_em: quando(-8), recebido_em: quando(-6, '07:30'),
    created_at: quando(-10),
  }),
  pedido('po-2', 2, {
    fornecedor_id: 'fo-descart', status: 'recebido', data_prevista: dia(-2), condicao_pagamento: '28',
    valor_total: total('po-2'), enviado_em: quando(-6), confirmado_em: quando(-5), recebido_em: quando(-2, '14:00'),
    obs: 'Entregar na cozinha, portão lateral.', created_at: quando(-7),
  }),
  pedido('po-3', 3, {
    fornecedor_id: 'fo-bebidas', status: 'confirmado', data_prevista: dia(2), condicao_pagamento: '14/28',
    valor_total: total('po-3'), enviado_em: quando(-3), confirmado_em: quando(-2), created_at: quando(-3),
  }),
  pedido('po-4', 4, {
    fornecedor_id: 'fo-leticia', status: 'confirmado', forma: 'retirada', data_prevista: dia(1), condicao_pagamento: 'avista',
    forma_pagamento: 'pix', valor_total: total('po-4'), enviado_em: quando(-2), confirmado_em: quando(-2, '16:00'),
    obs: 'Retirada 13h — levar 3 caixas térmicas.', created_at: quando(-2),
  }),
  pedido('po-5', 5, {
    fornecedor_id: 'fo-leal', status: 'enviado', data_prevista: dia(2), condicao_pagamento: '14',
    valor_total: total('po-5'), enviado_em: quando(0, '08:20'), created_at: quando(-1),
  }),
  pedido('po-6', 6, {
    fornecedor_id: 'fo-ceagesp', status: 'rascunho', data_prevista: dia(2), condicao_pagamento: '7',
    valor_total: total('po-6'), obs: 'Salada de frutas da Convenção — confirmar preço do morango.', created_at: quando(0, '09:00'),
  }),
]

// ---------- contas a pagar ----------
const pagar = (id: string, extra: Linha): Linha => ({
  id,
  fornecedor_id: null,
  purchase_order_id: null,
  event_staff_id: null,
  freelancer_id: null,
  event_id: null,
  categoria: 'outros',
  parcela: 1,
  parcelas: 1,
  status: 'a_pagar',
  valor_pago: null,
  pago_em: null,
  forma_pagamento: null,
  obs: null,
  created_by: U.financeiro,
  created_at: quando(-8),
  updated_at: quando(-1),
  ...extra,
})

/** as parcelas que a confirmação gerou — mesma função do sistema */
function parcelasDo(po: Linha, pago = false): Linha[] {
  const forn = fornecedores.find((f) => f.id === po.fornecedor_id)?.nome ?? (po.fornecedor_id === 'fo-leticia' ? 'Letícia Salgados' : 'Fornecedor')
  return gerarParcelas(po.valor_total, po.condicao_pagamento, po.data_prevista).map((p) =>
    pagar(`pg-${po.id}-${p.parcela}`, {
      fornecedor_id: po.fornecedor_id,
      purchase_order_id: po.id,
      event_id: purchase_order_items.find((i) => i.purchase_order_id === po.id)?.event_id ?? null,
      categoria: 'insumos',
      descricao: `Pedido ${po.numero} — ${forn}`,
      ...p,
      forma_pagamento: po.forma_pagamento,
      ...(pago ? { status: 'pago', valor_pago: p.valor, pago_em: p.vencimento } : {}),
      created_by: U.compras,
      created_at: po.confirmado_em,
    })
  )
}

const payables: Linha[] = [
  ...parcelasDo(purchase_orders[0], true), // #1 pago na hora (à vista)
  ...parcelasDo(purchase_orders[1]), // #2 vence em 26 dias, com divergência
  ...parcelasDo(purchase_orders[2]), // #3 duas parcelas
  ...parcelasDo(purchase_orders[3]), // #4 à vista na retirada (amanhã)
  // diária do Treinamento Aurora — já paga (Joana); o Diego faltou
  pagar('pg-diaria-joana', {
    freelancer_id: 'f-2', event_id: E.treino, event_staff_id: 'es-7', categoria: 'freelancer',
    descricao: `Diárias — Joana Lima (1 diária, ${dia(-5).split('-').reverse().join('/')}) · PIX: (11) 95555-0002`,
    valor: 180, vencimento: dia(-3), status: 'pago', valor_pago: 180, pago_em: dia(-3), forma_pagamento: 'pix',
  }),
  pagar('pg-combustivel', {
    categoria: 'transporte', descricao: 'Combustível — Fiorino e Kombi (setembro)',
    valor: 1240, vencimento: dia(-6), status: 'pago', valor_pago: 1240, pago_em: dia(-6), forma_pagamento: 'pix',
  }),
  pagar('pg-camara', {
    categoria: 'outros', descricao: 'Manutenção da câmara fria — FrioTec',
    valor: 1850, vencimento: dia(-3), forma_pagamento: 'boleto', obs: 'Técnico veio dia 22. Boleto no e-mail do financeiro.',
  }),
  pagar('pg-van-aurora', {
    categoria: 'transporte', event_id: E.aurora, descricao: 'Van extra — Convenção Aurora (150 pax)',
    valor: 650, vencimento: dia(3), forma_pagamento: 'pix',
  }),
  pagar('pg-aluguel', {
    categoria: 'aluguel', descricao: 'Aluguel da cozinha — mês corrente',
    valor: 9500, vencimento: dia(5), forma_pagamento: 'boleto',
  }),
  pagar('pg-folha', {
    categoria: 'outros', descricao: 'Folha — equipe fixa',
    valor: 21400, vencimento: dia(5), forma_pagamento: 'transferencia',
  }),
  pagar('pg-impostos', {
    categoria: 'impostos', descricao: 'DAS / ISS do mês',
    valor: 7300, vencimento: dia(6), forma_pagamento: 'boleto',
  }),
]

// diária do Paulo (IA, hoje) — título JÁ GERADO e em aberto: cancelar
// solta a diária, que volta para "Gerar pagamento das diárias"
payables.push(
  pagar('pg-diaria-paulo', {
    freelancer_id: 'f-3', event_id: E.ia, event_staff_id: 'es-3', categoria: 'freelancer',
    descricao: `Diárias — Paulo Santos (1 diária, ${dia(0).split('-').reverse().join('/')}) · PIX: (11) 95555-0003`,
    valor: 200, vencimento: dia(2), forma_pagamento: 'pix', created_at: quando(0, '08:00'),
  })
)

// diária já paga ↔ título
const payable_diarias: Linha[] = [
  { payable_id: 'pg-diaria-joana', event_staff_id: 'es-7' },
  { payable_id: 'pg-diaria-paulo', event_staff_id: 'es-3' },
]

// Duas diárias do Treinamento Aurora que a escala da rua não tem, para a
// prévia de pagamento mostrar os dois avisos novos (somam-se às da rua):
//   • Rafaela trabalhou SEM CONTRATO (só tem ASO) → selo vermelho;
//   • um ajudante avulso, sem cadastro e SEM VALOR → fica fora do lote.
const extraStaff = (id: string, f: string | null, nome: string, funcao: string, valor: number | null): Linha => ({
  id, event_id: E.treino, freelancer_id: f, nome, funcao, dia: dia(-5),
  horario_saida: '05:00', horario_fim: '18:30', valor, status: 'presente', avaliacao: null,
  obs: f ? null : 'Avulso indicado pelo Diego — combinar valor', created_at: quando(-6),
})
const event_staff: Linha[] = [
  extraStaff('es-cp-1', 'f-4', 'Rafaela Costa', 'copeira', 180),
  extraStaff('es-cp-2', null, 'Seu Zé (avulso)', 'ajudante de carga', null),
]

// ---------- views (mesmas regras do SQL da 0036) ----------
const hoje = () => hojeLocal()

function divergente(b: Tabelas, poId: string | null): boolean {
  if (!poId) return false
  return (b.purchase_order_items ?? []).some(
    (i) => i.purchase_order_id === poId && i.quantidade_recebida != null && Number(i.quantidade_recebida) !== Number(i.quantidade)
  )
}

function papel(b: Tabelas): string | null {
  return (b.profiles ?? []).find((p) => p.id === getSessaoDemoId())?.role ?? null
}

function nomeFornecedor(b: Tabelas, id: string | null): string | null {
  return (b.fornecedores ?? []).find((f) => f.id === id)?.nome ?? null
}

const views: AreaCenario['views'] = {
  payables_abertos: (b) =>
    (b.payables ?? [])
      .filter((p) => p.status !== 'cancelado')
      .map((p) => {
        const dias = Math.round((new Date(p.vencimento).getTime() - new Date(hoje()).getTime()) / 86400000)
        const po = (b.purchase_orders ?? []).find((x) => x.id === p.purchase_order_id)
        return {
          ...p,
          atrasado: p.status === 'a_pagar' && p.vencimento < hoje(),
          dias_ate_vencer: dias,
          fornecedor_nome: nomeFornecedor(b, p.fornecedor_id),
          pedido_numero: po?.numero ?? null,
          pedido_divergente: divergente(b, p.purchase_order_id),
          freelancer_nome: (b.freelancers ?? []).find((f) => f.id === p.freelancer_id)?.nome ?? null,
          evento_nome: (b.events ?? []).find((e) => e.id === p.event_id)?.nome ?? null,
        }
      }),

  purchase_orders_resumo: (b) => {
    const pos = b.purchase_orders ?? []
    // o identity do SQL: pedido novo ganha o próximo número
    let max = Math.max(0, ...pos.map((p) => Number(p.numero ?? 0)))
    for (const p of [...pos].sort((x, y) => String(x.created_at).localeCompare(String(y.created_at))))
      if (p.numero == null) p.numero = ++max
    return pos.map((po) => {
      const f = (b.fornecedores ?? []).find((x) => x.id === po.fornecedor_id)
      const parc = (b.payables ?? []).filter((p) => p.purchase_order_id === po.id && p.status !== 'cancelado')
      const pagas = parc.filter((p) => p.status === 'pago')
      return {
        ...po,
        fornecedor_nome: f?.nome ?? null,
        fornecedor_telefone: f?.telefone ?? null,
        itens_qtd: (b.purchase_order_items ?? []).filter((i) => i.purchase_order_id === po.id).length,
        divergente: divergente(b, po.id),
        parcelas_total: parc.length,
        parcelas_pagas: pagas.length,
        valor_pago: pagas.reduce((t, p) => t + Number(p.valor_pago ?? p.valor), 0),
      }
    })
  },
}

// ---------- rpcs (mesmas travas da 0036) ----------
const rpcs: AreaCenario['rpcs'] = {
  compra_confirmar: (a: Args, b: Tabelas) => {
    if (!['admin', 'compras'].includes(papel(b) ?? '')) throw new Error('Só compras ou admin confirmam pedido.')
    const po = (b.purchase_orders ?? []).find((x) => x.id === a.p_pedido)
    if (!po) throw new Error('Pedido não encontrado.')
    if (!['rascunho', 'enviado'].includes(po.status)) throw new Error(`O pedido ${po.numero} está ${po.status}, não dá para confirmar.`)
    const itens = (b.purchase_order_items ?? []).filter((i) => i.purchase_order_id === po.id)
    const falta = pendenciasConfirmar({ data_prevista: po.data_prevista, itens: itens as never })
    if (falta.length) throw new Error(falta.join('\n'))
    const valor = totalItens(itens as never)
    const eventos = [...new Set(itens.map((i) => i.event_id))]
    const evento = eventos.length === 1 ? eventos[0] : null
    const forn = nomeFornecedor(b, po.fornecedor_id) ?? 'Fornecedor'
    const parcelas = gerarParcelas(valor, po.condicao_pagamento, po.data_prevista)
    b.payables ??= []
    for (const p of parcelas)
      b.payables.push(
        pagar(novoId(), {
          fornecedor_id: po.fornecedor_id,
          purchase_order_id: po.id,
          event_id: evento,
          categoria: 'insumos',
          descricao: `Pedido ${po.numero} — ${forn}`,
          ...p,
          forma_pagamento: po.forma_pagamento,
          created_by: getSessaoDemoId(),
          created_at: new Date().toISOString(),
        })
      )
    Object.assign(po, { status: 'confirmado', confirmado_em: new Date().toISOString(), valor_total: valor })
    return parcelas.length
  },

  compra_cancelar: (a: Args, b: Tabelas) => {
    if (!['admin', 'compras'].includes(papel(b) ?? '')) throw new Error('Só compras ou admin cancelam pedido.')
    const po = (b.purchase_orders ?? []).find((x) => x.id === a.p_pedido)
    if (!po) throw new Error('Pedido não encontrado.')
    if (['recebido', 'cancelado'].includes(po.status)) throw new Error(`Pedido ${po.status} não pode ser cancelado.`)
    let n = 0
    for (const p of b.payables ?? [])
      if (p.purchase_order_id === po.id && p.status === 'a_pagar') {
        p.status = 'cancelado'
        p.obs = [p.obs, 'pedido cancelado'].filter(Boolean).join(' · ')
        n++
      }
    Object.assign(po, { status: 'cancelado', cancelado_em: new Date().toISOString() })
    return n
  },

  // a porta da cozinha (produção) recebe sem ver preço — espelho da função SQL
  compras_a_receber: (_a: Args, b: Tabelas) => {
    if (!['admin', 'compras', 'logistica', 'producao'].includes(papel(b) ?? '')) return []
    return (b.purchase_orders ?? [])
      .filter((po) => po.status === 'confirmado')
      .sort((x, y) => String(x.data_prevista ?? '9').localeCompare(String(y.data_prevista ?? '9')))
      .map((po) => ({
        id: po.id,
        numero: po.numero,
        forma: po.forma,
        data_prevista: po.data_prevista,
        fornecedor_nome: (b.fornecedores ?? []).find((f) => f.id === po.fornecedor_id)?.nome ?? null,
        itens: (b.purchase_order_items ?? [])
          .filter((i) => i.purchase_order_id === po.id)
          .map((i) => ({
            id: i.id,
            purchase_order_id: i.purchase_order_id,
            descricao: i.descricao,
            quantidade: i.quantidade,
            unidade: i.unidade,
            event_id: i.event_id,
            quantidade_recebida: i.quantidade_recebida,
          })),
      }))
  },

  compra_receber: (a: Args, b: Tabelas) => {
    if (!['admin', 'compras', 'logistica', 'producao'].includes(papel(b) ?? ''))
      throw new Error('Só compras, logística, produção ou admin recebem mercadoria.')
    const po = (b.purchase_orders ?? []).find((x) => x.id === a.p_pedido)
    if (!po) throw new Error('Pedido não encontrado.')
    if (po.status !== 'confirmado') throw new Error(`Só pedido confirmado é recebido (este está ${po.status}).`)
    const itens = (b.purchase_order_items ?? []).filter((i) => i.purchase_order_id === po.id)
    const conferido = new Map(((a.p_itens ?? []) as { id: string; quantidade_recebida: number | null }[]).map((x) => [x.id, x.quantidade_recebida]))
    const novos = itens.map((i) => (conferido.has(i.id) ? conferido.get(i.id) : i.quantidade_recebida))
    if (novos.some((q) => q == null)) throw new Error('Falta conferir item. Se não veio, informe 0.')
    itens.forEach((i, k) => (i.quantidade_recebida = novos[k]))
    Object.assign(po, { status: 'recebido', recebido_em: new Date().toISOString() })
    return itens.filter((i) => Number(i.quantidade_recebida) !== Number(i.quantidade)).length
  },

  payables_cancelar: (a: Args, b: Tabelas) => {
    if (!['admin', 'financeiro'].includes(papel(b) ?? '')) throw new Error('Só o financeiro ou o admin cancelam conta a pagar.')
    const p = (b.payables ?? []).find((x) => x.id === a.p_id)
    if (!p) throw new Error('Conta não encontrada.')
    if (p.status !== 'a_pagar') throw new Error(`Só conta a pagar em aberto é cancelada (esta está ${p.status}).`)
    if (p.purchase_order_id) throw new Error('Conta de pedido: cancele o pedido em Compras.')
    p.status = 'cancelado'
    // o trigger payables_solta_diarias da 0036: a diária volta a poder ser gerada
    const lista = b.payable_diarias ?? []
    let soltas = 0
    for (let k = lista.length - 1; k >= 0; k--)
      if (lista[k].payable_id === p.id) {
        lista.splice(k, 1)
        soltas++
      }
    return soltas
  },

  payables_gerar_diarias: (a: Args, b: Tabelas) => {
    if (!['admin', 'financeiro'].includes(papel(b) ?? '')) throw new Error('Só o financeiro ou o admin geram pagamento de diárias.')
    const ja = new Set((b.payable_diarias ?? []).map((d) => d.event_staff_id))
    const grupos = agruparDiarias(b.event_staff as never, (b.freelancers ?? []) as never, ja, a.p_de, a.p_ate)
    b.payables ??= []
    b.payable_diarias ??= []
    for (const g of grupos) {
      const id = novoId()
      b.payables.push(
        pagar(id, {
          freelancer_id: g.freelancer_id,
          event_id: g.eventIds.length === 1 ? g.eventIds[0] : null,
          event_staff_id: g.staffIds.length === 1 ? g.staffIds[0] : null,
          categoria: 'freelancer',
          descricao: g.descricao,
          valor: g.valor,
          vencimento: a.p_vencimento,
          forma_pagamento: 'pix',
          created_by: getSessaoDemoId(),
          created_at: new Date().toISOString(),
        })
      )
      for (const s of g.staffIds) b.payable_diarias.push({ payable_id: id, event_staff_id: s })
    }
    return grupos.length
  },
}

export const compras: AreaCenario = {
  tabelas: () => ({ fornecedores, purchase_orders, purchase_order_items, payables, payable_diarias, event_staff }),
  views,
  rpcs,
  padroes: {
    purchase_orders: {
      numero: null, status: 'rascunho', forma: 'entrega', condicao_pagamento: 'avista', forma_pagamento: null,
      valor_total: 0, obs: null, enviado_em: null, confirmado_em: null, recebido_em: null, cancelado_em: null,
    },
    purchase_order_items: { unidade: 'un', quantidade: 0, preco_unitario: null, event_id: null, quantidade_recebida: null, ordem: 0 },
    payables: {
      status: 'a_pagar', categoria: 'outros', parcela: 1, parcelas: 1, valor_pago: null, pago_em: null,
      fornecedor_id: null, purchase_order_id: null, event_staff_id: null, freelancer_id: null, event_id: null,
      forma_pagamento: null, obs: null,
    },
  },
  roteiro: [
    {
      rota: '/compras/receber',
      titulo: 'Receber mercadoria (porta da cozinha)',
      cenario:
        'A Bia recebe sem ver preço: estão esperados as bebidas da Distribuidora (daqui a 2 dias) e a retirada de mini coxinhas na Letícia (amanhã). Divergência vira aviso para compras e financeiro.',
      testar: [
        'Ver como Beatriz (produção): abrir a Distribuidora, digitar uma quantidade menor num item e registrar',
        'Ver como Rita (compras) em Pedidos de compra: o pedido aparece recebido, com a divergência',
      ],
      papel: 'producao',
    },
    {
      rota: '/compras/pedidos',
      titulo: 'Pedidos de compra',
      cenario:
        'Semana da Convenção Aurora: as bebidas já estão confirmadas (2 parcelas no financeiro), as 450 coxinhas saem da Letícia amanhã por retirada, os queijos da Leal esperam resposta e as frutas do Ceagesp estão em rascunho com dois itens sem preço. Os descartáveis do IA chegaram com 2 caixas de copo a menos.',
      testar: [
        'Abrir o pedido 6 (rascunho) e tentar confirmar: o sistema lista o que falta. Preencha os preços e confirme — as contas a pagar nascem sozinhas',
        'No pedido 5, "Mandar no WhatsApp" abre a mensagem pronta para a Leal',
        'No pedido 3, cancelar e ver a mensagem "2 conta(s) a pagar canceladas". Depois trocar o papel para Financeiro e conferir em Contas a pagar que as parcelas sumiram',
        'Trocar para Logística, abrir o pedido 4 (confirmado) e usar "Receber mercadoria": no celular, digitar o que chegou',
      ],
      papel: 'compras',
    },
    {
      rota: '/compras/fornecedores',
      titulo: 'Fornecedores (cadastro de compra)',
      cenario:
        'O cadastro de quem vende para a Pieggi: CNPJ, categoria, prazo e forma de pagamento — e onde retirar, que a logística usa. A Letícia e a Leal vieram da logística sem os dados de compra: aparecem com "completar cadastro".',
      testar: [
        'Editar a Letícia: categoria Salgados, à vista, PIX',
        'Ver a coluna "Em aberto / comprado no mês" de cada fornecedor',
      ],
      papel: 'compras',
    },
    {
      rota: '/compras',
      titulo: 'Lista de compras → pedido',
      cenario:
        'A lista consolidada continua igual. Embaixo de cada seção há um botão discreto "Gerar pedido ao fornecedor" que leva os itens para um pedido novo, já com o fornecedor sugerido pelo título da seção.',
      testar: [
        'Selecionar a Convenção Aurora, consolidar e clicar em "Gerar pedido ao fornecedor" numa seção: os itens já vêm ligados ao evento',
        'Repetir com IA para Negócios + Convenção Aurora juntos: o pedido avisa em âmbar para ligar cada item ao seu evento',
        'No pedido aberto, conferir os itens e passar os preços',
      ],
      papel: 'compras',
    },
    {
      rota: '/financeiro/pagar',
      titulo: 'Contas a pagar',
      cenario:
        'A manutenção da câmara fria está ATRASADA. Os pedidos confirmados já viraram títulos (o dos descartáveis com aviso de divergência). A Maria e a Joana trabalharam hoje no IA para Negócios e ainda não têm pagamento; o do Paulo já foi gerado. No Treinamento Aurora, a Rafaela trabalhou sem contrato e um ajudante avulso ficou sem valor de diária.',
      testar: [
        'Clicar em "Gerar pagamento das diárias": ver o PIX de cada um, o selo vermelho "sem contrato" da Rafaela e o ajudante avulso fora do lote, porque falta o valor da diária',
        'Cancelar o título de diárias do Paulo: a mensagem avisa que 1 diária voltou, e ele reaparece em "Gerar pagamento das diárias"',
        'Dar baixa na câmara fria',
      ],
      papel: 'financeiro',
    },
    {
      rota: '/financeiro/caixa',
      titulo: 'Fluxo de caixa',
      cenario:
        'Com o saldo inicial em branco, entra a entrada da Convenção Aurora amanhã, mas aluguel, folha e impostos no começo da semana que vem levam o caixa para o VERMELHO até o saldo do IA para Negócios entrar. Embaixo, a margem de cada evento assinado.',
      testar: [
        'Digitar um saldo inicial que evite o vermelho (fica guardado só neste navegador)',
        'Trocar o horizonte para 60 dias',
        'Em "Resultado por evento", ver que a Convenção Aurora só tem a entrada lançada (falta o saldo do contrato)',
      ],
      papel: 'financeiro',
    },
  ],
}
