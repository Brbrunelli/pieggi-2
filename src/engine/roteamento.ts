// ============================================================
// ROTEAMENTO DE ESTAÇÕES (Comandas) + estrutura de expedição
// Regra: item do catálogo usa a estação cadastrada; sem catálogo,
// heurística por texto. Ambíguo → fila "a rotear" (perguntar, nunca chutar).
// ============================================================

import type { CatalogItem } from '@/types'
import { qtdGelo, round2 } from './index'

export type EstacaoComanda =
  | 'quente'
  | 'fria'
  | 'confeitaria'
  | 'congelado' // seção ❄ da Expedição-Alimentação
  | 'alimentacao' // Alimentos de produção / insumos / adicionais
  | 'bebidas' // Expedição bebidas/estrutura
  | 'adriana' // fornecedores que o motorista busca
  | 'indefinido'

/**
 * §17.3 — produção interna Pieggi.
 *
 * Croissant de queijo e pão de batata (inclusive "com catupiry") são
 * feitos na casa (Confeitaria/Panificação). Nunca viram encomenda de
 * fornecedor e nunca caem em "a classificar", mesmo que o cadastro do
 * catálogo traga um fornecedor por engano.
 */
export function ehProducaoInterna(texto: string): boolean {
  const t = texto.toLowerCase()
  return /croissant/.test(t) || /p[ãa]o de batata/.test(t)
}

/** Roteia um item para a estação. Catálogo manda; senão, heurística por texto. */
export function rotearItem(texto: string, cat?: CatalogItem | null): EstacaoComanda {
  // produção interna vence o cadastro de fornecedor (§17.3)
  if (ehProducaoInterna(`${texto} ${cat?.nome ?? ''}`)) return 'confeitaria'

  if (cat) {
    // fornecedor: só Letícia/Leal/Luigi/Rotisseria vão pra página da Adriana;
    // mercado/Arosa são compra do setor → aparecem na Alimentação
    if (cat.estacao === 'fornecedor' || cat.fornecedor) {
      const f = (cat.fornecedor ?? '').toLowerCase()
      if (['leticia', 'leal', 'luigi', 'rotisseria'].includes(f)) return 'adriana'
      if (['mercado', 'arosa', 'cpl'].includes(f)) return 'alimentacao'
    }
    switch (cat.estacao) {
      case 'cozinha_quente':
        return 'quente'
      case 'cozinha_fria':
        return 'fria'
      case 'confeitaria':
        return 'confeitaria'
      case 'congelado':
        return 'congelado'
      case 'expedicao_bebidas':
        return 'bebidas'
      case 'expedicao_alimentacao':
        return 'alimentacao'
    }
  }

  const t = texto.toLowerCase()

  // ------------------------------------------------------------
  // A ORDEM AQUI É A REGRA. O que é específico vem antes do genérico:
  // "Churros · recheio de doce de leite" é confeitaria, não bebida —
  // testar bebida primeiro mandava todo cup cake para a expedição.
  // ------------------------------------------------------------

  // congelado — único que a copeira assa/frita no local
  if (t.includes('pão de queijo') || t.includes('pao de queijo')) return 'congelado'
  if (t.includes('batata frita')) return 'congelado'

  // estrutura do evento (§17.6) — vai na Expedição-Bebidas/Estrutura
  if (/(arranjo de flores|gelo\b|toalha|extens[ãa]o|transformador|placa el[ée]trica|r[ée]chaud|galheteiro|champanheira|bandeja)/.test(t))
    return 'bebidas'

  // §5 — a salada de frutas é da Confeitaria, mesmo citando granola e
  // iogurte no descritivo (os adicionais é que são comprados prontos)
  if (/salada de frutas/.test(t)) return 'confeitaria'

  // insumos de mesa e adicionais comprados prontos (§17.2 / §7)
  if (/(sach[êe]|a[çc][úu]car|ado[çc]ante|p[óo] de caf[ée]|coador|filtro)/.test(t)) return 'alimentacao'
  if (/(iogurte, granola|granola|aveia|sucrilhos)/.test(t)) return 'alimentacao'

  // §5 — comprados prontos no mercado, não são produção nossa
  if (/(coalhada|crouton|t[áa]bua de queijos)/.test(t)) return 'alimentacao'

  // §5 — fornecedor Letícia (inclui frios e pães do HH)
  if (/(esfiha|[kq]uibe|coxinha|bolinha de queijo|empada|mini pizza|salgadinho de festa|t[áa]bua de frios|frios do hh|p[ãa]es? do hh)/.test(t))
    return 'adriana'

  // §17.13 — cubinho de tapioca frita aqui; banana-da-terra grelha aqui
  if (/(cubinho de tapioca|tapioca com queijo coalho|banana-da-terra|banana da terra)/.test(t))
    return 'quente'

  // §5 — TODAS as quiches vão para a Confeitaria (saem prontas), nunca
  // para a Cozinha Quente, mesmo a Lorraine (que leva bacon)
  if (/quiche/.test(t)) return 'confeitaria'

  // confeitaria — doces, salada de frutas, shots, bolos, petit four
  if (
    /(salada de frutas|frutas laminadas|verrine|shot|cup ?cake|bebezinho|petit four|croissant|pão de batata|pao de batata|bolo|carolina|tartelete doce|canapé doce|canape doce|doce|sobremesa|queijadinha|bombocado|camafeu|favo de mel)/.test(
      t
    )
  )
    return 'confeitaria'

  // cozinha fria — montagem a frio (tábua de frios saiu daqui: é Letícia)
  if (
    /(mini lanche|wrap|tramezzino|homus|guacamole|pasta|salada|folhas|burrata|mix de queijos|barquete|crudit[ée])/.test(
      t
    )
  )
    return 'fria'

  // cozinha quente — cozido/assado, inclusive canapé/vol-au-vent SALGADO
  if (
    /(proteína|proteina|arroz|feijão|feijao|purê|pure|massa|molho|torta|assad|salteado|vinho quente|canjica|caldo|hambúrguer|hamburguer|escondidinho|lasanha|nhoque|ravioli|legumes|vol-au-vent|canapé|canape|tartelete)/.test(
      t
    )
  )
    return 'quente'

  // bebidas — POR ÚLTIMO, senão "recheio de doce de leite" rouba o cup
  // cake e "creme de café" rouba o doce. Sem \b: em JavaScript o limite
  // de palavra não funciona depois de letra acentuada, então /\bcafé\b/
  // simplesmente nunca casa e o café caía em "a rotear".
  if (
    /(caf[ée]|leite|[áa]gua quente|ch[áa]|suco|refrigerante|cerveja|[áa]gua|vinho|espumante|champagne|prosecco|drink|refresqueira|achocolatado|garrafa t[ée]rmica)/.test(
      t
    )
  )
    return 'bebidas'

  if (/salgadinho/.test(t)) return 'adriana'

  return 'indefinido'
}

export const ESTACAO_LABEL: Record<EstacaoComanda, string> = {
  quente: '🔥 Cozinha Quente',
  fria: '🧊 Cozinha Fria / Garde Manger',
  confeitaria: '🍰 Confeitaria',
  congelado: '❄ Congelado (Expedição-Alimentação)',
  alimentacao: '📦 Expedição — Alimentação',
  bebidas: '🥤 Expedição — Bebidas/Estrutura',
  adriana: '🟢 Página da Adriana (fornecedor)',
  indefinido: '❓ A rotear (perguntar)',
}

// ------------------------------------------------------------
// Estrutura de expedição (Bebidas, Estrutura e Materiais)
// ------------------------------------------------------------

export interface EstruturaInput {
  pax: number
  qtdServicosCafe: number // serviços com café (coffee, welcome, auditório…)
  qtdPeriodosCoffee: number // períodos de coffee (p/ sachê de chá e achocolatado)
  temHH: boolean
  temAlmocoJantar: boolean
  temSalada: boolean
  temHamburguerOuBatata: boolean
  pratosQuentes: number // p/ placas elétricas (2 pratos por placa)
  startseFixo: boolean
  freelancers?: number
  /**
   * §8 — recipiente das verrines/shots, contado pelo cardápio montado.
   * Copinho bolha é DESCARTÁVEL e não conta como vidro; misturar os dois
   * era o erro clássico da lista de compras.
   */
  cupsVidro?: number
  coposBolha?: number
  /** total de ml de café do evento — base dos sachês (1 por dose de 100 ml) */
  mlCafe?: number
  /** períodos de coffee/auditório, para achocolatado 3 g/pax/período */
  periodosAchocolatado?: number
}

export interface LinhaEstrutura {
  qtd: string
  item: string
  receita: string
  destaque?: 'amarelo' | 'vermelho' | 'azul' | null
}

const cima = Math.ceil

export function gerarEstrutura(i: EstruturaInput): LinhaEstrutura[] {
  const out: LinhaEstrutura[] = []
  const naoEnviar = i.startseFixo ? ' — NÃO ENVIAR NA STARTSE (manter ticável)' : ''

  // topo obrigatório
  out.push(
    { qtd: '1', item: 'ETIQUETAS', receita: 'etiquetas de identificação das caixas' },
    { qtd: '1', item: 'PROGRAMAÇÃO IMPRESSA', receita: 'vai junto no topo — copeiras recebem SÓ a programação' }
  )

  // copos / pratos / talheres
  if (i.qtdServicosCafe > 0) {
    out.push({
      qtd: `${cima(i.pax * 1.5)} un`,
      item: 'Copos descartáveis quentes',
      receita: `café + chá — ${i.pax} × 1,5 + mexedores descartáveis`,
    })
  }
  out.push(
    { qtd: `${cima(i.pax * 1.1)} un`, item: 'Copos de vidro', receita: `suco/refri — ${i.pax} × 1,1` },
    { qtd: `${cima(i.pax * 1.2)} un`, item: 'Pratos de louça', receita: `${i.pax} × 1,2` },
    { qtd: `${cima(i.pax * 1.2)} un`, item: 'Garfos de bolo', receita: `${i.pax} × 1,2` }
  )

  // §8 — recipiente da verrine/shot, em linhas SEPARADAS.
  // Copinho bolha é descartável; cup de vidro volta e conta na louça.
  if (i.cupsVidro)
    out.push(
      {
        qtd: `${cima(i.cupsVidro * 1.1)} un`,
        item: 'CUP MINI DE VIDRO',
        receita: `verrine/shot em vidro — ${i.cupsVidro} × 1,1 · volta para a casa`,
      },
      {
        qtd: `${cima(i.cupsVidro * 1.2)} un`,
        item: 'Colherinhas de verrine',
        receita: `1,2 por verrine servida em cup — shot NÃO leva colherinha`,
      }
    )
  if (i.coposBolha)
    out.push({
      qtd: `${cima(i.coposBolha * 1.1)} un`,
      item: 'Copinho bolha (descartável)',
      receita: `verrine/shot do coffee — ${i.coposBolha} × 1,1 · NÃO contar como vidro`,
    })

  // §17.2 — sachês por DOSE de café (100 ml), não por pax. O auditório
  // entra na conta porque também serve café.
  const mlCafe = i.mlCafe ?? i.pax * 100 * Math.max(1, i.qtdServicosCafe)
  if (mlCafe > 0) {
    const doses = cima(mlCafe / 100)
    out.push({
      qtd: `${doses} de cada`,
      item: 'Sachês açúcar + adoçante',
      receita: `1 de cada por dose de 100 ml — ${Math.round(mlCafe)} ml de café no evento (auditório conta)`,
    })
  }
  if (i.qtdPeriodosCoffee > 0) {
    const periodos = i.periodosAchocolatado ?? i.qtdPeriodosCoffee
    out.push(
      {
        qtd: `${cima(i.pax * 0.5 * i.qtdPeriodosCoffee)} un`,
        item: 'Sachês de chá',
        receita: `0,5/pax por coffee × ${i.qtdPeriodosCoffee}`,
      },
      {
        qtd: `${round2((i.pax * 3 * periodos) / 1000)} kg`,
        item: 'Achocolatado (pote inox)',
        receita: `3 g/pax por período × ${periodos} período(s) — servir em pote de inox`,
      }
    )
  }

  // gelo — StartSe: só em HH
  if (i.temHH || (!i.startseFixo && i.temAlmocoJantar)) {
    const pacotes = qtdGelo(i.pax)
    out.push({
      qtd: `${pacotes} pacote(s) 3 kg`,
      item: 'Gelo',
      receita: `1 pacote/25 pax${i.startseFixo ? ' — StartSe: SÓ em HH' : ''}`,
    })
  } else if (i.startseFixo) {
    out.push({
      qtd: '—',
      item: 'Gelo',
      receita: 'NÃO ENVIAR — StartSe sem HH (gelo só em HH)',
      destaque: 'vermelho', // alerta (rev. 24/09: amarelo = finalizar no local)
    })
  }

  // almoço/jantar — placas elétricas + cerâmicas + fixos de mesa
  if (i.temAlmocoJantar) {
    const placas = Math.max(1, cima(i.pratosQuentes / 2))
    out.push(
      {
        qtd: `${placas} un`,
        item: 'Placas elétricas',
        receita: `${i.pratosQuentes} prato(s) quente(s) ÷ 2 por placa — réchaud de fogo PROIBIDO em prédio corporativo`,
      },
      { qtd: `${i.pratosQuentes} un`, item: 'Panelas/travessas de cerâmica coloridas', receita: '1 por prato quente + reposição' },
      { qtd: '1', item: 'Galheteiro (vinagre, sal, azeite)', receita: 'fixo de mesa — todo almoço/jantar' },
      { qtd: '1', item: 'Pimenta Tabasco', receita: 'vai na comanda de ALIMENTAÇÃO (condimento de mesa)' },
      { qtd: '2 un', item: 'Bandeja garçom preta', receita: 'sempre 2 por evento' },
      { qtd: '1', item: 'Champanheira', receita: 'HH/almoço/jantar' }
    )
    if (!i.startseFixo) {
      out.push(
        { qtd: '1', item: 'Transformador 100→220V', receita: 'placa elétrica — eventos NÃO-StartSe' },
        { qtd: '1', item: 'Extensão + adaptador', receita: 'placa elétrica' }
      )
    }
  }

  if (i.temHamburguerOuBatata && !i.temAlmocoJantar) {
    out.push({ qtd: '1', item: 'Placa elétrica + extensão', receita: 'batata frita / mini hambúrguer' })
    if (!i.startseFixo)
      out.push({ qtd: '1', item: 'Transformador 100→220V', receita: 'não-StartSe' })
  }

  // kit saladas
  if (i.temSalada) {
    out.push({
      qtd: '1 kit',
      item: 'KIT SALADAS',
      receita:
        'vinagreiro · azeiteiro · moedor sal himalaia rosa · moedor sal grosso branco · pote de cristal c/ croutons + pegador · molho caseiro no cristal + mini concha · 2 travessas de cristal por salada',
    })
  }

  // réchaud
  if (i.pratosQuentes > 0 && !i.temAlmocoJantar) {
    out.push({
      qtd: `${cima(i.pratosQuentes / 2)} un`,
      item: 'Réchaud',
      receita: '1 a cada 2 travessas quentes',
    })
  }

  // 5 caixas etiquetadas
  for (const cx of [
    'CAIXA LOUÇAS — pratos, bowls, ramequins, taças, xícaras',
    'CAIXA PEGADORES E UTENSÍLIOS — pegadores, descansos, colheres de serviço',
    'CAIXA DESCARTÁVEIS — copos, pratos desc., talheres, mexedores, colherinhas, guardanapos, palitos',
    'CAIXA BEBIDAS — açúcar, adoçante, achocolatado, sachês de chá, colheres de café',
    'CAIXA IDENTIFICAÇÃO E APOIO — plaquinhas, etiquetas, papel toalha, panos, borrifadores, álcool 70%, sacos de lixo, toalhas, extensões, LED',
  ]) {
    const [nome, resto] = cx.split(' — ')
    out.push({ qtd: '1', item: nome, receita: resto })
  }

  // blocos fixos (por nº de freelancers, não por pax)
  const porFreela = i.freelancers ? `${i.freelancers} un` : 'conforme freelancers (Adriana)'
  out.push(
    { qtd: porFreela, item: 'Uniforme Pieggi', receita: `por nº de freelancers${naoEnviar}`, destaque: i.startseFixo ? 'vermelho' : null },
    { qtd: porFreela, item: 'Luvas + toucas', receita: `por nº de freelancers${naoEnviar}`, destaque: i.startseFixo ? 'vermelho' : null },
    {
      qtd: '1 kit',
      item: 'Kit de limpeza',
      receita: `detergente, esponja, pano de chão, rodo, papel toalha, álcool 70%${naoEnviar}`,
      destaque: i.startseFixo ? 'vermelho' : null,
    },
    { qtd: '1', item: 'Infra', receita: 'toalhas + extensão' },
    // §17.6 — arranjo de flores em TODO evento, linha própria para ser
    // ticada na saída (antes ia diluído dentro de "Infra")
    { qtd: '1', item: 'ARRANJO DE FLORES', receita: 'todo evento leva 1 arranjo — conferir na saída' }
  )

  return out
}

export function horarioSaida(horaServir: string | null): string {
  if (!horaServir) return '________ (perguntar pra Adriana e anotar aqui)'
  const [h, m] = horaServir.split(':').map(Number)
  const total = h * 60 + m - 180
  const hh = Math.floor(((total % 1440) + 1440) % 1440 / 60)
  const mm = ((total % 60) + 60) % 60
  return `${String(hh).padStart(2, '0')}h${String(mm).padStart(2, '0')} (servir −3h — conferir Adriana)`
}

export { round2 }
