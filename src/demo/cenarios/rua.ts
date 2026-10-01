// ============================================================
// CENÁRIOS DA RUA — materiais, checklist, equipe, viagens, sobras
//
//   E1 (hoje): material saiu e foi conferido; checklist de saída e de
//      montagem feitos com foto; 3 freelancers presentes; Carlos levou a
//      entrega às 05h, recolhimento às 18h30. Falta: reposição,
//      desmontagem, retorno do material e termo → não dá para "desmontar".
//   E2 (em 3 dias): retirada na Letícia programada para o Zé na véspera;
//      entrega SEM programar (o quadro acusa) e endereço não confirmado.
//   E6 (há 5 dias): encerrado — 6 copos não voltaram, 2 quebraram,
//      termo assinado, ocorrência de quebra resolvida.
// ============================================================

import type { Linha } from '../banco'
import { dia, E, quando, U, type AreaCenario } from './tipos'

// cadastro de materiais (0030), com custo preenchido para mostrar prejuízo
const materials: Linha[] = [
  ['m-copo', 'Copos de vidro', 'bebidas', 'copos de vidro', 8, 10],
  ['m-cup', 'Cup mini de vidro', 'estrutura', 'cup mini de vidro', 5, 20],
  ['m-prato', 'Pratos de louça', 'estrutura', 'pratos de louça', 15, 30],
  ['m-garfo', 'Garfos de bolo', 'estrutura', 'garfos de bolo', 6, 40],
  ['m-ceramica', 'Travessas de cerâmica', 'estrutura', 'cerâmica', 80, 60],
  ['m-rechaud', 'Réchaud', 'estrutura', 'réchaud|rechaud', 180, 70],
  ['m-placa', 'Placa elétrica', 'estrutura', 'placas elétricas|placa elétrica', 250, 80],
  ['m-champ', 'Champanheira', 'bebidas', 'champanheira', 120, 130],
  ['m-caixa', 'Caixas etiquetadas', 'estrutura', 'caixa ', 25, 160],
].map(([id, nome, setor, chave, custo, ordem]) => ({
  id,
  nome,
  setor,
  unidade: 'un',
  custo_reposicao: custo,
  chave,
  ativo: true,
  ordem,
  created_at: quando(-60),
}))

// checklist (0030 + 0034)
const T = (id: string, momento: string, texto: string, foto: boolean, obrig = true, ordem = 10, tipos: string[] | null = null, detalhe: string | null = null): Linha => ({
  id,
  momento,
  texto,
  detalhe,
  service_types: tipos,
  exige_foto: foto,
  obrigatorio: obrig,
  ordem,
  ativo: true,
})
const SUCO = ['coffee_break', 'brunch', 'almoco', 'jantar', 'coquetel', 'bar']
const checklist_templates: Linha[] = [
  T('ck-carro', 'saida', 'Carro carregado e conferido', true, true, 10, null, 'Foto do material arrumado no carro.'),
  T('ck-equipe', 'saida', 'Equipe com uniforme, touca e luvas', true, true, 20),
  T('ck-encad', 'montagem', 'Encadernado da biblioteca Pieggi + kit de finalização em mãos', false, true, 1),
  T('ck-hig', 'montagem', 'Bancada, utensílios e mãos higienizados antes de montar', false, true, 2),
  T('ck-mesa', 'montagem', 'Mesa montada no padrão Pieggi', true, true, 10, null, 'Foto de FRENTE, mesa inteira.'),
  T('ck-plaq', 'montagem', 'Plaquinhas posicionadas em todos os itens', true, true, 20),
  T('ck-touca', 'montagem', 'Equipe de touca no salão', true, true, 30),
  T('ck-gelar', 'montagem', 'Toda a bebida gelada assim que chegou', false, true, 35),
  T('ck-suco', 'montagem', 'Suco montado: receita pronta + gelo, SEM ÁGUA', true, true, 36, SUCO, '500 g de gelo → 1 receita → não adicionar água.'),
  T('ck-repos', 'reposicao', 'Reposição feita', true, true, 10, ['coffee_break', 'auditorio', 'brunch', 'coquetel', 'bar', 'almoco', 'jantar']),
  T('ck-cafe', 'reposicao', 'Café e água repostos durante todo o serviço de sala', false, true, 20),
  T('ck-volta', 'desmontagem', 'Bebida que sobrou conferida e devolvida FECHADA ao buffet', false, true, 20),
  T('ck-natural', 'desmontagem', 'Garrafas de 1,7 L do suco Natural One separadas para voltar', false, false, 21),
  T('ck-lavar', 'desmontagem', 'Louças, térmicas e refresqueiras lavadas e devolvidas', false, true, 30),
  T('ck-limpo', 'desmontagem', 'Local entregue limpo', true, true, 40),
]

// conferência de material
const em = (id: string, event_id: string, material_id: string, nome: string, setor: string, prev: number, saiu: number | null, voltou: number | null = null, quebra = 0): Linha => ({
  id,
  event_id,
  material_id,
  descricao: nome,
  setor,
  unidade: 'un',
  qtd_prevista: prev,
  qtd_saida: saiu,
  saida_por: saiu == null ? null : U.producao,
  saida_em: saiu == null ? null : quando(0, '04:30'),
  qtd_retorno: voltou,
  qtd_quebra: quebra,
  retorno_por: voltou == null ? null : U.logistica,
  retorno_em: voltou == null ? null : quando(-5, '20:00'),
  obs: null,
  ordem: 0,
})
const event_materials: Linha[] = [
  em('em-1', E.ia, 'm-copo', 'Copos de vidro', 'bebidas', 99, 100),
  em('em-2', E.ia, 'm-prato', 'Pratos de louça', 'estrutura', 108, 108),
  em('em-3', E.ia, 'm-garfo', 'Garfos de bolo', 'estrutura', 108, 108),
  em('em-4', E.ia, 'm-caixa', 'Caixas etiquetadas', 'estrutura', 5, 5),
  em('em-5', E.treino, 'm-copo', 'Copos de vidro', 'bebidas', 66, 66, 58, 2),
  em('em-6', E.treino, 'm-prato', 'Pratos de louça', 'estrutura', 72, 72, 72, 0),
  em('em-7', E.treino, 'm-caixa', 'Caixas etiquetadas', 'estrutura', 5, 5, 5, 0),
]

// checklist feito (E1 hoje: saída + montagem; E6: tudo)
const FOTO = 'demo/foto-exemplo.jpg'
const check = (template_id: string, event_id: string, offset: number, hora: string, foto = true): Linha => ({
  id: `chk-${event_id}-${template_id}-${offset}`,
  event_id,
  template_id,
  dia: dia(offset),
  foto_path: foto ? FOTO : null,
  obs: null,
  feito_por: U.logistica,
  feito_em: quando(offset, hora),
})
const event_checks: Linha[] = [
  check('ck-carro', E.ia, 0, '04:50'),
  check('ck-equipe', E.ia, 0, '04:55'),
  check('ck-encad', E.ia, 0, '06:10', false),
  check('ck-hig', E.ia, 0, '06:15', false),
  check('ck-mesa', E.ia, 0, '07:30'),
  check('ck-plaq', E.ia, 0, '07:32'),
  check('ck-touca', E.ia, 0, '07:35'),
  check('ck-gelar', E.ia, 0, '06:40', false),
  check('ck-suco', E.ia, 0, '09:50'),
  ...['ck-carro', 'ck-equipe', 'ck-encad', 'ck-hig', 'ck-mesa', 'ck-plaq', 'ck-touca', 'ck-gelar', 'ck-suco', 'ck-repos', 'ck-cafe', 'ck-volta', 'ck-lavar', 'ck-limpo'].map((t) =>
    check(t, E.treino, -5, '18:00', !['ck-encad', 'ck-hig', 'ck-gelar', 'ck-cafe', 'ck-volta', 'ck-lavar'].includes(t))
  ),
]

// freelancers e escala
const freelancers: Linha[] = [
  ['f-1', 'Maria Aparecida', 'copeira', 180, '(11) 95555-0001'],
  ['f-2', 'Joana Lima', 'copeira', 180, '(11) 95555-0002'],
  ['f-3', 'Paulo Santos', 'garçom', 200, '(11) 95555-0003'],
  ['f-4', 'Rafaela Costa', 'copeira', 180, '(11) 95555-0004'],
  ['f-5', 'Diego Alves', 'ajudante de carga', 150, '(11) 95555-0005'],
].map(([id, nome, funcao, valor, tel]) => ({
  id,
  nome,
  telefone: tel,
  documento: '000.000.000-00',
  pix: tel,
  funcao_padrao: funcao,
  valor_padrao: valor,
  ativo: true,
  obs: null,
  created_at: quando(-90),
}))

const staff = (id: string, event_id: string, f: string, nome: string, funcao: string, offset: number, status: string, valor: number, aval: number | null = null): Linha => ({
  id,
  event_id,
  freelancer_id: f,
  nome,
  funcao,
  dia: dia(offset),
  horario_saida: '05:00',
  horario_fim: '18:30',
  valor,
  status,
  avaliacao: aval,
  obs: null,
  created_at: quando(-6),
})
const event_staff: Linha[] = [
  staff('es-1', E.ia, 'f-1', 'Maria Aparecida', 'copeira', 0, 'presente', 180),
  staff('es-2', E.ia, 'f-2', 'Joana Lima', 'copeira', 0, 'presente', 180),
  staff('es-3', E.ia, 'f-3', 'Paulo Santos', 'garçom', 0, 'presente', 200),
  staff('es-4', E.ia, 'f-1', 'Maria Aparecida', 'copeira', 1, 'confirmado', 180),
  staff('es-5', E.ia, 'f-4', 'Rafaela Costa', 'copeira', 1, 'escalado', 180),
  staff('es-6', E.aurora, 'f-3', 'Paulo Santos', 'garçom', 3, 'escalado', 200),
  staff('es-7', E.treino, 'f-2', 'Joana Lima', 'copeira', -5, 'presente', 180, 5),
  staff('es-8', E.treino, 'f-5', 'Diego Alves', 'ajudante de carga', -5, 'faltou', 150),
]

// sobras e ocorrências (E6)
const event_sobras: Linha[] = [
  {
    id: 'sb-1',
    event_id: E.treino,
    dia: dia(-5),
    sem_sobra: false,
    itens: [
      { descricao: 'Mini lanche de peito de peru', quantidade: 18, unidade: 'un' },
      { descricao: 'Bolo de cenoura com chocolate', quantidade: 1, unidade: 'kg' },
    ],
    recebedor_nome: 'Marcos (Aurora)',
    recebedor_contato: '(11) 97777-2001',
    entregue_por: 'Joana Lima',
    aceite_texto: null,
    assinatura_path: null,
    foto_path: FOTO,
    registrado_por: U.logistica,
    registrado_em: quando(-5, '17:45'),
  },
]
const event_ocorrencias: Linha[] = [
  {
    id: 'oc-1',
    event_id: E.treino,
    tipo: 'quebra',
    descricao: '2 copos de vidro quebraram na desmontagem; 6 não foram encontrados na sala.',
    foto_path: FOTO,
    staff_id: null,
    registrado_por: U.logistica,
    registrado_em: quando(-5, '18:10'),
    resolvida: true,
    resolucao: 'Cliente informado; reposição entra no custo do evento.',
  },
  {
    id: 'oc-2',
    event_id: E.ia,
    tipo: 'endereco',
    descricao: 'Portaria mandou a carga para a doca da Torre Sul — perdemos 15 min.',
    foto_path: null,
    staff_id: null,
    registrado_por: U.motorista,
    registrado_em: quando(0, '05:40'),
    resolvida: false,
    resolucao: null,
  },
]

// fornecedores (0033) e viagens (0032)
const fornecedores: Linha[] = [
  { id: 'fo-leticia', chave: 'leticia', categoria: 'salgados', condicao_pagamento: 'avista', forma_pagamento: 'pix', pix: '(11) 94444-0001', cnpj: null, nome: 'Letícia Salgados', endereco: 'Rua Turiassu, 1.200 — Perdizes, SP', complemento: 'Balcão dos fundos', contato: 'Letícia', telefone: '(11) 94444-0001', horario: 'seg–sáb 6h–14h', obs: 'Levar caixas térmicas. Pagamento na retirada (PIX).', ativo: true },
  { id: 'fo-leal', chave: 'leal', categoria: 'frios', condicao_pagamento: '14', forma_pagamento: 'boleto', pix: null, cnpj: null, nome: 'Leal Frios', endereco: 'Rua Cardeal Arcoverde, 900 — Pinheiros, SP', complemento: null, contato: 'Sr. Leal', telefone: '(11) 94444-0002', horario: 'seg–sex 7h–17h', obs: null, ativo: true },
  { id: 'fo-luigi', chave: 'luigi', nome: 'Luigi Pães', endereco: null, complemento: null, contato: null, telefone: null, horario: null, obs: null, ativo: true },
  { id: 'fo-mercado', chave: 'mercado', nome: 'Mercado', endereco: 'Av. Rebouças, 3.970 — Pinheiros, SP', complemento: null, contato: null, telefone: null, horario: '24h', obs: null, ativo: true },
].map((f) => ({ ...f, created_at: quando(-60) }))

const viagem = (id: string, extra: Linha): Linha => ({
  id,
  veiculo: 'Fiorino FXR-2B34',
  chegada_prevista: null,
  contato_nome: null,
  contato_telefone: null,
  obs: null,
  status: 'programada',
  saiu_em: null,
  chegou_em: null,
  concluida_em: null,
  chegada_lat: null,
  chegada_lng: null,
  fornecedor_id: null,
  itens: [],
  created_by: U.logistica,
  created_at: quando(-3),
  updated_at: quando(-1),
  ...extra,
})
const ENDERECO_IA = 'Av. das Nações Unidas, 12.901 — CENU Torre Norte, Cidade Monções, SP'
const viagens: Linha[] = [
  viagem('v-1', {
    event_id: E.ia, dia: dia(0), tipo: 'entrega', motorista_id: U.motorista, saida_prevista: '05:00', chegada_prevista: '05:50',
    endereco: ENDERECO_IA, local_detalhe: '9º andar — Auditório B+C', hora_servico: '08:00',
    contato_nome: 'Gabi', contato_telefone: '(11) 98888-1001', status: 'concluida',
    saiu_em: quando(0, '05:02'), chegou_em: quando(0, '05:55'), concluida_em: quando(0, '06:20'),
  }),
  viagem('v-2', {
    event_id: E.ia, dia: dia(0), tipo: 'recolhimento', motorista_id: U.motorista, saida_prevista: '17:30', chegada_prevista: '18:15',
    endereco: ENDERECO_IA, local_detalhe: '9º andar — Auditório B+C', hora_servico: '18:00',
  }),
  viagem('v-3', {
    event_id: E.ia, dia: dia(1), tipo: 'entrega', motorista_id: U.motorista, saida_prevista: '05:00', chegada_prevista: '05:50',
    endereco: ENDERECO_IA, local_detalhe: '9º andar — Auditório B+C', hora_servico: '08:00',
    contato_nome: 'Gabi', contato_telefone: '(11) 98888-1001',
  }),
  viagem('v-4', {
    event_id: null, fornecedor_id: 'fo-leticia', dia: dia(1), tipo: 'retirada', motorista_id: U.motorista2, saida_prevista: '13:00', chegada_prevista: '13:40',
    endereco: 'Rua Turiassu, 1.200 — Perdizes, SP', local_detalhe: 'Balcão dos fundos', hora_servico: null,
    contato_nome: 'Letícia', contato_telefone: '(11) 94444-0001',
    itens: [{ descricao: 'Mini coxinha de frango', qtd: '450 un', evento: 'Convenção Comercial Aurora' }],
    obs: 'Levar 3 caixas térmicas.',
  }),
]

const campo_log: Linha[] = [
  { id: 1, event_id: E.ia, de: null, para: 'expedido', user_id: U.producao, obs: null, criado_em: quando(0, '05:00') },
  { id: 2, event_id: E.ia, de: 'expedido', para: 'montado', user_id: U.logistica, obs: null, criado_em: quando(0, '07:40') },
]

const event_endereco_log: Linha[] = [
  { id: 1, event_id: E.aurora, campo: 'endereco', de: 'Rua Gomes de Carvalho, 1.150', para: 'Rua Gomes de Carvalho, 1.510 — Vila Olímpia, SP', user_id: U.comercial, criado_em: quando(-1) },
]

export const rua: AreaCenario = {
  tabelas: () => ({
    materials,
    checklist_templates,
    event_materials,
    event_checks,
    freelancers,
    event_staff,
    event_sobras,
    event_ocorrencias,
    fornecedores,
    viagens,
    campo_log,
    event_endereco_log,
  }),
}
