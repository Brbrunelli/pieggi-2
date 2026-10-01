// ============================================================
// CENÁRIOS — junta a base e as áreas
//
// Para somar uma área nova: criar cenarios/<area>.ts exportando um
// AreaCenario e incluir em AREAS. Uma área não edita a tabela da outra.
// ============================================================

import type { Linha, Tabelas } from '../banco'
import { montarBase } from './base'
import type { AreaCenario, PaginaRoteiro } from './tipos'
import { rua } from './rua'
import { operacao } from './operacao'
import { compras } from './compras'
import { pessoas } from './pessoas'
import { extras } from './extras'

// extras ANTES das áreas novas: elas podem ligar dados aos eventos extras
const AREAS: AreaCenario[] = [rua, extras, operacao, compras, pessoas]

export function montarCenarios(): Tabelas {
  const banco = montarBase()
  for (const a of AREAS) {
    const novas = a.tabelas?.(banco) ?? {}
    for (const [nome, linhas] of Object.entries(novas)) banco[nome] = [...(banco[nome] ?? []), ...linhas]
  }
  return banco
}

export const VIEWS_AREAS: Record<string, (b: Tabelas) => Linha[]> = Object.assign({}, ...AREAS.map((a) => a.views ?? {}))
export const PADROES_AREAS: Record<string, Linha> = Object.assign({}, ...AREAS.map((a) => a.padroes ?? {}))

export const ROTEIRO_AREAS: PaginaRoteiro[] = AREAS.flatMap((a) => a.roteiro ?? [])

export const RPCS_AREAS: Record<string, (args: Record<string, any>, b: Tabelas) => unknown> = // eslint-disable-line @typescript-eslint/no-explicit-any
  Object.assign({}, ...AREAS.map((a) => a.rpcs ?? {}))
