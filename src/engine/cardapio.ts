// ============================================================
// COMPOSITOR AUTOMÁTICO DE CARDÁPIO
// O sistema escolhe os itens — não a pessoa. Aplica as regras da
// casa: contraponto (1 veg + 1 não-veg), manhã leve/salgado ×
// tarde forte/doce, nunca repetir a base do sabor no mesmo dia,
// escalonamento por pax (>50 = 2 sabores, >120 = 3), proibidos
// fora, brioche tradicional p/ carne e de cenoura p/ vegetariano.
// Devolve cada item já com a QUANTIDADE que vai para a proposta.
// ============================================================

import type { CatalogItem, DayPeriod, ServiceLine, ServiceType } from '@/types'
import { round2 } from './index'

export interface ItemCardapio {
  /** rótulo do papel no cardápio: "Mini lanche (carne)", "Cup cake", … */
  papel: string
  catalogItemId: string | null
  nome: string
  /** receita completa como sai no slide do cliente */
  descricao?: string | null
  categoria: string
  selo: string | null
  quantidade: number
  unidade: 'un' | 'kg' | 'l' | 'pacote'
  /** de onde saiu a conta — aparece só internamente */
  memoria: string
  /** true = item fixo da linha (não escolhido, não trocável) */
  fixo: boolean
  /**
   * Recipiente da verrine/shot — "copo bolha" (descartável) no coffee,
   * "cup de vidro" no HH/brunch/almoço/jantar (§14.4).
   *
   * Fica num campo próprio de propósito: a proposta e a programação
   * escrevem ao lado do sabor, mas a PLAQUINHA não leva (§16.4), e as
   * compras contam copo bolha × vidro separados.
   */
  recipiente?: string | null
  /**
   * true = insumo operacional (sachê de açúcar, achocolatado, chá em
   * sachê…). Conta para comanda, expedição e compras, mas NÃO aparece no
   * cardápio do cliente — ninguém vende "achocolatado em pó" num slide.
   */
  operacional?: boolean
}

/** Recipiente por serviço (§14.4 · §11.6 · §17.7). */
const RECIPIENTE_POR_SERVICO: Partial<Record<ServiceType, string>> = {
  welcome_coffee: 'copo bolha',
  coffee_break: 'copo bolha',
  coquetel: 'cup de vidro',
  coquetel_pizza: 'cup de vidro',
  bar: 'cup de vidro',
  brunch: 'cup de vidro',
  almoco: 'cup de vidro',
  jantar: 'cup de vidro',
}

const CATEGORIAS_COM_RECIPIENTE = ['verrine', 'shot_funcional', 'shot_vitaminado']

export function recipienteDe(categoria: string, serviceType: ServiceType): string | null {
  if (!CATEGORIAS_COM_RECIPIENTE.includes(categoria)) return null
  return RECIPIENTE_POR_SERVICO[serviceType] ?? null
}

/**
 * Pão do mini lanche (§2.3 · §14.9).
 *
 * Com carne = brioche tradicional. Sem carne = brioche de cenoura, MESMO
 * que o catálogo traga aveia (Veg II) ou alecrim (Veg III) — nesse caso a
 * troca é sinalizada, senão a cozinha manda o pão do catálogo.
 */
export function paoDoLanche(item: CatalogItem, vegetariano: boolean): string {
  if (!vegetariano) return 'brioche tradicional'
  const texto = `${item.nome} ${item.descricao ?? ''} ${item.obs ?? ''}`.toLowerCase()
  return /aveia|alecrim|multigr|integral/.test(texto)
    ? 'brioche de cenoura (ajustado da regra Pieggi)'
    : 'brioche de cenoura'
}

export interface EntradaCardapio {
  serviceType: ServiceType
  serviceLine: ServiceLine | null
  periodo: DayPeriod | null
  pax: number
  reposicaoPct: number
  catalogo: CatalogItem[]
  /** bases de sabor já usadas no mesmo dia (para não repetir) */
  basesUsadas?: Set<string>
  /** muda a escolha mantendo as regras (botão "outra combinação") */
  semente?: number
}

const cima = Math.ceil

// ------------------------------------------------------------
// Sorteio determinístico (mesma semente → mesma combinação)
// ------------------------------------------------------------
function baralhar<T>(lista: T[], semente: number): T[] {
  const a = [...lista]
  let s = semente || 1
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Quantos sabores o tamanho do evento pede para o mesmo produto. */
export function saboresPorPax(pax: number): number {
  if (pax > 120) return 3
  if (pax > 50) return 2
  return 1
}

// ------------------------------------------------------------
// Seleção com as regras de cardápio
// ------------------------------------------------------------
class Seletor {
  private usadas: Set<string>
  private escolhidos = new Set<string>()

  constructor(
    private catalogo: CatalogItem[],
    private entrada: EntradaCardapio
  ) {
    this.usadas = new Set(entrada.basesUsadas ?? [])
  }

  private disponiveis(categoria: string | string[], veg?: boolean): CatalogItem[] {
    const cats = Array.isArray(categoria) ? categoria : [categoria]
    const { serviceType, serviceLine, periodo } = this.entrada

    return this.catalogo.filter((c) => {
      if (!c.ativo || c.proibido || c.descontinuado) return false
      if (!cats.includes(c.categoria)) return false
      if (this.escolhidos.has(c.id)) return false
      // serve para este tipo de serviço?
      if (c.servicos.length && !c.servicos.includes(serviceType)) return false
      // respeita o período (manhã leve/salgado × tarde forte/doce)
      if (periodo && c.periodos.length && !c.periodos.includes(periodo)) return false
      // tier: item de linha superior não entra em linha inferior
      if (c.tier_minimo && serviceLine && !this.tierOk(c.tier_minimo, serviceLine)) return false
      // contraponto vegetariano × não-vegetariano
      if (veg === true && !c.selo) return false
      if (veg === false && c.selo) return false
      // nunca repetir a base do sabor no mesmo dia
      if (c.base_sabor && this.usadas.has(c.base_sabor)) return false
      return true
    })
  }

  private tierOk(minimo: ServiceLine, contratado: ServiceLine): boolean {
    const ordem: ServiceLine[] = ['basic', 'standard', 'executive', 'master', 'premium']
    const i = ordem.indexOf(minimo)
    const j = ordem.indexOf(contratado)
    if (i < 0 || j < 0) return true
    return j >= i
  }

  /** Escolhe N itens distintos, respeitando as regras. */
  pegar(categoria: string | string[], n: number, veg?: boolean): CatalogItem[] {
    const out: CatalogItem[] = []
    for (let k = 0; k < n; k++) {
      const pool = baralhar(this.disponiveis(categoria, veg), (this.entrada.semente ?? 1) + k * 97)
      const item = pool[0]
      if (!item) break
      this.escolhidos.add(item.id)
      if (item.base_sabor) this.usadas.add(item.base_sabor)
      out.push(item)
    }
    return out
  }

  /** Bases de sabor consumidas — o chamador acumula entre serviços do mesmo dia. */
  get basesConsumidas(): Set<string> {
    return this.usadas
  }
}

// ------------------------------------------------------------
// Helpers de quantidade
// ------------------------------------------------------------
function comReposicao(qtd: number, repo: number): number {
  return cima(qtd * (1 + repo / 100))
}

function dividir(total: number, partes: number): number[] {
  const base = Math.floor(total / partes)
  const resto = total - base * partes
  return Array.from({ length: partes }, (_, i) => base + (i < resto ? 1 : 0))
}

function litros(pax: number, ml: number, repo: number): number {
  return round2((pax * ml * (1 + repo / 100)) / 1000)
}

// ------------------------------------------------------------
// Compositor
// ------------------------------------------------------------
export interface ResultadoCardapio {
  itens: ItemCardapio[]
  basesConsumidas: string[]
  avisos: string[]
}

export function montarCardapio(entrada: EntradaCardapio): ResultadoCardapio {
  const { serviceType, serviceLine, periodo, pax, reposicaoPct: repo } = entrada
  const sel = new Seletor(entrada.catalogo, entrada)
  const itens: ItemCardapio[] = []
  const avisos: string[] = []
  const nSabores = saboresPorPax(pax)

  const add = (i: ItemCardapio) => itens.push(i)
  const faltou = (oque: string) => avisos.push(`Sem opção disponível no catálogo para: ${oque}`)

  switch (serviceType) {
    // ---------------------------------------------- Welcome Coffee
    case 'welcome_coffee': {
      add({ papel: 'Pão de queijo', catalogItemId: null, nome: 'Tradicional e integral', categoria: 'pao_de_queijo', selo: 'vegetariano', quantidade: cima(pax * 2), unidade: 'un', memoria: `${pax} × 2 (0,7 trad + 0,3 integral)`, fixo: true })

      const salgados = sel.pegar('petit_four_salgado', 1)
      if (salgados[0])
        add({ papel: 'Petit four salgado', catalogItemId: salgados[0].id, nome: salgados[0].nome, descricao: salgados[0].descricao, categoria: salgados[0].categoria, selo: salgados[0].selo, quantidade: cima(pax), unidade: 'un', memoria: `${pax} × 1`, fixo: false })
      else faltou('petit four salgado')

      const doces = sel.pegar('petit_four_doce', 2)
      const qtdDoce = dividir(cima(pax), Math.max(1, doces.length))
      doces.forEach((d, i) =>
        add({ papel: 'Petit four doce', catalogItemId: d.id, nome: d.nome, descricao: d.descricao, categoria: d.categoria, selo: d.selo, quantidade: qtdDoce[i], unidade: 'un', memoria: `${pax} × 1 dividido em 2 sabores`, fixo: false })
      )
      if (doces.length < 2) faltou('petit four doce (2 sabores)')

      add({ papel: 'Café', catalogItemId: null, nome: 'Café tradicional', categoria: 'bebida', selo: null, quantidade: litros(pax, 50, 0), unidade: 'l', memoria: `${pax} × 50 ml`, fixo: true })
      add({ papel: 'Leite', catalogItemId: null, nome: 'Leite integral', categoria: 'bebida', selo: 'vegetariano', quantidade: litros(pax, 15, 0), unidade: 'l', memoria: `${pax} × 15 ml`, fixo: true })
      add({ papel: 'Água quente', catalogItemId: null, nome: 'Água quente para chá', categoria: 'bebida', selo: null, quantidade: litros(pax, 15, 0), unidade: 'l', memoria: `${pax} × 15 ml`, fixo: true })
      break
    }

    // ---------------------------------------------- Coffee Break
    case 'coffee_break': {
      const linha = (serviceLine ?? 'executive') as ServiceLine
      const fatorLanche = linha === 'basic' ? 1.5 : 1.1
      const totalLanche = comReposicao(pax * fatorLanche, repo)

      // mini lanches — 80% carne + 20% veg, contraponto obrigatório
      const nCarne = 1 + Math.floor(pax / 100)
      const nVeg = 1 + Math.floor(pax / 100)
      const carnes = sel.pegar('mini_lanche', nCarne, false)
      const vegs = sel.pegar('mini_lanche', nVeg, true)
      const qCarne = dividir(cima(totalLanche * 0.8), Math.max(1, carnes.length))
      const qVeg = dividir(cima(totalLanche * 0.2), Math.max(1, vegs.length))
      carnes.forEach((c, i) =>
        add({ papel: 'Mini lanche', catalogItemId: c.id, nome: `${c.nome} — ${paoDoLanche(c, false)}`, descricao: c.descricao, categoria: c.categoria, selo: c.selo, quantidade: qCarne[i], unidade: 'un', memoria: `80% de ${totalLanche}`, fixo: false })
      )
      vegs.forEach((v, i) =>
        add({ papel: 'Mini lanche (vegetariano)', catalogItemId: v.id, nome: `${v.nome} — ${paoDoLanche(v, true)}`, descricao: v.descricao, categoria: v.categoria, selo: v.selo, quantidade: qVeg[i], unidade: 'un', memoria: `20% de ${totalLanche}`, fixo: false })
      )
      if (!carnes.length || !vegs.length) avisos.push('Contraponto incompleto: falta opção de carne ou vegetariana no catálogo.')

      // bebezinho — sempre 2 sabores 50/50
      const totalBolo = comReposicao(pax * 1.1, repo)
      const bolos = sel.pegar('bebezinho', 2)
      const qBolo = dividir(totalBolo, Math.max(1, bolos.length))
      bolos.forEach((b, i) =>
        add({ papel: 'Cup cake', catalogItemId: b.id, nome: b.nome, descricao: b.descricao, categoria: b.categoria, selo: b.selo, quantidade: qBolo[i], unidade: 'un', memoria: `${pax} × 1,1 em 2 sabores 50/50`, fixo: false })
      )
      if (bolos.length < 2) faltou('cup cake (2 sabores)')

      // pão de queijo (fixo)
      add({ papel: 'Pão de queijo', catalogItemId: null, nome: 'Tradicional e integral', categoria: 'pao_de_queijo', selo: 'vegetariano', quantidade: comReposicao(pax * 2, repo), unidade: 'un', memoria: `${pax} × (1,5 trad + 0,5 integral)`, fixo: true })

      // categorias já usadas no cardápio — os itens a mais consultam para
      // não repetir (senão sai croissant no bloco de wrap E no adicional)
      const categoriasUsadas = new Set<string>()

      // extras por linha
      if (linha !== 'basic') {
        const wraps = sel.pegar(['barquete', 'tramezzino', 'croissant'], nSabores > 1 ? 2 : 1)
        wraps.forEach((w) => categoriasUsadas.add(w.categoria))
        const totalWrap = comReposicao(pax * 1.1, repo)
        const qW = dividir(totalWrap, Math.max(1, wraps.length))
        wraps.forEach((w, i) =>
          add({ papel: 'Wrap / tapioca / tartelete', catalogItemId: w.id, nome: w.nome, descricao: w.descricao, categoria: w.categoria, selo: w.selo, quantidade: qW[i], unidade: 'un', memoria: `${pax} × 1,1`, fixo: false })
        )
      }

      if (linha === 'executive' || linha === 'master' || linha === 'premium') {
        const fator = linha === 'master' ? 1.0 : 1.1
        const doces = sel.pegar(['verrine', 'shot_funcional', 'shot_vitaminado'], nSabores > 1 ? 2 : 1)
        const totalV = comReposicao(pax * fator, repo)
        const qV = dividir(totalV, Math.max(1, doces.length))
        doces.forEach((d, i) => {
          categoriasUsadas.add(d.categoria)
          add({ papel: d.categoria.startsWith('shot') ? 'Shot' : 'Verrine', catalogItemId: d.id, nome: d.nome, descricao: d.descricao, categoria: d.categoria, selo: d.selo, quantidade: qV[i], unidade: 'un', memoria: `${pax} × ${fator}`, fixo: false, recipiente: recipienteDe(d.categoria, serviceType) })
        })
      }

      // itens a mais: Standard +1 · Executive +2 · Master +3
      const extras = linha === 'standard' ? 1 : linha === 'executive' ? 2 : linha === 'master' ? 3 : 0
      if (extras > 0) {
        // manhã puxa salgado, tarde puxa doce
        const catsDoce = ['tartelete', 'doce_confeitaria', 'verrine']
        const catsSalgado = ['quiche', 'croissant', 'barquete', 'tramezzino']
        // "Sugestão de cardápio: VARIAR" — sem isto saía verrine duas vezes
        // (2,2 sobremesas/pax) ou croissant no wrap E no adicional
        for (let k = 0; k < extras; k++) {
          const querDoce = periodo === 'tarde' ? k < extras - (linha === 'master' ? 1 : 0) : k > 0
          const base = querDoce ? catsDoce : catsSalgado
          const inéditas = base.filter((c) => !categoriasUsadas.has(c))
          const escolhido = sel.pegar(inéditas.length ? inéditas : base, 1)[0]
          if (!escolhido) continue
          categoriasUsadas.add(escolhido.categoria)
          const total = comReposicao(pax * 1.1, repo)
          const partes = pax >= 50 ? 2 : 1
          const q = dividir(total, partes)
          // >50 pax divide o mesmo item em 2 sabores
          if (partes === 2) {
            const par = sel.pegar(escolhido.categoria, 1)[0]
            add({ papel: `Item adicional ${k + 1}`, catalogItemId: escolhido.id, nome: escolhido.nome, descricao: escolhido.descricao, categoria: escolhido.categoria, selo: escolhido.selo, quantidade: q[0], unidade: 'un', memoria: `${pax} × 1,1 · 50%`, fixo: false })
            if (par)
              add({ papel: `Item adicional ${k + 1}`, catalogItemId: par.id, nome: par.nome, descricao: par.descricao, categoria: par.categoria, selo: par.selo, quantidade: q[1], unidade: 'un', memoria: `${pax} × 1,1 · 50%`, fixo: false })
          } else {
            add({ papel: `Item adicional ${k + 1}`, catalogItemId: escolhido.id, nome: escolhido.nome, descricao: escolhido.descricao, categoria: escolhido.categoria, selo: escolhido.selo, quantidade: q[0], unidade: 'un', memoria: `${pax} × 1,1`, fixo: false })
          }
        }
      }

      // §14.3: Master = 3 itens a mais + frutas laminadas E favo de mel.
      // São dois itens diferentes: a fruta é por peso, o favo é porção.
      if (linha === 'master') {
        add({ papel: 'Frutas laminadas', catalogItemId: null, nome: 'Frutas laminadas', categoria: 'acompanhamento', selo: 'vegano', quantidade: round2((pax * 50) / 1000), unidade: 'kg', memoria: `${pax} × 50 g`, fixo: true })
        add({ papel: 'Favo de mel', catalogItemId: null, nome: 'Favo de mel', categoria: 'acompanhamento', selo: 'vegetariano', quantidade: cima(pax / 100), unidade: 'un', memoria: `1 porção a cada 100 pax · servir junto da fruta laminada`, fixo: true })
      }

      // base comum (fixa)
      add({ papel: 'Salada de frutas', catalogItemId: null, nome: 'Frutas da estação · iogurte, granola, aveia, mel e sucrilhos à parte', categoria: 'acompanhamento', selo: 'vegano', quantidade: round2((pax * 100 * (1 + repo / 100)) / 1000), unidade: 'kg', memoria: `${pax} × 100 g`, fixo: true })
      add({ papel: 'Suco', catalogItemId: null, nome: 'Suco de laranja', categoria: 'bebida', selo: 'vegano', quantidade: litros(pax, 130, repo), unidade: 'l', memoria: `${pax} × 130 ml`, fixo: true })
      add({ papel: 'Chá gelado', catalogItemId: null, nome: 'Chá mate gelado', categoria: 'bebida', selo: 'vegano', quantidade: litros(pax, 80, repo), unidade: 'l', memoria: `${pax} × 80 ml`, fixo: true })
      add({ papel: 'Café', catalogItemId: null, nome: 'Café tradicional', categoria: 'bebida', selo: null, quantidade: litros(pax, 100, repo), unidade: 'l', memoria: `${pax} × 100 ml`, fixo: true })
      add({ papel: 'Leite', catalogItemId: null, nome: 'Leite integral', categoria: 'bebida', selo: 'vegetariano', quantidade: litros(pax, 30, repo), unidade: 'l', memoria: `${pax} × 30 ml`, fixo: true })
      add({ papel: 'Água quente', catalogItemId: null, nome: 'Água quente para chá', categoria: 'bebida', selo: null, quantidade: litros(pax, 30, repo), unidade: 'l', memoria: `${pax} × 30 ml`, fixo: true })

      // §14.2 — acompanhamentos com gramatura FIXA, mesmo quando o
      // briefing diz "a gosto". Antes só existiam como texto solto na
      // linha da salada, então não chegavam à comanda nem às compras.
      const cafeL = litros(pax, 100, repo)
      const doses = cima((cafeL * 1000) / 100) // 1 sachê por dose de 100 ml
      add({ papel: 'Açúcar e adoçante', catalogItemId: null, nome: 'Açúcar e adoçante em sachê', categoria: 'acompanhamento', selo: 'vegano', quantidade: doses, unidade: 'un', memoria: `1 de cada por dose de 100 ml (${doses} doses de café)`, fixo: true, operacional: true })
      add({ papel: 'Chá em sachê', catalogItemId: null, nome: 'Chá em sachê (sortidos)', categoria: 'acompanhamento', selo: 'vegano', quantidade: cima(pax * 0.5), unidade: 'un', memoria: `${pax} × 0,5`, fixo: true, operacional: true })
      add({ papel: 'Achocolatado', catalogItemId: null, nome: 'Achocolatado em pó', categoria: 'acompanhamento', selo: 'vegetariano', quantidade: round2((pax * 3) / 1000), unidade: 'kg', memoria: `${pax} × 3 g/período · servir em pote de inox`, fixo: true, operacional: true })
      add({ papel: 'Adicionais da salada', catalogItemId: null, nome: 'Iogurte, granola, aveia, mel e sucrilhos', categoria: 'acompanhamento', selo: 'vegetariano', quantidade: round2((pax * (10 + 10 + 5 + 5)) / 1000), unidade: 'kg', memoria: `granola 10 g + aveia 10 g + mel 5 g + sucrilhos 5 g por pax (+ iogurte ${round2((pax * 20) / 1000)} l)`, fixo: true, operacional: true })
      break
    }

    // ---------------------------------------------- Coquetel / HH
    case 'coquetel':
    case 'coquetel_pizza': {
      const linha = (serviceLine ?? 'executive') as ServiceLine
      const conf: Record<string, { canapes: number; fator: number }> = {
        basic: { canapes: 4, fator: 1.1 },
        standard: { canapes: 3, fator: 1.1 },
        executive: { canapes: 3, fator: 1.1 },
        master: { canapes: 4, fator: 2.5 },
        premium: { canapes: 5, fator: 2 },
        pizza: { canapes: 3, fator: 1.1 },
        cortesia: { canapes: 2, fator: 1.1 },
      }
      const c = conf[linha] ?? conf.executive

      const canapes = sel.pegar(['canape', 'quiche', 'salgado_festa'], c.canapes)
      canapes.forEach((k) =>
        add({ papel: 'Canapé / salgadinho', catalogItemId: k.id, nome: k.nome, descricao: k.descricao, categoria: k.categoria, selo: k.selo, quantidade: comReposicao(pax * c.fator, repo), unidade: 'un', memoria: `${pax} × ${c.fator}`, fixo: false })
      )
      if (canapes.length < c.canapes) faltou(`${c.canapes} opções de canapé/salgadinho`)

      if (['standard', 'executive', 'master', 'premium'].includes(linha)) {
        add({ papel: 'Mini hambúrguer', catalogItemId: null, nome: 'Mini hambúrguer com queijo, alface e maionese verde caseira', categoria: 'coquetel_item', selo: null, quantidade: comReposicao(pax * 2, repo), unidade: 'un', memoria: `${pax} × 2 (acompanha batata, molhos Heinz)`, fixo: true })
      }

      // dips com piso de produção
      const homus = pax <= 30 ? 600 : 600 + 12 * (pax - 30)
      const guaca = pax <= 30 ? 600 : 600 + 15 * (pax - 30)
      add({ papel: 'Dip', catalogItemId: null, nome: 'Homus com pão sírio', categoria: 'dip', selo: 'vegano', quantidade: round2(homus / 1000), unidade: 'kg', memoria: pax <= 30 ? 'piso 600 g' : `600 g + 12 g × ${pax - 30}`, fixo: true })
      add({ papel: 'Dip', catalogItemId: null, nome: 'Guacamole com crocante de milho', categoria: 'dip', selo: 'vegano', quantidade: round2(guaca / 1000), unidade: 'kg', memoria: pax <= 30 ? 'piso 600 g' : `600 g + 15 g × ${pax - 30}`, fixo: true })

      // tábuas
      add({ papel: 'Tábua de frios', catalogItemId: null, nome: 'Parma, salame espanhol e pastrami', categoria: 'tabua', selo: null, quantidade: round2((pax * 6) / 1000), unidade: 'kg', memoria: `${pax} × 6 g`, fixo: true })
      add({ papel: 'Tábua de queijos', catalogItemId: null, nome: 'Provolone, gruyère e gorgonzola', categoria: 'tabua', selo: 'vegetariano', quantidade: round2((pax * 6) / 1000), unidade: 'kg', memoria: `${pax} × 6 g`, fixo: true })

      if (['executive', 'master', 'premium'].includes(linha)) {
        const pasta = sel.pegar('pasta_board', 1)[0]
        if (pasta)
          add({ papel: 'Pasta na tábua', catalogItemId: pasta.id, nome: `${pasta.nome} · mini pão sueco`, descricao: pasta.descricao, categoria: pasta.categoria, selo: pasta.selo, quantidade: round2((pax * 20) / 1000), unidade: 'kg', memoria: `${pax} × 20 g + 1 pacote de sueco/20 pax`, fixo: false })
      }

      // doces no verrine — padrão pax × 1,1 dividido entre os sabores
      const verrines = sel.pegar('verrine', 2)
      const totalV = cima(pax * 1.1)
      const qV = dividir(totalV, Math.max(1, verrines.length))
      verrines.forEach((v, i) =>
        add({ papel: 'Verrine', catalogItemId: v.id, nome: v.nome, descricao: v.descricao, categoria: v.categoria, selo: v.selo, quantidade: qV[i], unidade: 'un', memoria: `${pax} × 1,1 em ${verrines.length} sabores`, fixo: false, recipiente: recipienteDe(v.categoria, serviceType) })
      )

      add({ papel: 'Suco', catalogItemId: null, nome: 'Suco na refresqueira', categoria: 'bebida', selo: 'vegano', quantidade: litros(pax, 150, repo), unidade: 'l', memoria: `${pax} × 150 ml`, fixo: true })
      break
    }

    // ---------------------------------------------- Almoço / Jantar
    case 'almoco':
    case 'jantar': {
      const item = (papel: string, cat: CatalogItem | undefined, gPax: number, minG: number, nomeFallback: string) => {
        const calc = pax * gPax
        const usado = Math.max(calc, minG)
        add({
          papel,
          catalogItemId: cat?.id ?? null,
          nome: cat?.nome ?? nomeFallback,
          categoria: cat?.categoria ?? 'prato',
          selo: cat?.selo ?? null,
          quantidade: round2(usado / 1000),
          unidade: 'kg',
          memoria: usado > calc ? `piso de produção ${minG / 1000} kg` : `${pax} × ${gPax} g (servido)`,
          fixo: !cat,
        })
      }

      const proteinas = sel.pegar('proteina', 2)
      item('Proteína 1', proteinas[0], 140, 1000, 'Proteína 1 (a definir)')
      item('Proteína 2', proteinas[1], 140, 1000, 'Proteína 2 (a definir)')
      item('Opção vegetariana', sel.pegar('prato_vegetariano', 1)[0], 100, 1000, 'Prato vegetariano (a definir)')
      const massa = sel.pegar('massa', 1)[0]
      item('Massa', massa, 130, 1000, 'Massa (a definir)')
      item('Molho da massa', undefined, 40, 0, 'Molho da massa')
      item('Arroz', undefined, 200, 1200, 'Arroz branco')
      item('Feijão', undefined, 300, 0, 'Feijão')
      item('Salada 1 (folhas)', sel.pegar('salada', 1)[0], 80, 0, 'Mix de folhas')
      item('Salada 2 (composta)', sel.pegar('salada', 1)[0], 60, 0, 'Salada composta')
      item('Tomate-cereja', undefined, 30, 0, 'Tomate-cereja (travessa exclusiva)')
      item('Cenoura ralada', undefined, 20, 0, 'Cenoura ralada (travessa exclusiva)')

      const sobremesas = sel.pegar(['verrine', 'doce_confeitaria'], 2)
      sobremesas.forEach((s, i) =>
        add({ papel: `Sobremesa ${i + 1}`, catalogItemId: s.id, nome: s.nome, descricao: s.descricao, categoria: s.categoria, selo: s.selo, quantidade: round2((pax * 60) / 1000), unidade: 'kg', memoria: `${pax} × 60 g`, fixo: false, recipiente: recipienteDe(s.categoria, serviceType) })
      )
      add({ papel: 'Frutas laminadas', catalogItemId: null, nome: 'Frutas laminadas (sem favo)', categoria: 'acompanhamento', selo: 'vegano', quantidade: round2((pax * 50) / 1000), unidade: 'kg', memoria: `${pax} × 50 g — adicional fixo`, fixo: true })
      break
    }

    // ---------------------------------------------- Auditório
    case 'auditorio': {
      add({ papel: 'Café', catalogItemId: null, nome: 'Café tradicional', categoria: 'bebida', selo: null, quantidade: litros(pax, 150, 0), unidade: 'l', memoria: `${pax} × 150 ml por período`, fixo: true })
      add({ papel: 'Água sem gás', catalogItemId: null, nome: 'Garrafinha 500 ml', categoria: 'bebida', selo: 'vegano', quantidade: cima(pax * 1.5 * 0.6), unidade: 'un', memoria: `${pax} × 1,5 × 60%`, fixo: true })
      add({ papel: 'Água com gás', catalogItemId: null, nome: 'Garrafinha 500 ml', categoria: 'bebida', selo: 'vegano', quantidade: cima(pax * 1.5 * 0.4), unidade: 'un', memoria: `${pax} × 1,5 × 40%`, fixo: true })
      break
    }

    default:
      avisos.push(`Composição automática ainda não cobre "${serviceType}" — monte manualmente.`)
  }

  return {
    itens,
    basesConsumidas: Array.from(sel.basesConsumidas),
    avisos,
  }
}

export function formatQtd(q: number, u: string): string {
  const n = Number.isInteger(q) ? String(q) : q.toFixed(2).replace('.', ',')
  const un = u === 'un' ? 'un' : u === 'kg' ? 'kg' : u === 'l' ? 'L' : u
  return `${n} ${un}`
}

// ------------------------------------------------------------
// Formato do slide — padrão real das propostas Pieggi:
//
//   Mini lanches artesanais  ·  34 unidades      ← grupo + total (negrito)
//   Peito de peru (27) · Queijos e manjericão (7)  ← sabores com qtd
//
// Grupos fixos (bebidas, pão de queijo, salada de frutas) saem sem
// quantidade, como "Da casa" e "Bebidas" nas propostas reais.
// ------------------------------------------------------------

/** Nome do grupo como aparece no slide, por papel do item. */
const GRUPO_SLIDE: Record<string, string> = {
  'Mini lanche': 'Mini lanches artesanais',
  'Mini lanche (vegetariano)': 'Mini lanches artesanais',
  'Cup cake': 'Bolos',
  'Wrap / tapioca / tartelete': 'Salgados da casa',
  Verrine: 'Sobremesa no verrine',
  Shot: 'Shots funcionais',
  'Canapé / salgadinho': 'Canapés e salgadinhos',
  'Petit four salgado': 'Petit fours',
  'Petit four doce': 'Petit fours',
  Dip: 'Ilha de entradas',
  'Tábua de frios': 'Ilha de entradas',
  'Tábua de queijos': 'Ilha de entradas',
  'Pasta na tábua': 'Ilha de entradas',
}

/**
 * Nome do grupo pela CATEGORIA do item — é o que manda no slide.
 *
 * O papel ("Item adicional 1", "Wrap / tapioca / tartelete") diz o lugar do
 * item na composição, não o que ele é: dois "Item adicional" podem ser um
 * croissant e um dip. Agrupar por papel juntava doce com salgado e levava
 * rótulo interno para o slide do cliente.
 */
const GRUPO_POR_CATEGORIA: Record<string, string> = {
  mini_lanche: 'Mini lanches artesanais',
  bebezinho: 'Bolos',
  croissant: 'Mini croissants',
  tramezzino: 'Tramezzinos',
  quiche: 'Quiches',
  barquete: 'Barquetes',
  tartelete: 'Tarteletes',
  canape: 'Canapés e salgadinhos',
  salgado_festa: 'Salgados de festa',
  petit_four_salgado: 'Petit fours salgados',
  petit_four_doce: 'Petit fours doces',
  doce_confeitaria: 'Doces da confeitaria',
  verrine: 'Sobremesa no verrine',
  shot_funcional: 'Shots funcionais',
  shot_vitaminado: 'Shots vitaminados',
  dip: 'Ilha de entradas',
  pasta_board: 'Ilha de entradas',
  tabua: 'Ilha de entradas',
  salada: 'Saladas',
}

const GRUPO_DA_CASA = 'Da casa'
const GRUPO_BEBIDAS = 'Bebidas'

function grupoDoItem(i: ItemCardapio): string {
  if (i.categoria === 'bebida') return GRUPO_BEBIDAS
  if (i.fixo && ['pao_de_queijo', 'acompanhamento'].includes(i.categoria)) return GRUPO_DA_CASA
  return GRUPO_POR_CATEGORIA[i.categoria] ?? GRUPO_SLIDE[i.papel] ?? i.papel
}

export interface LinhaSlide {
  titulo: string
  detalhe: string
}

/**
 * Monta as linhas do slide de cardápio de UM serviço, agrupadas por
 * categoria e com as quantidades — como nas propostas que a casa envia.
 */
export function cardapioParaSlide(itens: ItemCardapio[]): LinhaSlide[] {
  const grupos = new Map<string, ItemCardapio[]>()
  // insumo de expedição não é cardápio: fica fora do slide do cliente
  for (const i of itens.filter((x) => !x.operacional)) {
    const g = grupoDoItem(i)
    if (!grupos.has(g)) grupos.set(g, [])
    grupos.get(g)!.push(i)
  }

  const linhas: LinhaSlide[] = []
  for (const [grupo, lista] of grupos) {
    const fixo = grupo === GRUPO_DA_CASA || grupo === GRUPO_BEBIDAS

    // total do grupo (só quando todos são da mesma unidade)
    const unidades = new Set(lista.map((i) => i.unidade))
    let titulo = grupo
    if (!fixo && unidades.size === 1) {
      const total = lista.reduce((s, i) => s + i.quantidade, 0)
      const un = lista[0].unidade
      titulo = `${grupo}  ·  ${
        un === 'un' ? `${Math.round(total)} unidades` : formatQtd(round2(total), un)
      }`
    }

    // sabores: "Nome (qtd) — descrição" · "Nome (qtd) — descrição"
    const detalhe = lista
      .map((i) => {
        const qtd = !fixo && lista.length > 1 && i.unidade === 'un' ? ` (${Math.round(i.quantidade)})` : ''
        // §11.6/§14.4: o recipiente vai ao lado do sabor (a plaquinha ignora)
        const rec = i.recipiente ? ` [${i.recipiente}]` : ''
        const desc = i.descricao ? ` — ${i.descricao}` : ''
        return `${i.nome}${qtd}${rec}${desc}`
      })
      .join(' · ')

    linhas.push({ titulo, detalhe })
  }
  return linhas
}

/**
 * §14.1 — água de coco é dimensionada como chá gelado: 80 ml/pax.
 * Mesma conta na programação, na comanda e na lista de compras.
 */
export function litrosAguaDeCoco(pax: number, reposicaoPct = 0): number {
  return litros(pax, 80, reposicaoPct)
}

/** Cabeçalho do slide: "COFFEE BREAK" + "Executive · manhã · 40 pessoas · 31/08". */
export function cabecalhoSlide(
  tipoLabel: string,
  linhaLabel: string | null,
  periodoLabel: string | null,
  pax: number,
  dataLabel: string
): { titulo: string; subtitulo: string } {
  return {
    titulo: tipoLabel.toUpperCase(),
    subtitulo: [linhaLabel, periodoLabel, `${pax} pessoas`, dataLabel]
      .filter(Boolean)
      .join('  ·  '),
  }
}
