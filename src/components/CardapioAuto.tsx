// ============================================================
// CARDÁPIO AUTOMÁTICO — o sistema escolhe, você confere
// Um clique monta o cardápio de todos os serviços aplicando as
// regras; "outra combinação" re-sorteia mantendo as regras; cada
// item pode ser trocado ou removido na mão. Quantidades já saem
// prontas para a proposta.
// ============================================================

import { useState } from 'react'
import { Button, Card } from '@/components/ui'
import {
  formatQtd,
  montarCardapio,
  type ItemCardapio,
} from '@/engine/cardapio'
import { formatDiaMes } from '@/engine'
import {
  PERIOD_LABEL,
  SERVICE_LINE_LABEL,
  SERVICE_TYPE_LABEL,
  paxDoServico,
  type CatalogItem,
  type EventService,
} from '@/types'

export interface CardapioPorServico {
  [serviceId: string]: ItemCardapio[]
}

export function montarTudo(
  servicos: EventService[],
  catalogo: CatalogItem[],
  paxEvento: number,
  semente = 1
): { cardapios: CardapioPorServico; avisos: string[] } {
  const cardapios: CardapioPorServico = {}
  const avisos: string[] = []
  // bases de sabor são acumuladas POR DIA (nunca repetir manhã × tarde)
  const basesPorDia: Record<string, Set<string>> = {}

  for (const s of [...servicos].sort((a, b) => (a.dia + (a.hora_inicio ?? '')).localeCompare(b.dia + (b.hora_inicio ?? '')))) {
    const usadas = (basesPorDia[s.dia] ??= new Set())
    const r = montarCardapio({
      serviceType: s.service_type,
      serviceLine: s.service_line,
      periodo: s.periodo,
      pax: paxDoServico(s, paxEvento),
      reposicaoPct: Number(s.reposicao_pct),
      catalogo,
      basesUsadas: usadas,
      semente,
    })
    cardapios[s.id] = r.itens
    r.basesConsumidas.forEach((b) => usadas.add(b))
    r.avisos.forEach((a) =>
      avisos.push(`${SERVICE_TYPE_LABEL[s.service_type]} ${formatDiaMes(s.dia)}: ${a}`)
    )
  }
  return { cardapios, avisos }
}

export default function CardapioAuto({
  servicos,
  catalogo,
  paxEvento,
  cardapios,
  editavel,
  onChange,
}: {
  servicos: EventService[]
  catalogo: CatalogItem[]
  paxEvento: number
  cardapios: CardapioPorServico
  editavel: boolean
  onChange: (c: CardapioPorServico, avisos: string[]) => void
}) {
  const [semente, setSemente] = useState(1)
  const [avisos, setAvisos] = useState<string[]>([])

  function montar(novaSemente: number) {
    const r = montarTudo(servicos, catalogo, paxEvento, novaSemente)
    setSemente(novaSemente)
    setAvisos(r.avisos)
    onChange(r.cardapios, r.avisos)
  }

  function trocarItem(serviceId: string, idx: number, catalogItemId: string) {
    const novo = catalogo.find((c) => c.id === catalogItemId)
    if (!novo) return
    const lista = [...(cardapios[serviceId] ?? [])]
    lista[idx] = { ...lista[idx], catalogItemId: novo.id, nome: novo.nome, selo: novo.selo, categoria: novo.categoria }
    onChange({ ...cardapios, [serviceId]: lista }, avisos)
  }

  function removerItem(serviceId: string, idx: number) {
    const lista = (cardapios[serviceId] ?? []).filter((_, i) => i !== idx)
    onChange({ ...cardapios, [serviceId]: lista }, avisos)
  }

  const temCardapio = Object.values(cardapios).some((l) => l?.length)

  return (
    <Card
      title="👨‍🍳 Cardápio — montado pelo sistema"
      actions={
        editavel && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => montar(semente)}>
              {temCardapio ? '↻ Refazer' : '✨ Montar cardápio'}
            </Button>
            {temCardapio && (
              <Button variant="secondary" onClick={() => montar(semente + 1)}>
                🎲 Outra combinação
              </Button>
            )}
          </div>
        )
      }
    >
      {!temCardapio ? (
        <div className="rounded-lg bg-neutral-50 p-6 text-center">
          <p className="mb-1 text-sm text-neutral-600">
            Clique em <b>✨ Montar cardápio</b> — o sistema escolhe os itens de cada serviço.
          </p>
          <p className="text-xs text-neutral-400">
            Aplica contraponto (1 vegetariano + 1 não-vegetariano), manhã leve/salgado ×
            tarde forte/doce, nunca repete a base do sabor no mesmo dia, respeita a linha
            contratada e o escalonamento por pax. Você confere e troca o que quiser.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {servicos.map((s) => {
            const itens = cardapios[s.id] ?? []
            if (!itens.length) return null
            const pax = paxDoServico(s, paxEvento)
            return (
              <div key={s.id} className="rounded-lg border border-neutral-200">
                <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-2">
                  <span className="text-sm font-semibold">
                    {SERVICE_TYPE_LABEL[s.service_type]}
                    {s.service_line ? ` ${SERVICE_LINE_LABEL[s.service_line]}` : ''} —{' '}
                    {formatDiaMes(s.dia)}
                    {s.periodo ? ` · ${PERIOD_LABEL[s.periodo]}` : ''}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {pax} pax
                    {Number(s.reposicao_pct) > 0 && ` · +${Number(s.reposicao_pct)}% reposição`}
                  </span>
                </div>
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {itens.map((i, idx) => {
                      const alternativas = catalogo.filter(
                        (c) =>
                          c.categoria === i.categoria &&
                          c.ativo &&
                          !c.proibido &&
                          c.id !== i.catalogItemId
                      )
                      return (
                        <tr key={idx} className="border-b border-neutral-50 last:border-0">
                          <td className="w-44 px-3 py-1.5 text-xs text-neutral-500">{i.papel}</td>
                          <td className="px-3 py-1.5">
                            {i.fixo || !editavel || !alternativas.length ? (
                              <span className={i.fixo ? 'text-neutral-600' : 'font-medium'}>
                                {i.nome}
                              </span>
                            ) : (
                              <select
                                className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-neutral-300 focus:border-neutral-900 focus:outline-none"
                                value={i.catalogItemId ?? ''}
                                onChange={(e) => trocarItem(s.id, idx, e.target.value)}
                              >
                                <option value={i.catalogItemId ?? ''}>{i.nome}</option>
                                {alternativas.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.nome}
                                  </option>
                                ))}
                              </select>
                            )}
                            {i.selo === 'vegetariano' && ' 🥬'}
                            {i.selo === 'vegano' && ' 🌱'}
                            {i.descricao && (
                              <div className="text-xs text-neutral-400">{i.descricao}</div>
                            )}
                          </td>
                          <td className="w-28 whitespace-nowrap px-3 py-1.5 text-right font-semibold">
                            {formatQtd(i.quantidade, i.unidade)}
                          </td>
                          <td className="w-40 px-3 py-1.5 text-right text-xs text-neutral-400">
                            {i.memoria}
                          </td>
                          <td className="w-8 px-1 text-center">
                            {editavel && !i.fixo && (
                              <button
                                className="text-neutral-300 hover:text-red-600"
                                onClick={() => removerItem(s.id, idx)}
                                title="Remover do cardápio"
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}

          {avisos.length > 0 && (
            <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3">
              {avisos.map((a, i) => (
                <p key={i} className="text-sm text-amber-800">
                  ⚠️ {a}
                </p>
              ))}
            </div>
          )}

          <p className="text-xs text-neutral-400">
            Itens em cinza são fixos da linha contratada (bebidas, pão de queijo, salada de frutas).
            Os demais podem ser trocados no seletor ou removidos.
          </p>
        </div>
      )}
    </Card>
  )
}
