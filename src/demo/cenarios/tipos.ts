// Contrato de uma ÁREA de cenários (rua, operação, compras, pessoas…).
// Cada área devolve as suas tabelas e, se precisar, views e funções —
// cenarios/index.ts junta tudo. Uma área não edita a tabela da outra.

import type { Linha, Tabelas } from '../banco'

export interface AreaCenario {
  /** recebe as tabelas já montadas (base + áreas anteriores) para ligar ids */
  tabelas?: (base: Tabelas) => Tabelas
  /** views calculadas (mesmo nome da view SQL) */
  views?: Record<string, (b: Tabelas) => Linha[]>
  /** funções rpc (mesmo nome da função SQL) */
  rpcs?: Record<string, (args: Record<string, any>, b: Tabelas) => unknown> // eslint-disable-line @typescript-eslint/no-explicit-any
  /** o cartão "cenário de teste" de cada página desta área */
  roteiro?: PaginaRoteiro[]
  /** valores padrão das colunas (o DEFAULT do SQL) por tabela, aplicados no insert */
  padroes?: Record<string, Linha>
}

export { dia, quando, U, E, C } from './base'

/**
 * O cartão de teste no topo de uma página (modo demonstração): o que o
 * cenário mostra e o que vale a pena testar ali.
 */
export interface PaginaRoteiro {
  /** padrão da rota, com :param — ex.: '/eventos/:id/campo' */
  rota: string
  titulo: string
  /** a situação hipotética, em uma ou duas frases */
  cenario: string
  /** passos curtos para o Bruno experimentar */
  testar: string[]
  /** papel sugerido para ver a tela como quem usa de verdade */
  papel?: string
}
