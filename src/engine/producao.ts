// ============================================================
// PRODUÇÃO — comanda e plaquinha derivadas da MESMA programação
//
// Antes cada uma dessas derivações morava dentro da sua tela. Como as
// duas leem o mesmo snapshot da programação, ter duas cópias abria a
// porta para o pior erro possível da casa: imprimir plaquinha de uma
// versão e comanda de outra.
//
// Aqui são funções puras: entram programação + catálogo + pedidos,
// saem as comandas e os cards. Nada de banco, nada de React.
// ============================================================

import type { CatalogItem, EventService, Restricao, DietSeal } from '@/types'
import { formatDiaMes } from './index'
import {
  gerarEstrutura,
  horarioSaida,
  rotearItem,
  type EstacaoComanda,
} from './roteamento'
import type { ComandaLinha } from '@/lib/docx-comanda'
import type { CardPlaquinha } from '@/lib/pdf-plaquinhas'

/** Um bloco de serviço do snapshot da programação. */
export interface BlocoProgramacao {
  serviceId: string
  titulo: string
  linhas: {
    qtd: string
    receita: string
    item: string
    destaque?: 'amarelo' | 'vermelho' | null
  }[]
}

export type SecaoDia =
  | 'quente'
  | 'fria'
  | 'confeitaria'
  | 'congelado'
  | 'insumos'
  | 'adicionais'

export const SECOES: { key: SecaoDia; label: string }[] = [
  { key: 'quente', label: '🔥 Produção — Cozinha Quente' },
  { key: 'fria', label: '🧊 Produção — Cozinha Fria / Garde Manger' },
  { key: 'confeitaria', label: '🍰 Produção — Confeitaria' },
  { key: 'congelado', label: '❄ Expedição-Alimentação — CONGELADO (copeira assa no local)' },
  { key: 'insumos', label: '📦 Expedição-Alimentação — INSUMOS' },
  { key: 'adicionais', label: '🟠 Expedição-Alimentação — Comprados prontos (âmbar)' },
]

export interface DiaComandas {
  diaISO: string
  saida: string
  secoes: Record<SecaoDia, ComandaLinha[]>
  indefinidos: ComandaLinha[]
}

export interface EstadoComandas {
  dias: DiaComandas[]
  bebidasEstrutura: ComandaLinha[]
  fornecedores: ComandaLinha[]
  locacao: ComandaLinha[]
  freelancers: string
}

export interface PedidoParaComanda {
  descricao: string
  destino: string
  resolvido: boolean
}

/**
 * §8 — soma as verrines/shots por tipo de recipiente.
 *
 * A programação escreve "servir em cup de vidro" ou "servir em copo
 * bolha" ao lado do sabor; aqui isso vira contagem para a expedição
 * separar o que volta (vidro) do que é descartável (bolha). Misturar os
 * dois é o erro que a §8 chama de proibido.
 */
function contarRecipientes(dias: DiaComandas[]): { cupsVidro: number; coposBolha: number } {
  let cupsVidro = 0
  let coposBolha = 0
  for (const d of dias) {
    for (const secao of Object.values(d.secoes)) {
      for (const l of secao) {
        const qtd = parseInt(l.qtd, 10)
        if (!Number.isFinite(qtd)) continue
        const txt = l.receita.toLowerCase()
        if (txt.includes('cup de vidro')) cupsVidro += qtd
        else if (txt.includes('copo bolha')) coposBolha += qtd
      }
    }
  }
  return { cupsVidro, coposBolha }
}

// ------------------------------------------------------------
// COMANDAS — roteia cada linha da programação para a sua estação
// ------------------------------------------------------------
export function montarComandas({
  pax,
  startseFixo,
  servicos,
  blocos,
  catalogo,
  pedidos,
}: {
  pax: number
  startseFixo: boolean
  servicos: EventService[]
  blocos: BlocoProgramacao[]
  catalogo: CatalogItem[] | undefined
  pedidos: PedidoParaComanda[]
}): EstadoComandas | null {
  if (!servicos.length) return null

  const porServico = new Map(servicos.map((s) => [s.id, s]))
  const dias = Array.from(new Set(servicos.map((s) => s.dia))).sort()

  const diasComandas: DiaComandas[] = dias.map((diaISO) => {
    const servDia = servicos.filter((s) => s.dia === diaISO)
    const primeira = servDia.reduce<string | null>(
      (min, s) => (!min || (s.hora_inicio && s.hora_inicio < min) ? s.hora_inicio : min),
      null
    )
    return {
      diaISO,
      saida: horarioSaida(primeira),
      secoes: {
        quente: [],
        fria: [],
        confeitaria: [],
        congelado: [],
        insumos: [],
        adicionais: [],
      },
      indefinidos: [],
    }
  })

  const bebidas: ComandaLinha[] = []
  const fornecedores: ComandaLinha[] = []

  for (const bloco of blocos) {
    const serv = porServico.get(bloco.serviceId)
    if (!serv) continue
    const dia = diasComandas.find((d) => d.diaISO === serv.dia)
    if (!dia) continue
    const tag = bloco.titulo.split(' — ').slice(0, 2).join(' ')

    // a linha vermelha de finalização (§17.13) tem que sair na MESMA
    // estação do item que ela explica, senão a cozinha não vê o aviso
    let ultimaRota: EstacaoComanda = 'indefinido'

    for (const l of bloco.linhas) {
      const texto = `${l.receita} ${l.item}`
      // tenta achar o item do catálogo pelo nome dentro da receita
      const cat =
        catalogo?.find(
          (c) => c.nome.length > 4 && texto.toLowerCase().includes(c.nome.toLowerCase())
        ) ?? null
      const ehFinalizacao = !l.qtd && !l.item && /^(FINALIZAR|⚠)/.test(l.receita)
      const rota: EstacaoComanda = ehFinalizacao ? ultimaRota : rotearItem(texto, cat)
      if (!ehFinalizacao) ultimaRota = rota
      const linha: ComandaLinha = {
        qtd: l.qtd,
        receita: `${l.receita} [${tag}]`,
        item: l.item,
        destaque: l.destaque ?? null,
      }
      switch (rota) {
        case 'quente':
        case 'fria':
        case 'confeitaria':
        case 'congelado':
          dia.secoes[rota].push(linha)
          break
        case 'alimentacao': {
          // INSUMOS = o que a casa manda para a mesa (sachê, pó de café).
          // ADICIONAIS = comprado pronto no mercado (iogurte, granola,
          // coalhada, croutons).
          const ehInsumo =
            /(sachê|sache|açúcar|acucar|adoçante|adocante|pó de café|po de cafe|coador|filtro)/i.test(
              texto
            )
          dia.secoes[ehInsumo ? 'insumos' : 'adicionais'].push(linha)
          break
        }
        case 'bebidas':
          bebidas.push({ ...linha, receita: `${l.receita} [${formatDiaMes(serv.dia)} ${tag}]` })
          break
        case 'adriana':
          fornecedores.push({
            ...linha,
            receita: `FORNECEDOR: ${cat?.fornecedor?.toUpperCase() ?? 'LETÍCIA'} — ${l.receita} (Adriana buscar) [${formatDiaMes(serv.dia)}]`,
          })
          break
        default:
          dia.indefinidos.push(linha)
      }
    }
  }

  // estrutura automática
  const tiposCafe = ['welcome_coffee', 'coffee_break', 'auditorio', 'brunch']
  const temHH = servicos.some((s) =>
    ['coquetel', 'bar', 'coquetel_pizza'].includes(s.service_type)
  )
  const temAlmoco = servicos.some((s) => ['almoco', 'jantar'].includes(s.service_type))
  const pratosQuentes = diasComandas.reduce((a, d) => a + d.secoes.quente.length, 0)
  const estrutura = gerarEstrutura({
    pax,
    qtdServicosCafe: servicos.filter((s) => tiposCafe.includes(s.service_type)).length,
    qtdPeriodosCoffee: servicos.filter((s) => s.service_type === 'coffee_break').length,
    temHH,
    temAlmocoJantar: temAlmoco,
    temSalada: temAlmoco,
    temHamburguerOuBatata: diasComandas.some((d) =>
      d.secoes.quente.some((l) => /hambúrguer|hamburguer|batata/i.test(l.receita + l.item))
    ),
    pratosQuentes: Math.max(pratosQuentes, temAlmoco ? 6 : 0),
    startseFixo,
    // §8 — conta o recipiente que a programação escreveu ao lado do sabor
    ...contarRecipientes(diasComandas),
    // §17.2 — sachês por dose de café; auditório também serve café
    mlCafe: servicos.reduce((soma, s) => {
      const paxS = s.pax ?? pax
      // auditório serve 150 ml/pax/período; coffee e welcome, 100 ml/pax
      if (s.service_type === 'auditorio') return soma + paxS * 150
      return soma + (tiposCafe.includes(s.service_type) ? paxS * 100 : 0)
    }, 0),
    periodosAchocolatado: servicos.filter((s) => s.service_type === 'coffee_break').length,
  })

  // ⚠️ Observações/pedidos do cliente entram na comanda do DESTINO escolhido
  const ativos = pedidos.filter((p) => !p.resolvido)
  const linhaPedido = (desc: string): ComandaLinha => ({
    qtd: '⚠',
    receita: `PEDIDO DO CLIENTE: ${desc}`,
    item: 'ATENÇÃO',
    destaque: 'vermelho',
  })
  for (const p of ativos) {
    const linha = linhaPedido(p.descricao)
    if (p.destino === 'cozinha') {
      for (const d of diasComandas) {
        d.secoes.quente.push(linha)
        d.secoes.fria.push(linha)
        d.secoes.confeitaria.push(linha)
      }
    } else if (p.destino === 'expedicao') {
      bebidas.push(linha)
    } else if (p.destino === 'adriana') {
      fornecedores.push(linha)
    }
  }

  return {
    dias: diasComandas,
    bebidasEstrutura: [
      ...bebidas,
      ...estrutura.map((e) => ({
        qtd: e.qtd,
        receita: e.receita,
        item: e.item,
        destaque: e.destaque,
      })),
    ],
    fornecedores,
    locacao: [],
    freelancers: '',
  }
}

// ------------------------------------------------------------
// PLAQUINHAS — um card por item SERVIDO
// ------------------------------------------------------------

/** Itens que NUNCA geram plaquinha (rótulo próprio / decoração / estrutura). */
const NAO_GERA =
  /(água (com|sem) gás|agua (com|sem) gás|garrafinha|refrigerante|cerveja|vinho\b|heinz|sachê|sache|açúcar|acucar|adoçante|adocante|mexedor|frutas laminadas|favo de mel|etiquetas|programação impressa|caixa |kit de limpeza|uniforme|luvas|toucas|gelo\b|copos|pratos|garfos|transformador|extensão|placa|bandeja|champanheira|réchaud|rechaud|galheteiro|tabasco|molho da |opção sem lactose)/i

const CAT_MAP: Record<string, { sub: string; en: string; es: string }> = {
  mini_lanche: { sub: 'MINI LANCHE', en: 'SANDWICH', es: 'SÁNDWICH' },
  bebezinho: { sub: 'CUP CAKE', en: 'CUPCAKE', es: 'CUPCAKE' },
  verrine: { sub: 'VERRINE', en: 'VERRINE', es: 'VERRINE' },
  shot_funcional: { sub: 'SHOT', en: 'SHOT', es: 'SHOT' },
  shot_vitaminado: { sub: 'SHOT', en: 'SHOT', es: 'SHOT' },
  petit_four_salgado: { sub: 'PETIT FOUR', en: 'PETIT FOUR', es: 'PETIT FOUR' },
  petit_four_doce: { sub: 'PETIT FOUR', en: 'PETIT FOUR', es: 'PETIT FOUR' },
  croissant: { sub: 'CROISSANT', en: 'CROISSANT', es: 'CROISSANT' },
  tramezzino: { sub: 'TRAMEZZINO', en: 'TRAMEZZINO', es: 'TRAMEZZINO' },
  barquete: { sub: 'BARQUETE', en: 'TAPIOCA BOAT', es: 'BARQUETA' },
  tartelete: { sub: 'TARTELETE', en: 'TARTLET', es: 'TARTALETA' },
  quiche: { sub: 'QUICHE', en: 'QUICHE', es: 'QUICHE' },
  canape: { sub: 'CANAPÉ', en: 'CANAPÉ', es: 'CANAPÉ' },
  pasta_board: { sub: 'PASTA NA TÁBUA', en: 'CHEESE SPREAD', es: 'PASTA' },
  doce_confeitaria: { sub: '', en: '', es: '' },
  wrap: { sub: 'WRAP', en: 'WRAP', es: 'WRAP' },
  tapioca: { sub: 'TAPIOCA', en: 'TAPIOCA', es: 'TAPIOCA' },
}

export function montarPlaquinhas({
  servicos,
  blocos,
  catalogo,
  restricoes,
}: {
  servicos: EventService[]
  blocos: BlocoProgramacao[]
  catalogo: CatalogItem[] | undefined
  restricoes: Restricao[]
}): CardPlaquinha[] {
  if (!servicos.length) return []
  const porServico = new Map(servicos.map((s) => [s.id, s]))
  const out: CardPlaquinha[] = []
  const vistos = new Set<string>() // dedup no PDF inteiro (decisão travada)
  let poosDia: string | null = null // pão de queijo agrupado — 1 card por evento

  function push(c: CardPlaquinha) {
    const chave = `${c.titulo}|${c.sub}`.toLowerCase()
    if (vistos.has(chave)) return
    vistos.add(chave)
    out.push(c)
  }

  for (const bloco of blocos) {
    const serv = porServico.get(bloco.serviceId)
    if (!serv) continue
    const dia = serv.dia

    for (const l of bloco.linhas) {
      // linhas de instrução da produção (finalização no local, alertas de
      // cardápio) não são item servido — nunca viram plaquinha
      if (!l.qtd && !l.item && /^(FINALIZAR|⚠)/.test(l.receita)) continue

      const texto = `${l.receita} ${l.item}`
      const t = texto.toLowerCase()
      if (NAO_GERA.test(t)) continue

      // pão de queijo — agrupar trad + integral num card único
      if (t.includes('pão de queijo') || t.includes('pao de queijo')) {
        if (/vegano/.test(t)) {
          push({ dia, titulo: 'PÃO DE QUEIJO', sub: 'VEGANO — CORTESIA', en: 'CHEESE BREAD / Vegan', es: 'PAN DE QUESO / Vegano', selo: 'vegano' })
        } else if (/sem lactose/.test(t)) {
          push({ dia, titulo: 'PÃO DE QUEIJO', sub: 'SEM LACTOSE', en: 'CHEESE BREAD / Lactose Free', es: 'PAN DE QUESO / Sin Lactosa', selo: 'sem_lactose' })
        } else if (!poosDia) {
          poosDia = dia
          push({ dia, titulo: 'TRADICIONAL E INTEGRAL', sub: 'PÃO DE QUEIJO', en: 'CHEESE BREAD / Traditional & Multigrain', es: 'PAN DE QUESO / Tradicional y Multigrano', selo: 'vegetariano' })
        }
        continue
      }

      // salada de frutas — 2 cards
      if (t.includes('salada de frutas')) {
        push({ dia, titulo: 'SALADA DE FRUTAS', sub: '', en: 'FRUIT SALAD', es: 'ENSALADA DE FRUTAS', selo: 'vegano' })
        push({ dia, titulo: 'IOGURTE, GRANOLA, AVEIA, SUCRILHOS E MEL', sub: 'ADICIONAIS', en: 'TOPPINGS', es: 'ADICIONALES', selo: null })
        continue
      }

      // bebidas padrão (categoria no título — exceção da hierarquia)
      if (/^caf[ée]\b|caf[ée] tradicional/.test(t) || l.item.toLowerCase() === 'café') {
        push({ dia, titulo: 'CAFÉ', sub: 'TRADICIONAL', en: 'COFFEE / Traditional', es: 'CAFÉ / Tradicional', selo: null })
        continue
      }
      if (/leite vegetal|leite de aveia/.test(t)) {
        push({ dia, titulo: 'LEITE DE AVEIA', sub: '', en: 'OAT MILK', es: 'LECHE DE AVENA', selo: 'vegano' })
        continue
      }
      if (/leite sem lactose/.test(t)) {
        push({ dia, titulo: 'LEITE', sub: 'SEM LACTOSE', en: 'MILK / Lactose Free', es: 'LECHE / Sin Lactosa', selo: 'sem_lactose' })
        continue
      }
      if (/^leite\b|\bleite\b/.test(l.item.toLowerCase())) {
        push({ dia, titulo: 'LEITE', sub: 'QUENTE', en: 'MILK / Hot', es: 'LECHE / Caliente', selo: 'vegetariano' })
        continue
      }
      if (/água quente|agua quente/.test(t)) {
        push({ dia, titulo: 'ÁGUA QUENTE', sub: 'PARA CHÁ', en: 'HOT WATER / For Tea', es: 'AGUA CALIENTE / Para Té', selo: null })
        continue
      }
      if (/chá|cha mate|chá mate/.test(l.item.toLowerCase())) {
        push({ dia, titulo: 'CHÁ', sub: 'GELADO', en: 'TEA / Iced', es: 'TÉ / Helado', selo: 'vegano' })
        continue
      }
      if (/suco/.test(t)) {
        const m = t.match(/suco de ([a-zà-ú çãõéíáê]+)/)
        const sabor = (m?.[1] ?? 'laranja').trim().toUpperCase()
        push({ dia, titulo: 'SUCO', sub: sabor, en: `JUICE / ${sabor}`, es: `JUGO / ${sabor}`, selo: 'vegano' })
        continue
      }
      // §8 — o achocolatado é bebida da mesa e TEM plaquinha
      if (/achocolatado|nescau/.test(t)) {
        push({ dia, titulo: 'ACHOCOLATADO', sub: 'EM PÓ', en: 'CHOCOLATE MILK / Powder', es: 'ACHOCOLATADO / En Polvo', selo: 'vegetariano' })
        continue
      }

      // item do catálogo — título = sabor, sub = categoria
      const cat = catalogo?.find((c) => c.nome.length > 4 && t.includes(c.nome.toLowerCase()))
      if (cat) {
        if (cat.proibido) continue
        const map = CAT_MAP[cat.categoria] ?? { sub: '', en: '', es: '' }
        push({
          dia,
          titulo: cat.nome.toUpperCase(),
          sub: map.sub,
          en: cat.nome_en ? `${map.en}${map.en ? ' / ' : ''}${cat.nome_en}` : map.en,
          es: cat.nome_es ? `${map.es}${map.es ? ' / ' : ''}${cat.nome_es}` : map.es,
          selo: cat.selo as DietSeal | null,
        })
        continue
      }

      // fallback: usa o texto da linha (título = receita curta, sub = item)
      // §16.4 — o recipiente (copo bolha × cup de vidro) é detalhe de
      // expedição e NUNCA aparece na plaquinha
      const receitaCurta = l.receita
        .split('—')[0]
        .split('[')[0]
        .replace(/\s*\((?:copo bolha|cup de vidro)\)/gi, '')
        .trim()
      if (receitaCurta.length > 2) {
        push({
          dia,
          titulo: receitaCurta.toUpperCase(),
          sub: l.item.toUpperCase(),
          en: '',
          es: '',
          selo: null,
        })
      }
    }
  }

  // cards CONTÉM {X} — quando há restrições (ficam após os de identificação)
  for (const r of restricoes) {
    const tipo = r.tipo.toUpperCase()
    out.push({
      dia: servicos[0].dia,
      titulo: `CONTÉM ${tipo}`,
      sub: '',
      en: `CONTAINS ${tipo}`,
      es: `CONTIENE ${tipo}`,
      selo: null,
      tipo: 'contem',
    })
  }

  return out
}
