// ============================================================
// PERMISSÕES POR PAPEL
//
// Espelho no front do que as migrations 0018/0019/0022/0023 travam na
// RLS. Mudou aqui, muda lá — a tela só decide o que MOSTRAR; quem
// protege o dado é o banco.
//
//   ADMIN      → tudo
//   COMERCIAL  → briefing, funil, proposta, contrato e CS. Vê todos os
//                PREÇOS de venda; na operação (programação/produção) só lê;
//                não entra no caixa (NF, contas a receber)
//   FINANCEIRO → NF, contas a receber e cadastro fiscal. Não mexe na
//                esteira nem no funil
//   COZINHA    → 'producao' e 'compras': vê a operação, imprime e dá baixa
//                do que ficou pronto — e não enxerga nada de dinheiro
// ============================================================

import { useAuth } from './auth'
import type { UserRole } from '@/types'

export const PAPEL_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  producao: 'Cozinha — Produção',
  compras: 'Cozinha — Compras',
}

export interface Permissoes {
  papel: UserRole | null
  ehAdmin: boolean
  ehComercial: boolean
  ehFinanceiro: boolean
  /** chão de produção: produz, expede e compra — não edita ficha nem vê valor */
  ehCozinha: boolean

  /** preço de venda: orçamento, verba, preço/pax, custo, CMV, ticket */
  verValores: boolean
  /** funil, proposta, briefing, estúdio de CMV, contrato, CS */
  verComercial: boolean
  editarComercial: boolean
  /** caixa da empresa: nota fiscal, contas a receber, cadastro fiscal */
  verFinanceiro: boolean
  /** transmitir NF ao PlugNotas e baixar título */
  emitirNota: boolean
  /** editar linhas, salvar, regenerar e aprovar programação/produção */
  editarOperacao: boolean
  /** dar baixa no que já ficou pronto (estação da comanda, impressão) */
  marcarPronto: boolean
  /** cadastros e parâmetros em /admin */
  administrar: boolean
}

export function permissoesDe(papel: UserRole | null | undefined): Permissoes {
  const p = papel ?? null
  const ehAdmin = p === 'admin'
  const ehComercial = p === 'comercial'
  const ehFinanceiro = p === 'financeiro'
  const ehCozinha = p === 'producao' || p === 'compras'
  return {
    papel: p,
    ehAdmin,
    ehComercial,
    ehFinanceiro,
    ehCozinha,
    // o financeiro precisa ver valor para conferir a nota contra o contrato
    verValores: ehAdmin || ehComercial || ehFinanceiro,
    verComercial: ehAdmin || ehComercial,
    editarComercial: ehAdmin || ehComercial,
    verFinanceiro: ehAdmin || ehFinanceiro,
    emitirNota: ehAdmin || ehFinanceiro,
    editarOperacao: ehAdmin,
    marcarPronto: ehAdmin || ehCozinha,
    administrar: ehAdmin,
  }
}

export function usePermissoes(): Permissoes {
  const { profile } = useAuth()
  return permissoesDe(profile?.role)
}
