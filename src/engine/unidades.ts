// ============================================================
// VENDA POR UNIDADE (modelo feira/stand — ITAM, Beauty Fair)
//
// Diferente do pacote: em vez de "Coffee Break Executive · R$ 50/pax",
// o cliente compra QUANTIDADE — "Salgados artesanais — 2 un/pax" a
// R$ 11,499 a unidade, vezes o pax, vezes os dias de evento.
//
// As quantidades vêm do cardápio que o sistema montou, então o que foi
// prometido e o que foi cobrado são o mesmo número.
// ============================================================

import type { ItemCardapio } from './cardapio'
import { round2 } from './index'

export interface PrecoUnidade {
  grupo: string
  /** 'unidade' = preço × quantidade · 'pax_dia' = preço × pax × dias */
  base: 'unidade' | 'pax_dia'
  preco: number
}

export interface LinhaUnidade {
  grupo: string
  descricao: string
  pax: string
  valor: number
  /** memória de cálculo — só uso interno, não vai para o cliente */
  memoria: string
}

export interface EntradaUnidades {
  /** itens do cardápio de UM dia (todos os serviços somados) */
  itens: ItemCardapio[]
  pax: number
  /** dias de evento — a linha do orçamento já sai multiplicada */
  dias: number
  precos: PrecoUnidade[]
  /** categoria do catálogo → grupo de venda */
  grupos: Record<string, string>
  /** grupo de venda → rótulo que aparece para o cliente */
  rotulos: Record<string, string>
}

export interface ResultadoUnidades {
  linhas: LinhaUnidade[]
  subtotal: number
  /** o que ficou de fora — nunca some em silêncio */
  avisos: string[]
}

/** "2 un/pax", "1,43 un/pax" — sem zeros à toa. */
function formatUnPax(v: number): string {
  const s = v.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
  return `${s} un/pax`
}

export function orcamentoPorUnidade(e: EntradaUnidades): ResultadoUnidades {
  const { itens, pax, dias, precos, grupos, rotulos } = e
  const avisos: string[] = []
  if (pax <= 0 || dias <= 0) return { linhas: [], subtotal: 0, avisos: ['Pax ou dias inválidos.'] }

  const precoDo = new Map(precos.map((p) => [p.grupo, p]))

  // agrupa a quantidade de UM dia por grupo de venda
  const porGrupo = new Map<string, { qtd: number; itens: string[] }>()
  const semGrupo: string[] = []

  for (const i of itens) {
    const grupo = grupos[i.categoria]
    if (!grupo) {
      semGrupo.push(`${i.nome} (${i.categoria})`)
      continue
    }
    const atual = porGrupo.get(grupo) ?? { qtd: 0, itens: [] }
    // só soma quantidade de itens contados por unidade; kg/l entram no
    // grupo mas não somam unidade (ex.: bebida, cobrada por pax/dia)
    if (i.unidade === 'un') atual.qtd += i.quantidade
    atual.itens.push(i.nome)
    porGrupo.set(grupo, atual)
  }

  const linhas: LinhaUnidade[] = []
  let subtotal = 0

  for (const [grupo, dados] of porGrupo) {
    const preco = precoDo.get(grupo)
    const rotulo = rotulos[grupo] ?? grupo
    if (!preco) {
      avisos.push(`Sem preço unitário cadastrado para "${rotulo}" — ${dados.itens.length} item(ns) fora do orçamento.`)
      continue
    }

    if (preco.base === 'pax_dia') {
      const valor = round2(preco.preco * pax * dias)
      subtotal = round2(subtotal + valor)
      linhas.push({
        grupo,
        descricao: rotulo,
        pax: String(pax),
        valor,
        memoria: `${pax} pax × ${dias} dia(s) × ${preco.preco}`,
      })
      continue
    }

    if (!dados.qtd) {
      avisos.push(`"${rotulo}" não tem quantidade em unidades — nada cobrado.`)
      continue
    }
    const totalUn = Math.ceil(dados.qtd) * dias
    const valor = round2(preco.preco * totalUn)
    subtotal = round2(subtotal + valor)
    linhas.push({
      grupo,
      descricao: `${rotulo} — ${formatUnPax(dados.qtd / pax)}`,
      pax: String(pax),
      valor,
      memoria: `${Math.ceil(dados.qtd)} un/dia × ${dias} dia(s) × ${preco.preco}`,
    })
  }

  if (semGrupo.length)
    avisos.push(
      `Sem grupo de venda (não entraram no orçamento): ${semGrupo.slice(0, 6).join(', ')}` +
        (semGrupo.length > 6 ? ` e mais ${semGrupo.length - 6}` : '')
    )

  return { linhas, subtotal, avisos }
}

/** "TOTAL — 3 dias (25, 26 e 27/08)", como sai nas propostas de feira. */
export function rotuloTotalDias(dias: string[]): string {
  if (dias.length <= 1) return 'Total Geral'
  const dm = dias.map((d) => d.split('-').reverse().slice(0, 2).join('/'))
  const lista = dm.length > 1 ? `${dm.slice(0, -1).join(', ')} e ${dm[dm.length - 1]}` : dm[0]
  return `TOTAL — ${dias.length} dias (${lista})`
}
