// ============================================================
// O QUE A COPEIRA FAZ NO LOCAL — fonte única
//
// Revisão de 24/09/2026 (programação "IA para Negócios", StartSe).
// Em conflito, vale sempre a revisão mais recente.
//
// O MESMO texto sai em dois lugares e não pode divergir:
//   - na programação impressa (docx-programacao.ts), por dia;
//   - na tela da rua, no celular (termo de sobras e checklist).
// ============================================================

export const LUIZ_WHATSAPP = '(11) 97603-8194'

export interface ItemChecklistCopeira {
  texto: string
  /** tarja amarela no papel — regra que mais dá errado */
  destaque?: boolean
}

export const CHECKLIST_COPEIRAS: ItemChecklistCopeira[] = [
  { texto: 'Encadernado impresso da biblioteca Pieggi (fichas OP/PA/BAS/MQ/CAN/TR/BF) + kit de finalização em mãos.' },
  { texto: 'Higienizar bancada, utensílios e mãos antes de montar. Uniforme completo.' },
  { texto: 'Montar as mesas conforme este documento, conferindo item por item.' },
  { texto: `Fotografar cada mesa montada e enviar ao Luiz (WhatsApp): ${LUIZ_WHATSAPP}.` },
  {
    texto:
      'SUCO = RECEITA PRONTA + GELO. NUNCA COLOCAR ÁGUA NO SUCO. 500 g de gelo na suqueira → 1 receita pronta enviada pela Pieggi → não adicionar água → misturar antes de abrir o serviço. Separou? Mexer delicadamente. Reposição = nova receita pronta + gelo. Nunca misturar sabores na sobra da suqueira.',
    destaque: true,
  },
  { texto: 'Enviar DE VOLTA TODAS as garrafas de 1,7 litro do suco Natural One.' },
  { texto: 'Café e água com reposição durante todo o serviço de sala.' },
  { texto: 'GELAR TODA A BEBIDA ASSIM QUE CHEGAR — suco, chá gelado e água. Nada vai para a mesa sem estar gelado.' },
  {
    texto:
      'BEBIDA QUE SOBROU VOLTA PARA O BUFFET. A Pieggi manda bebida a mais de propósito, para não acabar — conferir e devolver fechado tudo o que não foi consumido.',
  },
  {
    texto: `Cliente pediu para ficar com as bebidas? Não combine nada e não comente nada com ele. Diga só que vai conferir o que sobrou e ligue ANTES para o Luiz — ${LUIZ_WHATSAPP}.`,
  },
  {
    texto:
      'Linha AMARELA = eu monto/finalizo. Linha AZUL = eu cuido do item durante o serviço (temperatura, reposição). Linha VERMELHA = restrição ou alerta — separar e identificar. Ler todas antes de abrir o serviço.',
  },
  {
    texto: `Cliente quer levar o que sobrou? Preencher e colher assinatura no TERMO DE ENTREGA DE ALIMENTOS REMANESCENTES (nesta folha), fotografar e enviar ao Luiz antes de entregar.`,
  },
  { texto: 'Lavagem e devolução de louças, térmicas e refresqueiras ao fim de cada serviço.' },
]

// ------------------------------------------------------------
// TERMO DE ENTREGA DE ALIMENTOS REMANESCENTES
// ------------------------------------------------------------

export const TERMO_TITULO = 'TERMO DE ENTREGA DE ALIMENTOS REMANESCENTES'

/** O texto de responsabilidade — o mesmo no papel e na tela. */
export const TERMO_TEXTO: string[] = [
  'A pedido do cliente, estamos entregando os alimentos que sobraram do evento.',
  'Como é praxe da Pieggi, ao fim do serviço os alimentos disponíveis são oferecidos primeiro aos funcionários do cliente e à equipe do buffet presente no evento. O que ainda restar pode ser entregue ao cliente.',
  'Esses alimentos ficaram expostos durante todo o período de serviço, fora de refrigeração. Por isso pedimos que sejam consumidos o quanto antes, de preferência em até 2 horas, e que não sejam reaquecidos mais de uma vez.',
  'Eles seguem em embalagem simples de transporte, que não é própria para conservar alimentos por muito tempo (travessas e utensílios da Pieggi permanecem conosco). A partir da entrega, a conservação e o consumo ficam a cargo do cliente — a Pieggi Catering não tem como responder pelos alimentos depois que eles saem do nosso cuidado.',
]

export const TERMO_ACEITE = 'Recebi os alimentos nas condições acima:'

// ------------------------------------------------------------
// LEGENDA DAS LINHAS (rev. 24/09 — padrão do Claudinho)
// ------------------------------------------------------------

export const LEGENDA_LINHAS: { cor: 'amarelo' | 'azul' | 'vermelho'; titulo: string; texto: string }[] = [
  {
    cor: 'amarelo',
    titulo: 'LINHA AMARELA = FINALIZAÇÃO NO LOCAL.',
    texto: 'Procure o kit de finalização e os brotos/ervas e monte conforme o encadernado da biblioteca Pieggi.',
  },
  {
    cor: 'azul',
    titulo: 'LINHA AZUL = CUIDADO DE SERVIÇO.',
    texto: 'Leia e cumpra durante a montagem, a exposição e a reposição do item.',
  },
  {
    cor: 'vermelho',
    titulo: 'LINHA VERMELHA = RESTRIÇÃO / ALERTA.',
    texto: 'Vegano, sem glúten, sem lactose ou aviso importante: separar, identificar e não misturar utensílios.',
  },
]
