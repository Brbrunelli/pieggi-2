// ============================================================
// CENÁRIOS — Pessoas e Comercial — escala de freelancers (contrato + ASO) e CRM automático
//
// Freelas (documentos da 0037), cada um num caso:
//   f-1 Maria      apto (contrato indeterminado + ASO ok)
//   f-2 Joana      apto, mas o ASO VENCE EM 12 DIAS (alerta amarelo)
//   f-3 Paulo      ASO vale só até depois de amanhã → já escalado na
//                  Convenção Aurora (daqui 3 dias) e lá aparece BLOQUEADO
//   f-4 Rafaela    SEM CONTRATO — e está escalada no IA para Negócios
//                  amanhã (a escala acusa "trocar")
//   f-5 Diego      contrato ok, ASO VENCIDO há 20 dias
//   f-6 Bianca     novata: só trouxe o ASO, falta assinar o contrato
//
// Vagas (escala_vagas): IA hoje cheio; IA amanhã 1 copeira em aberto;
// Convenção Aurora faltando garçom, copeira e ajudante.
//
// CRM: "Clínica Sorriso Faria Lima" entrou sozinha pelo briefing ontem
// (lead); "Vértice Engenharia" fechou há 8 meses e sumiu (inativo); o
// Lumen continua SEM cadastro — para o Bruno ver o aviso e o botão.
// ============================================================

import type { Linha, Tabelas } from '../banco'
import { dia, E, quando, U, type AreaCenario } from './tipos'

// mesma normalização de src/lib/crm.ts (importar de lá criaria o ciclo demo → supabase → demo)
const normalizarNome = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

// ---------- documentos dos freelas ----------
let n = 0
const doc = (freelancer_id: string, tipo: 'contrato' | 'aso', o: Linha): Linha => ({
  id: `fd-${++n}`,
  freelancer_id,
  tipo,
  emitido_em: null,
  validade: null,
  assinado_em: null,
  arquivo_path: null,
  obs: null,
  registrado_por: U.logistica,
  created_at: quando(-30),
  ...o,
})
const freelancer_documentos: Linha[] = [
  doc('f-1', 'contrato', { assinado_em: dia(-200), emitido_em: dia(-200), obs: 'Prazo indeterminado' }),
  doc('f-1', 'aso', { emitido_em: dia(-100), validade: dia(265) }),
  doc('f-2', 'contrato', { assinado_em: dia(-150), emitido_em: dia(-150) }),
  doc('f-2', 'aso', { emitido_em: dia(-353), validade: dia(12), obs: 'Renovar — exame na clínica da Lapa' }),
  doc('f-3', 'contrato', { assinado_em: dia(-300), emitido_em: dia(-300) }),
  doc('f-3', 'aso', { emitido_em: dia(-363), validade: dia(2) }),
  doc('f-4', 'aso', { emitido_em: dia(-40), validade: dia(325) }),
  doc('f-5', 'contrato', { assinado_em: dia(-250), emitido_em: dia(-250) }),
  doc('f-5', 'aso', { emitido_em: dia(-385), validade: dia(-20) }),
  doc('f-6', 'aso', { emitido_em: dia(-3), validade: dia(362), obs: 'Indicação da Maria' }),
]

const freelancers: Linha[] = [
  {
    id: 'f-6',
    nome: 'Bianca Rocha',
    telefone: '(11) 95555-0006',
    documento: '000.000.000-00',
    pix: '(11) 95555-0006',
    funcao_padrao: 'copeira',
    valor_padrao: 180,
    ativo: true,
    obs: 'Novata — começou o processo nesta semana.',
    created_at: quando(-3),
  },
]

// ---------- vagas da escala ----------
const vaga = (id: string, event_id: string, offset: number, funcao: string, quantidade: number, saida: string, obs: string | null = null): Linha => ({
  id,
  event_id,
  dia: dia(offset),
  funcao,
  quantidade,
  horario_saida: saida,
  obs,
  created_at: quando(-5),
})
const escala_vagas: Linha[] = [
  vaga('ev-1', E.ia, 0, 'copeira', 2, '05:00'),
  vaga('ev-2', E.ia, 0, 'garçom', 1, '05:00'),
  vaga('ev-3', E.ia, 1, 'copeira', 3, '05:00', 'Dia 2 tem mais reposição no auditório'),
  vaga('ev-4', E.aurora, 3, 'garçom', 3, '09:30'),
  vaga('ev-5', E.aurora, 3, 'copeira', 4, '09:30'),
  vaga('ev-6', E.aurora, 3, 'ajudante de carga', 1, '08:00'),
]

// ---------- CRM ----------
const baseCliente = {
  marca_agua: 'Lindóia',
  marca_refri: 'Coca-Cola',
  marca_cerveja: 'Heineken',
  isento_logistica: false,
  isento_taxa_servico: false,
  regras: {},
  ativo: true,
  endereco_fixo: false,
  acesso_carga: null,
}
const SORRISO = 'c-sorriso'
const VERTICE = 'c-vertice'
const E_SORRISO = 'e-sorriso'
const E_VERTICE = 'e-vertice'

const clients: Linha[] = [
  {
    ...baseCliente,
    id: SORRISO,
    nome: 'Clínica Sorriso Faria Lima',
    tipo: 'externo',
    endereco: 'Av. Brigadeiro Faria Lima, 2.100 — Jardim Paulistano, SP',
    contato: 'Dra. Paula',
    telefone: '(11) 93333-4000',
    email: 'paula@sorriso.demo',
    origem: 'briefing',
    criado_automaticamente: true,
    created_at: quando(-1, '15:20'),
  },
  {
    ...baseCliente,
    id: VERTICE,
    nome: 'Vértice Engenharia',
    tipo: 'externo',
    endereco: 'Rua Funchal, 418 — Vila Olímpia, SP',
    contato: 'Rodrigo',
    telefone: '(11) 92222-5000',
    email: 'rodrigo@vertice.demo',
    origem: 'manual',
    criado_automaticamente: false,
    created_at: quando(-260),
  },
]

const evBase = {
  status: 'rascunho',
  restricoes: [],
  preco_a_definir: false,
  modo_cobranca: 'pacote',
  motivo_perda: null,
  pipedrive_url: null,
  obs: null,
  local_detalhe: null,
  acesso_carga: null,
  endereco_confirmado: false,
  endereco_confirmado_com: null,
  endereco_confirmado_em: null,
  campo_etapa: null,
  campo_em: null,
  cliente_nome: null,
  created_by: U.comercial,
  updated_at: quando(-1),
}
const events: Linha[] = [
  {
    ...evBase,
    id: E_SORRISO,
    client_id: SORRISO,
    nome: 'Inauguração Clínica Sorriso',
    contato: 'Dra. Paula',
    contato_telefone: '(11) 93333-4000',
    contato_email: 'paula@sorriso.demo',
    price_table_id: 'pt-ext',
    status: 'proposta_em_montagem',
    pax: 60,
    endereco: 'Av. Brigadeiro Faria Lima, 2.100 — Jardim Paulistano, SP',
    orcamento_valor: null,
    preco_a_definir: true,
    pipeline: 'frio',
    pipeline_em: quando(-1, '15:20'),
    created_at: quando(-1, '15:20'),
  },
  {
    ...evBase,
    id: E_VERTICE,
    client_id: VERTICE,
    nome: 'Confraternização de obra Vértice',
    contato: 'Rodrigo',
    contato_telefone: '(11) 92222-5000',
    price_table_id: 'pt-ext',
    status: 'concluido',
    pax: 120,
    endereco: 'Rua Funchal, 418 — Vila Olímpia, SP',
    endereco_confirmado: true,
    orcamento_valor: 14200,
    pipeline: 'aprovado',
    pipeline_em: quando(-250),
    campo_etapa: 'encerrado',
    campo_em: quando(-240, '22:00'),
    created_at: quando(-260),
  },
]

const servico = (id: string, event_id: string, offset: number, service_type: string, ini: string, fim: string, pax: number): Linha => ({
  id,
  event_id,
  service_type,
  service_line: 'executive',
  dia: dia(offset),
  periodo: ini < '12:00' ? 'manha' : ini < '18:00' ? 'tarde' : 'noite',
  hora_inicio: ini,
  hora_fim: fim,
  reposicao_pct: 0,
  cardapio_interno: null,
  pax,
  obs: null,
  ordem: 900,
})
const event_services: Linha[] = [
  servico('s-sorriso', E_SORRISO, 14, 'coquetel', '19:00', '22:00', 60),
  servico('s-vertice', E_VERTICE, -240, 'jantar', '19:00', '22:00', 120),
]

const contracts: Linha[] = [
  {
    id: 'ct-vertice',
    event_id: E_VERTICE,
    versao: 1,
    valor: 14200,
    condicoes: {},
    signatario_nome: 'Rodrigo',
    signatario_email: 'rodrigo@vertice.demo',
    signatario_doc: null,
    status: 'assinado',
    enviado_em: quando(-255),
    assinado_em: quando(-250),
    recusado_motivo: null,
    docusign_envelope_id: null,
    docusign_status: null,
    minuta_path: null,
    assinado_path: null,
    created_by: U.comercial,
    created_at: quando(-255),
    updated_at: quando(-250),
  },
]

const receivables: Linha[] = [
  {
    id: 'r-vertice',
    invoice_id: null,
    event_id: E_VERTICE,
    client_id: VERTICE,
    descricao: 'Confraternização Vértice — parcela única',
    parcela: 1,
    parcelas: 1,
    valor: 14200,
    vencimento: dia(-225),
    forma_pagamento: 'boleto',
    valor_pago: 14200,
    pago_em: dia(-226),
    status: 'recebido',
    obs: null,
    created_by: U.financeiro,
    created_at: quando(-240),
    updated_at: quando(-226),
  },
]

const cs_envios: Linha[] = [
  {
    id: 'cse-vertice',
    event_id: E_VERTICE,
    template_id: 'cs-pos',
    titulo: null,
    canal: 'whatsapp',
    status: 'enviado',
    destinatario: '(11) 92222-5000',
    mensagem: 'Pesquisa NPS',
    enviado_em: quando(-239),
    enviado_por: U.comercial,
    respondido_em: quando(-238),
    nps: 7,
    resposta: 'Comida boa, mas a montagem atrasou 20 minutos.',
  },
]

const event_ocorrencias: Linha[] = [
  {
    id: 'oc-vertice',
    event_id: E_VERTICE,
    tipo: 'atraso',
    descricao: 'Montagem terminou 20 min depois do combinado — trânsito na Juscelino.',
    foto_path: null,
    staff_id: null,
    registrado_por: U.logistica,
    registrado_em: quando(-240, '18:50'),
    resolvida: true,
    resolucao: 'Desculpas ao Rodrigo no dia; saída 30 min mais cedo para a Vila Olímpia.',
  },
]

// ---------- trava de documentos (0037) ----------
// No banco real ela nasce DESLIGADA (plano de entrada no ar da 0037). Na
// demo começa LIGADA, para o Bruno ver a escala travando; em Admin →
// Regras dá para pôr false e ver o "período de transição".
const rule_params: Linha[] = [
  {
    chave: 'exigir_docs_freela',
    valor: true,
    descricao:
      'true = só escala freela com contrato assinado + ASO válido no dia. false = período de transição: escala liberada, falta de documento vira pendência.',
    categoria: 'equipe',
    updated_at: quando(-1),
  },
]

// ---------- função do banco (0037) ----------
/** garantir_cliente_crm — acha pelo nome normalizado ou cria marcado automático */
function garantirClienteCrm(a: Record<string, unknown>, b: Tabelas): string {
  const nome = String(a.p_nome ?? '').replace(/\s+/g, ' ').trim()
  if (!nome) throw new Error('Cliente sem nome.')
  b.clients = b.clients ?? []
  const achado = b.clients.find((c) => normalizarNome(String(c.nome)) === normalizarNome(nome))
  if (achado) return achado.id
  const id = crypto.randomUUID()
  b.clients.push({
    ...baseCliente,
    id,
    nome,
    tipo: 'externo',
    endereco: null,
    contato: a.p_contato ?? null,
    telefone: a.p_telefone ?? null,
    email: a.p_email ?? null,
    origem: a.p_origem ?? 'evento',
    criado_automaticamente: true,
    created_at: new Date().toISOString(),
  })
  return id
}

export const pessoas: AreaCenario = {
  tabelas: () => ({
    freelancer_documentos,
    freelancers,
    escala_vagas,
    rule_params,
    clients,
    events,
    event_services,
    contracts,
    receivables,
    cs_envios,
    event_ocorrencias,
  }),

  rpcs: {
    garantir_cliente_crm: (a, b) => garantirClienteCrm(a, b),
  },

  padroes: {
    freelancer_documentos: { emitido_em: null, validade: null, assinado_em: null, arquivo_path: null, obs: null },
    escala_vagas: { quantidade: 1, horario_saida: null, obs: null },
  },

  roteiro: [
    {
      rota: '/rua/escala',
      titulo: 'Escala da semana',
      cenario:
        'IA para Negócios hoje está completo. Amanhã o IA pede 3 copeiras: só a Maria conta (1/3). A Rafaela está escalada, mas SEM CONTRATO: a vaga fica âmbar com "1 com pendência — trocar", e ainda falta 1. Na Convenção Aurora (daqui 3 dias) faltam garçons, copeiras e o ajudante. O Paulo, escalado lá, vai estar com o ASO vencido no dia. A saída de cada evento vem da comanda aprovada, a mesma da expedição.',
      testar: [
        'No IA de amanhã, tocar em "Escalar copeira": a Joana vem primeiro (copeira e livre); Maria aparece como "já escalada neste dia"; Diego e Bianca bloqueados com o motivo',
        'Escalar a Joana, abrir o WhatsApp com o convite (saída 05:00, igual à comanda) e marcar "Confirmou"; cancelar a Rafaela e ver a vaga ficar verde',
        'Em "+ vaga", a função é uma lista (garçom, copeira…), não texto livre. O "−" na última vaga pede confirmação',
        'Transição: em Admin → Regras, pôr exigir_docs_freela = false. A Bianca e o Diego passam a ser escaláveis, aparecem em âmbar e a página mostra o aviso de "período de transição"',
      ],
      papel: 'logistica',
    },
    {
      rota: '/rua/freelancers',
      titulo: 'Freelancers — contrato + ASO',
      cenario:
        'Seis freelas, um em cada situação: Maria apta; Joana com ASO vencendo em 12 dias; Paulo com ASO até depois de amanhã; Rafaela sem contrato; Diego com ASO vencido; Bianca, novata, só trouxe o ASO.',
      testar: [
        'Filtrar "Não aptos" e depois "Vencendo em 30 dias"',
        'Abrir a Bianca e registrar o contrato assinado hoje: no celular, "Escolher arquivo/PDF" pega o PDF do DocuSign e "Tirar foto" abre a câmera. Ela vira "Apto"',
        'Abrir o Diego e registrar um ASO novo válido por 1 ano',
      ],
      papel: 'logistica',
    },
    {
      rota: '/crm',
      titulo: 'CRM',
      cenario:
        'A Clínica Sorriso entrou SOZINHA ontem pelo briefing (selo "novo (automático)"). A Vértice Engenharia fechou há 8 meses e sumiu — está inativa, com NPS 7 e um atraso na linha do tempo. O Lumen ainda está sem cadastro.',
      testar: [
        'Clicar em "Cadastrar todos no CRM" no aviso do topo e ver o Lumen virar cliente',
        'Abrir o Banco Aurora e ler a linha do tempo: contrato, NPS 9 com comentário e a quebra de copos',
        'Filtrar Leads e Inativos',
      ],
      papel: 'comercial',
    },
  ],
}

