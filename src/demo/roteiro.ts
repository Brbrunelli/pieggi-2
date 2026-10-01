// ============================================================
// ROTEIRO DA DEMONSTRAÇÃO — o cartão de teste de cada página
//
// Páginas que já existiam + a rua. As áreas novas (operação, compras,
// pessoas) trazem o próprio roteiro em cenarios/<area>.ts.
// ============================================================

import { ROTEIRO_AREAS } from './cenarios'
import type { PaginaRoteiro } from './cenarios/tipos'

const BASE: PaginaRoteiro[] = [
  {
    rota: '/briefing',
    titulo: 'Briefing',
    cenario:
      'Há uma conversa salva com o Studio K (cliente novo): a IA já pediu andar e doca e deixou "confirmar no pós-venda" nas pendências. Na demonstração a IA não responde — a conversa é só para ver o fluxo.',
    testar: ['Abrir a conversa "Studio K — coquetel 60 pessoas"'],
    papel: 'comercial',
  },
  {
    rota: '/eventos/:id/proposta',
    titulo: 'Proposta',
    cenario: 'O Workshop Inteli (lead quente) já tem cardápio montado: mini lanches, bebezinho e petit four para 40 pessoas.',
    testar: ['Abrir a proposta do Workshop Inteli', 'Ver o aviso de endereço a confirmar no checklist da proposta'],
    papel: 'comercial',
  },
  {
    rota: '/eventos/:id/programacao',
    titulo: 'Programação',
    cenario:
      'O Treinamento RH Inteli (em 5 dias) está com a programação EM MONTAGEM — falta aprovar. O IA para Negócios mostra a programação de 2 dias da revisão 24/09.',
    testar: ['No Treinamento RH, gerar o .docx e ver checklist da copeira + termo de sobras por dia', 'Aprovar a programação'],
  },
  {
    rota: '/operacao',
    titulo: 'Operação',
    cenario:
      'Hoje: IA para Negócios (na rua) e Jantar do Conselho StartSe (19h30, ainda na casa). Amanhã: Almoço de Diretoria Aurora. O vinho do jantar vai para a Expedição — Bebidas (o motor passou a reconhecer vinho, espumante e drinks).',
    testar: ['Abrir o Jantar do Conselho e ir para Produção'],
  },
  {
    rota: '/',
    titulo: 'Painel',
    cenario:
      'Uma semana hipotética: o "IA para Negócios" (StartSe) está acontecendo hoje e amanhã, a Convenção Aurora é daqui a 3 dias e o Treinamento Aurora fechou há 5 dias com 8 copos perdidos.',
    testar: [
      'Ver o bloco "Rua no período": prejuízo de material e ocorrências abertas',
      'Trocar o papel para Cozinha e ver o painel virar agenda de produção, sem dinheiro',
    ],
  },
  {
    rota: '/eventos',
    titulo: 'Funil de eventos',
    cenario:
      'Um evento em cada etapa: Lumen (frio, cliente novo sem cadastro), Workshop Inteli (quente), Summit WTC (contrato para assinar), IA para Negócios e Convenção Aurora (assinados).',
    testar: ['Arrastar o Workshop Inteli para "Contrato para assinar"', 'Abrir o Lumen e ver que o cliente não tem cadastro'],
    papel: 'comercial',
  },
  {
    rota: '/eventos/:id',
    titulo: 'Evento',
    cenario:
      'O cartão "Endereço e acesso" mostra se andar, doca e com quem foram confirmados. A Convenção Aurora está sem confirmação — e o endereço já mudou uma vez (veja o histórico).',
    testar: ['Abrir a Convenção Aurora e confirmar o endereço preenchendo andar, doca e "confirmado com"'],
  },
  {
    rota: '/eventos/:id/producao',
    titulo: 'Produção (comanda + plaquinha)',
    cenario:
      'A comanda foi calculada pelo motor real a partir da programação de teste. Na Convenção Aurora, o endereço não confirmado TRAVA a geração — de propósito.',
    testar: ['Tentar gerar a comanda da Convenção Aurora e ler a mensagem', 'No IA para Negócios, ver a saída "PROGRAMADA (motorista Carlos)"'],
  },
  {
    rota: '/eventos/:id/campo',
    titulo: 'Evento na rua',
    cenario:
      'IA para Negócios hoje: saiu às 05h com o Carlos, foi montado às 07h40 com fotos. Ainda falta a reposição, a desmontagem, a volta do material e o termo de sobras — por isso não dá para marcar "desmontado".',
    testar: [
      'Aba Checklist: marcar "Reposição feita" tirando uma foto',
      'Aba Material → Retorno: digitar 94 copos voltando e ver o prejuízo',
      'Aba Sobras: assinar o termo com o dedo e baixar o PDF',
    ],
    papel: 'logistica',
  },
  {
    rota: '/rua',
    titulo: 'Rua',
    cenario: 'A agenda da logística: hoje o IA para Negócios está "Montado"; a Convenção Aurora ainda está na casa.',
    testar: ['Abrir o IA para Negócios', 'Ver a aba Encerrados: o Treinamento Aurora'],
    papel: 'logistica',
  },
  {
    rota: '/rua/transporte',
    titulo: 'Rotas do dia',
    cenario:
      'Hoje: Carlos já fez a entrega das 05h, tem a entrega do Jantar do Conselho às 17h e o recolhimento do IA para Negócios às 17h30 — o quadro acusa CONFLITO. Amanhã: o Zé leva o Almoço de Diretoria e busca 450 coxinhas na Letícia.',
    testar: ['Mudar o dia para amanhã e ver a retirada', 'Mudar para daqui a 3 dias: a Convenção Aurora aparece "sem entrega"'],
    papel: 'logistica',
  },
  {
    rota: '/motorista',
    titulo: 'Minha rota (motorista)',
    cenario:
      'Hoje o Carlos tem 3 paradas: a entrega do IA para Negócios (já concluída), a entrega do Jantar do Conselho às 17h e o recolhimento do IA às 17h30. Amanhã, a entrega das 05h.',
    testar: ['Tocar em "Saí da Pieggi" e depois "Cheguei no local"', 'Abrir "O que estou levando"'],
    papel: 'motorista',
  },
  {
    rota: '/cs',
    titulo: 'Sucesso do cliente',
    cenario: 'No topo, a fila "Endereços a confirmar" do pós-venda. O Treinamento Aurora já respondeu o NPS (nota 9).',
    testar: ['Clicar na Convenção Aurora na fila de endereços'],
    papel: 'comercial',
  },
  {
    rota: '/financeiro/receber',
    titulo: 'Contas a receber',
    cenario: 'Entrada do IA para Negócios recebida; saldo vence em 16 dias; o Treinamento Aurora está ATRASADO.',
    testar: ['Dar baixa no título atrasado'],
    papel: 'financeiro',
  },
  {
    rota: '/financeiro/notas',
    titulo: 'Notas fiscais',
    cenario: 'A nota 1042 do Treinamento Aurora foi emitida. Transmitir nota nova na demonstração não chama o PlugNotas.',
    testar: ['Montar uma nota para o IA para Negócios'],
    papel: 'financeiro',
  },
]

export const ROTEIRO: PaginaRoteiro[] = [...ROTEIRO_AREAS, ...BASE]

/** acha o roteiro da rota atual — '/eventos/:id' casa com '/eventos/e-ia' */
export function roteiroDa(caminho: string): PaginaRoteiro | null {
  const partes = caminho.replace(/\/+$/, '').split('/')
  return (
    ROTEIRO.find((r) => {
      const p = r.rota.replace(/\/+$/, '').split('/')
      return p.length === partes.length && p.every((seg, i) => seg.startsWith(':') || seg === partes[i])
    }) ?? null
  )
}
