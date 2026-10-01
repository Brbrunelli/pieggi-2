// ============================================================
// CENÁRIOS — Operação — telas de produção por estação e checklist da expedição
//
//   E1 IA para Negócios, HOJE: o carro saiu às 05h02. A confeitaria deu
//      baixa em 8 de 9 itens (o bebezinho de banana ficou "produzindo" —
//      baixa esquecida), a cozinha fria tem 2 prontos e 2 produzindo, a
//      cozinha quente não tem nada (coffee da StartSe não leva quente).
//      Expedição: COMIDAS e ESTRUTURA 100%, BEBIDAS faltando 2 (suco de
//      caju e chá mate) — o carro saiu assim, e a tela diz isso: "SAIU ÀS
//      05:02 COM 2 LINHAS SEM CONFERÊNCIA", para confirmar com o motorista.
//   E1 AMANHÃ: a confeitaria já começou (petit fours prontos, bebezinhos
//      no forno); a fria ainda não começou. Saída 05h00 com o Carlos.
//   E2 Convenção Aurora (daqui 3 dias): sem rota programada — a TV usa o
//      horário da comanda (09h30). Filé mignon e verrine já iniciados.
//      Expedição ainda NÃO saiu: a logística já separou parte da
//      estrutura; a coxinha da Letícia e a tábua da Leal (encomendas que a
//      Adriana busca) estão em COMIDAS sem conferência. Os pedidos de
//      compra do evento (cenário de Compras) aparecem na faixa âmbar —
//      bebidas confirmadas, coxinha para retirar, queijos sem resposta,
//      frutas em rascunho.
//
// As CHAVES não são escritas à mão: saem do mesmo motor que as telas
// usam (engine/expedicao.ts) sobre a comanda real da base — se a chave
// mudar de fórmula, o cenário acompanha.
// ============================================================

import type { Linha, Tabelas } from '../banco'
import type { EstadoComandas } from '@/engine/producao'
import { conferenciaDoDia, itensDaSecao } from '@/engine/expedicao'
import type { EstacaoProducao, ProducaoStatus } from '@/tipos/operacao'
import { formatDiaMes } from '@/engine'
import { dia, E, U, type AreaCenario } from './tipos'

/** timestamp no horário de quem olha (a TV mostra "04:30", não UTC) */
const local = (offset: number, hora: string): string => new Date(`${dia(offset)}T${hora}:00`).toISOString()

function comanda(base: Tabelas, eventId: string): EstadoComandas | null {
  const po = (base.production_orders ?? []).find((p) => p.event_id === eventId)
  return (po?.snapshot as EstadoComandas | undefined) ?? null
}

/**
 * Baixas de uma praça: `marcas` diz o status por posição do item na
 * lista da praça (undefined = a fazer, sem linha).
 */
function baixasDaPraca(
  snap: EstadoComandas | null,
  eventId: string,
  offset: number,
  estacao: EstacaoProducao,
  marcas: (ProducaoStatus | undefined)[],
  quem: string,
  /** quando a praça marcou: dia relativo a hoje + hora do primeiro item */
  marcadoEm: [number, string]
): Linha[] {
  const d = snap?.dias.find((x) => x.diaISO === dia(offset))
  if (!d) return []
  const { itens } = itensDaSecao(d.secoes[estacao] ?? [])
  const [diaMarca, horaInicial] = marcadoEm
  const [h0, m0] = horaInicial.split(':').map(Number)
  const out: Linha[] = []
  itens.forEach((it, i) => {
    const status = marcas[i]
    if (!status || status === 'a_fazer') return
    const min = h0 * 60 + m0 + i * 12
    const hora = `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
    out.push({
      id: `pi-${eventId}-${offset}-${estacao}-${i}`,
      event_id: eventId,
      dia: dia(offset),
      estacao,
      chave: it.chave,
      rotulo: `${it.qtd} ${it.texto}`,
      status,
      atualizado_por: quem,
      atualizado_em: local(diaMarca, hora),
    })
  })
  return out
}

const P: ProducaoStatus = 'pronto'
const F: ProducaoStatus = 'produzindo'

function producaoItens(base: Tabelas): Linha[] {
  const ia = comanda(base, E.ia)
  const aurora = comanda(base, E.aurora)
  return [
    // hoje — tudo foi feito na madrugada, antes do carro das 05h
    // confeitaria (9 itens): 8 prontos, o 8º (bebezinho banana) esquecido em "produzindo"
    ...baixasDaPraca(ia, E.ia, 0, 'confeitaria', [P, P, P, P, P, P, P, F, P], U.producao, [0, '02:10']),
    // fria (4 mini lanches): 2 prontos, 2 produzindo
    ...baixasDaPraca(ia, E.ia, 0, 'fria', [P, P, F, F], U.compras, [0, '03:00']),
    // amanhã — a confeitaria começou ontem à tarde (petit four aguenta)
    ...baixasDaPraca(ia, E.ia, 1, 'confeitaria', [P, P, P, F, F], U.producao, [-1, '14:30']),
    // Convenção Aurora (daqui 3 dias): filé em preparo, verrine em produção, petit four pronto
    ...baixasDaPraca(aurora, E.aurora, 3, 'quente', [F], U.producao, [-1, '09:00']),
    ...baixasDaPraca(aurora, E.aurora, 3, 'confeitaria', [F, P], U.producao, [-1, '10:00']),
  ]
}

/** Convenção Aurora: estrutura começando a ser separada, nada de comida ainda. */
function checksAurora(base: Tabelas): Linha[] {
  const conf = conferenciaDoDia(comanda(base, E.aurora), dia(3))
  if (!conf) return []
  return conf.estrutura.slice(0, 6).map((l, i) => ({
    id: `xc-au-${i}`,
    event_id: E.aurora,
    dia: dia(3),
    setor: l.setor,
    chave: l.chave,
    conferido_por: U.logistica,
    conferido_em: local(-1, `16:${String(10 + i * 3).padStart(2, '0')}`),
    obs: null,
  }))
}

function expedicaoChecks(base: Tabelas): Linha[] {
  const conf = conferenciaDoDia(comanda(base, E.ia), dia(0))
  if (!conf) return []
  // bebidas: faltam o suco de caju e o chá mate
  const falta = (l: { texto: string }) => /suco pieggi de caju|chá mate/i.test(l.texto)
  const linhas = [
    ...conf.comidas.map((l) => ({ l, quem: U.producao, base: '04:00' })),
    ...conf.estrutura.map((l) => ({ l, quem: U.logistica, base: '04:05' })),
    ...conf.bebidas.filter((l) => !falta(l)).map((l) => ({ l, quem: U.producao, base: '04:20' })),
  ]
  return linhas.map(({ l, quem, base: hora }, i) => {
    const [h, m] = hora.split(':').map(Number)
    const min = h * 60 + m + Math.floor(i / 3)
    return {
      id: `xc-${i}`,
      event_id: E.ia,
      dia: dia(0),
      setor: l.setor,
      chave: l.chave,
      conferido_por: quem,
      conferido_em: local(0, `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`),
      obs: /^Leite/.test(l.texto) ? 'Faltou 1 caixa de leite — reposta do estoque seco.' : null,
    }
  })
}

export const operacao: AreaCenario = {
  tabelas: (base) => ({
    producao_itens: producaoItens(base),
    expedicao_checks: [...expedicaoChecks(base), ...checksAurora(base)],
  }),
  padroes: {
    producao_itens: { status: 'produzindo', rotulo: '' },
    expedicao_checks: { obs: null },
  },
  roteiro: [
    {
      rota: '/producao/:estacao',
      titulo: 'TV da praça (confeitaria · fria · quente)',
      cenario:
        'Hoje o IA para Negócios já saiu às 05h02 — e a TV acusa o que ficou sem baixa: 1 bebezinho na confeitaria e 2 mini lanches na fria. A cozinha quente não tem nada hoje (coffee da StartSe não leva quente). Amanhã a confeitaria já começou; a Convenção Aurora (' +
          formatDiaMes(dia(3)) +
          ') tem filé e verrine em produção, com a saída tirada da comanda porque ninguém programou a rota — e uma linha âmbar lembra as compras do evento que ainda não chegaram.',
      testar: [
        'Na Confeitaria, clicar "Amanhã" e tocar num item "A fazer" duas vezes (produzindo → pronto); "↶ voltar" desfaz',
        'Ligar o 📺 Modo TV: tela cheia, letra grande, contagem regressiva para a saída',
        'Escolher ' + formatDiaMes(dia(3)) + ' (Convenção Aurora) na Cozinha quente: filé "produzindo" e a linha âmbar "Compras ainda não recebidas"',
      ],
      papel: 'producao',
    },
    {
      rota: '/expedicao',
      titulo: 'Checklist da expedição',
      cenario:
        'IA para Negócios hoje: o carro saiu às 05:02 com COMIDAS e ESTRUTURA conferidas, mas BEBIDAS sem o suco de caju e o chá mate — a faixa âmbar diz isso e pede para confirmar com o motorista. O bebezinho de banana está conferido, mas amarelo: a praça não deu baixa nele. A Convenção Aurora (' +
          formatDiaMes(dia(3)) +
          ') ainda vai sair: estrutura começando, coxinha da Letícia e tábua da Leal em COMIDAS como "Fornecedor (Adriana)", e os pedidos de compra que ainda não chegaram.',
      testar: [
        'Ticar as 2 bebidas que faltam: a faixa vira verde "SAIU ÀS 05:02 COM TUDO CONFERIDO"',
        'Escolher ' + formatDiaMes(dia(3)) + ' no calendário: faixa "Compras deste evento ainda não recebidas" (pedido 3 bebidas, pedido 4 Letícia…) e as encomendas de fornecedor em COMIDAS',
        'Clicar "Amanhã": a estrutura não aparece de novo (saiu toda no 1º dia), só o arranjo de flores do dia',
        'No setor Estrutura, seguir "Conferir quantidades" para a aba Material do evento',
      ],
      papel: 'producao',
    },
  ],
}
