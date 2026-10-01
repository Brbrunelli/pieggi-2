// DEFAULT das colunas, como no SQL — o insert da demonstração preenche o
// que a tela não manda (status inicial, flags, listas vazias).

import type { Linha } from './banco'
import { PADROES_AREAS } from './cenarios'

export const PADROES: Record<string, Linha> = {
  events: {
    status: 'rascunho', pipeline: 'frio', restricoes: [], endereco_confirmado: false, preco_a_definir: false,
    modo_cobranca: 'pacote', campo_etapa: null, acesso_carga: null, local_detalhe: null, client_id: null, cliente_nome: null,
  },
  event_services: { reposicao_pct: 0, ordem: 0, pax: null, obs: null },
  service_items: { unidade: 'un', calculo: {}, ordem: 0 },
  contracts: { status: 'rascunho', versao: 1, condicoes: {} },
  invoices: { status: 'rascunho', valor_produto: 0, valor_servico: 0, impostos: {} },
  receivables: { status: 'a_receber', parcela: 1, parcelas: 1 },
  cs_envios: { status: 'enviado', nps: null },
  special_requests: { resolvido: false, verificacoes: {} },
  schedules: { versao: 1, snapshot: {} },
  production_orders: { versao: 1, snapshot: {} },
  signage_sets: { versao: 1, cards: [] },
  materials: { ativo: true, setor: 'estrutura', unidade: 'un', ordem: 0 },
  event_materials: { qtd_quebra: 0, setor: 'estrutura', unidade: 'un', ordem: 0 },
  checklist_templates: { ativo: true, obrigatorio: true, exige_foto: false, ordem: 0, service_types: null },
  freelancers: { ativo: true },
  event_staff: { status: 'escalado' },
  event_sobras: { sem_sobra: false, itens: [] },
  event_ocorrencias: { resolvida: false },
  fornecedores: { ativo: true },
  viagens: { status: 'programada', itens: [], tipo: 'entrega' },
  clients: { ativo: true, endereco_fixo: false, regras: {}, tipo: 'externo', marca_agua: 'Lindóia', marca_refri: 'Coca-Cola', marca_cerveja: 'Heineken', isento_logistica: false, isento_taxa_servico: false },
  ...PADROES_AREAS,
}
