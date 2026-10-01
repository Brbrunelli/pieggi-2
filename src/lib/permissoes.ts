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
//   LOGÍSTICA  → a rua (Adriana + coordenadores): escala de freelancers,
//                conferência de material, checklist com foto, sobras e
//                encerramento do evento (0030). Não vê preço de venda
//   MOTORISTA  → só as próprias viagens: endereço, horário, contato no
//                local, saí/cheguei/concluí e ocorrência de endereço (0032)
// ============================================================

import { useAuth } from './auth'
import type { UserRole } from '@/types'

export const PAPEL_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  producao: 'Cozinha — Produção',
  compras: 'Cozinha — Compras',
  logistica: 'Logística — Rua',
  motorista: 'Motorista',
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
  /** a rua (Adriana + coordenadores) */
  ehLogistica: boolean
  /** conferir material e marcar checklist da rua — pode_campo() na 0030 */
  conferirCampo: boolean
  /** escalar freelancer, cadastrar equipe e encerrar o evento — pode_escalar() */
  escalar: boolean
  /** só as próprias viagens (0032) — some todo o resto do menu */
  ehMotorista: boolean
  /** programar viagem: motorista, saída e chegada — pode_escalar() */
  programarViagem: boolean
  /** ver a equipe com PIX/documento/valor — pode_ver_equipe() */
  verEquipe: boolean
  /** módulo Compras: lista, pedidos de compra e fornecedores */
  verCompras: boolean
  /** receber mercadoria na porta (produção incluída — sem ver preço) */
  receberCompra: boolean
  /** fazer pedido de compra (gera conta a pagar no financeiro) */
  pedirCompra: boolean
  /** cadastros e parâmetros em /admin */
  administrar: boolean
}

export function permissoesDe(papel: UserRole | null | undefined): Permissoes {
  const p = papel ?? null
  const ehAdmin = p === 'admin'
  const ehComercial = p === 'comercial'
  const ehFinanceiro = p === 'financeiro'
  const ehCozinha = p === 'producao' || p === 'compras'
  const ehLogistica = p === 'logistica'
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
    ehLogistica,
    // a expedição (cozinha) confere a SAÍDA; a rua confere o resto
    conferirCampo: ehAdmin || ehLogistica || ehCozinha,
    escalar: ehAdmin || ehLogistica,
    verEquipe: ehAdmin || ehLogistica || ehFinanceiro,
    ehMotorista: p === 'motorista',
    programarViagem: ehAdmin || ehLogistica,
    // a logística consulta fornecedor para a rota de retirada
    verCompras: ehAdmin || p === 'compras' || ehFinanceiro || ehLogistica,
    pedirCompra: ehAdmin || p === 'compras',
    // decisão de 01/10: a Bia (produção) recebe — a tela dela não mostra preço
    receberCompra: ehAdmin || p === 'compras' || ehLogistica || p === 'producao',
    administrar: ehAdmin,
  }
}

export function usePermissoes(): Permissoes {
  const { profile } = useAuth()
  return permissoesDe(profile?.role)
}
