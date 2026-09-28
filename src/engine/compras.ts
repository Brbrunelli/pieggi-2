// ============================================================
// CONSOLIDAÇÃO DE COMPRAS (multi-evento, filtro de datas)
// Mentalidade: comprador da fábrica — converter produção em compra.
// Nunca inventar/estimar: sem regra → "A classificar" (nunca omitir).
// Regras: brioche 15 g principal + 10 g muçarela + 10 g ricota ·
// café L→garrafas 1,8→filtros→pó 50 g→pacotes 500 g · dose 100 ml ·
// salada de frutas receita padrão · tramezzino ×3/4 fatias ÷20 pacote ·
// itens básicos sempre no final.
// ============================================================

import { round2 } from './index'

const cima = Math.ceil

export interface LinhaCompra {
  item: string
  quantidade: string
  obs?: string
}

export interface SecaoCompra {
  titulo: string
  linhas: LinhaCompra[]
}

export interface LinhaFonte {
  dia: string // yyyy-mm-dd
  qtd: string // "38 un" | "3,5 l" | "2,2 kg"
  receita: string
  item: string
}

interface Quantia {
  valor: number
  unidade: string
}

function parseQtd(txt: string): Quantia | null {
  const m = txt
    .toLowerCase()
    .match(/([\d.]+(?:,\d+)?)\s*(un|und|kg|g\b|l\b|litros?|ml|pacotes?|garrafas?|potes?|kits?)/)
  if (!m) return null
  const valor = parseFloat(m[1].replace(/\.(?=\d{3})/g, '').replace(',', '.'))
  let unidade = m[2].replace(/s$/, '')
  if (unidade === 'litro') unidade = 'l'
  if (unidade === 'und') unidade = 'un'
  return { valor, unidade }
}

function emKg(q: Quantia): number | null {
  if (q.unidade === 'kg') return q.valor
  if (q.unidade === 'g') return q.valor / 1000
  return null
}

function emL(q: Quantia): number | null {
  if (q.unidade === 'l') return q.valor
  if (q.unidade === 'ml') return q.valor / 1000
  return null
}

const RECEITA_SALADA_FRUTAS: [string, number][] = [
  ['Mamão', 17.5],
  ['Melão', 17.5],
  ['Manga', 17.5],
  ['Abacaxi', 17.5],
  ['Uva', 15],
  ['Morango', 10],
  ['Kiwi', 5],
]

const ITENS_BASICOS: [string, string[]][] = [
  ['Hortifruti', ['cebola', 'alho', 'gengibre', 'tomate', 'cenoura', 'beterraba', 'pepino', 'alface crespa', 'couve', 'melancia']],
  ['Ervas frescas', ['ciboulette', 'cebolinha', 'salsinha', 'coentro', 'manjericão', 'hortelã', 'alecrim']],
  ['Mercearia', ['arroz', 'feijão preto', 'feijão carioca', 'farinha de mandioca', 'tahine', 'nozes', 'azeitonas', 'sachês de chá', 'vinagre', 'shoyo', 'mel']],
  ['Óleos / gorduras / secos', ['azeite', 'óleo', 'manteiga', 'margarina', 'sal refinado', 'pimenta do reino', 'louro']],
  ['Condimentos e ovos', ['maionese', 'mostarda', 'ovos']],
  ['Almoço dos funcionários', ['carnes', 'frangos', 'batatas', 'arroz', 'feijão (preto e carioca)', 'farinha de mandioca']],
]

/** Filtra por intervalo de datas (inclusive) e consolida tudo numa compra só. */
export function consolidarCompras(
  linhas: LinhaFonte[],
  dataInicio?: string,
  dataFim?: string
): SecaoCompra[] {
  const fonte = linhas.filter(
    (l) => (!dataInicio || l.dia >= dataInicio) && (!dataFim || l.dia <= dataFim)
  )

  // acumuladores
  let briocheTradicional = 0
  let briocheCenoura = 0
  const principais = new Map<string, number>() // sabor → unidades
  let hamburgueres = 0
  const paoQueijo = new Map<string, number>()
  let tramezzinos = 0
  let cafeL = 0
  let leiteL = 0
  let chaL = 0
  const sucosL = new Map<string, number>()
  let aguaQuenteL = 0
  let saladaFrutasKg = 0
  let cupcakes = 0
  let verrines = 0
  const refrigerantes = new Map<string, number>()
  const cervejas = new Map<string, number>()
  const leticia: LinhaCompra[] = []
  const mercadoExtras = new Set<string>()
  const aClassificar = new Map<string, { qtd: string; obs: string }>()
  // categorias da revisão 28/07
  const producaoInterna: LinhaCompra[] = []
  const rotisseria: LinhaCompra[] = []
  const luigi: LinhaCompra[] = []
  const bebidasExtras: LinhaCompra[] = []
  const arranjos: LinhaCompra[] = []
  const mercadoAvulso: LinhaCompra[] = []
  let wraps = 0
  let cupsVidro = 0
  let coposBolha = 0
  let guacamoleKg = 0

  for (const l of fonte) {
    const texto = `${l.receita} ${l.item}`.toLowerCase()
    const q = parseQtd(l.qtd)

    // ---- mini lanches (brioche) ----
    if (/mini lanche/.test(texto)) {
      const un = q?.unidade === 'un' ? q.valor : 0
      if (/cenoura/.test(texto) || /vegetariano|veg\b|queijos e/.test(texto)) briocheCenoura += un
      else briocheTradicional += un
      // principal = trecho antes do "—"
      const sabor = l.receita.split('—')[0].split('[')[0].trim()
      if (sabor && !/vegetariano|queijos/i.test(sabor)) {
        principais.set(sabor, (principais.get(sabor) ?? 0) + un)
      }
      continue
    }

    if (/hambúrguer|hamburguer/.test(texto) && q?.unidade === 'un') {
      hamburgueres += q.valor
      continue
    }

    // ---- pão de queijo ----
    if (/p[ãa]o de queijo/.test(texto) && q?.unidade === 'un') {
      const tipo = /vegano/.test(texto)
        ? 'Vegano'
        : /sem lactose/.test(texto)
          ? 'Sem lactose'
          : /integral|multigr/.test(texto)
            ? 'Multigrão (= integral)'
            : 'Tradicional'
      paoQueijo.set(tipo, (paoQueijo.get(tipo) ?? 0) + q.valor)
      continue
    }

    // ---- tramezzino ----
    if (/tramezzino/.test(texto) && q?.unidade === 'un') {
      tramezzinos += q.valor
      continue
    }

    // ---- bebidas ----
    if (/caf[ée]/.test(texto) && !/final/.test(texto)) {
      const litros = q ? emL(q) : null
      if (litros) {
        cafeL += litros
        continue
      }
    }
    if (/\bleite\b/.test(texto)) {
      const litros = q ? emL(q) : null
      if (litros) {
        leiteL += litros
        continue
      }
    }
    if (/ch[áa]( mate)? gelado|ch[áa] gelado/.test(texto)) {
      const litros = q ? emL(q) : null
      if (litros) {
        chaL += litros
        continue
      }
    }
    if (/água quente|agua quente/.test(texto)) {
      const litros = q ? emL(q) : null
      if (litros) {
        aguaQuenteL += litros
        continue
      }
    }
    if (/suco/.test(texto)) {
      const litros = q ? emL(q) : null
      if (litros) {
        const m = texto.match(/suco de ([a-zà-ú çãõéíáê]+?)(\s*\[|\s*—|$)/)
        const sabor = (m?.[1] ?? 'laranja').trim()
        sucosL.set(sabor, (sucosL.get(sabor) ?? 0) + litros)
        continue
      }
    }
    // Cuidado com o limite de palavra: sem \b, "cocada" e "coco" viravam
    // Coca-Cola — uma verrine de cocada virava 50 latas na lista de compras.
    if (/\b(refrigerante|pepsi|coca-cola|coca cola|guaran[áa])\b/.test(texto)) {
      const marca = /pepsi/.test(texto)
        ? 'Pepsi (lata)'
        : /guaran/.test(texto)
          ? 'Guaraná Antarctica (lata)'
          : 'Coca-Cola (lata)'
      refrigerantes.set(marca, (refrigerantes.get(marca) ?? 0) + (q?.valor ?? 0))
      continue
    }
    if (/cerveja|budweiser|heineken/.test(texto)) {
      const marca = /budweiser/.test(texto)
        ? 'Budweiser'
        : /heineken/.test(texto)
          ? 'Heineken'
          : 'Cerveja (marca a confirmar)'
      const tipo = /long ?neck/.test(texto) ? 'long neck' : 'lata'
      const chave = `${marca} (${tipo})`
      cervejas.set(chave, (cervejas.get(chave) ?? 0) + (q?.valor ?? 0))
      continue
    }

    // ---- salada de frutas ----
    if (/salada de frutas/.test(texto)) {
      const kg = q ? emKg(q) : null
      if (kg) {
        saladaFrutasKg += kg
        continue
      }
    }

    // ---- doces por embalagem ----
    if (/cup ?cake|bebezinho/.test(texto) && q?.unidade === 'un') {
      cupcakes += q.valor
      continue
    }
    if (/verrine/.test(texto) && q?.unidade === 'un') {
      verrines += q.valor
      // §5.1 — copo bolha é DESCARTÁVEL e não entra na contagem de vidro
      if (/cup de vidro/.test(texto)) cupsVidro += q.valor
      else if (/copo bolha|copinho bolha/.test(texto)) coposBolha += q.valor
      continue
    }

    // §4 — wrap: 1 disco rende 3 wraps, 1 pacote traz 10 discos
    if (/\bwrap\b/.test(texto) && q?.unidade === 'un') {
      wraps += q.valor
      continue
    }

    // §4 — guacamole compra 50% abacate + 50% avocado
    if (/guacamole/.test(texto) && q?.unidade === 'kg') {
      guacamoleKg += q.valor
      continue
    }

    // ---- §17.3 produção interna — NUNCA encomenda, NUNCA "a classificar"
    if (/croissant|p[ãa]o de batata/.test(texto)) {
      producaoInterna.push({
        item: l.receita.split('[')[0].trim() || l.item,
        quantidade: l.qtd,
        obs: 'PRODUÇÃO INTERNA (Confeitaria/Panificação) — comprar só os insumos',
      })
      continue
    }

    // ---- fornecedor Letícia ----
    // "quibe" e "kibe" aparecem escritos das duas formas nas fichas
    if (
      /(esfiha|[kq]uibe|coxinha|bolinha de queijo|empada|mini pizza|salgadinho de festa|t[áa]bua de frios|p[ãa]es? do hh|frios do hh|baguel|bisquit)/.test(
        texto
      )
    ) {
      leticia.push({ item: l.receita.split('[')[0].trim() || l.item, quantidade: l.qtd, obs: 'leticia — encomendar' })
      continue
    }

    // ---- §3 Rotisseria (massas frescas) e Luigi (pizza) ----
    if (/(nhoque|ravioli|raviole)/.test(texto)) {
      rotisseria.push({
        item: l.receita.split('[')[0].trim() || l.item,
        quantidade: l.qtd,
        obs: 'ROTISSERIA — massa fresca (o molho é produção Pieggi, não entra aqui)',
      })
      continue
    }
    if (/\bpizza\b/.test(texto) && !/mini pizza/.test(texto)) {
      luigi.push({ item: l.receita.split('[')[0].trim() || l.item, quantidade: l.qtd, obs: 'LUIGI — encomendar' })
      continue
    }

    // ---- §2/§5 bebidas extras (vinho, champagne, espumante) ----
    if (/(vinho|champagne|champanhe|espumante|prosecco)/.test(texto)) {
      bebidasExtras.push({
        item: l.receita.split('[')[0].trim() || l.item,
        quantidade: l.qtd,
        obs: 'BEBIDAS IMIGRANTES — fora do padrão da casa',
      })
      continue
    }

    // ---- extras de mercado (listar sem cálculo) ----
    const extras = ['salmão defumado', 'carpaccio', 'cream cheese', 'shimeji', 'geleia de damasco', 'catupiry', 'coalhada', 'repolho roxo', 'burrata', 'brie', 'gorgonzola', 'pitaya', 'toranja']
    const achou = extras.find((e) => texto.includes(e))
    if (achou) {
      mercadoExtras.add(achou)
      // não continue — item também pode precisar de classificação própria
    }

    // ---- §4 — estes SÃO compra, apesar de virem da expedição ----
    // gelo e arranjo de flores estavam sendo descartados junto com a
    // estrutura; os dois são item de compra em TODO evento que precisa
    if (/gelo\b/.test(texto)) {
      mercadoAvulso.push({ item: 'Gelo', quantidade: l.qtd, obs: 'mercado — 1 pacote de 3 kg a cada 25 pax' })
      continue
    }
    if (/arranjo de flores/.test(texto)) {
      arranjos.push({ item: l.receita.split('[')[0].trim(), quantidade: l.qtd, obs: 'todo evento leva 1 arranjo' })
      continue
    }
    if (/água saborizada|agua saborizada/.test(texto)) {
      mercadoAvulso.push(
        { item: 'Água em galão', quantidade: l.qtd, obs: 'água saborizada — enviar separado' },
        { item: 'Limão siciliano', quantidade: '—', obs: 'água saborizada — copeiras montam no local' },
        { item: 'Alecrim', quantidade: '—', obs: 'água saborizada — copeiras montam no local' }
      )
      continue
    }

    // ---- itens de estrutura/expedição não são compra de alimento ----
    if (/(caixa |etiquetas|programação impressa|copos|pratos|garfos|uniforme|luvas|toucas|kit de limpeza|infra|placa|transformador|extensão|bandeja|champanheira|réchaud|rechaud|galheteiro|kit saladas)/.test(texto)) {
      continue
    }

    // ---- sem regra → A classificar (nunca omitir) ----
    const chave = (l.receita.split('[')[0].trim() || l.item).slice(0, 80)
    if (chave) {
      const existente = aClassificar.get(chave)
      aClassificar.set(chave, {
        qtd: existente ? `${existente.qtd} + ${l.qtd}` : l.qtd,
        obs: 'sem regra cadastrada — classificar',
      })
    }
  }

  // ---------- montar seções ----------
  const secoes: SecaoCompra[] = []

  // 1. Mini lanches
  const s1: LinhaCompra[] = []
  if (briocheTradicional)
    s1.push({ item: 'Mini brioche tradicional', quantidade: `${cima(briocheTradicional)} un`, obs: 'lanches com carne' })
  if (briocheCenoura)
    s1.push({ item: 'Mini brioche de cenoura', quantidade: `${cima(briocheCenoura)} un`, obs: 'lanches vegetarianos' })
  if (hamburgueres)
    s1.push({ item: 'Pão de hambúrguer (brioche tradicional)', quantidade: `${cima(hamburgueres)} un`, obs: 'linha separada' })
  const totalBrioches = briocheTradicional + briocheCenoura + hamburgueres
  if (totalBrioches)
    s1.push({ item: 'TOTAL DE BRIOCHES', quantidade: `${cima(totalBrioches)} un`, obs: 'mini lanches + hambúrguer' })
  for (const [sabor, un] of principais) {
    s1.push({ item: `Principal: ${sabor}`, quantidade: `${round2((un * 15) / 1000)} kg`, obs: `${un} un × 15 g` })
  }
  const totalLanches = briocheTradicional + briocheCenoura
  if (totalLanches) {
    s1.push(
      { item: 'Muçarela (base)', quantidade: `${round2((totalLanches * 10) / 1000)} kg`, obs: `${totalLanches} un × 10 g` },
      { item: 'Ricota (base)', quantidade: `${round2((totalLanches * 10) / 1000)} kg`, obs: `${totalLanches} un × 10 g` }
    )
  }
  if (s1.length) secoes.push({ titulo: '1. Mini lanches (+ ingredientes)', linhas: s1 })

  // 2. Pão de queijo
  if (paoQueijo.size)
    secoes.push({
      titulo: '2. Pão de queijo',
      linhas: Array.from(paoQueijo).map(([t, v]) => ({ item: `Pão de queijo ${t}`, quantidade: `${cima(v)} un` })),
    })

  // 3. Tramezzino
  if (tramezzinos) {
    const fatias = cima((tramezzinos * 3) / 4)
    secoes.push({
      titulo: '3. Tramezzino / pão de forma',
      linhas: [
        { item: 'Tramezzinos', quantidade: `${cima(tramezzinos)} un` },
        { item: 'Fatias de pão de forma sem casca', quantidade: `${fatias} fatias`, obs: '3 fatias = 4 tramezzinos' },
        { item: 'Pacotes de pão de forma', quantidade: `${cima(fatias / 20)} pacote(s)`, obs: '20 fatias/pacote' },
      ],
    })
  }

  // 4. Café e mesa
  if (cafeL > 0) {
    const garrafas = cima(cafeL / 1.8)
    const poG = garrafas * 50
    const doses = cima((cafeL * 1000) / 100)
    secoes.push({
      titulo: '4. Café e mesa',
      linhas: [
        { item: 'Café (total)', quantidade: `${round2(cafeL)} L` },
        { item: 'Garrafas térmicas', quantidade: `${garrafas} garrafa(s)`, obs: '1,8 L/garrafa — enviar escaldadas' },
        { item: 'Filtros de papel', quantidade: `${garrafas} un`, obs: '1 por garrafa' },
        { item: 'Café em pó', quantidade: `${poG} g`, obs: '50 g/garrafa' },
        { item: 'Pacotes de café (500 g)', quantidade: `${cima(poG / 500)} pacote(s)` },
        { item: 'Sachês de açúcar', quantidade: `${doses} un`, obs: '1/dose de 100 ml' },
        { item: 'Sachês de adoçante', quantidade: `${doses} un`, obs: '1/dose de 100 ml' },
      ],
    })
  }

  // 5. Leite / chá / água quente
  const s5: LinhaCompra[] = []
  if (leiteL) s5.push({ item: 'Leite integral', quantidade: `${round2(leiteL)} L` })
  if (chaL) s5.push({ item: 'Chá mate gelado (= chá gelado)', quantidade: `${round2(chaL)} L` })
  if (aguaQuenteL) s5.push({ item: 'Água quente p/ chá', quantidade: `${round2(aguaQuenteL)} L`, obs: 'sachês de chá nos itens básicos' })
  if (s5.length) secoes.push({ titulo: '5. Leite e chás', linhas: s5 })

  // 6. Sucos por sabor
  if (sucosL.size)
    secoes.push({
      titulo: '6. Sucos (por sabor)',
      linhas: Array.from(sucosL).map(([s, v]) => ({ item: `Suco de ${s}`, quantidade: `${round2(v)} L` })),
    })

  // 7. Refrigerantes e cerveja
  const s7: LinhaCompra[] = [
    ...Array.from(refrigerantes).map(([m, v]) => ({
      item: m,
      quantidade: v ? `${cima(v)} un` : 'qtd conforme comanda',
      obs: 'SOMENTE LATA — nunca PET/2L',
    })),
    ...Array.from(cervejas).map(([m, v]) => ({
      item: m,
      quantidade: v ? `${cima(v)} un` : 'qtd conforme comanda',
    })),
  ]
  if (s7.length) secoes.push({ titulo: '7. Refrigerantes e cerveja (por marca e tipo)', linhas: s7 })

  // 8. Salada de frutas — receita padrão
  if (saladaFrutasKg > 0) {
    secoes.push({
      titulo: '8. Salada de frutas (receita padrão)',
      linhas: [
        { item: 'Peso total', quantidade: `${round2(saladaFrutasKg)} kg` },
        ...RECEITA_SALADA_FRUTAS.map(([fruta, pct]) => ({
          item: fruta,
          quantidade: `${round2((saladaFrutasKg * pct) / 100)} kg`,
          obs: `${pct}%`,
        })),
      ],
    })
  }

  // 9. Doces por embalagem
  const s9: LinhaCompra[] = []
  if (cupcakes) s9.push({ item: 'Forminhas para cup cake/bebezinho', quantidade: `${cima(cupcakes)} un` })
  if (s9.length) secoes.push({ titulo: '9. Doces (por embalagem)', linhas: s9 })

  // 9.1 §5.1 — COPOS BOLHA é categoria própria: só descartável.
  // Vidro volta para a casa e não se compra; misturar os dois inflava a
  // compra todo mês.
  const s91: LinhaCompra[] = []
  if (coposBolha)
    s91.push({ item: 'Copo bolha (descartável)', quantidade: `${cima(coposBolha * 1.1)} un`, obs: 'verrine/shot do coffee — comprar' })
  if (cupsVidro)
    s91.push({ item: 'Cup mini de vidro', quantidade: `${cima(cupsVidro)} un`, obs: 'NÃO COMPRAR — é da casa, volta do evento (conferir estoque)' })
  const semRecipiente = verrines - coposBolha - cupsVidro
  if (semRecipiente > 0)
    s91.push({ item: 'Verrines sem recipiente definido', quantidade: `${cima(semRecipiente)} un`, obs: 'PERGUNTAR: copo bolha ou vidro?' })
  if (s91.length) secoes.push({ titulo: '9.1. Copos bolha × cup de vidro', linhas: s91 })

  // 9.2 §4 — wrap por pacote de disco
  if (wraps) {
    const discos = cima(wraps / 3)
    const pacotes = cima(discos / 10)
    secoes.push({
      titulo: '9.2. Discos de wrap (mercado)',
      linhas: [
        { item: 'Pacote de disco de wrap', quantidade: `${pacotes} pacote(s)`, obs: `${wraps} wraps ÷ 3 = ${discos} discos ÷ 10 por pacote` },
      ],
    })
  }

  // 9.3 §4 — guacamole 50% abacate + 50% avocado
  if (guacamoleKg) {
    secoes.push({
      titulo: '9.3. Guacamole',
      linhas: [
        { item: 'Abacate', quantidade: `${round2(guacamoleKg / 2)} kg`, obs: '50% do total de guacamole' },
        { item: 'Avocado', quantidade: `${round2(guacamoleKg / 2)} kg`, obs: '50% do total de guacamole' },
      ],
    })
  }

  // 10. Fornecedores
  if (leticia.length) secoes.push({ titulo: '10. Fornecedor Padaria Letícia (encomendar)', linhas: leticia })
  if (rotisseria.length) secoes.push({ titulo: '10.1. Rotisseria — massas frescas', linhas: rotisseria })
  if (luigi.length) secoes.push({ titulo: '10.2. Luigi — pizza', linhas: luigi })

  // 10.3 §17.3 — produção interna: aparece para ninguém encomendar por engano
  if (producaoInterna.length)
    secoes.push({
      titulo: '10.3. PRODUÇÃO INTERNA PIEGGI — não encomendar de fornecedor',
      linhas: producaoInterna,
    })

  // 14. §2/§5 — bebidas extras
  if (bebidasExtras.length)
    secoes.push({ titulo: '14. Bebidas extras — Bebidas Imigrantes', linhas: bebidasExtras })

  // 15. §4 — arranjo de flores (todo evento)
  if (arranjos.length) secoes.push({ titulo: '15. Arranjo de flores', linhas: arranjos })

  // 15.1 mercado — avulsos que vêm da expedição (gelo, água saborizada)
  if (mercadoAvulso.length)
    secoes.push({ titulo: '15.1. Mercado — insumos avulsos', linhas: mercadoAvulso })

  // 11. Mercado — extras sem cálculo
  if (mercadoExtras.size)
    secoes.push({
      titulo: '11. Mercado — extras (sem cálculo, apareceram no cardápio)',
      linhas: Array.from(mercadoExtras).map((e) => ({ item: e, quantidade: '—', obs: 'comprar; acompanhamentos conforme regra' })),
    })

  // A classificar (nunca omitir)
  if (aClassificar.size)
    secoes.push({
      titulo: '17. A CLASSIFICAR (sem regra cadastrada — definir depois, nunca omitir)',
      linhas: Array.from(aClassificar).map(([item, v]) => ({ item, quantidade: v.qtd, obs: v.obs })),
    })

  // Itens básicos — sempre no final
  secoes.push({
    titulo: '16. ITENS BÁSICOS QUE NÃO PODEM FALTAR (sempre)',
    linhas: ITENS_BASICOS.flatMap(([grupo, itens]) =>
      itens.map((i) => ({ item: i, quantidade: '—', obs: grupo }))
    ),
  })

  return secoes
}
