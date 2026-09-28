// ============================================================
// MOTOR DE CÁLCULO PIEGGI
// Funções puras — os parâmetros vêm de rule_params (Supabase);
// os defaults abaixo espelham o seed (rev. 27/07/2026).
// ============================================================

import type { ServiceType, PriceTableKind } from '@/types'

// ------------------------------------------------------------
// Reposição (extensão de tempo) — incide em PREÇO e QUANTIDADE
// ------------------------------------------------------------

export const DURACAO_BASE_MIN: Partial<Record<ServiceType, number>> = {
  welcome_coffee: 30,
  coffee_break: 60,
  coquetel: 120,
  bar: 120,
  brunch: 120,
  almoco: 120,
  jantar: 120,
  coquetel_pizza: 120,
}

const REPOSICAO_COFFEE: Record<number, number> = { 30: 30, 60: 80, 90: 100, 120: 150 }
const REPOSICAO_DEMAIS: Record<number, number> = { 30: 0, 60: 30, 90: 60, 120: 80 }

export interface ReposicaoResult {
  pct: number
  extraMin: number
  status: 'ok' | 'sem_extensao' | 'escalar_diretor' | 'nao_permitido'
  mensagem?: string
}

/** Calcula o % de reposição a partir da duração real do serviço. */
export function calcReposicao(
  serviceType: ServiceType,
  duracaoMin: number
): ReposicaoResult {
  const base = DURACAO_BASE_MIN[serviceType]
  if (base == null) return { pct: 0, extraMin: 0, status: 'ok' }

  const extraBruto = duracaoMin - base
  if (extraBruto <= 0) return { pct: 0, extraMin: 0, status: 'ok' }

  if (serviceType === 'welcome_coffee') {
    return {
      pct: 0,
      extraMin: extraBruto,
      status: 'nao_permitido',
      mensagem: 'Welcome Coffee NUNCA admite extensão de tempo.',
    }
  }

  // arredonda o tempo extra para cima em blocos de 30 min
  const extra = Math.ceil(extraBruto / 30) * 30
  if (extra > 120) {
    return {
      pct: 0,
      extraMin: extra,
      status: 'escalar_diretor',
      mensagem:
        'Reposição acima de +2h — escalar o diretor (segurança alimentar). ' +
        'Coffee Break: alternativa é teto +2h ou dividir em 2 coffees.',
    }
  }

  const tabela = serviceType === 'coffee_break' ? REPOSICAO_COFFEE : REPOSICAO_DEMAIS
  return { pct: tabela[extra] ?? 0, extraMin: extra, status: 'ok' }
}

/** Duração em minutos entre dois horários "HH:MM". */
export function duracaoMin(horaInicio: string, horaFim: string): number {
  const [h1, m1] = horaInicio.split(':').map(Number)
  const [h2, m2] = horaFim.split(':').map(Number)
  return h2 * 60 + m2 - (h1 * 60 + m1)
}

// ------------------------------------------------------------
// Preço e trava de desconto (CMV)
// ------------------------------------------------------------

export interface PrecoInput {
  precoPax: number
  pax: number
  reposicaoPct: number // ex.: 30 para +30%
  descontoPct?: number
}

export interface PrecoResult {
  subtotal: number
  comReposicao: number
  total: number
}

export function calcPreco({ precoPax, pax, reposicaoPct, descontoPct = 0 }: PrecoInput): PrecoResult {
  const subtotal = precoPax * pax
  const comReposicao = subtotal * (1 + reposicaoPct / 100)
  const total = comReposicao * (1 - descontoPct / 100)
  return {
    subtotal: round2(subtotal),
    comReposicao: round2(comReposicao),
    total: round2(total),
  }
}

export type CmvStatus = 'ok' | 'alerta' | 'teto' | 'bloqueado'

export interface CmvResult {
  status: CmvStatus
  cmvResultante: number
  mensagem: string
}

/**
 * Trava de desconto: CMV_result = CMV_base / (1 − X/100). Teto de CMV = 30%.
 * StartSe-Inteli/Externos (base 20%): 0–15 ok · 16–30 alerta · 33,3 teto · 34+ bloqueia.
 * WTC (base ~22,7%): 0–5 ok · 6–20 alerta · 24 teto · 25+ bloqueia.
 * NUNCA citar CMV/margem/trava no slide do cliente.
 */
export function validarDesconto(kind: PriceTableKind, descontoPct: number): CmvResult {
  const isWtc = kind === 'wtc'
  const base = isWtc ? 22.7 : 20
  const cmvResultante = round2(base / (1 - descontoPct / 100))

  const [okMax, alertaMax, tetoDesc] = isWtc ? [5, 20, 24] : [15, 30, 33.3]

  if (descontoPct <= okMax)
    return { status: 'ok', cmvResultante, mensagem: `Desconto OK (CMV ${cmvResultante}%)` }
  if (descontoPct <= alertaMax)
    return {
      status: 'alerta',
      cmvResultante,
      mensagem: `⚠️ Desconto em faixa de alerta (CMV ${cmvResultante}%)`,
    }
  if (descontoPct <= tetoDesc)
    return {
      status: 'teto',
      cmvResultante,
      mensagem: `⚠️ Desconto no teto (${tetoDesc}%) — CMV ${cmvResultante}%`,
    }
  return {
    status: 'bloqueado',
    cmvResultante,
    mensagem: `❌ Desconto acima do teto de ${tetoDesc}% — bloqueado (CMV ${cmvResultante}% > 30%)`,
  }
}

/** Repasse WTC (12%) — só para o resumo interno, nunca no slide. */
export function repasseWtc(total: number, repassePct = 12) {
  const repasse = round2((total * repassePct) / 100)
  return { repasse, liquidoPieggi: round2(total - repasse) }
}

// ------------------------------------------------------------
// Fechamento do orçamento (linhas + logística + taxa de serviço)
// Externos: Taxa de serviço 10% sobre o subtotal + Logística R$ 250.
// StartSe / Inteli / WTC / IPT: isentos dos dois.
//
// A taxa NÃO incide sobre a logística — é como saem as propostas da casa
// (conferido nas 4 versões do orçamento ITAM/Intersolar: 10% sobre a comida,
// R$ 250 somados depois). Cobrar 10% sobre a logística dava R$ 25 a mais.
// ------------------------------------------------------------

export interface FechamentoInput {
  subtotalServicos: number
  impactosExtras?: number // observações do cliente que geram custo
  descontoPct?: number
  isentoLogistica: boolean
  isentoTaxa: boolean
  logisticaValor?: number
  taxaServicoPct?: number
  /** true = 10% também sobre a logística (fora do padrão da casa) */
  taxaSobreLogistica?: boolean
  /** "Serviço (10%) e logística" numa linha só, como no orçamento ITAM */
  juntarTaxaELogistica?: boolean
}

export interface FechamentoLinha {
  descricao: string
  valor: number
  tipo: 'servicos' | 'extra' | 'desconto' | 'logistica' | 'taxa'
}

export interface FechamentoResult {
  linhas: FechamentoLinha[]
  total: number
}

export function fecharOrcamento(i: FechamentoInput): FechamentoResult {
  const logisticaValor = i.logisticaValor ?? 250
  const taxaPct = i.taxaServicoPct ?? 10
  const linhas: FechamentoLinha[] = []

  let base = i.subtotalServicos
  linhas.push({ descricao: 'Serviços contratados', valor: round2(base), tipo: 'servicos' })

  if (i.impactosExtras) {
    base += i.impactosExtras
    linhas.push({
      descricao: 'Adicionais solicitados pelo cliente',
      valor: round2(i.impactosExtras),
      tipo: 'extra',
    })
  }

  if (i.descontoPct) {
    const desc = round2((base * i.descontoPct) / 100)
    base = round2(base - desc)
    linhas.push({ descricao: `Desconto (${i.descontoPct}%)`, valor: -desc, tipo: 'desconto' })
  }

  const logistica = i.isentoLogistica ? 0 : logisticaValor
  // por padrão a taxa incide só sobre a comida; a logística entra depois
  const baseTaxa = i.taxaSobreLogistica ? round2(base + logistica) : base
  const taxa = i.isentoTaxa ? 0 : round2((baseTaxa * taxaPct) / 100)

  if (i.juntarTaxaELogistica && logistica && taxa) {
    linhas.push({
      descricao: `Serviço (${taxaPct}%) e logística`,
      valor: round2(taxa + logistica),
      tipo: 'taxa',
    })
  } else {
    if (logistica)
      linhas.push({ descricao: 'Transporte e logística', valor: logistica, tipo: 'logistica' })
    if (taxa)
      linhas.push({ descricao: `Taxa de serviço (${taxaPct}%)`, valor: taxa, tipo: 'taxa' })
  }

  return { linhas, total: round2(base + logistica + taxa) }
}

// ------------------------------------------------------------
// Quantidades por serviço (item × pax)
// ------------------------------------------------------------

export interface QtdItem {
  item: string
  quantidade: number
  unidade: 'un' | 'g' | 'kg' | 'ml' | 'l' | 'pacote' | 'garrafa'
  memoria: string // memória de cálculo auditável
}

const cima = Math.ceil

function unit(pax: number, fator: number, repo: number): number {
  return cima(pax * fator * (1 + repo / 100))
}

/** Welcome Coffee (Executive). */
export function qtdWelcomeCoffee(pax: number): QtdItem[] {
  return [
    { item: 'Pão de queijo tradicional', quantidade: cima(pax * 2 * 0.7), unidade: 'un', memoria: `${pax} × 2 × 70%` },
    { item: 'Pão de queijo integral', quantidade: cima(pax * 2 * 0.3), unidade: 'un', memoria: `${pax} × 2 × 30%` },
    { item: 'Petit four salgado', quantidade: pax, unidade: 'un', memoria: `${pax} × 1` },
    { item: 'Petit four doce (2 sabores, 50/50)', quantidade: pax, unidade: 'un', memoria: `${pax} × 1 (0,5 + 0,5)` },
    { item: 'Café', quantidade: round2((pax * 50) / 1000), unidade: 'l', memoria: `${pax} × 50 ml` },
    { item: 'Leite', quantidade: round2((pax * 15) / 1000), unidade: 'l', memoria: `${pax} × 15 ml` },
    { item: 'Água quente para chá', quantidade: round2((pax * 15) / 1000), unidade: 'l', memoria: `${pax} × 15 ml` },
  ]
}

/** Auditório contratado, por número de períodos. */
export function qtdAuditorio(pax: number, periodos: number, cortesia = false): QtdItem[] {
  const cafe: QtdItem = {
    item: 'Café',
    quantidade: round2((pax * 150 * periodos) / 1000),
    unidade: 'l',
    memoria: `${pax} × 150 ml × ${periodos} período(s)`,
  }
  if (cortesia) {
    return [
      cafe,
      {
        item: 'Água (refresqueira)',
        quantidade: round2((pax * 150 * periodos) / 1000),
        unidade: 'l',
        memoria: `${pax} × 150 ml × ${periodos} — cortesia: sem suco/chá/garrafinha`,
      },
    ]
  }
  const garrafas = pax * 1.5
  return [
    cafe,
    { item: 'Água sem gás (garrafinha)', quantidade: cima(garrafas * 0.6 * periodos), unidade: 'un', memoria: `${pax} × 1,5 × 60% × ${periodos}` },
    { item: 'Água com gás (garrafinha)', quantidade: cima(garrafas * 0.4 * periodos), unidade: 'un', memoria: `${pax} × 1,5 × 40% × ${periodos}` },
  ]
}

export type CoffeeLinha = 'basic' | 'standard' | 'executive' | 'master'

/** Coffee Break — base comum + linha. `repo` = % reposição. */
export function qtdCoffeeBreak(pax: number, linha: CoffeeLinha, repo = 0): QtdItem[] {
  const r = (f: number) => unit(pax, f, repo)
  const ml = (v: number) => round2((pax * v * (1 + repo / 100)) / 1000)

  const base: QtdItem[] = [
    { item: 'Bolo / bebezinho (2 sabores 50/50)', quantidade: r(1.1), unidade: 'un', memoria: `${pax} × 1,1${repoTxt(repo)}` },
    { item: 'Suco de laranja', quantidade: ml(130), unidade: 'l', memoria: `${pax} × 130 ml${repoTxt(repo)}` },
    { item: 'Chá mate gelado', quantidade: ml(80), unidade: 'l', memoria: `${pax} × 80 ml${repoTxt(repo)}` },
    { item: 'Café', quantidade: ml(100), unidade: 'l', memoria: `${pax} × 100 ml${repoTxt(repo)}` },
    { item: 'Leite', quantidade: ml(30), unidade: 'l', memoria: `${pax} × 30 ml${repoTxt(repo)}` },
    { item: 'Água quente para chá', quantidade: ml(30), unidade: 'l', memoria: `${pax} × 30 ml${repoTxt(repo)}` },
    { item: 'Salada de frutas', quantidade: round2((pax * 100 * (1 + repo / 100)) / 1000), unidade: 'kg', memoria: `${pax} × 100 g${repoTxt(repo)}` },
    { item: 'Pão de queijo tradicional', quantidade: r(1.5), unidade: 'un', memoria: `${pax} × 1,5${repoTxt(repo)}` },
    { item: 'Pão de queijo integral', quantidade: r(0.5), unidade: 'un', memoria: `${pax} × 0,5${repoTxt(repo)}` },
  ]

  const porLinha: Record<CoffeeLinha, QtdItem[]> = {
    basic: [
      { item: 'Mini lanche (80% carne + 20% veg)', quantidade: r(1.5), unidade: 'un', memoria: `${pax} × 1,5 (total Basic)${repoTxt(repo)}` },
    ],
    standard: [
      { item: 'Mini lanche (80% carne + 20% veg)', quantidade: r(1.1), unidade: 'un', memoria: `${pax} × 1,1${repoTxt(repo)}` },
      { item: 'Wrap / tapioca / tartelete', quantidade: r(1.1), unidade: 'un', memoria: `${pax} × 1,1${repoTxt(repo)}` },
    ],
    executive: [
      { item: 'Mini lanche 70% / envelope 30% / tramezzino 30%', quantidade: r(1.1), unidade: 'un', memoria: `${pax} × 1,1${repoTxt(repo)}` },
      { item: 'Wrap / tapioca / tartelete', quantidade: r(1.1), unidade: 'un', memoria: `${pax} × 1,1${repoTxt(repo)}` },
      { item: 'Verrine / shot', quantidade: r(1.1), unidade: 'un', memoria: `${pax} × 1,1${repoTxt(repo)}` },
    ],
    master: [
      { item: 'Mini lanche (80% carne + 20% veg)', quantidade: r(1.1), unidade: 'un', memoria: `${pax} × 1,1${repoTxt(repo)}` },
      { item: 'Wrap / tapioca — opção 1', quantidade: r(1.3), unidade: 'un', memoria: `${pax} × 1,3${repoTxt(repo)}` },
      { item: 'Wrap / tapioca — opção 2', quantidade: r(1.3), unidade: 'un', memoria: `${pax} × 1,3${repoTxt(repo)}` },
      { item: 'Verrine / shot', quantidade: r(1.0), unidade: 'un', memoria: `${pax} × 1,0${repoTxt(repo)}` },
      { item: 'Favo de mel + frutas laminadas', quantidade: round2((pax * 50 * (1 + repo / 100)) / 1000), unidade: 'kg', memoria: `${pax} × 50 g (adicional fixo Master)${repoTxt(repo)}` },
    ],
  }

  return [...porLinha[linha], ...base]
}

/** Itens a mais por linha do Coffee Break (split manhã/tarde). */
export function itensAMais(linha: CoffeeLinha, periodo: 'manha' | 'tarde') {
  const config = {
    basic: { manha: [], tarde: [] },
    standard: { manha: ['1 salgado'], tarde: ['1 doce'] },
    executive: { manha: ['1 salgado', '1 doce'], tarde: ['2 doces'] },
    master: { manha: ['2 salgados', '1 doce'], tarde: ['2 doces', '1 salgado'] },
  } as const
  return config[linha][periodo]
}

/** Dips do Coquetel/HH — piso de produção 600 g até 30 pax. */
export function qtdDips(pax: number): QtdItem[] {
  const homus = pax <= 30 ? 600 : 600 + 12 * (pax - 30)
  const guaca = pax <= 30 ? 600 : 600 + 15 * (pax - 30)
  return [
    { item: 'Homus (acompanha pão sírio)', quantidade: round2(homus / 1000), unidade: 'kg', memoria: pax <= 30 ? 'piso 600 g' : `600 g + 12 g × ${pax - 30}` },
    { item: 'Guacamole (50% avocado + 50% abacate)', quantidade: round2(guaca / 1000), unidade: 'kg', memoria: pax <= 30 ? 'piso 600 g' : `600 g + 15 g × ${pax - 30}` },
    { item: 'Coalhada no repolho roxo', quantidade: round2((pax * 7) / 1000), unidade: 'kg', memoria: `${pax} × 7 g` },
  ]
}

/** Doces no verrine: padrão 1,1 (1,65 SÓ com reposição contínua). */
export function qtdVerrines(pax: number, sabores = 2, reposicaoContinua = false): QtdItem[] {
  const fator = reposicaoContinua ? 1.65 : 1.1
  const total = cima(pax * fator)
  const porSabor = Math.floor(total / sabores)
  const resto = total - porSabor * sabores
  return Array.from({ length: sabores }, (_, i) => ({
    item: `Verrine — sabor ${i + 1}`,
    quantidade: porSabor + (i < resto ? 1 : 0),
    unidade: 'un' as const,
    memoria: `total ${pax} × ${fator} = ${total} ÷ ${sabores} sabores`,
  }))
}

/** Almoço/Jantar — peso SERVIDO por item, com pisos de produção (nunca "corrigir"). */
export function qtdAlmoco(pax: number): QtdItem[] {
  const item = (nome: string, gPax: number, minG = 0): QtdItem => {
    const calc = pax * gPax
    const usado = Math.max(calc, minG)
    return {
      item: nome,
      quantidade: round2(usado / 1000),
      unidade: 'kg',
      memoria:
        usado > calc
          ? `piso de produção ${minG / 1000} kg (cálculo ${pax} × ${gPax} g = ${round2(calc / 1000)} kg)`
          : `${pax} × ${gPax} g (servido)`,
    }
  }
  return [
    item('Proteína 1', 140, 1000),
    item('Proteína 2', 140, 1000),
    item('Opção vegetariana', 100, 1000),
    item('Massa', 130, 1000),
    item('Molho da massa (linha separada)', 40),
    item('Arroz', 200, 1200),
    item('Feijão', 300),
    item('Purê', 200, 1200),
    item('Salada 1 (folhas)', 80),
    { item: 'Molho da salada 1', quantidade: round2((pax * 20) / 1000), unidade: 'l', memoria: `${pax} × 20 ml` },
    item('Salada 2 (composta)', 60),
    { item: 'Molho da salada 2', quantidade: round2((pax * 20) / 1000), unidade: 'l', memoria: `${pax} × 20 ml` },
    item('Tomate-cereja (travessa exclusiva)', 30),
    item('Cenoura ralada (travessa exclusiva)', 20),
    item('Sobremesa 1', 60),
    item('Sobremesa 2', 60),
    item('Frutas laminadas (SEM favo — adicional fixo)', 50),
  ]
}

// ------------------------------------------------------------
// Conversões (Comandas / Compras)
// ------------------------------------------------------------

export const FATOR_CRU: Record<string, number> = {
  file_mignon: 1.33,
  carne_bovina: 1.33,
  frango_peito: 1.25,
  salmao: 1.25,
  peixe_branco: 1.33,
  arroz: 0.33,
  feijao: 0.43,
  massa_seca: 0.45,
  pure_batata: 1.35,
  pure_mandioquinha: 1.25,
  pure_abobora: 1.2,
  panache: 1.15,
  legumes_salteados: 1.2,
  moqueca_palmito: 1.3,
  escondidinho: 1.1,
  ravioli: 0.95,
  nhoque: 1.0,
  lasanha: 1.0,
}

/** Peso cru/compra a partir do peso pronto (kg). */
export function pesoCru(fatorKey: string, prontoKg: number): number | null {
  const f = FATOR_CRU[fatorKey]
  return f == null ? null : round2(prontoKg * f)
}

export const MOLHO_G_POR_KG_MASSA: Record<string, number> = {
  pomodoro: 350,
  bechamel: 400,
  branco: 400,
  funghi: 400,
  pesto_tradicional: 200,
  pesto_cremoso: 350,
}

/** Litros → garrafas (arredondar para cima). Café servir = 1,7 L/garrafa. */
export function litrosParaGarrafas(litros: number, tipo: 'cafe' | 'suco' | 'cha'): number {
  const porGarrafa = tipo === 'cafe' ? 1.7 : 1.0
  return cima(litros / porGarrafa)
}

/** Cerveja: 1,5 un/pax por 2h de serviço (por evento de 2h, não por hora). */
export function qtdCerveja(pax: number, duracaoHoras = 2): number {
  const blocos = Math.max(1, Math.ceil(duracaoHoras / 2))
  return cima(pax * 1.5 * blocos)
}

/** Gelo: 1 pacote (3 kg) a cada 25 pax, arredondando p/ cima. */
export function qtdGelo(pax: number): number {
  return cima(pax / 25)
}

/** Verba da página da Adriana: 8% do orçamento (nunca exibir o orçamento). */
export function calcVerba(orcamento: number, pct = 8): number {
  return round2((orcamento * pct) / 100)
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function repoTxt(repo: number): string {
  return repo > 0 ? ` × (1 + ${repo}%)` : ''
}

export function formatBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatDiaMes(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
