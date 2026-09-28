// Tipos do domínio — espelham o schema do Supabase

export type UserRole = 'admin' | 'comercial' | 'producao' | 'compras' | 'financeiro'
export type ClientKind = 'startse' | 'inteli' | 'wtc' | 'externo'
export type PriceTableKind = 'startse_atual' | 'startse_negociacao' | 'externos' | 'wtc'

export type EventStatus =
  | 'rascunho'
  | 'proposta_em_montagem'
  | 'proposta_enviada'
  | 'proposta_recusada'
  | 'proposta_aprovada'
  | 'programacao_em_montagem'
  | 'programacao_aprovada'
  | 'comandas_geradas'
  | 'plaquinhas_geradas'
  | 'compras_consolidadas'
  | 'concluido'
  | 'cancelado'

export type ServiceType =
  | 'welcome_coffee'
  | 'coffee_break'
  | 'auditorio'
  | 'brunch'
  | 'coquetel'
  | 'bar'
  | 'almoco'
  | 'jantar'
  | 'coquetel_pizza'
  | 'kit'

export type ServiceLine =
  | 'basic'
  | 'standard'
  | 'executive'
  | 'master'
  | 'premium'
  | 'pizza'
  | 'cortesia'

export type DayPeriod = 'manha' | 'tarde' | 'noite'

export type Station =
  | 'cozinha_quente'
  | 'cozinha_fria'
  | 'confeitaria'
  | 'expedicao_alimentacao'
  | 'expedicao_bebidas'
  | 'fornecedor'
  | 'congelado'

export type DietSeal = 'vegetariano' | 'vegano' | 'sem_gluten' | 'sem_lactose' | 'sem_acucar'

export interface Profile {
  id: string
  nome: string
  email: string | null
  role: UserRole
  ativo: boolean
}

export interface Client {
  id: string
  nome: string
  /** contato padrão do cliente — a cadência de CS cai aqui quando o evento não tem o seu */
  telefone?: string | null
  email?: string | null
  tipo: ClientKind
  endereco: string | null
  endereco_fixo: boolean
  marca_agua: string
  marca_refri: string
  marca_cerveja: string
  isento_logistica: boolean
  isento_taxa_servico: boolean
  regras: Record<string, unknown>
  ativo: boolean
}

export interface PriceTable {
  id: string
  kind: PriceTableKind
  nome: string
  vigente: boolean
  versao: number
  obs: string | null
}

export interface PriceItem {
  id: string
  price_table_id: string
  service_type: ServiceType
  service_line: ServiceLine | null
  variante: string
  preco_pax: number
  obs: string | null
}

export interface CatalogItem {
  id: string
  categoria: string
  nome: string
  descricao: string | null
  base_sabor: string | null
  tier_minimo: ServiceLine | null
  servicos: ServiceType[]
  periodos: DayPeriod[]
  selo: DietSeal | null
  nome_en: string | null
  nome_es: string | null
  proibido: boolean
  descontinuado: boolean
  estacao: Station | null
  fornecedor: string | null
  ficha_compra: Record<string, unknown>
  ativo: boolean
  obs: string | null

  // ---------- fiscal ----------
  /**
   * Grupo fiscal do item (migration 0024). Quando preenchido, o GRUPO
   * manda: os campos abaixo ficam como exceção para o produto raro com
   * NCM próprio.
   */
  tax_group_id: string | null
  classificacao_fiscal: ClassificacaoFiscal
  ncm: string | null
  cest: string | null
  cfop: string | null
  origem_mercadoria: string | null
  unidade_fiscal: string | null
  icms_pct: number | null
  ipi_pct: number | null
  pis_pct: number | null
  cofins_pct: number | null
  iss_pct: number | null
  item_lista_servico: string | null
}

export interface RuleParam {
  chave: string
  valor: unknown
  descricao: string | null
  categoria: string
  updated_at: string
}

export interface PieggiEvent {
  id: string
  client_id: string | null
  /** Nome livre quando o cliente não tem cadastro (cliente novo/avulso) */
  cliente_nome: string | null
  nome: string
  contato: string | null
  /**
   * Contato DESTE evento — tem prioridade sobre o do cadastro do cliente:
   * quem responde a pesquisa de CS é a pessoa do evento, não a empresa.
   */
  contato_telefone: string | null
  contato_email: string | null
  price_table_id: string | null
  status: EventStatus
  pax: number | null
  endereco: string | null
  endereco_confirmado: boolean
  local_detalhe: string | null
  restricoes: Restricao[]
  /** AUTOMÁTICO — total da proposta salva (base da verba 8%) */
  orcamento_valor: number | null
  /** Cliente ainda sem preço fechado → slide sai com "R$ a definir" */
  preco_a_definir: boolean
  /**
   * Como o cliente compra: 'pacote' = preço/pax da linha contratada ·
   * 'unidade' = preço por unidade × un/pax × pax × dias (feira e stand).
   */
  modo_cobranca: 'pacote' | 'unidade'
  /** Etapa no funil comercial (Kanban) */
  pipeline: PipelineStage
  pipeline_em: string
  motivo_perda: string | null
  /** Link do negócio no Pipedrive (o funil comercial mora lá) */
  pipedrive_url: string | null
  obs: string | null
  created_at: string
  updated_at: string
}

// ------------------------------------------------------------
// Pipeline comercial (Kanban da aba Eventos)
// ------------------------------------------------------------
/**
 * Etapa do funil comercial (Kanban da aba Eventos).
 *
 * `aprovado` = contrato ASSINADO. O nome continua o mesmo de propósito:
 * é ele que a FaseGuard e a fila da operação já consultam, então trocar
 * quebraria a esteira sem necessidade. O que mudou é COMO se chega lá —
 * antes era o aceite do cliente, agora é a assinatura voltando do
 * DocuSign (trigger `contrato_assinado_libera_operacao`, migration 0021).
 */
export type PipelineStage =
  | 'frio'
  | 'morno'
  | 'quente'
  | 'contrato_enviado'
  | 'aprovado'
  | 'perdido'

export const PIPELINE: {
  key: PipelineStage
  label: string
  emoji: string
  cor: string
  descricao: string
}[] = [
  {
    key: 'frio',
    label: 'Frio',
    emoji: '',
    cor: 'border-t-neutral-300',
    descricao: 'Chegou o pedido — briefing e proposta em montagem',
  },
  {
    key: 'morno',
    label: 'Morno',
    emoji: '',
    cor: 'border-t-neutral-500',
    descricao: 'Proposta enviada — aguardando o cliente responder',
  },
  {
    key: 'quente',
    label: 'Quente',
    emoji: '',
    cor: 'border-t-amber-500',
    descricao: 'Cliente aceitou o valor — fechando detalhes do contrato',
  },
  {
    key: 'contrato_enviado',
    label: 'Contrato para assinar',
    emoji: '',
    cor: 'border-t-amber-600',
    descricao: 'Contrato no DocuSign — a assinatura é o que libera a operação',
  },
  {
    key: 'aprovado',
    label: 'Contrato assinado',
    emoji: '',
    cor: 'border-t-green-700',
    descricao: 'Cai o card para a operação e a NF entra na fila do financeiro',
  },
]

/** A etapa que libera Programação, Comandas, Plaquinhas e Compras. */
export const ETAPA_FECHADO: PipelineStage = 'aprovado'

export function operacaoLiberada(pipeline: PipelineStage | undefined): boolean {
  return pipeline === ETAPA_FECHADO
}

/** Nome do cliente para exibição/documentos (cadastro tem prioridade) */
export function nomeCliente(
  e: { cliente_nome?: string | null; clients?: { nome: string } | null } | null | undefined
): string {
  return e?.clients?.nome ?? e?.cliente_nome ?? 'Cliente'
}

export interface Restricao {
  tipo: string
  pax: number
  critico?: boolean
}

export interface EventService {
  id: string
  event_id: string
  service_type: ServiceType
  service_line: ServiceLine | null
  dia: string
  periodo: DayPeriod | null
  hora_inicio: string | null
  hora_fim: string | null
  reposicao_pct: number
  cardapio_interno: string | null
  /** PAX deste serviço; null = usa o PAX do evento */
  pax: number | null
  obs: string | null
  ordem: number
}

/** PAX efetivo de um serviço (o do serviço manda; senão o do evento) */
export function paxDoServico(s: { pax?: number | null }, paxEvento: number): number {
  return s.pax ?? paxEvento
}

export interface ServiceItem {
  id: string
  event_service_id: string
  catalog_item_id: string | null
  descricao_livre: string | null
  quantidade: number | null
  unidade: string
  quantidade_override: number | null
  override_motivo: string | null
  calculo: Record<string, unknown>
  ordem: number
}

// ------------------------------------------------------------
// CONTRATO (migration 0021)
// ------------------------------------------------------------
export type ContratoStatus =
  | 'rascunho'
  | 'enviado'
  | 'assinado'
  | 'recusado'
  | 'expirado'
  | 'cancelado'

export const CONTRATO_STATUS_LABEL: Record<ContratoStatus, string> = {
  rascunho: '📝 Minuta em montagem',
  enviado: '⏳ Aguardando assinatura',
  assinado: '✅ Assinado',
  recusado: '❌ Recusado pelo cliente',
  expirado: '⌛ Expirado sem assinar',
  cancelado: 'Cancelado',
}

export interface Contract {
  id: string
  event_id: string
  versao: number
  valor: number | null
  condicoes: Record<string, unknown>
  signatario_nome: string | null
  signatario_email: string | null
  signatario_doc: string | null
  status: ContratoStatus
  enviado_em: string | null
  assinado_em: string | null
  recusado_motivo: string | null
  docusign_envelope_id: string | null
  docusign_status: string | null
  minuta_path: string | null
  assinado_path: string | null
  created_at: string
  updated_at: string
}

// ------------------------------------------------------------
// FINANCEIRO E NOTA FISCAL (migration 0022)
// ------------------------------------------------------------
/** O que decide se o item entra como produto (NF-e) ou serviço (NFS-e). */
export type ClassificacaoFiscal = 'produto' | 'servico'

/**
 * Grupo fiscal (migration 0024) — poucos grupos com NCM/CFOP/alíquotas,
 * e cada item do cardápio aponta para um. Cadastrar 140 itens um a um
 * não se mantém; alíquota que muda tem um lugar só para mudar.
 */
export interface TaxGroup {
  id: string
  nome: string
  descricao: string | null
  classificacao_fiscal: ClassificacaoFiscal
  ncm: string | null
  cest: string | null
  cfop: string | null
  origem_mercadoria: string | null
  unidade_fiscal: string | null
  icms_pct: number | null
  ipi_pct: number | null
  pis_pct: number | null
  cofins_pct: number | null
  iss_pct: number | null
  item_lista_servico: string | null
  ativo: boolean
  ordem: number
}

export type InvoiceTipo = 'servico' | 'produto' | 'mista'
export type InvoiceStatus = 'rascunho' | 'transmitindo' | 'emitida' | 'erro' | 'cancelada'

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  rascunho: '📝 Rascunho',
  transmitindo: '⏳ Transmitindo',
  emitida: '✅ Emitida',
  erro: '🛑 Erro na emissão',
  cancelada: 'Cancelada',
}

export interface FiscalConfig {
  id: number
  razao_social: string | null
  cnpj: string | null
  inscricao_municipal: string | null
  inscricao_estadual: string | null
  regime_tributario: 'simples_nacional' | 'lucro_presumido' | 'lucro_real'
  endereco: string | null
  municipio: string | null
  uf: string | null
  cep: string | null
  item_lista_servico: string | null
  codigo_tributario_municipio: string | null
  cnae: string | null
  iss_pct: number | null
  iss_retido: boolean
  cfop_padrao: string | null
  ncm_padrao: string | null
  plugnotas_ambiente: 'homologacao' | 'producao'
  plugnotas_empresa_id: string | null
}

export interface Invoice {
  id: string
  client_id: string | null
  destinatario_nome: string
  destinatario_doc: string | null
  destinatario_email: string | null
  destinatario_endereco: string | null
  tipo: InvoiceTipo
  valor_produto: number
  valor_servico: number
  /** coluna gerada no banco: produto + serviço */
  valor_total: number
  impostos: Record<string, unknown>
  competencia: string | null
  observacoes: string | null
  status: InvoiceStatus
  plugnotas_id: string | null
  numero: string | null
  serie: string | null
  emitida_em: string | null
  pdf_url: string | null
  xml_url: string | null
  erro_msg: string | null
  created_at: string
  updated_at: string
}

/** Rateio de uma nota entre os eventos que ela cobre. */
export interface InvoiceEvent {
  invoice_id: string
  event_id: string
  valor_produto: number
  valor_servico: number
}

export type ReceivableStatus = 'a_receber' | 'recebido' | 'cancelado'

export interface Receivable {
  id: string
  invoice_id: string | null
  event_id: string | null
  client_id: string | null
  descricao: string
  parcela: number
  parcelas: number
  valor: number
  vencimento: string
  forma_pagamento: string | null
  valor_pago: number | null
  pago_em: string | null
  status: ReceivableStatus
  obs: string | null
  /** vem da view `receivables_abertos` — nunca é coluna guardada */
  atrasado?: boolean
  dias_ate_vencer?: number
}

// ------------------------------------------------------------
// CADÊNCIA DE CS (migration 0023)
// ------------------------------------------------------------
export type CsCanal = 'whatsapp' | 'email'
export type CsMomento = 'pre' | 'pos'

export interface CsTemplate {
  id: string
  nome: string
  canal: CsCanal
  momento: CsMomento
  /** dias em relação ao 1º dia do evento: negativo = antes, positivo = depois */
  dias: number
  /** só para a cadência PRÉ: folga mínima entre assinatura e evento */
  min_antecedencia_dias: number
  assunto: string | null
  corpo: string
  ativo: boolean
  ordem: number
}

export interface CsEnvio {
  id: string
  event_id: string
  /** null = contato avulso (ligação, reunião) — não veio de cadência */
  template_id: string | null
  /** rótulo do contato avulso; na cadência o nome sai do template */
  titulo: string | null
  canal: CsCanal
  status: 'enviado' | 'dispensado'
  destinatario: string | null
  mensagem: string | null
  enviado_em: string
  enviado_por: string | null
  // ---------- resposta do cliente (migration 0026) ----------
  respondido_em: string | null
  /** 0–10. Promotor 9–10 · neutro 7–8 · detrator 0–6 */
  nps: number | null
  resposta: string | null
}

/** Classificação NPS de uma nota. */
export function classeNps(nota: number): 'promotor' | 'neutro' | 'detrator' {
  if (nota >= 9) return 'promotor'
  if (nota >= 7) return 'neutro'
  return 'detrator'
}

/** Uma conversa com o agente de proposta (tela Briefing). */
export interface BriefingMensagem {
  role: 'user' | 'assistant'
  content: string
}

export interface BriefingThread {
  id: string
  titulo: string
  /** preenchido quando a conversa vira evento */
  event_id: string | null
  mensagens: BriefingMensagem[]
  /** último fechamento do agente; null enquanto só se conversou */
  proposta: Record<string, unknown> | null
  created_by: string | null
  created_at: string
  updated_at: string
}

// Rótulos PT-BR
export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  welcome_coffee: 'Welcome Coffee',
  coffee_break: 'Coffee Break',
  auditorio: 'Auditório',
  brunch: 'Brunch',
  coquetel: 'Coquetel / HH',
  bar: 'Bar',
  almoco: 'Almoço',
  jantar: 'Jantar',
  coquetel_pizza: 'Coquetel de Pizza',
  kit: 'Kit (deslocamento)',
}

export const SERVICE_LINE_LABEL: Record<ServiceLine, string> = {
  basic: 'Basic',
  standard: 'Standard',
  executive: 'Executive',
  master: 'Master',
  premium: 'Premium',
  pizza: 'Pizza',
  cortesia: 'Cortesia',
}

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  rascunho: 'Rascunho',
  proposta_em_montagem: 'Proposta em montagem',
  proposta_enviada: '⏳ Pendente do cliente',
  proposta_recusada: '❌ Proposta recusada',
  proposta_aprovada: 'Proposta aprovada',
  programacao_em_montagem: 'Programação em montagem',
  programacao_aprovada: 'Programação aprovada',
  comandas_geradas: 'Comandas geradas',
  plaquinhas_geradas: 'Plaquinhas geradas',
  compras_consolidadas: 'Compras consolidadas',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

export const PERIOD_LABEL: Record<DayPeriod, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
}

/**
 * Fases da esteira como a casa trabalha.
 *
 * Comanda e plaquinha viraram UMA fase — "Produção". As duas sempre
 * saíram da mesma programação aprovada, e aprovar cada uma em separado
 * criava a chance de imprimir plaquinha de uma versão e comanda de
 * outra. Agora a programação é o único ponto editável, e a produção sai
 * inteira dela.
 */
export const FASES = [
  { key: 'proposta', label: 'Proposta' },
  { key: 'contrato', label: 'Contrato' },
  { key: 'programacao', label: 'Programação' },
  { key: 'producao', label: 'Produção' },
  { key: 'compras', label: 'Compras' },
] as const

export type EsteiraFase = (typeof FASES)[number]['key']

/**
 * Fases usadas na VERIFICAÇÃO de pedido especial (`special_requests.fases`)
 * e no registro de aprovação (`approvals.fase`).
 *
 * Continuam separando comanda de plaquinha porque é o que já está gravado
 * no banco — a fase Produção verifica as duas de uma vez. Unificar aqui
 * exigiria reescrever histórico de evento antigo para não ganhar nada.
 */
export type FaseKey = 'proposta' | 'programacao' | 'comandas' | 'plaquinhas'

/**
 * Em que fase da esteira o evento está, pelo `status` — índice dentro de
 * `FASES`. Vive aqui porque o Painel e o detalhe do evento desenham a
 * mesma barra: duplicar a regra em dois arquivos garantia que um dia
 * elas discordassem.
 *
 * Devolve `FASES.length` quando o evento já saiu da esteira
 * (concluído/cancelado) — nenhuma coluna o reivindica.
 */
export function faseAtual(status: EventStatus): number {
  switch (status) {
    case 'rascunho':
    case 'proposta_em_montagem':
    case 'proposta_enviada':
    case 'proposta_recusada':
      return 0 // Proposta
    case 'proposta_aprovada':
      return 1 // Contrato — o cliente aceitou, falta assinar
    case 'programacao_em_montagem':
      return 2 // Programação
    case 'programacao_aprovada':
    case 'comandas_geradas':
      return 3 // Produção (comanda + plaquinha saem juntas)
    case 'plaquinhas_geradas':
      return 4 // Compras
    default:
      return FASES.length
  }
}
