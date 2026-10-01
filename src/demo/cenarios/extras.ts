// ============================================================
// EVENTOS EXTRAS — para cada módulo ter o que testar
//
//   X1 Jantar do Conselho (StartSe)     HOJE 19h30 · prato quente → a
//      Cozinha Quente tem trabalho hoje · ainda na casa · a entrega do
//      Carlos às 17h BATE com o recolhimento dele às 17h30 (conflito)
//   X2 Almoço de Diretoria (Aurora)     AMANHÃ 12h30 · almoço + coffee ·
//      as 3 praças produzindo para amanhã · entrega com o Zé
//   X3 Treinamento RH (Inteli)          em 5 dias · contrato assinado ·
//      programação EM MONTAGEM (ainda não aprovada)
//   X4 Workshop Studio K                lead morno · proposta enviada
//   X5 Festa de Fim de Ano Lumen        PERDIDO (preço)
//   + uma conversa no Briefing e o cardápio montado do Workshop Inteli
//     (para a tela de Proposta ter itens)
// ============================================================

import type { Linha, Tabelas } from '../banco'
import { montarComandas, type BlocoProgramacao } from '@/engine/producao'
import type { CatalogItem, EventService } from '@/types'
import { C, dia, E, quando, U, type AreaCenario } from './tipos'

export const X = {
  jantar: 'e-jantar',
  almoco: 'e-almoco',
  rh: 'e-rh',
  studio: 'e-studio',
  perdido: 'e-perdido',
}

const ddmm = (offset: number) => dia(offset).split('-').reverse().slice(0, 2).join('/')
const L = (qtd: string, receita: string, item: string, destaque: 'amarelo' | 'vermelho' | 'azul' | null = null) => ({
  qtd,
  receita,
  item,
  destaque,
})

const ENDERECO_STARTSE = 'Av. das Nações Unidas, 12.901 — CENU Torre Norte, Cidade Monções, SP'
const ACESSO_STARTSE = 'Doca pela Rua Arizona, 1.366 · cadastrar placa até 17h do dia anterior · elevador de carga até 8h'

function evento(id: string, extra: Linha): Linha {
  return {
    id,
    cliente_nome: null,
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
    created_at: quando(-14),
    updated_at: quando(-1),
    ...extra,
  }
}

const servicos: Linha[] = []
function servico(event_id: string, offset: number, service_type: string, service_line: string | null, ini: string, fim: string, pax: number): string {
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
    ordem: servicos.length,
  })
  return id
}

// ---------- serviços ----------
const jantar = servico(X.jantar, 0, 'jantar', 'executive', '19:30', '21:30', 40)
const almoco = servico(X.almoco, 1, 'almoco', 'executive', '12:30', '14:00', 30)
const almocoCoffee = servico(X.almoco, 1, 'coffee_break', 'standard', '16:00', '16:30', 30)
const rhCoffee = servico(X.rh, 5, 'coffee_break', 'basic', '10:00', '10:30', 50)
servico(X.studio, 12, 'coquetel', 'executive', '19:00', '22:00', 60)
servico(X.perdido, 40, 'jantar', 'master', '20:00', '23:00', 120)

// ---------- programação ----------
const blocosJantar: BlocoProgramacao[] = [
  {
    serviceId: jantar,
    titulo: `JANTAR EXECUTIVE — 19h30 — ${ddmm(0)} — 40 PAX`,
    linhas: [
      L('6 kg', 'Salmão assado com crosta de ervas — peso servido', 'Proteína'),
      L('5 kg', 'Risoto de cogumelos', 'Massa/Risoto'),
      L('4 kg', 'Legumes salteados na manteiga', 'Acompanhamento'),
      L('', 'FINALIZAR NO LOCAL: risoto termina na placa elétrica, 10 min antes de servir', '', 'amarelo'),
      L('3 kg', 'Salada de folhas com burrata e tomate confit', 'Salada'),
      L('44 un', 'Verrine de frutas vermelhas (cup de vidro)', 'Sobremesa'),
      L('44 un', 'Bombom de chocolate belga — petit four doce', 'Petit four doce'),
      L('12 garrafas', 'Vinho tinto — bebida extra contratada', 'Vinho'),
    ],
  },
]

const blocosAlmoco: BlocoProgramacao[] = [
  {
    serviceId: almoco,
    titulo: `ALMOÇO EXECUTIVE — 12h30 — ${ddmm(1)} — 30 PAX`,
    linhas: [
      L('4,5 kg', 'Frango assado ao limão siciliano — peso servido', 'Proteína'),
      L('3,6 kg', 'Arroz com brócolis', 'Acompanhamento'),
      L('3 kg', 'Massa fusilli ao pesto', 'Massa'),
      L('2,4 kg', 'Salada caprese com folhas', 'Salada'),
      L('33 un', 'Mini tartelete de limão — doce', 'Sobremesa'),
    ],
  },
  {
    serviceId: almocoCoffee,
    titulo: `COFFEE BREAK STANDARD — TARDE — 16h00 — ${ddmm(1)} — 30 PAX`,
    linhas: [
      L('33 un', 'Mini lanche de peito de peru — mini brioche tradicional', 'Mini lanche'),
      L('33 un', 'Croissant de queijo', 'Croissant'),
      L('33 un', 'Bebezinho cup cake Prestígio (já recheado)', 'Bebezinho'),
      L('3 L', 'Café coado Pieggi — 2 térmicas de 1,7 L', 'Café'),
      L('3 L', 'Suco Natural One Laranja', 'Suco'),
    ],
  },
]

const blocosRh: BlocoProgramacao[] = [
  {
    serviceId: rhCoffee,
    titulo: `COFFEE BREAK BASIC — MANHÃ — 10h00 — ${ddmm(5)} — 50 PAX`,
    linhas: [
      L('50 un', 'Mini lanche de frango defumado', 'Mini lanche'),
      L('55 un', 'Pão de queijo tradicional — CUIDADO DE SERVIÇO: servir perto do consumo, repor aos poucos.', 'Pão de queijo', 'azul'),
      L('', '⚠ CONFIRMAR COM O CLIENTE: 3 veganos? (programação ainda em montagem)', '', 'vermelho'),
    ],
  },
]

function comanda(eventId: string, pax: number, startse: boolean, blocos: BlocoProgramacao[], catalogo: Linha[]) {
  return montarComandas({
    pax,
    startseFixo: startse,
    servicos: servicos.filter((s) => s.event_id === eventId) as unknown as EventService[],
    blocos,
    catalogo: catalogo as unknown as CatalogItem[],
    pedidos: [],
  })
}

export const extras: AreaCenario = {
  tabelas: (base: Tabelas) => {
    const catalogo = base.catalog_items ?? []

    const events: Linha[] = [
      evento(X.jantar, {
        client_id: C.startse,
        nome: 'Jantar do Conselho StartSe',
        contato: 'Gabi',
        contato_telefone: '(11) 98888-1001',
        price_table_id: 'pt-startse',
        status: 'comandas_geradas',
        pax: 40,
        endereco: ENDERECO_STARTSE,
        local_detalhe: '15º andar — Rooftop',
        acesso_carga: ACESSO_STARTSE,
        endereco_confirmado: true,
        endereco_confirmado_com: 'Gabi (StartSe)',
        endereco_confirmado_em: quando(-3),
        orcamento_valor: 14800,
        pipeline: 'aprovado',
        pipeline_em: quando(-6),
      }),
      evento(X.almoco, {
        client_id: C.aurora,
        nome: 'Almoço de Diretoria Aurora',
        contato: 'Marcos',
        contato_telefone: '(11) 97777-2001',
        price_table_id: 'pt-ext',
        status: 'comandas_geradas',
        pax: 30,
        endereco: 'Rua Gomes de Carvalho, 1.510 — Vila Olímpia, SP',
        local_detalhe: '22º andar — sala da Diretoria',
        acesso_carga: 'Garagem G1, elevador de serviço ao lado da portaria · avisar recepção 30 min antes',
        endereco_confirmado: true,
        endereco_confirmado_com: 'Marcos (Aurora)',
        endereco_confirmado_em: quando(-2),
        restricoes: [{ tipo: 'glúten', pax: 1, critico: true }],
        orcamento_valor: 6120,
        pipeline: 'aprovado',
        pipeline_em: quando(-5),
      }),
      evento(X.rh, {
        client_id: C.inteli,
        nome: 'Treinamento RH Inteli',
        contato: 'Renata',
        price_table_id: 'pt-startse',
        status: 'programacao_em_montagem',
        pax: 50,
        endereco: 'Av. Prof. Almeida Prado, 520 — Butantã, SP',
        local_detalhe: 'Prédio 2 — sala 204',
        acesso_carga: 'Portão 2, entrada de serviço',
        endereco_confirmado: true,
        endereco_confirmado_com: 'Renata (Inteli)',
        endereco_confirmado_em: quando(-1),
        orcamento_valor: 1600,
        pipeline: 'aprovado',
        pipeline_em: quando(-2),
      }),
      evento(X.studio, {
        client_id: null,
        cliente_nome: 'Studio K Design',
        nome: 'Workshop Studio K — Coquetel',
        contato: 'Kátia',
        contato_telefone: '(11) 93333-4000',
        price_table_id: 'pt-ext',
        status: 'proposta_enviada',
        pax: 60,
        endereco: 'Rua Oscar Freire, 2.100 — Pinheiros, SP',
        orcamento_valor: 5700,
        pipeline: 'morno',
        pipeline_em: quando(-6),
      }),
      evento(X.perdido, {
        client_id: null,
        cliente_nome: 'Lumen Arquitetura',
        nome: 'Festa de Fim de Ano Lumen',
        contato: 'Fernanda',
        price_table_id: 'pt-ext',
        status: 'proposta_recusada',
        pax: 120,
        orcamento_valor: 31200,
        pipeline: 'perdido',
        pipeline_em: quando(-9),
        motivo_perda: 'Preço — fechou com buffet mais barato',
      }),
    ]

    const schedules: Linha[] = [
      { id: 'sch-jantar', event_id: X.jantar, versao: 1, snapshot: { blocos: blocosJantar }, arquivo_path: null, aprovado_por: U.admin, aprovado_em: quando(-2), created_at: quando(-3) },
      { id: 'sch-almoco', event_id: X.almoco, versao: 1, snapshot: { blocos: blocosAlmoco }, arquivo_path: null, aprovado_por: U.admin, aprovado_em: quando(-1), created_at: quando(-2) },
      // em montagem: sem aprovado_em — a tela de Programação mostra "aprovar"
      { id: 'sch-rh', event_id: X.rh, versao: 1, snapshot: { blocos: blocosRh }, arquivo_path: null, aprovado_por: null, aprovado_em: null, created_at: quando(-1) },
    ]

    const production_orders: Linha[] = [
      { id: 'po-jantar', event_id: X.jantar, versao: 1, verba: 1184, snapshot: comanda(X.jantar, 40, true, blocosJantar, catalogo), arquivo_path: null, aprovado_por: U.admin, aprovado_em: quando(-1), created_at: quando(-1) },
      { id: 'po-almoco', event_id: X.almoco, versao: 1, verba: 490, snapshot: comanda(X.almoco, 30, false, blocosAlmoco, catalogo), arquivo_path: null, aprovado_por: U.admin, aprovado_em: quando(-1), created_at: quando(-1) },
    ]

    const proposals: Linha[] = [X.jantar, X.almoco, X.rh, X.studio, E.inteli].map((event_id, i) => ({
      id: `prop-x${i}`,
      event_id,
      versao: 1,
      desconto_pct: 0,
      cmv_status: 'ok',
      preco_total: events.find((e) => e.id === event_id)?.orcamento_valor ?? 3840,
      dados: {},
      arquivo_path: null,
      aprovado_por: [X.studio, E.inteli].includes(event_id) ? null : U.comercial,
      aprovado_em: [X.studio, E.inteli].includes(event_id) ? null : quando(-7),
      created_at: quando(-8),
    }))

    const contracts: Linha[] = [X.jantar, X.almoco, X.rh].map((event_id, i) => ({
      id: `ct-x${i}`,
      event_id,
      versao: 1,
      valor: events.find((e) => e.id === event_id)?.orcamento_valor,
      condicoes: { forma: '100% em 15 dias após o evento' },
      signatario_nome: 'Responsável do cliente',
      signatario_email: 'assinatura@cliente.demo',
      signatario_doc: null,
      status: 'assinado',
      enviado_em: quando(-8),
      assinado_em: quando(-5),
      recusado_motivo: null,
      docusign_envelope_id: null,
      docusign_status: null,
      minuta_path: null,
      assinado_path: null,
      created_by: U.comercial,
      created_at: quando(-8),
      updated_at: quando(-5),
    }))

    const receivables: Linha[] = [
      { id: 'r-x1', invoice_id: null, event_id: X.jantar, client_id: C.startse, descricao: 'Jantar do Conselho — parcela única', parcela: 1, parcelas: 1, valor: 14800, vencimento: dia(15), forma_pagamento: 'boleto', valor_pago: null, pago_em: null, status: 'a_receber', obs: null },
      { id: 'r-x2', invoice_id: null, event_id: X.almoco, client_id: C.aurora, descricao: 'Almoço de Diretoria — parcela única', parcela: 1, parcelas: 1, valor: 6120, vencimento: dia(16), forma_pagamento: 'PIX', valor_pago: null, pago_em: null, status: 'a_receber', obs: null },
    ].map((r) => ({ ...r, created_by: U.financeiro, created_at: quando(-5), updated_at: quando(-5) }))

    // entrega do jantar às 17h com o Carlos — que tem recolhimento do IA
    // para Negócios às 17h30: o quadro "Rotas do dia" acusa o conflito
    const viagens: Linha[] = [
      {
        id: 'v-x1', event_id: X.jantar, fornecedor_id: null, dia: dia(0), tipo: 'entrega', motorista_id: U.motorista, veiculo: 'Fiorino FXR-2B34',
        saida_prevista: '17:00', chegada_prevista: '17:50', endereco: ENDERECO_STARTSE, local_detalhe: '15º andar — Rooftop', hora_servico: '19:30',
        contato_nome: 'Gabi', contato_telefone: '(11) 98888-1001', obs: 'Placa elétrica para o risoto.', status: 'programada', itens: [],
        saiu_em: null, chegou_em: null, concluida_em: null, chegada_lat: null, chegada_lng: null, created_by: U.logistica, created_at: quando(-1), updated_at: quando(-1),
      },
      {
        id: 'v-x2', event_id: X.almoco, fornecedor_id: null, dia: dia(1), tipo: 'entrega', motorista_id: 'u-motorista2', veiculo: 'HR KLM-9C12',
        saida_prevista: '09:30', chegada_prevista: '10:30', endereco: 'Rua Gomes de Carvalho, 1.510 — Vila Olímpia, SP', local_detalhe: '22º andar — sala da Diretoria', hora_servico: '12:30',
        contato_nome: 'Marcos', contato_telefone: '(11) 97777-2001', obs: null, status: 'programada', itens: [],
        saiu_em: null, chegou_em: null, concluida_em: null, chegada_lat: null, chegada_lng: null, created_by: U.logistica, created_at: quando(-1), updated_at: quando(-1),
      },
    ]

    // cardápio montado do Workshop Inteli (lead quente) — a tela de Proposta tem o que mostrar
    const inteliCoffee = `s-${E.inteli}-6-coffee_break-10:00`
    const service_items: Linha[] = [
      ['ci-1', 40, 'un'],
      ['ci-2', 8, 'un'],
      ['ci-3', 44, 'un'],
      ['ci-4', 44, 'un'],
    ].map(([catalog_item_id, quantidade, unidade], i) => ({
      id: `si-inteli-${i}`,
      event_service_id: inteliCoffee,
      catalog_item_id,
      descricao_livre: null,
      quantidade,
      unidade,
      quantidade_override: null,
      override_motivo: null,
      calculo: { formula: 'pax × 1,1' },
      ordem: i,
    }))

    const briefing_threads: Linha[] = [
      {
        id: 'bt-1',
        titulo: 'Studio K — coquetel 60 pessoas',
        event_id: X.studio,
        mensagens: [
          { role: 'user', content: 'Oi! Coquetel para 60 pessoas na Oscar Freire, dia ' + dia(12).split('-').reverse().join('/') + ', das 19h às 22h. Cliente novo, Studio K Design.' },
          { role: 'assistant', content: 'Perfeito! Antes de montar: qual tabela de preço — Externos? E me confirme o andar/sala e como a carga entra (tem doca? elevador de carga?).' },
          { role: 'user', content: 'Externos. Andar ainda não sei, vou perguntar.' },
          { role: 'assistant', content: 'Combinado. Deixei "confirmar no pós-venda: andar / doca / contato no local" nas pendências. Sugestão: Coquetel Executive com 8 tipos de salgado volante.' },
        ],
        proposta: null,
        created_by: U.comercial,
        created_at: quando(-7),
        updated_at: quando(-6),
      },
    ]

    return {
      events,
      event_services: servicos,
      schedules,
      production_orders,
      proposals,
      contracts,
      receivables,
      viagens,
      service_items,
      briefing_threads,
    }
  },
}
