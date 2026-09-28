// ============================================================
// NOTAS FISCAIS — fila do financeiro
//
// Todo evento com contrato assinado cai aqui para faturar. Duas regras
// da casa moldam a tela:
//
//   1. Uma nota pode SOMAR vários eventos — daí a seleção múltipla.
//      Mas nunca eventos de clientes diferentes: nota fiscal tem um
//      destinatário só, e misturar seria nota errada.
//   2. A única pergunta do financeiro é quanto vai em PRODUTO e quanto
//      em SERVIÇO. O resto (impostos, alíquotas) vem do cadastro.
//
// A emissão é transmitida pela Edge Function `nota-fiscal` (PlugNotas),
// que começa em homologação — nada fiscal de verdade sai até virar a
// chave em Administração → Fiscal.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Textarea, Th } from '@/components/ui'
import {
  ETAPA_FECHADO,
  INVOICE_STATUS_LABEL,
  nomeCliente,
  type Invoice,
  type PieggiEvent,
} from '@/types'
import { formatBRL, formatDiaMes } from '@/engine'

type EventoFaturavel = PieggiEvent & {
  clients: { id: string; nome: string; doc?: string | null } | null
  primeiraData: string | null
  /** já está dentro de alguma nota? */
  faturado: boolean
}

const TOM: Record<Invoice['status'], 'neutral' | 'amber' | 'green' | 'red'> = {
  rascunho: 'neutral',
  transmitindo: 'amber',
  emitida: 'green',
  erro: 'red',
  cancelada: 'neutral',
}

export default function Notas() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { emitirNota } = usePermissoes()

  const [selecionados, setSelecionados] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [form, setForm] = useState<{
    valor_produto: string
    valor_servico: string
    competencia: string
    observacoes: string
    parcelas: string
    primeiro_vencimento: string
  } | null>(null)

  // ---------- eventos fechados e o que já foi faturado ----------
  const { data: eventos } = useQuery({
    queryKey: ['eventos-faturaveis'],
    queryFn: async (): Promise<EventoFaturavel[]> => {
      const [evRes, servRes, faturadosRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, clients(id, nome)')
          .eq('pipeline', ETAPA_FECHADO)
          .neq('status', 'cancelado'),
        supabase.from('event_services').select('event_id, dia'),
        supabase.from('invoice_events').select('event_id'),
      ])
      if (evRes.error) throw evRes.error
      const servicos = (servRes.data ?? []) as { event_id: string; dia: string }[]
      const jaFaturados = new Set(
        ((faturadosRes.data ?? []) as { event_id: string }[]).map((f) => f.event_id)
      )
      return (
        evRes.data as (PieggiEvent & { clients: { id: string; nome: string } | null })[]
      ).map((e) => {
        const dias = servicos.filter((s) => s.event_id === e.id).map((s) => s.dia).sort()
        return {
          ...e,
          primeiraData: dias[0] ?? null,
          faturado: jaFaturados.has(e.id),
        }
      })
    },
  })

  const { data: notas } = useQuery({
    queryKey: ['notas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, invoice_events(event_id, valor_produto, valor_servico)')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return data as (Invoice & {
        invoice_events: { event_id: string; valor_produto: number; valor_servico: number }[]
      })[]
    },
  })

  const aFaturar = useMemo(
    () =>
      (eventos ?? [])
        .filter((e) => !e.faturado)
        .sort((a, b) => (a.primeiraData ?? '').localeCompare(b.primeiraData ?? '')),
    [eventos]
  )

  const escolhidos = useMemo(
    () => (eventos ?? []).filter((e) => selecionados.includes(e.id)),
    [eventos, selecionados]
  )

  const totalEscolhido = escolhidos.reduce((s, e) => s + Number(e.orcamento_valor ?? 0), 0)

  // Nota fiscal tem UM destinatário. Cliente avulso (sem cadastro) entra
  // pelo nome, então a comparação é pelo nome exibido.
  const clientesDistintos = new Set(escolhidos.map((e) => nomeCliente(e)))
  const misturaClientes = clientesDistintos.size > 1

  function abrirForm() {
    setMsg(null)
    if (misturaClientes) {
      setMsg('🛑 Uma nota tem um destinatário só. Selecione eventos do mesmo cliente.')
      return
    }
    setForm({
      // catering é serviço: o padrão é 100% serviço, e o financeiro move
      // para produto o que precisar
      valor_produto: '0',
      valor_servico: String(totalEscolhido.toFixed(2)),
      competencia: new Date().toISOString().slice(0, 10),
      observacoes: '',
      parcelas: '1',
      primeiro_vencimento: '',
    })
  }

  async function criarNota() {
    if (!form || !escolhidos.length) return
    const produto = Number(form.valor_produto || 0)
    const servico = Number(form.valor_servico || 0)
    const soma = produto + servico
    if (soma <= 0) {
      setMsg('🛑 Informe o valor da nota (produto, serviço, ou os dois).')
      return
    }

    setOcupado(true)
    setMsg(null)
    try {
      const primeiro = escolhidos[0]
      const tipo = produto > 0 && servico > 0 ? 'mista' : produto > 0 ? 'produto' : 'servico'

      const { data: nota, error } = await supabase
        .from('invoices')
        .insert({
          client_id: primeiro.clients?.id ?? null,
          destinatario_nome: nomeCliente(primeiro),
          destinatario_email: primeiro.contato_email ?? null,
          destinatario_endereco: primeiro.endereco ?? null,
          tipo,
          valor_produto: produto,
          valor_servico: servico,
          competencia: form.competencia || null,
          observacoes: form.observacoes || null,
          created_by: session?.user.id,
        })
        .select('id')
        .single()
      if (error) throw error

      // Rateio: cada evento entra na proporção do seu valor — sem isso a
      // nota fecharia certo e o relatório por evento mentiria. O ÚLTIMO
      // evento absorve a sobra do arredondamento, para a soma das partes
      // bater exatamente com a nota (centavo perdido em rateio é o tipo de
      // erro que só aparece na conciliação, meses depois).
      const base = escolhidos.reduce((s, e) => s + Number(e.orcamento_valor ?? 0), 0)
      const pesos = escolhidos.map((e) =>
        base > 0 ? Number(e.orcamento_valor ?? 0) / base : 1 / escolhidos.length
      )
      const ratear = (total: number): number[] => {
        const partes = pesos.map((p) => Number((total * p).toFixed(2)))
        const soma = partes.reduce((s, v) => s + v, 0)
        partes[partes.length - 1] = Number(
          (partes[partes.length - 1] + (total - soma)).toFixed(2)
        )
        return partes
      }
      const porProduto = ratear(produto)
      const porServico = ratear(servico)

      const rVinc = await supabase.from('invoice_events').insert(
        escolhidos.map((e, i) => ({
          invoice_id: nota.id,
          event_id: e.id,
          valor_produto: porProduto[i],
          valor_servico: porServico[i],
        }))
      )
      if (rVinc.error) throw rVinc.error

      // ---------- títulos a receber ----------
      const nParcelas = Math.max(1, Number(form.parcelas || 1))
      if (form.primeiro_vencimento) {
        const valorParcela = Number((soma / nParcelas).toFixed(2))
        const titulos = Array.from({ length: nParcelas }, (_, i) => {
          const venc = new Date(form.primeiro_vencimento + 'T12:00')
          venc.setMonth(venc.getMonth() + i)
          // a última parcela absorve a diferença do arredondamento
          const valor =
            i === nParcelas - 1
              ? Number((soma - valorParcela * (nParcelas - 1)).toFixed(2))
              : valorParcela
          return {
            invoice_id: nota.id,
            event_id: escolhidos.length === 1 ? escolhidos[0].id : null,
            client_id: primeiro.clients?.id ?? null,
            descricao: `${nomeCliente(primeiro)} — ${
              escolhidos.length === 1 ? primeiro.nome : `${escolhidos.length} eventos`
            }`,
            parcela: i + 1,
            parcelas: nParcelas,
            valor,
            vencimento: venc.toISOString().slice(0, 10),
            created_by: session?.user.id,
          }
        })
        const rTit = await supabase.from('receivables').insert(titulos)
        if (rTit.error) throw rTit.error
      }

      setForm(null)
      setSelecionados([])
      setMsg(
        `✅ Nota criada com ${escolhidos.length} evento(s)${
          form.primeiro_vencimento ? ` e ${nParcelas} título(s) a receber` : ''
        }. Confira e transmita.`
      )
      await qc.invalidateQueries({ queryKey: ['notas'] })
      await qc.invalidateQueries({ queryKey: ['eventos-faturaveis'] })
      await qc.invalidateQueries({ queryKey: ['receber'] })
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao criar a nota'}`)
    } finally {
      setOcupado(false)
    }
  }

  async function chamarFiscal(nota: Invoice, acao: 'emitir' | 'consultar') {
    setOcupado(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('nota-fiscal', {
        body: { invoice_id: nota.id, acao },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      setMsg(`✅ ${data.mensagem ?? 'Nota transmitida.'}`)
      await qc.invalidateQueries({ queryKey: ['notas'] })
    } catch (e) {
      const m = e instanceof Error ? e.message : 'erro'
      setMsg(
        m.includes('Failed to send a request')
          ? '🛑 A Edge Function "nota-fiscal" ainda não foi publicada (ver supabase/README.md).'
          : `🛑 ${m}`
      )
    } finally {
      setOcupado(false)
    }
  }

  const nomeEvento = (eid: string) => (eventos ?? []).find((e) => e.id === eid)?.nome ?? eid

  return (
    <div>
      <PageTitle lead="FINANCEIRO">Notas fiscais</PageTitle>

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {/* ---------- 1. eventos a faturar ---------- */}
      <Card
        title={`1 · Eventos com contrato assinado a faturar (${aFaturar.length})`}
        className="mb-6"
        actions={
          selecionados.length > 0 && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">
                {selecionados.length} selecionado(s) · {formatBRL(totalEscolhido)}
              </span>
              <Button onClick={abrirForm} disabled={ocupado || !emitirNota}>
                Criar nota
              </Button>
            </div>
          )
        }
      >
        {!aFaturar.length ? (
          <EmptyState>
            Nada a faturar. Eventos aparecem aqui quando o contrato é assinado.
          </EmptyState>
        ) : (
          <>
            {misturaClientes && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                Você selecionou eventos de clientes diferentes. Uma nota tem um destinatário só.
              </p>
            )}
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th></Th>
                  <Th>Cliente</Th>
                  <Th>Evento</Th>
                  <Th>Data</Th>
                  <Th>Valor</Th>
                </tr>
              </thead>
              <tbody>
                {aFaturar.map((e) => (
                  <tr key={e.id} className="hover:bg-[var(--pg-bg)]">
                    <Td>
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selecionados.includes(e.id)}
                        onChange={(ev) =>
                          setSelecionados(
                            ev.target.checked
                              ? [...selecionados, e.id]
                              : selecionados.filter((x) => x !== e.id)
                          )
                        }
                      />
                    </Td>
                    <Td>{nomeCliente(e)}</Td>
                    <Td>
                      <Link to={`/eventos/${e.id}`} className="hover:underline">
                        {e.nome}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap font-mono text-xs">
                      {e.primeiraData ? formatDiaMes(e.primeiraData) : '—'}
                    </Td>
                    <Td>
                      {e.orcamento_valor ? (
                        formatBRL(Number(e.orcamento_valor))
                      ) : (
                        <span className="text-amber-700">sem valor</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>

      {/* ---------- 2. formulário da nota ---------- */}
      {form && (
        <Card title={`2 · Nova nota — ${escolhidos.length} evento(s), ${formatBRL(totalEscolhido)}`} className="mb-6">
          <p className="mb-4 text-sm text-neutral-600">
            Destinatário: <b>{nomeCliente(escolhidos[0])}</b>. A única decisão aqui é o split
            entre produto e serviço.
          </p>

          <div className="mb-3 flex flex-wrap gap-2">
            {(
              [
                ['Tudo serviço', '0', totalEscolhido],
                ['Tudo produto', totalEscolhido, '0'],
                ['Meio a meio', totalEscolhido / 2, totalEscolhido / 2],
              ] as const
            ).map(([rotulo, p, s]) => (
              <Button
                key={rotulo}
                variant="secondary"
                className="!px-3 !py-1.5"
                onClick={() =>
                  setForm({
                    ...form,
                    valor_produto: Number(p).toFixed(2),
                    valor_servico: Number(s).toFixed(2),
                  })
                }
              >
                {rotulo}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              label="Valor em PRODUTO (R$)"
              type="number"
              step="0.01"
              value={form.valor_produto}
              onChange={(e) => setForm({ ...form, valor_produto: e.target.value })}
            />
            <Input
              label="Valor em SERVIÇO (R$)"
              type="number"
              step="0.01"
              value={form.valor_servico}
              onChange={(e) => setForm({ ...form, valor_servico: e.target.value })}
            />
            <Input
              label="Competência"
              type="date"
              value={form.competencia}
              onChange={(e) => setForm({ ...form, competencia: e.target.value })}
            />
            <Input
              label="1º vencimento (opcional)"
              type="date"
              value={form.primeiro_vencimento}
              onChange={(e) => setForm({ ...form, primeiro_vencimento: e.target.value })}
            />
            <Select
              label="Parcelas"
              value={form.parcelas}
              onChange={(e) => setForm({ ...form, parcelas: e.target.value })}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </Select>
            <div className="md:col-span-3">
              <Textarea
                label="Observações da nota"
                rows={2}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
          </div>

          {(() => {
            const soma = Number(form.valor_produto || 0) + Number(form.valor_servico || 0)
            const difere = Math.abs(soma - totalEscolhido) > 0.01
            return (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <span className="text-sm">
                  Total da nota: <b>{formatBRL(soma)}</b>
                </span>
                {difere && (
                  <span className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                    ⚠️ Diferente da soma dos eventos ({formatBRL(totalEscolhido)}) — pode ser
                    proposital (desconto, adiantamento), mas confira.
                  </span>
                )}
              </div>
            )
          })()}

          <div className="mt-4 flex gap-3">
            <Button onClick={criarNota} disabled={ocupado}>
              {ocupado ? 'Criando…' : 'Criar nota'}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </div>
          {!form.primeiro_vencimento && (
            <p className="mt-2 text-xs text-neutral-400">
              Sem 1º vencimento não são criados títulos — dá para lançar depois em Contas a receber.
            </p>
          )}
        </Card>
      )}

      {/* ---------- 3. notas ---------- */}
      <Card title={`3 · Notas (${notas?.length ?? 0})`}>
        {!notas?.length ? (
          <EmptyState>Nenhuma nota criada ainda.</EmptyState>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Destinatário</Th>
                <Th>Eventos</Th>
                <Th>Produto</Th>
                <Th>Serviço</Th>
                <Th>Total</Th>
                <Th>Situação</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {notas.map((n) => (
                <tr key={n.id} className="hover:bg-[var(--pg-bg)]">
                  <Td>
                    <div className="font-medium">{n.destinatario_nome}</div>
                    {n.numero && (
                      <div className="pg-key !normal-case">
                        nº {n.numero}
                        {n.serie ? ` · série ${n.serie}` : ''}
                      </div>
                    )}
                  </Td>
                  <Td className="text-xs text-neutral-500">
                    {n.invoice_events?.map((v) => nomeEvento(v.event_id)).join(' · ') || '—'}
                  </Td>
                  <Td>{Number(n.valor_produto) > 0 ? formatBRL(Number(n.valor_produto)) : '—'}</Td>
                  <Td>{Number(n.valor_servico) > 0 ? formatBRL(Number(n.valor_servico)) : '—'}</Td>
                  <Td className="font-semibold">{formatBRL(Number(n.valor_total))}</Td>
                  <Td>
                    <Badge tone={TOM[n.status]}>{INVOICE_STATUS_LABEL[n.status]}</Badge>
                    {n.erro_msg && (
                      <div className="mt-1 max-w-xs text-xs text-red-700">{n.erro_msg}</div>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {n.pdf_url && (
                      <a
                        href={n.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-xs underline"
                      >
                        PDF
                      </a>
                    )}
                    {n.xml_url && (
                      <a
                        href={n.xml_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-3 text-xs underline"
                      >
                        XML
                      </a>
                    )}
                    {emitirNota && (n.status === 'rascunho' || n.status === 'erro') && (
                      <Button
                        variant="secondary"
                        className="!px-3 !py-1.5"
                        onClick={() => chamarFiscal(n, 'emitir')}
                        disabled={ocupado}
                      >
                        Transmitir
                      </Button>
                    )}
                    {/* o PlugNotas processa assíncrono: número e PDF chegam
                        depois, então a nota transmitida precisa ser consultada */}
                    {emitirNota && n.status === 'transmitindo' && (
                      <Button
                        variant="secondary"
                        className="!px-3 !py-1.5"
                        onClick={() => chamarFiscal(n, 'consultar')}
                        disabled={ocupado}
                      >
                        Consultar situação
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p className="mt-4 text-xs text-neutral-400">
        Os impostos e a classificação produto × serviço de cada item vêm de{' '}
        <Link to="/admin/fiscal" className="underline">
          Administração → Fiscal
        </Link>
        . Enquanto o ambiente do PlugNotas estiver em <b>homologação</b>, nenhuma nota tem
        validade fiscal.
      </p>
    </div>
  )
}
