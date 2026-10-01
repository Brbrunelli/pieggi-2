// ============================================================
// RUA — o que sai e o que tem que voltar
//
// A comanda já calcula a estrutura do evento (roteamento.ts →
// gerarEstrutura: copos de vidro 1,1/pax, pratos 1,2/pax, réchaud 1 a
// cada 2 travessas…). A conferência de material não recalcula nada:
// ela LÊ a comanda aprovada e casa cada linha com o cadastro de
// materiais retornáveis. Assim o número que a expedição confere é o
// mesmo que saiu impresso — nunca uma segunda conta.
//
// Funções puras: entram linhas da comanda + cadastro, sai o previsto.
// ============================================================

import type { EventMaterial, Material } from '@/types'

export interface LinhaEstruturaComanda {
  qtd: string
  item: string
  receita?: string
}

export interface Previsto {
  material: Material
  qtd: number
}

/** "55 un" → 55 · "1 kit" → 1 · "3 pacote(s) 3 kg" → 3 · "—" → null */
export function qtdDaLinha(qtd: string): number | null {
  const m = qtd.replace(',', '.').match(/^\s*(\d+(?:\.\d+)?)/)
  return m ? Number(m[1]) : null
}

/** O material casa com a linha se algum termo da `chave` aparece no ITEM. */
export function casaMaterial(material: Material, item: string): boolean {
  if (!material.chave) return false
  const alvo = item.toLowerCase()
  return material.chave
    .split('|')
    .map((t) => t.toLowerCase())
    .filter((t) => t.trim())
    .some((t) => alvo.includes(t))
}

/**
 * Soma, por material, as linhas da estrutura da comanda que casam com
 * ele. As 5 caixas etiquetadas viram "Caixas etiquetadas: 5" — uma
 * linha de conferência por material, não por linha de comanda.
 */
export function previstoDaComanda(
  linhas: LinhaEstruturaComanda[],
  materiais: Material[]
): Previsto[] {
  const ativos = materiais.filter((m) => m.ativo && m.chave)
  const soma = new Map<string, number>()
  for (const l of linhas) {
    const qtd = qtdDaLinha(l.qtd)
    if (qtd == null) continue
    // a primeira chave que casa leva a linha: "Placa elétrica + extensão"
    // não pode contar duas vezes
    const m = ativos.find((x) => casaMaterial(x, l.item))
    if (!m) continue
    soma.set(m.id, (soma.get(m.id) ?? 0) + qtd)
  }
  return ativos
    .filter((m) => soma.has(m.id))
    .sort((a, b) => a.ordem - b.ordem)
    .map((m) => ({ material: m, qtd: soma.get(m.id)! }))
}

/** Perda = saiu − voltou − quebrou. Só existe depois do retorno conferido. */
export function perdaDe(m: Pick<EventMaterial, 'qtd_saida' | 'qtd_retorno' | 'qtd_quebra'>): number | null {
  if (m.qtd_retorno == null) return null
  return Math.max(Number(m.qtd_saida ?? 0) - Number(m.qtd_retorno) - Number(m.qtd_quebra ?? 0), 0)
}

/** Divergência na saída: conferido diferente do previsto pela comanda. */
export function divergenciaSaida(m: Pick<EventMaterial, 'qtd_prevista' | 'qtd_saida'>): number | null {
  if (m.qtd_saida == null || m.qtd_prevista == null) return null
  return Number(m.qtd_saida) - Number(m.qtd_prevista)
}

// ------------------------------------------------------------
// RETIRADAS — o que a página da Adriana manda buscar
//
// A comanda escreve cada compra de fornecedor como
//   "FORNECEDOR: LETÍCIA — Pão de batata (Adriana buscar) [12/08]"
// Aqui isso vira uma lista por fornecedor, para a retirada entrar na
// rota do motorista em vez de depender de alguém lembrar.
// ------------------------------------------------------------

export interface LinhaFornecedorComanda {
  qtd: string
  receita: string
  item: string
}

export interface RetiradaSugerida {
  /** nome do fornecedor normalizado (sem acento, minúsculo) */
  chave: string
  nome: string
  itens: { descricao: string; qtd: string; evento: string }[]
}

export function normalizarChave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function retiradasDaComanda(
  linhas: LinhaFornecedorComanda[],
  evento: string
): RetiradaSugerida[] {
  const porFornecedor = new Map<string, RetiradaSugerida>()
  for (const l of linhas) {
    const m = l.receita.match(/^FORNECEDOR:\s*([^—]+?)\s*—\s*(.+)$/)
    if (!m) continue // pedido do cliente e linhas avulsas não são retirada
    const nome = m[1].trim()
    const descricao = m[2]
      .replace(/\s*\(Adriana buscar\)/i, '')
      .replace(/\s*\[[^\]]*\]\s*$/, '')
      .trim()
    const chave = normalizarChave(nome)
    const r = porFornecedor.get(chave) ?? { chave, nome, itens: [] }
    r.itens.push({ descricao, qtd: [l.qtd, l.item].filter(Boolean).join(' ').trim(), evento })
    porFornecedor.set(chave, r)
  }
  return Array.from(porFornecedor.values())
}
