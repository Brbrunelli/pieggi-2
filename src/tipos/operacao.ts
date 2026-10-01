// ============================================================
// TIPOS — Operação: produção por praça e checklist da expedição
//
// Espelho das tabelas da migration 0035 (producao_itens e
// expedicao_checks). As LINHAS (o que produzir, o que conferir) não
// estão no banco: vêm da comanda aprovada — aqui só o andamento.
// ============================================================

/** As três praças que produzem — as mesmas seções da comanda. */
export type EstacaoProducao = 'confeitaria' | 'fria' | 'quente'

export const ESTACOES: EstacaoProducao[] = ['confeitaria', 'fria', 'quente']

/**
 * Nome e cor de cada praça. As cores são as da comanda impressa
 * (docx-comanda.ts): quem lê a TV reconhece a mesma praça do papel.
 */
export const ESTACAO_INFO: Record<EstacaoProducao, { nome: string; curto: string; cor: string }> = {
  confeitaria: { nome: 'Confeitaria', curto: 'Confeitaria', cor: '#1F4E79' },
  fria: { nome: 'Cozinha fria / Garde manger', curto: 'Cozinha fria', cor: '#B45309' },
  quente: { nome: 'Cozinha quente', curto: 'Cozinha quente', cor: '#800020' },
}

export function ehEstacao(v: string | undefined): v is EstacaoProducao {
  return v === 'confeitaria' || v === 'fria' || v === 'quente'
}

/** "a_fazer" é a ausência de linha — voltar para "a fazer" apaga. */
export type ProducaoStatus = 'a_fazer' | 'produzindo' | 'pronto'

export const PRODUCAO_STATUS_LABEL: Record<ProducaoStatus, string> = {
  a_fazer: 'A fazer',
  produzindo: 'Produzindo',
  pronto: 'Pronto',
}

export interface ProducaoItem {
  id: string
  event_id: string
  dia: string
  estacao: EstacaoProducao
  chave: string
  rotulo: string
  status: ProducaoStatus
  atualizado_por: string | null
  atualizado_em: string
  profiles?: { nome: string } | null
}

/** Os três setores da expedição validados na reunião. */
export type SetorConferencia = 'comidas' | 'bebidas' | 'estrutura'

export const SETORES_CONFERENCIA: SetorConferencia[] = ['comidas', 'bebidas', 'estrutura']

export const SETOR_CONFERENCIA_LABEL: Record<SetorConferencia, string> = {
  comidas: 'Comidas',
  bebidas: 'Bebidas',
  estrutura: 'Estrutura',
}

export interface ExpedicaoCheck {
  id: string
  event_id: string
  dia: string
  setor: SetorConferencia
  chave: string
  conferido_por: string | null
  conferido_em: string
  obs: string | null
  profiles?: { nome: string } | null
}
