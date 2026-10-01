// ============================================================
// REGRAS OPERACIONAIS DA REVISÃO 28/07
//
// O que a programação precisa escrever para a equipe saber o que enviar
// e o que montar no local. A comanda reaproveita as mesmas funções, para
// os dois documentos nunca divergirem.
// ============================================================

import type { CatalogItem, ClientKind, ServiceType } from '@/types'

// ------------------------------------------------------------
// §14.11 — descritivo completo na coluna RECEITA
// ------------------------------------------------------------

/**
 * "Peito de peru — brioche tradicional · mini brioche, pasta de queijos
 * Pieggi com ervas finas, cenoura ralada e alface americana".
 *
 * Sem o descritivo a equipe recebe só o nome do sabor e não sabe o que
 * montar. Vale a regra: item + descritivo completo do cardápio.
 */
export function receitaCompleta(
  item: CatalogItem | null,
  complementos: (string | null | undefined)[] = []
): string {
  if (!item) return complementos.filter(Boolean).join(' · ')
  const partes = [item.nome, ...complementos.filter(Boolean)]
  const base = partes.join(' — ')
  return item.descricao ? `${base} · ${item.descricao}` : base
}

// ------------------------------------------------------------
// §14.5 / §14.7 / §14.13 — o que sai desmontado
// ------------------------------------------------------------

export interface Finalizacao {
  /** texto em vermelho na programação e na comanda */
  aviso: string
}

const CATEGORIAS_CANAPE = ['canape', 'tartelete', 'barquete', 'quiche']

/**
 * O que a cozinha manda em partes e a copeira monta no local.
 * Devolve null quando o item vai pronto.
 */
export function finalizacaoNoLocal(item: CatalogItem | null): Finalizacao | null {
  if (!item) return null
  const nome = `${item.nome} ${item.descricao ?? ''} ${item.obs ?? ''}`.toLowerCase()

  // §14.7 — wrap de abacate liberado, mas monta no local
  if (/abacate/.test(nome) && ['wrap', 'envelope_gourmet'].includes(item.categoria))
    return {
      aviso:
        'FINALIZAR NO LOCAL: enviar discos, recheio e folhas de alface em pacotes separados — copeiras montam.',
    }

  // §14.5 — cup cake vai sem recheio para não destruir no transporte
  if (item.categoria === 'bebezinho')
    return {
      aviso:
        'FINALIZAR NO LOCAL: enviar o bebezinho SEM recheio + recheio em manga com bico à parte — copeiras montam.',
    }

  // §14.13 — todos os canapés, quentes e frios
  if (CATEGORIAS_CANAPE.includes(item.categoria))
    return {
      aviso: 'FINALIZAR CONFORME IMAGEM: componentes vão prontos, copeiras montam no local.',
    }

  return null
}

// ------------------------------------------------------------
// §2.7 / §14.15 — marcas por cliente
// ------------------------------------------------------------

export interface MarcasCliente {
  refri: string
  cerveja: string
  agua: string
}

export function marcasDoCliente(tipo: ClientKind | undefined): MarcasCliente {
  return tipo === 'startse' || tipo === 'inteli'
    ? { refri: 'Pepsi (normal e zero)', cerveja: 'Budweiser', agua: 'Minalba' }
    : { refri: 'Coca-Cola (normal e zero)', cerveja: 'Heineken', agua: 'Lindóia' }
}

/** Linha de aviso para a programação — refri sempre em lata, nunca 1 L. */
export function avisoMarcas(tipo: ClientKind | undefined): string {
  const m = marcasDoCliente(tipo)
  const daCasa = tipo === 'startse' || tipo === 'inteli'
  return (
    `Água ${m.agua} · Refrigerante ${m.refri} · Cerveja ${m.cerveja}. ` +
    `Refrigerante SEMPRE em LATA (nunca garrafa de 1 L); especificar lata ou long neck. ` +
    `Cerveja 1,5 un/pessoa por 2h. Guaraná Antarctica só quando avisado.` +
    (daCasa ? '' : ' Outra marca só quando o cliente pedir — avisar.')
  )
}

// ------------------------------------------------------------
// §14.12 — arranjo de flores em TODO evento
// ------------------------------------------------------------

export function linhaArranjoFlores(dataDDMM: string, nomeEvento: string) {
  return {
    qtd: '1 un',
    receita: `Arranjo de flores — ${dataDDMM} — ${nomeEvento}`,
    item: 'Arranjo de flores',
  }
}

// ------------------------------------------------------------
// §14.10 — cada serviço com o seu cardápio
// ------------------------------------------------------------

/**
 * Item de coquetel no coffee (ou o contrário) é erro de montagem —
 * o compositor já filtra, mas o cardápio pode ser editado à mão.
 */
export function itemForaDoServico(item: CatalogItem | null, serviceType: ServiceType): boolean {
  if (!item || !item.servicos.length) return false
  return !item.servicos.includes(serviceType)
}

// ------------------------------------------------------------
// rev. 24/09 (Claudinho) — LINHA AZUL = cuidado de serviço
//
// O que a copeira precisa CUIDAR durante o serviço (temperatura,
// reposição), e não montar. Hoje: pão de queijo, que esfria e murcha se
// for todo para a mesa de uma vez. Item novo entra nesta lista.
// ------------------------------------------------------------

const CUIDADOS: { padrao: RegExp; texto: string }[] = [
  {
    padrao: /p[ãa]o de queijo/i,
    texto:
      'servir o mais próximo possível do horário de consumo. Não colocar toda a quantidade de uma vez: assar/dispor metade, manter a outra metade reservada e repor em pequenas quantidades durante o serviço, para não ficar muito tempo exposto e esfriar.',
  },
]

/** Texto da linha azul do item, ou null quando o item não pede cuidado de serviço. */
export function cuidadoDeServico(texto: string): string | null {
  return CUIDADOS.find((c) => c.padrao.test(texto))?.texto ?? null
}
