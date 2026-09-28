// ============================================================
// CMV REAL — a partir do custo do ERP
//
// Até aqui a trava de desconto usava uma base ESTIMADA (20%, ou 22,7%
// no WTC). Com a planilha de custos carregada dá para somar o custo real
// do cardápio montado e comparar com a receita.
//
// Regra da casa: teto de CMV = 30%.
// ============================================================

import type { ItemCardapio } from './cardapio'
import { round2 } from './index'

export interface CustoErp {
  catalogItemId: string | null
  produto: string
  categoria: string | null
  custo: number
  /** unidade comercial do ERP: 'unidade', 'travessa (~10 pax)', 'bolo inteiro (~12 pax)'… */
  unidadeComercial: string
}

export interface ItemSemCusto {
  nome: string
  motivo: 'sem_cadastro' | 'unidade_incompativel'
}

export interface CustoCardapio {
  custoTotal: number
  /** quantos itens do cardápio tiveram custo encontrado */
  itensComCusto: number
  itensTotal: number
  /** o que ficou de fora — nunca some em silêncio */
  semCusto: ItemSemCusto[]
}

const semAcento = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()

/**
 * Quanto o produto do ERP rende, lido da unidade comercial.
 *
 * O ERP não vende tudo por unidade: "garrafa 1,5L (~10 pax)",
 * "bolo inteiro (~12 pax)", "porção 100 pax", "pote (40 pax)". Sem ler
 * isso, todo item que não é unidade fica sem custo — e o CMV sai
 * calculado sobre um terço do cardápio.
 */
function rendimento(unidade: string): { tipo: 'unidade' } | { tipo: 'litros'; litros: number } | { tipo: 'pax'; pax: number } | null {
  const u = unidade.toLowerCase().trim()
  if (/^unidade$/.test(u)) return { tipo: 'unidade' }
  const vol = /(\d+(?:[.,]\d+)?)\s*l\b/.exec(u)
  if (vol) return { tipo: 'litros', litros: Number(vol[1].replace(',', '.')) }
  const pax = /(\d+)\s*pax/.exec(u)
  if (pax) return { tipo: 'pax', pax: Number(pax[1]) }
  return null
}

/**
 * Casa o item do cardápio com o produto do ERP.
 *
 * O ERP prefixa a categoria no nome ("Shot Verde Vital", "Tramezzino
 * Creme de Milho", "Verrine Franui Desconstruído") e o catálogo guarda só
 * o sabor. Por isso, além do nome exato, vale conter — restrito à mesma
 * categoria para não casar "Milho" de tramezzino com "Milho na Folha".
 */
function casar(item: ItemCardapio, erp: CustoErp[], porId: Map<string, CustoErp>): CustoErp | null {
  if (item.catalogItemId) {
    const porIdAchado = porId.get(item.catalogItemId)
    if (porIdAchado) return porIdAchado
  }
  const alvo = semAcento(item.nome.split('—')[0])
  if (!alvo) return null

  const exato = erp.find((e) => semAcento(e.produto) === alvo)
  if (exato) return exato

  const mesmaCategoria = erp.filter((e) => e.categoria === item.categoria)
  const pool = mesmaCategoria.length ? mesmaCategoria : erp

  // ERP mais específico que o catálogo: "Milho" ⊂ "Tramezzino Creme de Milho"
  const contem = pool
    .filter((e) => semAcento(e.produto).includes(alvo))
    .sort((a, b) => a.produto.length - b.produto.length)
  if (contem[0]) return contem[0]

  // catálogo mais específico que o ERP: "Blanquet de peru" ⊃ "Blanquet".
  // Exige palavra inteira, senão "Café" casaria com meio cardápio.
  const inverso = pool
    .filter((e) => {
      const p = semAcento(e.produto)
      return p.length >= 4 && new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(alvo)
    })
    .sort((a, b) => b.produto.length - a.produto.length)
  return inverso[0] ?? null
}

/**
 * Custo do cardápio montado, casando cada item com o produto do ERP.
 * O que não casar entra em `semCusto` — nunca vira número inventado.
 */
export function custoDoCardapio(itens: ItemCardapio[], erp: CustoErp[], pax: number): CustoCardapio {
  const porId = new Map<string, CustoErp>()
  for (const e of erp) if (e.catalogItemId) porId.set(e.catalogItemId, e)

  let custoTotal = 0
  let itensComCusto = 0
  const semCusto: ItemSemCusto[] = []

  for (const i of itens) {
    const achado = casar(i, erp, porId)
    if (!achado) {
      semCusto.push({ nome: i.nome, motivo: 'sem_cadastro' })
      continue
    }
    const rend = rendimento(achado.unidadeComercial)
    let custo: number | null = null

    if (rend?.tipo === 'unidade' && i.unidade === 'un') custo = achado.custo * i.quantidade
    else if (rend?.tipo === 'litros' && i.unidade === 'l')
      custo = achado.custo * Math.ceil(i.quantidade / rend.litros)
    else if (rend?.tipo === 'pax' && pax > 0) custo = achado.custo * Math.ceil(pax / rend.pax)
    else if (rend?.tipo === 'unidade' && i.unidade !== 'un') custo = null

    if (custo == null) {
      semCusto.push({ nome: i.nome, motivo: 'unidade_incompativel' })
      continue
    }
    custoTotal = round2(custoTotal + custo)
    itensComCusto++
  }

  return { custoTotal, itensComCusto, itensTotal: itens.length, semCusto }
}

export type CmvStatusReal = 'ok' | 'alerta' | 'teto' | 'bloqueado' | 'sem_dados'

export interface CmvRealResult {
  status: CmvStatusReal
  /** CMV do cardápio antes do desconto */
  cmvBase: number
  /** CMV depois do desconto — é este que bate no teto de 30% */
  cmvResultante: number
  /** quanto da receita está coberta por custo conhecido (0–100) */
  cobertura: number
  mensagem: string
}

const TETO_CMV = 30

/**
 * CMV real do orçamento. `receita` é o subtotal dos serviços (sem
 * logística nem taxa — elas não são comida).
 */
export function cmvReal(entrada: {
  custoTotal: number
  receita: number
  descontoPct?: number
  cobertura?: number
}): CmvRealResult {
  const { custoTotal, receita, descontoPct = 0 } = entrada
  const cobertura = round2(entrada.cobertura ?? 100)

  if (!receita || !custoTotal)
    return {
      status: 'sem_dados',
      cmvBase: 0,
      cmvResultante: 0,
      cobertura,
      mensagem: 'Sem custo cadastrado para este cardápio — CMV não calculado.',
    }

  const cmvBase = round2((custoTotal / receita) * 100)
  const cmvResultante = round2(cmvBase / (1 - descontoPct / 100))
  const sufixo =
    cobertura < 99 ? ` · calculado sobre ${cobertura}% dos itens (o resto sem custo no ERP)` : ''

  if (cmvResultante > TETO_CMV)
    return {
      status: 'bloqueado',
      cmvBase,
      cmvResultante,
      cobertura,
      mensagem: `❌ CMV ${cmvResultante}% acima do teto de ${TETO_CMV}% — desconto bloqueado${sufixo}`,
    }
  if (cmvResultante > TETO_CMV - 3)
    return {
      status: 'teto',
      cmvBase,
      cmvResultante,
      cobertura,
      mensagem: `⚠️ CMV ${cmvResultante}% no limite (teto ${TETO_CMV}%)${sufixo}`,
    }
  if (cmvResultante > 25)
    return {
      status: 'alerta',
      cmvBase,
      cmvResultante,
      cobertura,
      mensagem: `⚠️ CMV ${cmvResultante}% em faixa de atenção${sufixo}`,
    }
  return {
    status: 'ok',
    cmvBase,
    cmvResultante,
    cobertura,
    mensagem: `CMV ${cmvResultante}% (cardápio ${cmvBase}%)${sufixo}`,
  }
}

/** Quanto ainda dá para descontar sem furar o teto de 30%. */
export function descontoMaximo(cmvBase: number): number {
  if (cmvBase <= 0 || cmvBase >= TETO_CMV) return 0
  return Math.floor((1 - cmvBase / TETO_CMV) * 100)
}
