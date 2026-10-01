// ============================================================
// MOTOR FINANCEIRO — compras que viram contas a pagar, fluxo de caixa
// e resultado por evento
//
// Funções puras (sem React, sem banco): a tela, a demonstração e o
// teste chamam a MESMA regra. A função SQL da 0036 repete as duas que
// mexem em dinheiro guardado (parcelas do pedido e diárias agrupadas) —
// mudou aqui, muda lá.
//
// Princípios:
//   • nenhum número de negócio é inventado aqui: preço, custo e prazo vêm
//     do cadastro/pedido; o motor só soma, divide e compara;
//   • "atrasado" e "dias até vencer" são DERIVADOS da data de hoje, nunca
//     guardados (mesma regra de receivables_abertos);
//   • parcela que não fecha nos centavos: a diferença vai na ÚLTIMA,
//     para a soma das parcelas bater exatamente com o pedido.
// ============================================================

import { mesmaFuncao, STATUS_OCUPA } from './freelas'
import { hojeLocal } from '@/engine/datas'

// ------------------------------------------------------------
// datas (ISO yyyy-mm-dd, sem fuso: a conta é de calendário)
// ------------------------------------------------------------
export function hojeISO(): string {
  return hojeLocal()
}

export function somarDias(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d + n))
  return dt.toISOString().slice(0, 10) // conta feita em UTC (Date.UTC) — ler em UTC
}

export function diasEntre(de: string, ate: string): number {
  const t = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number)
    return Date.UTC(a, m - 1, d)
  }
  return Math.round((t(ate) - t(de)) / 86400000)
}

export function dataBR(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('/')
}

const centavos = (v: number) => Math.round(v * 100) / 100

// ------------------------------------------------------------
// condição de pagamento → parcelas
// ------------------------------------------------------------
export const CONDICOES: { valor: string; label: string }[] = [
  { valor: 'avista', label: 'À vista' },
  { valor: '7', label: '7 dias' },
  { valor: '14', label: '14 dias' },
  { valor: '21', label: '21 dias' },
  { valor: '28', label: '28 dias' },
  { valor: '14/28', label: '14/28 dias (2x)' },
]

export function rotuloCondicao(c: string | null | undefined): string {
  if (!c) return '—'
  return CONDICOES.find((x) => x.valor === c)?.label ?? `${c} dias`
}

/** 'avista' → [0] · '28' → [28] · '14/28' → [14, 28]. Inválido → [0]. */
export function diasDaCondicao(c: string | null | undefined): number[] {
  if (!c || c === 'avista') return [0]
  const dias = c
    .split('/')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0)
  return dias.length ? dias : [0]
}

export interface Parcela {
  parcela: number
  parcelas: number
  valor: number
  vencimento: string
}

/** divide o total pela condição; vencimento conta a partir da data-base */
export function gerarParcelas(total: number, condicao: string | null | undefined, dataBase: string): Parcela[] {
  const dias = diasDaCondicao(condicao)
  const n = dias.length
  const cada = Math.floor((total / n) * 100) / 100
  return dias.map((d, i) => ({
    parcela: i + 1,
    parcelas: n,
    valor: i === n - 1 ? centavos(total - cada * (n - 1)) : cada,
    vencimento: somarDias(dataBase, d),
  }))
}

// ------------------------------------------------------------
// pedido de compra
// ------------------------------------------------------------
export interface ItemValor {
  quantidade: number
  preco_unitario: number | null
  quantidade_recebida?: number | null
}

export function totalItens(itens: ItemValor[]): number {
  return centavos(itens.reduce((t, i) => t + Number(i.quantidade || 0) * Number(i.preco_unitario || 0), 0))
}

/** o que impede confirmar o pedido (vira conta a pagar — tem de estar fechado) */
export function pendenciasConfirmar(p: { data_prevista: string | null; itens: (ItemValor & { descricao: string })[] }): string[] {
  const out: string[] = []
  if (!p.itens.length) out.push('O pedido não tem itens.')
  if (!p.data_prevista) out.push('Falta a data prevista (é dela que contam os vencimentos).')
  const semPreco = p.itens.filter((i) => !(Number(i.preco_unitario) > 0))
  if (semPreco.length)
    out.push(`${semPreco.length} item(ns) sem preço: ${semPreco.map((i) => i.descricao).slice(0, 3).join(', ')}${semPreco.length > 3 ? '…' : ''}`)
  const semQtd = p.itens.filter((i) => !(Number(i.quantidade) > 0))
  if (semQtd.length) out.push(`${semQtd.length} item(ns) sem quantidade.`)
  return out
}

export interface Divergencia {
  descricao: string
  pedido: number
  recebido: number
  diferenca: number
  unidade: string
  /** quanto a mais (+) ou a menos (−) em R$, pelo preço do pedido */
  valor: number
}

export function divergencias(
  itens: (ItemValor & { descricao: string; unidade: string })[]
): Divergencia[] {
  return itens
    .filter((i) => i.quantidade_recebida != null && Number(i.quantidade_recebida) !== Number(i.quantidade))
    .map((i) => {
      const dif = Number(i.quantidade_recebida) - Number(i.quantidade)
      return {
        descricao: i.descricao,
        pedido: Number(i.quantidade),
        recebido: Number(i.quantidade_recebida),
        diferenca: dif,
        unidade: i.unidade,
        valor: centavos(dif * Number(i.preco_unitario || 0)),
      }
    })
}

function numeroBR(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/** o texto que vai no WhatsApp do fornecedor */
export function textoPedido(p: {
  numero: number | null
  fornecedor: string
  forma: 'retirada' | 'entrega'
  data_prevista: string | null
  condicao: string | null
  forma_pagamento: string | null
  obs: string | null
  itens: { descricao: string; quantidade: number; unidade: string }[]
}): string {
  const linhas = [
    `Olá! Pedido de compra Pieggi${p.numero ? ` nº ${p.numero}` : ''} — ${p.fornecedor}`,
    '',
    ...p.itens.map((i) => `• ${numeroBR(Number(i.quantidade))} ${i.unidade} — ${i.descricao}`),
    '',
    `${p.forma === 'retirada' ? 'Retirada' : 'Entrega'}: ${dataBR(p.data_prevista)}`,
    `Pagamento: ${rotuloCondicao(p.condicao)}${p.forma_pagamento ? ` · ${p.forma_pagamento.toUpperCase()}` : ''}`,
  ]
  if (p.obs) linhas.push(`Obs.: ${p.obs}`)
  linhas.push('', 'Pode confirmar, por favor? Obrigado!')
  return linhas.join('\n')
}

export function linkWhatsApp(telefone: string | null | undefined, texto: string): string {
  let n = (telefone ?? '').replace(/\D/g, '')
  if (n && n.length <= 11) n = `55${n}`
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}

/** "38 un" → 38/un · "3,5 kg" → 3.5/kg · "2 pacotes (500 g)" → 2/pacotes (500 g) */
export function lerQuantidade(texto: string): { quantidade: number; unidade: string } | null {
  const m = texto.trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/)
  if (!m) return null
  const quantidade = Number(m[1].replace(',', '.'))
  if (!Number.isFinite(quantidade)) return null
  return { quantidade, unidade: m[2].trim() || 'un' }
}

const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** título da seção da lista ("LETÍCIA — salgados") → fornecedor pela chave ou nome */
export function sugerirFornecedor<F extends { id: string; chave: string | null; nome: string }>(
  titulo: string,
  fornecedores: F[]
): F | null {
  const t = normal(titulo)
  return (
    fornecedores.find((f) => f.chave && t.includes(normal(f.chave))) ??
    fornecedores.find((f) => t.includes(normal(f.nome.split(' ')[0])) && f.nome.length > 3) ??
    null
  )
}

// ------------------------------------------------------------
// resumo por fornecedor (cadastro de compra)
// ------------------------------------------------------------
export const PEDIDO_ABERTO = ['rascunho', 'enviado', 'confirmado']

export function resumoFornecedor(
  pedidos: { fornecedor_id: string; status: string; valor_total: number; confirmado_em: string | null; data_prevista: string | null }[],
  fornecedorId: string,
  mesISO: string // 'yyyy-mm'
): { abertos: number; compradoMes: number } {
  const meus = pedidos.filter((p) => p.fornecedor_id === fornecedorId)
  return {
    abertos: meus.filter((p) => PEDIDO_ABERTO.includes(p.status)).length,
    compradoMes: centavos(
      meus
        .filter(
          (p) =>
            ['confirmado', 'recebido'].includes(p.status) &&
            (p.confirmado_em ?? p.data_prevista ?? '').slice(0, 7) === mesISO
        )
        .reduce((t, p) => t + Number(p.valor_total || 0), 0)
    ),
  }
}

// ------------------------------------------------------------
// diárias de freelancer → um título por freelancer
// ------------------------------------------------------------
export interface DiariaStaff {
  id: string
  event_id: string
  freelancer_id: string | null
  nome: string
  dia: string
  valor: number | null
  status: string
}

export interface GrupoDiarias {
  chave: string
  freelancer_id: string | null
  nome: string
  pix: string | null
  staffIds: string[]
  eventIds: string[]
  dias: string[]
  valor: number
  descricao: string
}

/** a diária está em aberto? presente, no período, ainda sem título */
function diariaAberta(s: DiariaStaff, jaPagos: Set<string>, de: string, ate: string): boolean {
  return s.status === 'presente' && !jaPagos.has(s.id) && s.dia >= de && s.dia <= ate
}

/**
 * Presentes no período, ainda sem título, agrupadas por freelancer. A
 * descrição já leva o PIX: quem paga não precisa abrir outro cadastro.
 *
 * Diária SEM VALOR fica FORA do lote: se entrasse, viraria título de
 * R$ 0 e ficaria marcada como paga para sempre. Ela continua pendente
 * para a próxima geração, depois que a logística puser o valor
 * (diariasSemValor lista quais são). O banco repete o filtro.
 */
export function agruparDiarias(
  staff: DiariaStaff[],
  freelancers: { id: string; nome: string; pix: string | null }[],
  jaPagos: Set<string>,
  de: string,
  ate: string
): GrupoDiarias[] {
  const grupos = new Map<string, GrupoDiarias>()
  for (const s of staff) {
    if (!diariaAberta(s, jaPagos, de, ate) || s.valor == null) continue
    const chave = s.freelancer_id ?? `nome:${s.nome}`
    const f = s.freelancer_id ? freelancers.find((x) => x.id === s.freelancer_id) : undefined
    const g =
      grupos.get(chave) ??
      ({
        chave,
        freelancer_id: s.freelancer_id,
        nome: f?.nome ?? s.nome,
        pix: f?.pix ?? null,
        staffIds: [],
        eventIds: [],
        dias: [],
        valor: 0,
        descricao: '',
      } as GrupoDiarias)
    g.staffIds.push(s.id)
    if (!g.eventIds.includes(s.event_id)) g.eventIds.push(s.event_id)
    g.dias.push(s.dia)
    g.valor = centavos(g.valor + Number(s.valor))
    grupos.set(chave, g)
  }
  return [...grupos.values()]
    .map((g) => {
      const dias = [...g.dias].sort()
      const periodo = dias[0] === dias[dias.length - 1] ? dataBR(dias[0]) : `${dataBR(dias[0])} a ${dataBR(dias[dias.length - 1])}`
      return {
        ...g,
        dias,
        descricao: `Diárias — ${g.nome} (${dias.length} diária${dias.length > 1 ? 's' : ''}, ${periodo}) · PIX: ${g.pix ?? 'NÃO CADASTRADO'}`,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))
}

/** Presentes no período, sem título e SEM VALOR — ficam fora do lote. */
export function diariasSemValor(staff: DiariaStaff[], jaPagos: Set<string>, de: string, ate: string): DiariaStaff[] {
  return staff
    .filter((s) => diariaAberta(s, jaPagos, de, ate) && s.valor == null)
    .sort((a, b) => a.dia.localeCompare(b.dia) || a.nome.localeCompare(b.nome))
}

// ------------------------------------------------------------
// fluxo de caixa dia a dia
// ------------------------------------------------------------
export interface Lancamento {
  id: string
  descricao: string
  valor: number
  vencimento: string
}

export interface DiaCaixa {
  data: string
  entra: number
  sai: number
  saldo: number
  negativo: boolean
  entradas: Lancamento[]
  saidas: Lancamento[]
  /** dia de hoje carrega os atrasados */
  temAtrasado: boolean
}

export interface FluxoCaixa {
  dias: DiaCaixa[]
  atrasadoReceber: number
  atrasadoPagar: number
  totalEntra: number
  totalSai: number
  saldoFinal: number
  menorSaldo: { data: string; saldo: number } | null
  primeiroNegativo: string | null
  diasNegativos: number
}

/**
 * Projeta o saldo de hoje até hoje+horizonte. Atrasado (vencido e não
 * baixado) entra no dia de HOJE — é o que precisa acontecer já — e fica
 * destacado; desligando `contarAtrasados`, ele só aparece no total.
 */
export function fluxoDeCaixa(p: {
  saldoInicial: number
  hoje: string
  horizonte: number
  entradas: Lancamento[]
  saidas: Lancamento[]
  contarAtrasados?: boolean
}): FluxoCaixa {
  const contar = p.contarAtrasados ?? true
  const atrasadoReceber = centavos(p.entradas.filter((l) => l.vencimento < p.hoje).reduce((t, l) => t + Number(l.valor), 0))
  const atrasadoPagar = centavos(p.saidas.filter((l) => l.vencimento < p.hoje).reduce((t, l) => t + Number(l.valor), 0))
  const diaDe = (l: Lancamento) => (l.vencimento < p.hoje ? (contar ? p.hoje : null) : l.vencimento)

  const dias: DiaCaixa[] = []
  let saldo = p.saldoInicial
  let totalEntra = 0
  let totalSai = 0
  let menor: { data: string; saldo: number } | null = null
  let primeiroNegativo: string | null = null
  let diasNegativos = 0
  for (let i = 0; i <= p.horizonte; i++) {
    const data = somarDias(p.hoje, i)
    const entradas = p.entradas.filter((l) => diaDe(l) === data)
    const saidas = p.saidas.filter((l) => diaDe(l) === data)
    const entra = centavos(entradas.reduce((t, l) => t + Number(l.valor), 0))
    const sai = centavos(saidas.reduce((t, l) => t + Number(l.valor), 0))
    saldo = centavos(saldo + entra - sai)
    totalEntra += entra
    totalSai += sai
    const negativo = saldo < 0
    if (negativo) {
      diasNegativos++
      primeiroNegativo ??= data
    }
    if (!menor || saldo < menor.saldo) menor = { data, saldo }
    dias.push({
      data,
      entra,
      sai,
      saldo,
      negativo,
      entradas,
      saidas,
      temAtrasado: i === 0 && contar && (atrasadoReceber > 0 || atrasadoPagar > 0),
    })
  }
  return {
    dias,
    atrasadoReceber,
    atrasadoPagar,
    totalEntra: centavos(totalEntra),
    totalSai: centavos(totalSai),
    saldoFinal: saldo,
    menorSaldo: menor,
    primeiroNegativo,
    diasNegativos,
  }
}

// ------------------------------------------------------------
// resultado por evento
// ------------------------------------------------------------
export interface ResultadoEvento {
  event_id: string
  nome: string
  primeiroDia: string | null
  contrato: number | null
  receita: number
  insumos: number
  /** escalados (view event_staff_custo) */
  equipe: number
  /** vagas da escala AINDA SEM GENTE × valor de referência da função */
  equipePrevista: number
  /** vagas em aberto (com e sem valor de referência) */
  vagasAbertas: number
  /** vagas em aberto de função sem valor de referência — não entram no custo */
  vagasSemReferencia: number
  material: number
  outros: number
  custos: number
  margem: number
  /** margem ÷ receita × 100; null sem receita */
  pct: number | null
  /** títulos lançados abaixo do contrato (falta lançar parcela) */
  receitaIncompleta: boolean
}

// ------------------------------------------------------------
// equipe prevista — a escala ainda incompleta não pode deixar a margem
// otimista. Vaga da escala (escala_vagas, frente Pessoas) menos quem já
// está escalado na MESMA função no mesmo dia = vagas em aberto; cada uma
// vale o valor de referência da função (média do valor_padrao dos freelas
// ativos daquela função). Função sem ninguém com valor → a vaga é contada
// mas fica sem preço (nunca inventar número). Só dias de hoje em diante:
// no passado, a vaga vazia não vai mais custar nada.
// ------------------------------------------------------------
export interface EquipePrevista {
  valor: number
  vagasAbertas: number
  vagasSemReferencia: number
}

export function equipePrevista(p: {
  hoje: string
  vagas: { event_id: string; dia: string; funcao: string; quantidade: number }[]
  staff: { event_id: string; dia: string; funcao: string | null; status: string }[]
  freelancers: { funcao_padrao: string | null; valor_padrao: number | null; ativo?: boolean | null }[]
}): Map<string, EquipePrevista> {
  const referencia = (funcao: string): number | null => {
    const valores = p.freelancers
      .filter((f) => f.ativo !== false && f.valor_padrao != null && mesmaFuncao(f.funcao_padrao, funcao))
      .map((f) => Number(f.valor_padrao))
    return valores.length ? centavos(valores.reduce((t, v) => t + v, 0) / valores.length) : null
  }
  const out = new Map<string, EquipePrevista>()
  for (const v of p.vagas) {
    if (v.dia < p.hoje) continue
    const escalados = p.staff.filter(
      (s) => s.event_id === v.event_id && s.dia === v.dia && STATUS_OCUPA.includes(s.status) && mesmaFuncao(s.funcao, v.funcao)
    ).length
    const abertas = Math.max(0, Number(v.quantidade) - escalados)
    if (!abertas) continue
    const r = out.get(v.event_id) ?? { valor: 0, vagasAbertas: 0, vagasSemReferencia: 0 }
    const ref = referencia(v.funcao)
    r.vagasAbertas += abertas
    if (ref == null) r.vagasSemReferencia += abertas
    else r.valor = centavos(r.valor + abertas * ref)
    out.set(v.event_id, r)
  }
  return out
}

/**
 * Receita = títulos a receber do evento (não cancelados).
 * Custos   = itens de pedido com o evento (pedido não cancelado; vale a
 *            quantidade RECEBIDA quando já conferida) + equipe da rua
 *            (view event_staff_custo: escalado/confirmado/presente —
 *            previsto antes, real depois) + vagas da escala ainda sem
 *            gente (equipePrevista) + prejuízo de material + outras
 *            contas a pagar ligadas ao evento (transporte, aluguel…).
 *            Contas de freelancer e de pedido NÃO entram de novo: já
 *            foram contadas pela escala e pelos itens do pedido.
 */
export function resultadoPorEvento(p: {
  eventos: { id: string; nome: string; primeiroDia: string | null; contrato: number | null }[]
  receivables: { event_id: string | null; valor: number; status: string }[]
  itens: { event_id: string | null; quantidade: number; quantidade_recebida: number | null; preco_unitario: number | null; pedido_status: string }[]
  /** linhas da view event_staff_custo (mesma regra de status da rua) */
  equipeCusto: { event_id: string; custo: number | null }[]
  previsao?: Map<string, EquipePrevista>
  materiais: { event_id: string; prejuizo: number | null }[]
  payables: { event_id: string | null; categoria: string; valor: number; status: string; purchase_order_id: string | null }[]
}): ResultadoEvento[] {
  return p.eventos.map((e) => {
    const receita = centavos(
      p.receivables.filter((r) => r.event_id === e.id && r.status !== 'cancelado').reduce((t, r) => t + Number(r.valor), 0)
    )
    const insumos = centavos(
      p.itens
        .filter((i) => i.event_id === e.id && i.pedido_status !== 'cancelado')
        .reduce((t, i) => t + Number(i.quantidade_recebida ?? i.quantidade) * Number(i.preco_unitario ?? 0), 0)
    )
    const equipe = centavos(p.equipeCusto.filter((s) => s.event_id === e.id).reduce((t, s) => t + Number(s.custo ?? 0), 0))
    const prev = p.previsao?.get(e.id) ?? { valor: 0, vagasAbertas: 0, vagasSemReferencia: 0 }
    const material = centavos(p.materiais.filter((m) => m.event_id === e.id).reduce((t, m) => t + Number(m.prejuizo ?? 0), 0))
    const outros = centavos(
      p.payables
        .filter((x) => x.event_id === e.id && x.status !== 'cancelado' && x.categoria !== 'freelancer' && !x.purchase_order_id)
        .reduce((t, x) => t + Number(x.valor), 0)
    )
    const custos = centavos(insumos + equipe + prev.valor + material + outros)
    const margem = centavos(receita - custos)
    return {
      event_id: e.id,
      nome: e.nome,
      primeiroDia: e.primeiroDia,
      contrato: e.contrato,
      receita,
      insumos,
      equipe,
      equipePrevista: prev.valor,
      vagasAbertas: prev.vagasAbertas,
      vagasSemReferencia: prev.vagasSemReferencia,
      material,
      outros,
      custos,
      margem,
      pct: receita > 0 ? Math.round((margem / receita) * 1000) / 10 : null,
      receitaIncompleta: e.contrato != null && receita + 0.005 < Number(e.contrato),
    }
  })
}
