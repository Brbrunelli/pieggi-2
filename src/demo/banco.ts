// ============================================================
// BANCO DE DEMONSTRAÇÃO — tabelas em memória, salvas no navegador
//
// Começa com os cenários (cenarios/*) e guarda no localStorage o que for
// mexido na tela, para a demonstração sobreviver a um F5. "Resetar
// cenários" volta ao começo.
// ============================================================

import { montarCenarios } from './cenarios'

export type Linha = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
export type Tabelas = Record<string, Linha[]>

const CHAVE = 'pg-demo-banco'
/** sobe quando os cenários mudam de forma — invalida o que está salvo */
const VERSAO = 9

let banco: Tabelas | null = null

export function getBanco(): Tabelas {
  if (banco) return banco
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null')
    if (salvo?.versao === VERSAO && salvo.tabelas) {
      banco = salvo.tabelas as Tabelas
      return banco
    }
  } catch {
    /* salvo corrompido: recomeça */
  }
  banco = montarCenarios()
  salvar()
  return banco
}

export function tabela(nome: string): Linha[] {
  const b = getBanco()
  if (!b[nome]) b[nome] = []
  return b[nome]
}

export function salvar() {
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ versao: VERSAO, tabelas: banco }))
  } catch {
    /* cota estourada: a demo segue só em memória */
  }
}

export function resetarCenarios() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* ignore */
  }
  banco = null
  window.location.reload()
}

export function novoId(): string {
  return crypto.randomUUID()
}
