// ============================================================
// OPÇÕES DA PROPOSTA (A / B / C)
// Como nas propostas reais da casa: "Opção 1 · Coffee Break Basic",
// "Opção 2 · Standard", "Opção 3 · Master" — o cliente escolhe uma.
// Cada opção tem sua linha (tier), seu preço, seu cardápio e seu
// slide. Com opções, o Total Geral sai "R$ a definir".
// ============================================================

import { Badge, Button, Card, Input, Select } from '@/components/ui'
import {
  SERVICE_LINE_LABEL,
  SERVICE_TYPE_LABEL,
  paxDoServico,
  type CatalogItem,
  type EventService,
  type PriceItem,
  type ServiceLine,
} from '@/types'
import { calcPreco, fecharOrcamento, formatBRL, round2 } from '@/engine'
import { montarTudo, type CardapioPorServico } from './CardapioAuto'

export interface OpcaoProposta {
  id: string
  nome: string
  linha: ServiceLine
  /** preço/pax por serviço; vazio = usa a tabela */
  precos: Record<string, number>
  cardapios: CardapioPorServico
}

/** Como o orçamento apresenta os pacotes ao cliente. */
export type FormatoOrcamento = 'simples' | 'opcoes' | 'comparativo'

export const FORMATO_LABEL: Record<FormatoOrcamento, string> = {
  simples: 'Composição única',
  opcoes: 'Opções em linhas (o cliente escolhe uma)',
  comparativo: 'Comparativo em colunas (pacotes lado a lado)',
}

const LINHAS: ServiceLine[] = ['basic', 'standard', 'executive', 'master', 'premium']

export function novaOpcao(n: number, linha: ServiceLine): OpcaoProposta {
  return {
    id: `op-${Date.now()}-${n}`,
    nome: `Opção ${n} · ${SERVICE_LINE_LABEL[linha]}`,
    linha,
    precos: {},
    cardapios: {},
  }
}

/** Preço/pax de um serviço dentro de uma opção (preço manual > tabela da linha). */
export function precoDaOpcao(
  op: OpcaoProposta,
  servico: EventService,
  precos: PriceItem[]
): number | null {
  const manual = op.precos[servico.id]
  if (manual != null) return manual
  const item = precos.find(
    (p) => p.service_type === servico.service_type && p.service_line === op.linha
  )
  return item ? Number(item.preco_pax) : null
}

/** Total de uma opção, já com logística e taxa de serviço. */
export function totalDaOpcao(
  op: OpcaoProposta,
  servicos: EventService[],
  precos: PriceItem[],
  paxEvento: number,
  isentoLogistica: boolean,
  isentoTaxa: boolean
): number {
  const subtotal = round2(
    servicos.reduce((soma, s) => {
      const p = precoDaOpcao(op, s, precos)
      if (p == null) return soma
      return (
        soma +
        calcPreco({
          precoPax: p,
          pax: paxDoServico(s, paxEvento),
          reposicaoPct: Number(s.reposicao_pct),
        }).comReposicao
      )
    }, 0)
  )
  return fecharOrcamento({ subtotalServicos: subtotal, isentoLogistica, isentoTaxa }).total
}

export default function OpcoesProposta({
  opcoes,
  formato,
  servicos,
  precos,
  catalogo,
  paxEvento,
  isentoLogistica,
  isentoTaxa,
  editavel,
  onChange,
  onFormato,
}: {
  opcoes: OpcaoProposta[]
  formato: FormatoOrcamento
  servicos: EventService[]
  precos: PriceItem[]
  catalogo: CatalogItem[]
  paxEvento: number
  isentoLogistica: boolean
  isentoTaxa: boolean
  editavel: boolean
  onChange: (o: OpcaoProposta[]) => void
  onFormato: (f: FormatoOrcamento) => void
}) {
  function adicionar() {
    const usadas = new Set(opcoes.map((o) => o.linha))
    const proxima = LINHAS.find((l) => !usadas.has(l)) ?? 'executive'
    onChange([...opcoes, novaOpcao(opcoes.length + 1, proxima)])
    if (formato === 'simples') onFormato('opcoes')
  }

  function atualizar(id: string, campos: Partial<OpcaoProposta>) {
    onChange(opcoes.map((o) => (o.id === id ? { ...o, ...campos } : o)))
  }

  function trocarLinha(op: OpcaoProposta, linha: ServiceLine) {
    atualizar(op.id, {
      linha,
      nome: /^Opção \d+ · /.test(op.nome)
        ? op.nome.replace(/· .*$/, `· ${SERVICE_LINE_LABEL[linha]}`)
        : op.nome,
      precos: {},
      cardapios: {},
    })
  }

  function montarCardapio(op: OpcaoProposta) {
    // aplica a linha da opção a todos os serviços antes de compor
    const servicosDaOpcao = servicos.map((s) => ({ ...s, service_line: op.linha }))
    const r = montarTudo(servicosDaOpcao, catalogo, paxEvento, opcoes.indexOf(op) + 1)
    atualizar(op.id, { cardapios: r.cardapios })
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          🅰️ Opções da proposta
          {opcoes.length > 0 && <Badge tone="blue">{opcoes.length} opções</Badge>}
        </span>
      }
      actions={
        editavel && (
          <div className="flex gap-2">
            {opcoes.length > 0 && (
              <Button variant="ghost" onClick={() => onChange([])}>
                Remover todas
              </Button>
            )}
            <Button variant="secondary" onClick={adicionar} disabled={opcoes.length >= 5}>
              + Opção
            </Button>
          </div>
        )
      }
    >
      {!opcoes.length ? (
        <p className="text-sm text-neutral-500">
          Proposta com <b>uma composição só</b>. Use opções quando quiser oferecer pacotes
          comparativos — &quot;Opção 1 · Basic&quot;, &quot;Opção 2 · Standard&quot;,
          &quot;Opção 3 · Master&quot; — e deixar o cliente escolher. Nesse caso o orçamento
          lista uma linha por opção e o Total Geral sai <b>&quot;R$ a definir&quot;</b>.
        </p>
      ) : (
        <div className="space-y-4">
          {opcoes.map((op, i) => {
            const total = totalDaOpcao(
              op,
              servicos,
              precos,
              paxEvento,
              isentoLogistica,
              isentoTaxa
            )
            const semPreco = servicos.filter((s) => precoDaOpcao(op, s, precos) == null)
            const itensCardapio = Object.values(op.cardapios).reduce(
              (n, l) => n + (l?.length ?? 0),
              0
            )
            return (
              <div key={op.id} className="rounded-lg border border-neutral-200 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    label={`Opção ${i + 1}`}
                    className="!w-72"
                    value={op.nome}
                    disabled={!editavel}
                    onChange={(e) => atualizar(op.id, { nome: e.target.value })}
                  />
                  <Select
                    label="Linha"
                    className="!w-40"
                    value={op.linha}
                    disabled={!editavel}
                    onChange={(e) => trocarLinha(op, e.target.value as ServiceLine)}
                  >
                    {LINHAS.map((l) => (
                      <option key={l} value={l}>
                        {SERVICE_LINE_LABEL[l]}
                      </option>
                    ))}
                  </Select>
                  <div className="pb-2">
                    <div className="text-xs uppercase tracking-wide text-neutral-500">Total</div>
                    <div className="text-lg font-bold">{formatBRL(total)}</div>
                  </div>
                  <div className="ml-auto flex gap-2 pb-1">
                    {editavel && (
                      <>
                        <Button variant="secondary" onClick={() => montarCardapio(op)}>
                          {itensCardapio ? '↻ Refazer cardápio' : '✨ Montar cardápio'}
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => onChange(opcoes.filter((o) => o.id !== op.id))}
                        >
                          ✕
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  {itensCardapio > 0 ? (
                    <Badge tone="green">cardápio com {itensCardapio} itens</Badge>
                  ) : (
                    <Badge tone="amber">sem cardápio montado</Badge>
                  )}
                  {semPreco.length > 0 && (
                    <Badge tone="red">
                      {semPreco.length} serviço(s) sem preço em {SERVICE_LINE_LABEL[op.linha]}
                    </Badge>
                  )}
                </div>

                {/* preço por serviço nesta opção */}
                {editavel && (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {servicos.map((s) => {
                      const p = precoDaOpcao(op, s, precos)
                      return (
                        <label key={s.id} className="text-xs">
                          <span className="block text-neutral-500">
                            {SERVICE_TYPE_LABEL[s.service_type]}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            className={`w-24 rounded border px-1.5 py-1 ${
                              p == null ? 'border-red-300 bg-red-50' : 'border-neutral-200'
                            }`}
                            placeholder="R$/pax"
                            value={op.precos[s.id] ?? p ?? ''}
                            onChange={(e) =>
                              atualizar(op.id, {
                                precos: { ...op.precos, [s.id]: Number(e.target.value) || 0 },
                              })
                            }
                          />
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          <div className="rounded-lg bg-neutral-50 p-3">
            <Select
              label="Como o orçamento apresenta os pacotes"
              className="!w-96"
              value={formato}
              disabled={!editavel}
              onChange={(e) => onFormato(e.target.value as FormatoOrcamento)}
            >
              <option value="opcoes">{FORMATO_LABEL.opcoes}</option>
              <option value="comparativo">{FORMATO_LABEL.comparativo}</option>
            </Select>
            <p className="mt-2 text-xs text-neutral-500">
              {formato === 'comparativo' ? (
                <>
                  Comparativo usa um <b>slide de orçamento com uma coluna por pacote</b>
                  (Descritivo · PAX · {opcoes.map((o) => o.linha).join(' · ')}). Configure o
                  número desse slide em <b>Admin → Parâmetros → template_proposta →
                  orcamento_comparativo</b>. Sem ele, a proposta sai no formato de linhas.
                </>
              ) : (
                <>
                  Uma linha por opção + a observação &quot;A contratante escolhe um dos pacotes
                  acima&quot;. Cada opção ganha seu slide de cardápio e o Total Geral sai
                  &quot;R$ a definir&quot;.
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </Card>
  )
}
