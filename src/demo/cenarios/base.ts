// ============================================================
// CENÁRIOS-BASE — uma semana hipotética da Pieggi
//
// Datas RELATIVAS a hoje: a demonstração está sempre "em andamento".
//
//   E1 IA para Negócios (StartSe)   hoje e amanhã · contrato assinado ·
//                                   produção gerada · na rua (montado)
//   E2 Convenção Aurora (externo)   daqui a 3 dias · assinado · ENDEREÇO
//                                   NÃO CONFIRMADO · retirada na Letícia
//   E3 Summit WTC                   daqui a 10 dias · contrato para assinar
//   E4 Workshop Inteli              lead quente · proposta montada
//   E5 Aniversário Lumen            lead frio · CLIENTE NOVO (sem cadastro)
//   E6 Treinamento Banco Aurora     há 5 dias · ENCERRADO · quebra de copo,
//                                   sobras com termo, NPS 9, título atrasado
//
// A comanda (production_orders) não é inventada: sai do motor real
// (montarComandas) a partir da programação — a demonstração mostra
// exatamente o que o sistema calcularia.
// ============================================================

import type { Linha, Tabelas } from '../banco'
import { montarComandas, type BlocoProgramacao } from '@/engine/producao'
import { cuidadoDeServico } from '@/engine/operacao'
import type { CatalogItem, EventService } from '@/types'
import { isoLocal } from '@/engine/datas'

export const dia = (offset: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return isoLocal(d)
}
// hora LOCAL (São Paulo) convertida para timestamp — "05:02" aparece 05:02 na tela
const quando = (offset: number, hora = '10:00'): string => new Date(`${dia(offset)}T${hora}:00`).toISOString()

// ---------- pessoas (um usuário por papel — o seletor troca entre eles) ----------
export const U = {
  admin: 'u-admin',
  comercial: 'u-comercial',
  financeiro: 'u-financeiro',
  producao: 'u-producao',
  compras: 'u-compras',
  logistica: 'u-logistica',
  motorista: 'u-motorista',
  motorista2: 'u-motorista2',
}

const profiles: Linha[] = [
  { id: U.admin, nome: 'Bruno (admin)', email: 'bruno@demo.pieggi', role: 'admin', ativo: true },
  { id: U.comercial, nome: 'Andressa (comercial)', email: 'comercial@demo.pieggi', role: 'comercial', ativo: true },
  { id: U.financeiro, nome: 'Débora (financeiro)', email: 'financeiro@demo.pieggi', role: 'financeiro', ativo: true },
  { id: U.producao, nome: 'Beatriz (produção)', email: 'producao@demo.pieggi', role: 'producao', ativo: true },
  { id: U.compras, nome: 'Rita (compras)', email: 'compras@demo.pieggi', role: 'compras', ativo: true },
  { id: U.logistica, nome: 'Adriana (logística)', email: 'logistica@demo.pieggi', role: 'logistica', ativo: true },
  { id: U.motorista, nome: 'Carlos (motorista)', email: 'motorista@demo.pieggi', role: 'motorista', ativo: true },
  { id: U.motorista2, nome: 'Zé (motorista)', email: 'motorista2@demo.pieggi', role: 'motorista', ativo: true },
]

// ---------- clientes ----------
export const C = { startse: 'c-startse', wtc: 'c-wtc', inteli: 'c-inteli', aurora: 'c-aurora' }

const baseCliente = {
  marca_agua: 'Lindóia',
  marca_refri: 'Coca-Cola',
  marca_cerveja: 'Heineken',
  isento_logistica: false,
  isento_taxa_servico: false,
  regras: {},
  ativo: true,
}
const clients: Linha[] = [
  {
    ...baseCliente,
    id: C.startse,
    nome: 'StartSe',
    tipo: 'startse',
    endereco: 'Av. das Nações Unidas, 12.901 — CENU Torre Norte, Cidade Monções, SP',
    endereco_fixo: true,
    acesso_carga: 'Doca pela Rua Arizona, 1.366 · cadastrar placa até 17h do dia anterior · elevador de carga até 8h',
    marca_agua: 'Minalba',
    marca_refri: 'Pepsi',
    marca_cerveja: 'Budweiser',
    regras: { ponto_fixo: true },
    telefone: '(11) 98888-1000',
    email: 'eventos@startse.demo',
  },
  {
    ...baseCliente,
    id: C.wtc,
    nome: 'WTC Events',
    tipo: 'wtc',
    endereco: 'Av. das Nações Unidas, 12.551 — Brooklin, SP',
    endereco_fixo: true,
    acesso_carga: 'Doca G2 pelo subsolo · crachá na segurança',
  },
  {
    ...baseCliente,
    id: C.inteli,
    nome: 'Inteli',
    tipo: 'inteli',
    endereco: 'Av. Prof. Almeida Prado, 520 — Butantã, SP',
    endereco_fixo: true,
    acesso_carga: 'Portão 2, entrada de serviço',
    marca_agua: 'Minalba',
    marca_refri: 'Pepsi',
    marca_cerveja: 'Budweiser',
  },
  {
    ...baseCliente,
    id: C.aurora,
    nome: 'Banco Aurora',
    tipo: 'externo',
    endereco: null,
    endereco_fixo: false,
    telefone: '(11) 97777-2000',
    email: 'facilities@aurora.demo',
  },
]

// ---------- tabelas de preço ----------
const price_tables: Linha[] = [
  { id: 'pt-startse', kind: 'startse_atual', nome: 'StartSe/Inteli — Atual', vigente: true, versao: 1, obs: null },
  { id: 'pt-neg', kind: 'startse_negociacao', nome: 'StartSe/Inteli — Negociação', vigente: true, versao: 1, obs: null },
  { id: 'pt-ext', kind: 'externos', nome: 'Externos', vigente: true, versao: 1, obs: null },
  { id: 'pt-wtc', kind: 'wtc', nome: 'WTC (12% repasse)', vigente: true, versao: 1, obs: null },
]
const price_items: Linha[] = [
  ['pt-startse', 'welcome_coffee', null, 18],
  ['pt-startse', 'coffee_break', 'basic', 32],
  ['pt-startse', 'auditorio', null, 14],
  ['pt-ext', 'coffee_break', 'standard', 48],
  ['pt-ext', 'almoco', 'executive', 129],
  ['pt-ext', 'coquetel', 'executive', 95],
  ['pt-wtc', 'coquetel', 'master', 118],
].map(([pt, st, sl, preco], i) => ({
  id: `pi-${i}`,
  price_table_id: pt,
  service_type: st,
  service_line: sl,
  variante: '',
  preco_pax: preco,
  obs: null,
}))

// ---------- catálogo (amostra) ----------
const cat = (
  id: string,
  categoria: string,
  nome: string,
  estacao: string | null,
  fornecedor: string | null = null,
  selo: string | null = null
): Linha => ({
  id,
  categoria,
  nome,
  descricao: null,
  base_sabor: null,
  tier_minimo: null,
  servicos: [],
  periodos: [],
  selo,
  nome_en: null,
  nome_es: null,
  proibido: false,
  descontinuado: false,
  estacao,
  fornecedor,
  ficha_compra: {},
  ativo: true,
  obs: null,
  tax_group_id: null,
  classificacao_fiscal: 'produto',
  ncm: null,
  cest: null,
  cfop: null,
  origem_mercadoria: null,
  unidade_fiscal: null,
  icms_pct: null,
  ipi_pct: null,
  pis_pct: null,
  cofins_pct: null,
  iss_pct: null,
  item_lista_servico: null,
})
const catalog_items: Linha[] = [
  cat('ci-1', 'mini_lanche', 'Mini lanche Peito de Frango Defumado', 'cozinha_fria'),
  cat('ci-2', 'mini_lanche', 'Mini lanche Vegetariano II', 'cozinha_fria', null, 'vegetariano'),
  cat('ci-3', 'bebezinho', 'Bebezinho cup cake Doce de Leite', 'confeitaria'),
  cat('ci-4', 'petit_four_salgado', 'Petit four salgado Gergelim Preto', 'confeitaria'),
  cat('ci-5', 'salgado_festa', 'Mini coxinha de frango', 'fornecedor', 'leticia'),
  cat('ci-6', 'tabua', 'Tábua de frios do HH', 'fornecedor', 'leal'),
  cat('ci-7', 'proteina', 'Filé mignon ao molho madeira', 'cozinha_quente'),
  cat('ci-8', 'verrine', 'Verrine de maracujá', 'confeitaria'),
]

// ---------- regras ----------
const rule_params: Linha[] = [
  ['verba_pct', 8, 'Verba da página da Adriana = 8% do orçamento.', 'comandas'],
  ['saida_horas_antes', 3, 'Horário de saída = servir − 3h.', 'comandas'],
  ['chegada_min_antes', 60, 'Entrega: chegar N minutos antes do serviço.', 'comandas'],
  ['endereco_pieggi', 'Rua Fradique Coutinho, 100 — Pinheiros, SP', 'Saída dos motoristas.', 'comandas'],
].map(([chave, valor, descricao, categoria]) => ({ chave, valor, descricao, categoria, updated_at: quando(-30) }))

// ---------- eventos ----------
export const E = {
  ia: 'e-ia',
  aurora: 'e-aurora',
  wtc: 'e-wtc',
  inteli: 'e-inteli',
  lumen: 'e-lumen',
  treino: 'e-treino',
}

const evBase = {
  status: 'rascunho',
  restricoes: [],
  preco_a_definir: false,
  modo_cobranca: 'pacote',
  motivo_perda: null,
  pipedrive_url: null,
  obs: null,
  contato_telefone: null,
  contato_email: null,
  local_detalhe: null,
  acesso_carga: null,
  endereco_confirmado: false,
  endereco_confirmado_com: null,
  endereco_confirmado_em: null,
  campo_etapa: null,
  campo_em: null,
  created_by: U.comercial,
  created_at: quando(-20),
  updated_at: quando(-1),
}

const events: Linha[] = [
  {
    ...evBase,
    id: E.ia,
    client_id: C.startse,
    cliente_nome: null,
    nome: 'IA para Negócios',
    contato: 'Gabi',
    contato_telefone: '(11) 98888-1001',
    price_table_id: 'pt-startse',
    status: 'comandas_geradas',
    pax: 90,
    endereco: 'Av. das Nações Unidas, 12.901 — CENU Torre Norte, Cidade Monções, SP',
    local_detalhe: '9º andar — Auditório B+C',
    acesso_carga: 'Doca pela Rua Arizona, 1.366 · cadastrar placa até 17h do dia anterior · elevador de carga até 8h',
    endereco_confirmado: true,
    endereco_confirmado_com: 'Gabi (StartSe)',
    endereco_confirmado_em: quando(-6),
    orcamento_valor: 38400,
    pipeline: 'aprovado',
    pipeline_em: quando(-8),
    campo_etapa: 'montado',
    campo_em: quando(0, '07:40'),
  },
  {
    ...evBase,
    id: E.aurora,
    client_id: C.aurora,
    cliente_nome: null,
    nome: 'Convenção Comercial Aurora',
    contato: 'Marcos',
    contato_telefone: '(11) 97777-2001',
    price_table_id: 'pt-ext',
    status: 'comandas_geradas',
    pax: 150,
    endereco: 'Rua Gomes de Carvalho, 1.510 — Vila Olímpia, SP',
    local_detalhe: null,
    restricoes: [{ tipo: 'camarão', pax: 2, critico: true }, { tipo: 'lactose', pax: 4 }],
    orcamento_valor: 52300,
    pipeline: 'aprovado',
    pipeline_em: quando(-4),
  },
  {
    ...evBase,
    id: E.wtc,
    client_id: C.wtc,
    cliente_nome: null,
    nome: 'Summit WTC — Lançamento',
    contato: 'Patrícia',
    price_table_id: 'pt-wtc',
    status: 'proposta_aprovada',
    pax: 220,
    endereco: 'Av. das Nações Unidas, 12.551 — Brooklin, SP',
    acesso_carga: 'Doca G2 pelo subsolo · crachá na segurança',
    orcamento_valor: 25960,
    pipeline: 'contrato_enviado',
    pipeline_em: quando(-2),
  },
  {
    ...evBase,
    id: E.inteli,
    client_id: C.inteli,
    cliente_nome: null,
    nome: 'Workshop Inteli — Turma Out',
    contato: 'Renata',
    price_table_id: 'pt-startse',
    status: 'proposta_enviada',
    pax: 40,
    endereco: 'Av. Prof. Almeida Prado, 520 — Butantã, SP',
    orcamento_valor: 3840,
    pipeline: 'quente',
    pipeline_em: quando(-3),
  },
  {
    ...evBase,
    id: E.lumen,
    client_id: null,
    cliente_nome: 'Lumen Arquitetura',
    nome: 'Aniversário 30 anos Lumen',
    contato: 'Fernanda',
    contato_telefone: '(11) 96666-3000',
    contato_email: 'fernanda@lumen.demo',
    price_table_id: 'pt-ext',
    status: 'proposta_em_montagem',
    pax: 80,
    endereco: null,
    orcamento_valor: null,
    preco_a_definir: true,
    pipeline: 'frio',
    pipeline_em: quando(0, '09:00'),
    created_at: quando(0, '09:00'),
  },
  {
    ...evBase,
    id: E.treino,
    client_id: C.aurora,
    cliente_nome: null,
    nome: 'Treinamento de Vendas Aurora',
    contato: 'Marcos',
    contato_telefone: '(11) 97777-2001',
    price_table_id: 'pt-ext',
    status: 'concluido',
    pax: 60,
    endereco: 'Rua Gomes de Carvalho, 1.510 — Vila Olímpia, SP',
    local_detalhe: '4º andar — sala Atlântico',
    acesso_carga: 'Garagem G1, elevador de serviço ao lado da portaria',
    endereco_confirmado: true,
    endereco_confirmado_com: 'Marcos (Aurora)',
    endereco_confirmado_em: quando(-12),
    orcamento_valor: 9840,
    pipeline: 'aprovado',
    pipeline_em: quando(-15),
    campo_etapa: 'encerrado',
    campo_em: quando(-5, '19:00'),
  },
]

// ---------- serviços ----------
const servicos: Linha[] = []
let ordemServico = 0
function servico(event_id: string, offset: number, service_type: string, service_line: string | null, ini: string, fim: string, pax: number | null = null): string {
  const id = `s-${event_id}-${offset}-${service_type}-${ini}`
  servicos.push({
    id,
    event_id,
    service_type,
    service_line,
    dia: dia(offset),
    periodo: ini < '12:00' ? 'manha' : ini < '18:00' ? 'tarde' : 'noite',
    hora_inicio: ini,
    hora_fim: fim,
    reposicao_pct: 0,
    cardapio_interno: null,
    pax,
    obs: null,
    ordem: ordemServico++,
  })
  return id
}

// E1 — dois dias, como a programação real de 24/09
const iaDias = [0, 1]
const iaServ: Record<number, Record<string, string>> = {}
for (const o of iaDias) {
  iaServ[o] = {
    auditorio: servico(E.ia, o, 'auditorio', null, '08:00', '18:00', 90),
    welcome: servico(E.ia, o, 'welcome_coffee', null, '08:00', '08:30', 75),
    manha: servico(E.ia, o, 'coffee_break', 'basic', '10:00', '10:30', 90),
    tarde: servico(E.ia, o, 'coffee_break', 'basic', '15:30', '16:00', 90),
  }
}
const auroraAlmoco = servico(E.aurora, 3, 'almoco', 'executive', '12:30', '14:30', 150)
const auroraCoquetel = servico(E.aurora, 3, 'coquetel', 'executive', '18:00', '20:00', 150)
servico(E.wtc, 10, 'coquetel', 'master', '19:00', '21:00', 220)
servico(E.inteli, 6, 'coffee_break', 'basic', '10:00', '10:30', 40)
servico(E.lumen, 21, 'coquetel', 'executive', '20:00', '23:00', 80)
const treinoCoffee = servico(E.treino, -5, 'coffee_break', 'standard', '09:30', '10:00', 60)

// ---------- programação (texto da revisão 24/09) ----------
// linha azul do pão de queijo — o mesmo texto que a Programação gera (engine/operacao)
const CUIDADO_PQ = cuidadoDeServico('pão de queijo') ?? ''

const L = (qtd: string, receita: string, item: string, destaque: 'amarelo' | 'vermelho' | 'azul' | null = null) => ({
  qtd,
  receita,
  item,
  destaque,
})

function blocosIA(o: number): BlocoProgramacao[] {
  const d = dia(o).split('-').reverse().slice(0, 2).join('/')
  return [
    {
      serviceId: iaServ[o].auditorio,
      titulo: `SERVIÇO DE AUDITÓRIO — INTEGRAL — ${d} — 90 PAX`,
      linhas: [
        L('27 L', 'Café coado Pieggi — 13,5 L por período (8 térmicas de 1,7 L)', 'Café'),
        L('162 un', 'Água Minalba sem gás — garrafinha — 81 por período', 'Água'),
        L('108 un', 'Água Minalba com gás — garrafinha — 54 por período', 'Água'),
        L('270 + 270 sachês', 'Açúcar e adoçante — 270 de cada', 'Acompanhamento'),
      ],
    },
    {
      serviceId: iaServ[o].welcome,
      titulo: `WELCOME COFFEE — MONTADO ÀS 08h00 — ${d} — 75 PAX`,
      linhas: [
        L('105 un', `Pão de queijo tradicional — CUIDADO DE SERVIÇO: ${CUIDADO_PQ}`, 'Pão de queijo', 'azul'),
        L('45 un', 'Pão de queijo integral — CUIDADO DE SERVIÇO: mesma reposição fracionada do tradicional.', 'Pão de queijo', 'azul'),
        L('75 un', 'Petit four salgado — Gergelim Preto', 'Petit four salgado'),
        L('38 un', 'Petit four doce — Cristal de Cereja', 'Petit four doce'),
        L('38 un', 'Petit four doce — Beijo de Dama', 'Petit four doce'),
        L('3,75 L', 'Café coado Pieggi — 3 térmicas de 1,7 L', 'Café'),
        L('1,13 L', 'Leite', 'Leite'),
        L('1 un', 'Arranjo de flores (1 por dia do evento)', 'Decoração'),
      ],
    },
    {
      serviceId: iaServ[o].manha,
      titulo: `COFFEE BREAK BASIC — MANHÃ — 10h00 — ${d} — 90 PAX`,
      linhas: [
        L('90 un', 'Mini lanche Peito de Frango Defumado — mini brioche tradicional; pasta mix de queijos Pieggi', 'Mini lanche'),
        L('15 un', 'Mini lanche Vegetariano II (vegetariano) — mini brioche de cenoura', 'Mini lanche'),
        L('35 un', 'Bebezinho cup cake Doce de Leite (já recheado)', 'Bebezinho'),
        L('30 un', 'Bebezinho cup cake Iogurte (já recheado)', 'Bebezinho'),
        L('135 un', `Pão de queijo tradicional — CUIDADO DE SERVIÇO: ${CUIDADO_PQ}`, 'Pão de queijo', 'azul'),
        L('9 kg', 'Salada de frutas — pedaços grandes; copeira finaliza no local', 'Salada de frutas'),
        L('', 'FINALIZAR NO LOCAL: salada de frutas picada na hora, adicionais em potes', '', 'amarelo'),
        L('900 g', 'Granola', 'Adicional da salada'),
        L('6 receitas (≈ 9 L)', 'Suco Natural One Laranja', 'Suco'),
        L('7,2 L', 'Chá mate gelado', 'Chá gelado'),
        L('9 L', 'Café coado Pieggi — 6 térmicas de 1,7 L', 'Café'),
      ],
    },
    {
      serviceId: iaServ[o].tarde,
      titulo: `COFFEE BREAK BASIC — TARDE — 15h30 — ${d} — 90 PAX`,
      linhas: [
        L('90 un', 'Mini lanche Salame Comum — mini brioche tradicional', 'Mini lanche'),
        L('15 un', 'Mini lanche Provolone (vegetariano) — mini brioche de cenoura', 'Mini lanche'),
        L('35 un', 'Bebezinho cup cake Brigadeiro (já recheado)', 'Bebezinho'),
        L('30 un', 'Bebezinho cup cake Banana (já recheado)', 'Bebezinho'),
        L('60 un', 'Pão de batata recheado com catupiry', 'Pão de batata'),
        L('6 receitas (≈ 9 L)', 'Suco Pieggi de Caju — mexer antes de servir', 'Suco'),
        L('9 L', 'Café coado Pieggi — 6 térmicas de 1,7 L', 'Café'),
      ],
    },
  ]
}

const blocosAurora: BlocoProgramacao[] = [
  {
    serviceId: auroraAlmoco,
    titulo: `ALMOÇO EXECUTIVE — 12h30 — ${dia(3).split('-').reverse().slice(0, 2).join('/')} — 150 PAX`,
    linhas: [
      L('22 kg', 'Filé mignon ao molho madeira — peso servido', 'Proteína'),
      L('18 kg', 'Arroz branco soltinho', 'Acompanhamento'),
      L('15 kg', 'Massa penne ao pomodoro', 'Massa'),
      L('12 kg', 'Salada verde com folhas, tomate cereja e crouton', 'Salada'),
      L('4 un', 'Prato sem lactose: filé grelhado + arroz — separado e identificado', 'Opção sem lactose', 'vermelho'),
      L('165 un', 'Verrine de maracujá (cup de vidro)', 'Sobremesa'),
    ],
  },
  {
    serviceId: auroraCoquetel,
    titulo: `COQUETEL EXECUTIVE — 18h00 — ${dia(3).split('-').reverse().slice(0, 2).join('/')} — 150 PAX`,
    linhas: [
      L('450 un', 'Mini coxinha de frango', 'Salgado'),
      L('6 un', 'Tábua de frios do HH', 'Tábua'),
      L('300 un', 'Canapé de salmão com cream cheese', 'Canapé'),
      L('', 'FINALIZAR CONFORME IMAGEM: componentes vão prontos, copeiras montam no local.', '', 'amarelo'),
      L('300 un', 'Mini lanche de rosbife com mostarda', 'Mini lanche'),
      L('225 un', 'Petit four doce sortido', 'Petit four doce'),
      L('150 un', 'Cerveja Heineken long neck', 'Cerveja'),
    ],
  },
]

const schedules: Linha[] = [
  {
    id: 'sch-ia',
    event_id: E.ia,
    versao: 1,
    snapshot: { blocos: [...blocosIA(0), ...blocosIA(1)] },
    arquivo_path: null,
    aprovado_por: U.admin,
    aprovado_em: quando(-3),
    created_at: quando(-4),
  },
  {
    id: 'sch-aurora',
    event_id: E.aurora,
    versao: 1,
    snapshot: { blocos: blocosAurora },
    arquivo_path: null,
    aprovado_por: U.admin,
    aprovado_em: quando(-1),
    created_at: quando(-2),
  },
]

// ---------- comandas: o motor real calcula ----------
function comandaDe(eventId: string, pax: number, startse: boolean, blocos: BlocoProgramacao[]) {
  return montarComandas({
    pax,
    startseFixo: startse,
    servicos: servicos.filter((s) => s.event_id === eventId) as unknown as EventService[],
    blocos,
    catalogo: catalog_items as unknown as CatalogItem[],
    pedidos: [],
  })
}

const production_orders: Linha[] = [
  {
    id: 'po-ia',
    event_id: E.ia,
    versao: 1,
    verba: 3072,
    snapshot: comandaDe(E.ia, 90, true, [...blocosIA(0), ...blocosIA(1)]),
    arquivo_path: null,
    aprovado_por: U.admin,
    aprovado_em: quando(-2),
    created_at: quando(-2),
  },
  {
    id: 'po-aurora',
    event_id: E.aurora,
    versao: 1,
    verba: 4184,
    snapshot: comandaDe(E.aurora, 150, false, blocosAurora),
    arquivo_path: null,
    aprovado_por: U.admin,
    aprovado_em: quando(-1),
    created_at: quando(-1),
  },
]
const signage_sets: Linha[] = [
  { id: 'ss-ia', event_id: E.ia, versao: 1, cards: [], arquivo_path: null, aprovado_por: U.admin, aprovado_em: quando(-2), created_at: quando(-2) },
]

const proposals: Linha[] = [E.ia, E.aurora, E.wtc, E.treino].map((event_id, i) => ({
  id: `prop-${i}`,
  event_id,
  versao: 1,
  desconto_pct: 0,
  cmv_status: 'ok',
  preco_total: events.find((e) => e.id === event_id)?.orcamento_valor,
  dados: {},
  arquivo_path: null,
  aprovado_por: U.comercial,
  aprovado_em: quando(-9),
  created_at: quando(-10),
}))

// ---------- contrato ----------
const contracts: Linha[] = [
  [E.ia, 'assinado', 38400, -8],
  [E.aurora, 'assinado', 52300, -4],
  [E.treino, 'assinado', 9840, -15],
  [E.wtc, 'enviado', 25960, null],
].map(([event_id, status, valor, ass], i) => ({
  id: `ct-${i}`,
  event_id,
  versao: 1,
  valor,
  condicoes: { forma: '50% na assinatura, 50% em 15 dias após o evento' },
  signatario_nome: 'Responsável do cliente',
  signatario_email: 'assinatura@cliente.demo',
  signatario_doc: null,
  status,
  enviado_em: quando(-10),
  assinado_em: ass == null ? null : quando(ass as number),
  recusado_motivo: null,
  docusign_envelope_id: null,
  docusign_status: null,
  minuta_path: null,
  assinado_path: null,
  created_by: U.comercial,
  created_at: quando(-10),
  updated_at: quando(-2),
}))

// ---------- financeiro ----------
const receivables: Linha[] = [
  { id: 'r-1', invoice_id: null, event_id: E.ia, client_id: C.startse, descricao: 'Entrada 50% — IA para Negócios', parcela: 1, parcelas: 2, valor: 19200, vencimento: dia(-7), forma_pagamento: 'boleto', valor_pago: 19200, pago_em: dia(-7), status: 'recebido', obs: null },
  { id: 'r-2', invoice_id: null, event_id: E.ia, client_id: C.startse, descricao: 'Saldo 50% — IA para Negócios', parcela: 2, parcelas: 2, valor: 19200, vencimento: dia(16), forma_pagamento: 'boleto', valor_pago: null, pago_em: null, status: 'a_receber', obs: null },
  { id: 'r-3', invoice_id: 'nf-treino', event_id: E.treino, client_id: C.aurora, descricao: 'Treinamento de Vendas Aurora — parcela única', parcela: 1, parcelas: 1, valor: 9840, vencimento: dia(-2), forma_pagamento: 'boleto', valor_pago: null, pago_em: null, status: 'a_receber', obs: null },
  { id: 'r-4', invoice_id: null, event_id: E.aurora, client_id: C.aurora, descricao: 'Entrada 50% — Convenção Aurora', parcela: 1, parcelas: 2, valor: 26150, vencimento: dia(1), forma_pagamento: 'PIX', valor_pago: null, pago_em: null, status: 'a_receber', obs: null },
].map((r) => ({ ...r, created_by: U.financeiro, created_at: quando(-10), updated_at: quando(-2) }))

const invoices: Linha[] = [
  {
    id: 'nf-treino',
    client_id: C.aurora,
    destinatario_nome: 'Banco Aurora S.A.',
    destinatario_doc: '12.345.678/0001-90',
    destinatario_email: 'fiscal@aurora.demo',
    destinatario_endereco: 'Rua Gomes de Carvalho, 1.510 — SP',
    tipo: 'mista',
    valor_produto: 6900,
    valor_servico: 2940,
    valor_total: 9840,
    impostos: {},
    competencia: dia(-5),
    observacoes: null,
    status: 'emitida',
    plugnotas_id: null,
    numero: '1042',
    serie: '1',
    emitida_em: quando(-4),
    pdf_url: null,
    xml_url: null,
    erro_msg: null,
    created_by: U.financeiro,
    created_at: quando(-4),
    updated_at: quando(-4),
  },
]
const invoice_events: Linha[] = [{ invoice_id: 'nf-treino', event_id: E.treino, valor_produto: 6900, valor_servico: 2940 }]

// ---------- CS ----------
const cs_templates: Linha[] = [
  { id: 'cs-pre', nome: 'Confirmação D-2', canal: 'whatsapp', momento: 'pre', dias: -2, min_antecedencia_dias: 3, assunto: null, corpo: 'Oi {{contato}}! Tudo certo para {{evento}} no dia {{data}}? Confirma o andar e a doca?', ativo: true, ordem: 1 },
  { id: 'cs-pos', nome: 'Pesquisa NPS D+1', canal: 'whatsapp', momento: 'pos', dias: 1, min_antecedencia_dias: 0, assunto: null, corpo: 'Oi {{contato}}, de 0 a 10, quanto você recomendaria a Pieggi?', ativo: true, ordem: 2 },
]
const cs_envios: Linha[] = [
  { id: 'cse-1', event_id: E.treino, template_id: 'cs-pos', titulo: null, canal: 'whatsapp', status: 'enviado', destinatario: '(11) 97777-2001', mensagem: 'Pesquisa NPS', enviado_em: quando(-4), enviado_por: U.comercial, respondido_em: quando(-3), nps: 9, resposta: 'Comida ótima! Só faltou copo no fim.' },
]

// ---------- pedido especial ----------
const special_requests: Linha[] = [
  { id: 'sr-1', event_id: E.aurora, descricao: 'Bolo sem glúten para a diretora (1 un, 1 kg)', destino: 'cozinha', fases: ['programacao', 'comandas'], verificacoes: {}, resolvido: false, impacto_valor: 0, created_at: quando(-2), created_by: U.comercial },
]

// ---------- histórico do funil ----------
const pipeline_log: Linha[] = [
  { id: 1, event_id: E.ia, de: 'contrato_enviado', para: 'aprovado', user_id: U.comercial, motivo: 'Contrato assinado', criado_em: quando(-8) },
  { id: 2, event_id: E.aurora, de: 'contrato_enviado', para: 'aprovado', user_id: U.comercial, motivo: 'Contrato assinado', criado_em: quando(-4) },
  { id: 3, event_id: E.treino, de: 'contrato_enviado', para: 'aprovado', user_id: U.comercial, motivo: 'Contrato assinado', criado_em: quando(-15) },
]

export function montarBase(): Tabelas {
  return {
    profiles,
    clients,
    price_tables,
    price_items,
    catalog_items,
    rule_params,
    events,
    event_services: servicos,
    service_items: [],
    schedules,
    production_orders,
    signage_sets,
    proposals,
    contracts,
    receivables,
    invoices,
    invoice_events,
    cs_templates,
    cs_envios,
    special_requests,
    pipeline_log,
    approvals: [],
    documents: [],
    station_progress: [],
    purchase_lists: [],
    notification_settings: [],
    notification_log: [],
    briefing_threads: [],
    calendar_events: [],
    tax_groups: [],
    fiscal_config: [],
    erp_produtos: [],
    price_units: [],
    term_translations: [],
  }
}

export { quando, treinoCoffee }
