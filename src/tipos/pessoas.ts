// ============================================================
// TIPOS — Pessoas (freelancer com contrato + ASO, escala) e CRM
//
// Migration 0037. Ficam fora de src/types.ts para três frentes poderem
// trabalhar ao mesmo tempo sem pisar no mesmo arquivo.
// ============================================================

import type { Client, PipelineStage } from '@/types'

/** Os dois papéis que liberam um freela: contrato assinado + ASO. */
export type TipoDocFreela = 'contrato' | 'aso'

export const DOC_FREELA_LABEL: Record<TipoDocFreela, string> = {
  contrato: 'Contrato',
  aso: 'ASO',
}

export interface FreelancerDocumento {
  id: string
  freelancer_id: string
  tipo: TipoDocFreela
  /** ASO: data do exame · contrato: início da vigência */
  emitido_em: string | null
  /** ASO: válido até · contrato: fim da vigência (null = indeterminado) */
  validade: string | null
  /** só contrato — sem assinatura o contrato não vale */
  assinado_em: string | null
  arquivo_path: string | null
  obs: string | null
  registrado_por: string | null
  created_at: string
}

export interface DocVencendo {
  tipo: TipoDocFreela
  /** dias até vencer, contados a partir do dia consultado */
  dias: number
}

export interface SituacaoFreela {
  apto: boolean
  motivos: string[]
  vencendo: DocVencendo[]
}

/** Quantas pessoas de cada função um evento precisa num dia (0037). */
export interface EscalaVaga {
  id: string
  event_id: string
  dia: string
  funcao: string
  quantidade: number
  horario_saida: string | null
  obs: string | null
}

// ---------- CRM ----------

/** De onde o cliente entrou no cadastro. */
export type OrigemCliente = 'manual' | 'evento' | 'briefing' | 'pipedrive'

export const ORIGEM_LABEL: Record<OrigemCliente, string> = {
  manual: 'cadastro manual',
  evento: 'novo evento',
  briefing: 'briefing',
  pipedrive: 'Pipedrive',
}

/** Client + colunas da 0037. Antes da migration elas não existem: ausência = falso. */
export interface ClienteCRM extends Client {
  contato?: string | null
  origem?: OrigemCliente | null
  criado_automaticamente?: boolean | null
  created_at?: string
}

export type StatusCRM = 'lead' | 'ativo' | 'inativo'

export const STATUS_CRM_LABEL: Record<StatusCRM, string> = {
  lead: 'Lead',
  ativo: 'Ativo',
  inativo: 'Inativo',
}

/** O mínimo de um evento que o CRM precisa para calcular status e métricas. */
export interface EventoCRM {
  id: string
  nome: string
  client_id: string | null
  cliente_nome: string | null
  contato: string | null
  contato_telefone?: string | null
  contato_email?: string | null
  pipeline: PipelineStage
  pipeline_em?: string | null
  campo_etapa?: string | null
  orcamento_valor: number | null
  created_at: string
  event_services?: { dia: string }[]
}
