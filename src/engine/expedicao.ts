// ============================================================
// PRODUÇÃO POR PRAÇA E EXPEDIÇÃO — regras puras
//
// As telas da TV da cozinha (/producao/:estacao) e da expedição
// (/expedicao) não guardam LISTA nenhuma: elas releem a comanda
// aprovada (EstadoComandas, em producao.ts) e só gravam o ANDAMENTO
// (producao_itens, expedicao_checks — migration 0035). Para o andamento
// achar a linha de novo depois de um F5, cada linha ganha uma CHAVE
// derivada do próprio texto — sem id no snapshot, sem cópia no banco.
//
// Por isso a chave tem que ser determinística:
//   hash(receita + item) + "-" + nº da repetição dessa mesma receita+item
// A repetição (e não a posição na lista) deixa a chave de pé quando
// alguém insere uma linha acima. Consequência assumida, igual à de
// station_progress: regerar a comanda MUDANDO a receita ou o item de uma
// linha perde a baixa daquela linha — o que mudou se faz de novo.
//
// A comanda junta bebidas e estrutura num bloco só (bebidasEstrutura).
// Na reunião a expedição foi validada em TRÊS setores — comidas, bebidas
// e estrutura — então aqui o bloco é dividido de novo, pela mesma lista
// de itens que gerarEstrutura (roteamento.ts) produz.
//
// Nada de banco, nada de React: entram linhas da comanda, saem listas.
//
// DATA: "hoje" é o dia de SÃO PAULO, não o de Greenwich. toISOString()
// devolve UTC e, a partir das 21h, já diria "amanhã" — justo quando a
// cozinha começa a madrugada. Use sempre diaLocal().
// ============================================================

import type { DiaComandas, EstadoComandas, SecaoDia } from './producao'
import type { EstacaoProducao, ProducaoStatus, SetorConferencia } from '@/tipos/operacao'

export interface LinhaComanda {
  qtd: string
  receita: string
  item: string
  destaque?: 'amarelo' | 'vermelho' | 'azul' | null
}

// ------------------------------------------------------------
// DATA LOCAL
// ------------------------------------------------------------

// mora em engine/datas.ts (fonte única); reexportado para quem já importa daqui
export { diaLocal } from './datas'

// ------------------------------------------------------------
// CHAVE ESTÁVEL
// ------------------------------------------------------------

/** djb2 em base 36 — curto, determinístico, sem dependência. */
function hash(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

function normalizar(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** A chave de uma linha: hash(receita|item) + nº da repetição (0, 1, 2…). */
export function chaveItem(receita: string, item: string, repeticao = 0): string {
  return `${hash(`${normalizar(receita)}|${normalizar(item)}`)}-${repeticao}`
}

/**
 * Dá chave a uma lista inteira, contando repetições da mesma
 * receita+item — a segunda "Café coado 9 L" do dia vira "-1".
 */
export function chavesDaLista(linhas: LinhaComanda[]): string[] {
  const vistos = new Map<string, number>()
  return linhas.map((l) => {
    const base = `${normalizar(l.receita)}|${normalizar(l.item)}`
    const n = vistos.get(base) ?? 0
    vistos.set(base, n + 1)
    return chaveItem(l.receita, l.item, n)
  })
}

// ------------------------------------------------------------
// LINHAS DA PRAÇA
// ------------------------------------------------------------

/**
 * Linha de instrução: "FINALIZAR NO LOCAL…" ou "⚠ …", sem quantidade.
 * Não é item a produzir — é um aviso sobre o item ANTERIOR (a comanda já
 * manda a linha vermelha para a mesma praça do item que ela explica).
 */
export function ehInstrucao(l: LinhaComanda): boolean {
  return !l.qtd.trim() && /^(FINALIZAR|⚠)/i.test(l.receita.trim())
}

/** Pedido do cliente que a comanda replica nas três praças. */
export function ehPedidoCliente(l: LinhaComanda): boolean {
  return /^PEDIDO DO CLIENTE/i.test(l.receita.trim())
}

/** "Mini lanche X [COFFEE BREAK BASIC MANHÃ]" → texto + serviço. */
export function separarTag(receita: string): { texto: string; servico: string | null } {
  const m = receita.match(/^(.*?)\s*\[([^\]]+)\]\s*$/)
  if (!m) return { texto: receita.trim(), servico: null }
  return { texto: m[1].trim(), servico: m[2].trim() }
}

export interface ItemPraca {
  chave: string
  qtd: string
  /** receita sem a etiqueta do serviço */
  texto: string
  /** "COFFEE BREAK BASIC MANHÃ" — de onde a linha veio */
  servico: string | null
  item: string
  destaque: 'amarelo' | 'vermelho' | 'azul' | null
  /** instruções vermelhas grudadas neste item */
  avisos: string[]
}

/**
 * As linhas de uma seção da comanda viram itens marcáveis. Instrução
 * gruda no item anterior; pedido do cliente e instrução sem item antes
 * vão para `avisosGerais` (aparecem no topo do evento).
 */
export function itensDaSecao(linhas: LinhaComanda[]): { itens: ItemPraca[]; avisosGerais: string[] } {
  const itens: ItemPraca[] = []
  const avisosGerais: string[] = []
  const chaves = chavesDaLista(linhas)
  linhas.forEach((l, i) => {
    const { texto, servico } = separarTag(l.receita)
    if (ehPedidoCliente(l)) {
      avisosGerais.push(texto)
      return
    }
    if (ehInstrucao(l)) {
      const anterior = itens[itens.length - 1]
      if (anterior) anterior.avisos.push(texto)
      else avisosGerais.push(texto)
      return
    }
    itens.push({
      chave: chaves[i],
      qtd: l.qtd,
      texto,
      servico,
      item: l.item,
      destaque: l.destaque ?? null,
      avisos: [],
    })
  })
  return { itens, avisosGerais }
}

// ------------------------------------------------------------
// STATUS DO ITEM NA PRAÇA
// ------------------------------------------------------------

export function proximoStatus(s: ProducaoStatus): ProducaoStatus {
  return s === 'a_fazer' ? 'produzindo' : 'pronto'
}

export function statusAnterior(s: ProducaoStatus): ProducaoStatus {
  return s === 'pronto' ? 'produzindo' : 'a_fazer'
}

export interface Progresso {
  feitos: number
  total: number
  pct: number
}

export function progresso(feitos: number, total: number): Progresso {
  return { feitos, total, pct: total ? Math.round((feitos / total) * 100) : 0 }
}

// ------------------------------------------------------------
// HORÁRIO DE SAÍDA
// ------------------------------------------------------------

/** "05h00 (servir −3h — conferir Adriana)" → "05:00"; sem hora → null. */
export function horaDaSaidaComanda(saida: string | null | undefined): string | null {
  const m = saida?.match(/(\d{1,2})h(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null
}

/** Minutos de agora até dia+hora (negativo = já passou). */
export function minutosAte(diaISO: string, hora: string | null, agora: Date): number | null {
  if (!hora) return null
  const [h, m] = hora.split(':').map(Number)
  const alvo = new Date(`${diaISO}T00:00:00`)
  alvo.setHours(h, m, 0, 0)
  return Math.round((alvo.getTime() - agora.getTime()) / 60000)
}

/** 135 → "faltam 2h15" · 20 → "faltam 20 min" · -15 → "saída há 15 min" */
export function textoContagem(min: number | null): string {
  if (min == null) return 'sem horário de saída'
  const abs = Math.abs(min)
  const t = abs >= 60 ? `${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}` : `${abs} min`
  return min >= 0 ? `faltam ${t}` : `saída há ${t}`
}

/** ATRASADO: menos de 1 h para a saída (ou já passou) e algo não pronto. */
export function eventoAtrasado(min: number | null, pendentes: number): boolean {
  return min != null && min < 60 && pendentes > 0
}

// ------------------------------------------------------------
// BEBIDAS × ESTRUTURA
// ------------------------------------------------------------

/**
 * O que gerarEstrutura (roteamento.ts) produz — tudo que NÃO é bebida.
 * Testado contra o ITEM da linha; arranjo de flores e "Decoração" que a
 * programação escreve no meio do coffee também são estrutura.
 */
const ESTRUTURA =
  /(etiqueta|programação impressa|programacao impressa|copos?\b|copinho|pratos?\b|garfos?\b|cup\b|colherinha|sachê|sache|achocolatado|pote|gelo\b|placas?\b|cerâmica|ceramica|galheteiro|tabasco|bandeja|champanheira|transformador|extensão|extensao|kit saladas|réchaud|rechaud|^caixa\b|uniforme|luvas|toucas|kit de limpeza|^infra\b|arranjo de flores|decoração|decoracao)/i

export function ehEstrutura(l: LinhaComanda): boolean {
  if (ehPedidoCliente(l)) return false
  return ESTRUTURA.test(l.item.trim()) || /arranjo de flores/i.test(l.receita)
}

/**
 * Divide o bloco único da comanda em BEBIDAS e ESTRUTURA. Café, leite,
 * suco, chá, água, refrigerante, cerveja e os "PEDIDO DO CLIENTE" que a
 * comanda manda para a expedição ficam em bebidas.
 */
export function separarBebidasEstrutura<T extends LinhaComanda>(linhas: T[]): { bebidas: T[]; estrutura: T[] } {
  const bebidas: T[] = []
  const estrutura: T[] = []
  for (const l of linhas) (ehEstrutura(l) ? estrutura : bebidas).push(l)
  return { bebidas, estrutura }
}

/** "Suco [01/10 COFFEE BREAK…]" → "01/10"; sem data na etiqueta → null. */
export function diaMesDaEtiqueta(receita: string): string | null {
  const m = receita.match(/\[(\d{2}\/\d{2})\b/)
  return m ? m[1] : null
}

function diaMes(iso: string): string {
  const [, mm, dd] = iso.split('-')
  return `${dd}/${mm}`
}

// ------------------------------------------------------------
// CONFERÊNCIA DO DIA
// ------------------------------------------------------------

export type OrigemLinha = SecaoDia | 'fornecedor' | 'bebidas' | 'estrutura'

export const ORIGEM_LABEL: Record<OrigemLinha, string> = {
  confeitaria: 'Confeitaria',
  fria: 'Cozinha fria',
  quente: 'Cozinha quente',
  congelado: 'Congelado',
  insumos: 'Insumos',
  adicionais: 'Comprado pronto',
  fornecedor: 'Fornecedor (Adriana)',
  bebidas: 'Bebidas',
  estrutura: 'Estrutura',
}

export interface LinhaConferencia {
  setor: SetorConferencia
  /** chave em expedicao_checks — prefixada pela origem */
  chave: string
  /** para comida de praça: a chave em producao_itens (status da praça) */
  chaveProducao: string | null
  estacao: EstacaoProducao | null
  origem: OrigemLinha
  qtd: string
  texto: string
  servico: string | null
  item: string
  destaque: 'amarelo' | 'vermelho' | 'azul' | null
  avisos: string[]
}

export interface ConferenciaDia {
  comidas: LinhaConferencia[]
  bebidas: LinhaConferencia[]
  estrutura: LinhaConferencia[]
  avisosGerais: string[]
  /** evento de vários dias: a estrutura inteira sai no PRIMEIRO dia */
  variosDias: boolean
  primeiroDia: boolean
}

const SECOES_COMIDA: SecaoDia[] = ['confeitaria', 'fria', 'quente', 'congelado', 'insumos', 'adicionais']
const PRACAS: SecaoDia[] = ['confeitaria', 'fria', 'quente']

/**
 * O que a expedição confere para um evento num dia:
 *  - COMIDAS: as seções do dia (praças + congelado + insumos + comprado
 *    pronto) + as encomendas de FORNECEDOR que a Adriana busca
 *    (snapshot.fornecedores: "FORNECEDOR: LETÍCIA — … (Adriana buscar)
 *    [dd/mm]"), pela data da etiqueta; sem data, primeiro dia. Pedido do
 *    cliente mandado para a Adriana vira aviso geral do primeiro dia;
 *  - BEBIDAS: as do dia, pela data na etiqueta "[dd/mm …]"; bebida sem
 *    data (pedido do cliente) cai no primeiro dia;
 *  - ESTRUTURA: a que gerarEstrutura calcula é CONSOLIDADA (soma de todos
 *    os dias, sem data) → sai no PRIMEIRO dia do evento; a que veio da
 *    programação com data (arranjo de flores do dia) fica no dia dela.
 */
export function conferenciaDoDia(snapshot: EstadoComandas | null | undefined, diaISO: string): ConferenciaDia | null {
  const dias = snapshot?.dias ?? []
  const d: DiaComandas | undefined = dias.find((x) => x.diaISO === diaISO)
  if (!snapshot || !d) return null
  const primeiro = [...dias].sort((a, b) => a.diaISO.localeCompare(b.diaISO))[0].diaISO
  const ehPrimeiro = diaISO === primeiro
  const diasDoEvento = new Set(dias.map((x) => diaMes(x.diaISO)))

  const avisosGerais: string[] = []
  const comidas: LinhaConferencia[] = []
  for (const secao of SECOES_COMIDA) {
    const { itens, avisosGerais: av } = itensDaSecao(d.secoes[secao] ?? [])
    for (const a of av) if (!avisosGerais.includes(a)) avisosGerais.push(a)
    const praca = PRACAS.includes(secao) ? (secao as EstacaoProducao) : null
    for (const it of itens)
      comidas.push({
        setor: 'comidas',
        chave: `${secao}:${it.chave}`,
        chaveProducao: praca ? it.chave : null,
        estacao: praca,
        origem: secao,
        qtd: it.qtd,
        texto: it.texto,
        servico: it.servico,
        item: it.item,
        destaque: it.destaque,
        avisos: it.avisos,
      })
  }

  // encomenda de fornecedor: comida que entra no carro sem passar por
  // praça. Chave sobre a lista INTEIRA (como em bebidasEstrutura) para
  // não mudar conforme o dia escolhido.
  const forn = itensDaSecao(snapshot.fornecedores ?? [])
  if (ehPrimeiro) for (const a of forn.avisosGerais) if (!avisosGerais.includes(a)) avisosGerais.push(a)
  for (const it of forn.itens) {
    // separarTag tira o "[dd/mm]" do fim para `servico`
    const etiqueta = it.servico && /^\d{2}\/\d{2}$/.test(it.servico) ? it.servico : null
    const doDia = etiqueta && diasDoEvento.has(etiqueta) ? etiqueta === diaMes(diaISO) : ehPrimeiro
    if (!doDia) continue
    comidas.push({
      setor: 'comidas',
      chave: `fornecedor:${it.chave}`,
      chaveProducao: null,
      estacao: null,
      origem: 'fornecedor',
      qtd: it.qtd,
      texto: it.texto,
      servico: etiqueta ? null : it.servico,
      item: it.item,
      destaque: it.destaque,
      avisos: it.avisos,
    })
  }

  // chave calculada sobre o bloco INTEIRO — não muda conforme o dia escolhido
  const todas = snapshot.bebidasEstrutura ?? []
  const chaves = chavesDaLista(todas)
  const bebidas: LinhaConferencia[] = []
  const estrutura: LinhaConferencia[] = []
  todas.forEach((l, i) => {
    const est = ehEstrutura(l)
    const etiqueta = diaMesDaEtiqueta(l.receita)
    // linha com data na etiqueta (bebida do coffee, arranjo da
    // programação) vai para o dia dela; o resto, para o primeiro dia
    const doDia = etiqueta && diasDoEvento.has(etiqueta) ? etiqueta === diaMes(diaISO) : ehPrimeiro
    if (!doDia) return
    const { texto, servico } = separarTag(l.receita)
    const setor: SetorConferencia = est ? 'estrutura' : 'bebidas'
    const linha: LinhaConferencia = {
      setor,
      chave: `${setor}:${chaves[i]}`,
      chaveProducao: null,
      estacao: null,
      origem: setor,
      qtd: l.qtd,
      texto,
      servico,
      item: l.item,
      destaque: l.destaque ?? null,
      avisos: [],
    }
    ;(est ? estrutura : bebidas).push(linha)
  })

  return {
    comidas,
    bebidas,
    estrutura,
    avisosGerais,
    variosDias: dias.length > 1,
    primeiroDia: ehPrimeiro,
  }
}

// ------------------------------------------------------------
// COMPRAS DO EVENTO AINDA NÃO RECEBIDAS
// ------------------------------------------------------------

/** Uma linha de purchase_order_items com o pedido embutido (Compras, 0036). */
export interface ItemCompraEvento {
  event_id: string | null
  descricao: string
  purchase_orders: {
    id: string
    numero: number | string | null
    status: string
    forma?: string | null
    data_prevista: string | null
    fornecedores?: { nome: string } | null
  } | null
}

export interface PedidoPendente {
  pedidoId: string
  numero: string
  fornecedor: string
  status: string
  retirada: boolean
  dataPrevista: string | null
  /** sem data, ou previsto para DEPOIS do dia da saída */
  chegaDepois: boolean
  itens: string[]
}

/**
 * Pedidos de compra do evento que ainda NÃO foram recebidos (rascunho,
 * enviado, confirmado), agrupados por pedido. É informação para a
 * expedição e para a praça — não trava conferência nem baixa, igual ao
 * amarelo da praça. Recebido e cancelado não aparecem.
 */
export function pedidosPendentes(linhas: ItemCompraEvento[], eventId: string, diaISO: string): PedidoPendente[] {
  const m = new Map<string, PedidoPendente>()
  for (const l of linhas) {
    const po = l.purchase_orders
    if (l.event_id !== eventId || !po) continue
    if (!['rascunho', 'enviado', 'confirmado'].includes(po.status)) continue
    let p = m.get(po.id)
    if (!p) {
      p = {
        pedidoId: po.id,
        numero: String(po.numero ?? '—'),
        fornecedor: po.fornecedores?.nome ?? 'fornecedor',
        status: po.status,
        retirada: po.forma === 'retirada',
        dataPrevista: po.data_prevista,
        chegaDepois: !po.data_prevista || po.data_prevista > diaISO,
        itens: [],
      }
      m.set(po.id, p)
    }
    p.itens.push(l.descricao)
  }
  return [...m.values()].sort((a, b) => Number(a.numero) - Number(b.numero))
}
