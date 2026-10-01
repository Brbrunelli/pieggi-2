// ============================================================
// PEDIDO DE COMPRA — montar, mandar, confirmar, receber
//
//   rascunho  → monta à mão ou com os itens da Lista de compras
//   enviado   → a mensagem foi pro WhatsApp do fornecedor (wa.me — não
//               chama integração nenhuma)
//   confirmado→ o fornecedor topou: o BANCO gera as contas a pagar pela
//               condição (compra_confirmar). A partir daqui o valor não
//               muda mais na tela — quem ajusta é o financeiro, no título
//   recebido  → conferido item a item; divergência fica marcada
//   cancelado → se já tinha conta a pagar, as não pagas são canceladas
//
// Sem preço não confirma: conta a pagar com valor inventado é pior do
// que conta nenhuma.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, Input, Select, Td, Textarea, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import {
  CONDICOES,
  dataBR,
  divergencias,
  gerarParcelas,
  hojeISO,
  linkWhatsApp,
  pendenciasConfirmar,
  rotuloCondicao,
  textoPedido,
  totalItens,
} from '@/engine/financeiro'
import { useItensPedido } from './dados'
import Recebimento from './Recebimento'
import { StatusPedidoBadge } from './StatusPedidoBadge'
import {
  FORMA_PAGAMENTO_LABEL,
  type FormaEntrega,
  type FormaPagamento,
  type FornecedorCompra,
  type NovoPedidoDaLista,
  type PedidoResumo,
} from '@/tipos/compras'

interface ItemForm {
  key: string
  descricao: string
  quantidade: string
  unidade: string
  preco_unitario: string
  event_id: string
  quantidade_recebida: number | null
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

let seq = 0
const novaLinha = (p: Partial<ItemForm> = {}): ItemForm => ({
  key: `l${++seq}`,
  descricao: '',
  quantidade: '',
  unidade: 'un',
  preco_unitario: '',
  event_id: '',
  quantidade_recebida: null,
  ...p,
})

export default function PedidoDetalhe({
  pedido,
  daLista,
  fornecedores,
  eventos,
  onFechar,
  onSalvo,
}: {
  pedido: PedidoResumo | null
  daLista: NovoPedidoDaLista | null
  fornecedores: FornecedorCompra[]
  eventos: { id: string; nome: string; primeiroDia: string | null }[]
  onFechar: () => void
  onSalvo: (id: string, msg: string) => void
}) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { pedirCompra, verFinanceiro, ehLogistica } = usePermissoes()
  const podeReceber = pedirCompra || ehLogistica
  const { data: itensBanco } = useItensPedido(pedido?.id ?? null)

  const status = pedido?.status ?? 'rascunho'
  const editavel = pedirCompra && (status === 'rascunho' || status === 'enviado')

  const [cab, setCab] = useState(() => {
    const sug = daLista?.fornecedorChave ? fornecedores.find((f) => f.chave === daLista.fornecedorChave) : null
    return {
      fornecedor_id: pedido?.fornecedor_id ?? sug?.id ?? '',
      forma: (pedido?.forma ?? 'entrega') as FormaEntrega,
      data_prevista: pedido?.data_prevista ?? '',
      condicao_pagamento: pedido?.condicao_pagamento ?? sug?.condicao_pagamento ?? 'avista',
      forma_pagamento: (pedido?.forma_pagamento ?? sug?.forma_pagamento ?? '') as FormaPagamento | '',
      obs: pedido?.obs ?? (daLista ? `Gerado da lista de compras — ${daLista.origem}` : ''),
    }
  })
  const [linhas, setLinhas] = useState<ItemForm[]>(() =>
    daLista
      ? daLista.itens.map((i) =>
          novaLinha({ descricao: i.descricao, quantidade: String(i.quantidade), unidade: i.unidade, event_id: i.event_id ?? '' })
        )
      : pedido
        ? []
        : [novaLinha()]
  )
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [recebendo, setRecebendo] = useState(false)

  // itens do banco chegam depois do primeiro render
  useEffect(() => {
    if (pedido && itensBanco)
      setLinhas(
        itensBanco.map((i) =>
          novaLinha({
            descricao: i.descricao,
            quantidade: String(i.quantidade),
            unidade: i.unidade,
            preco_unitario: i.preco_unitario == null ? '' : String(i.preco_unitario),
            event_id: i.event_id ?? '',
            quantidade_recebida: i.quantidade_recebida,
          })
        )
      )
  }, [pedido?.id, itensBanco]) // eslint-disable-line react-hooks/exhaustive-deps

  const fornecedor = fornecedores.find((f) => f.id === cab.fornecedor_id) ?? null
  const itensValor = linhas
    .filter((l) => l.descricao.trim())
    .map((l) => ({
      descricao: l.descricao.trim(),
      quantidade: num(l.quantidade) ?? 0,
      unidade: l.unidade.trim() || 'un',
      preco_unitario: num(l.preco_unitario),
      event_id: l.event_id || null,
      quantidade_recebida: l.quantidade_recebida,
    }))
  const total = totalItens(itensValor)
  const pend = pendenciasConfirmar({ data_prevista: cab.data_prevista || null, itens: itensValor })
  const previa = useMemo(
    () => (total > 0 ? gerarParcelas(total, cab.condicao_pagamento, cab.data_prevista || hojeISO()) : []),
    [total, cab.condicao_pagamento, cab.data_prevista]
  )
  const difs = divergencias(itensValor)

  function escolherFornecedor(id: string) {
    const f = fornecedores.find((x) => x.id === id)
    setCab({
      ...cab,
      fornecedor_id: id,
      condicao_pagamento: f?.condicao_pagamento ?? cab.condicao_pagamento,
      forma_pagamento: f?.forma_pagamento ?? cab.forma_pagamento,
      forma: f && !f.endereco ? 'entrega' : cab.forma,
    })
  }

  /** o que impede salvar — síncrono, para o "mandar" checar antes de abrir o WhatsApp */
  function problemaParaSalvar(): string | null {
    if (!cab.fornecedor_id) return 'Escolha o fornecedor.'
    if (cab.forma === 'retirada' && !fornecedor?.endereco)
      return 'Este fornecedor não tem endereço — não dá para ser retirada. Complete o cadastro ou mude para entrega.'
    if (!itensValor.length) return 'O pedido precisa de ao menos um item.'
    return null
  }

  async function salvar(): Promise<string | null> {
    const problema = problemaParaSalvar()
    if (problema) {
      setMsg(problema)
      return null
    }
    const dados = {
      fornecedor_id: cab.fornecedor_id,
      forma: cab.forma,
      data_prevista: cab.data_prevista || null,
      condicao_pagamento: cab.condicao_pagamento,
      forma_pagamento: cab.forma_pagamento || null,
      obs: cab.obs.trim() || null,
      valor_total: total,
    }
    let id = pedido?.id ?? null
    if (id) {
      const r = await supabase.from('purchase_orders').update(dados).eq('id', id)
      if (r.error) {
        setMsg(r.error.message)
        return null
      }
      const d = await supabase.from('purchase_order_items').delete().eq('purchase_order_id', id)
      if (d.error) {
        setMsg(d.error.message)
        return null
      }
    } else {
      const r = await supabase
        .from('purchase_orders')
        .insert({ ...dados, criado_por: session?.user.id })
        .select()
        .single()
      if (r.error || !r.data) {
        setMsg(r.error?.message ?? 'Não consegui criar o pedido.')
        return null
      }
      id = (r.data as { id: string }).id
    }
    const ins = await supabase
      .from('purchase_order_items')
      .insert(itensValor.map((i, k) => ({ ...i, purchase_order_id: id, ordem: k + 1 })))
    if (ins.error) {
      setMsg(ins.error.message)
      return null
    }
    await qc.invalidateQueries({ queryKey: ['pedidos'] })
    await qc.invalidateQueries({ queryKey: ['pedido-itens', id] })
    return id
  }

  async function acao(fn: () => Promise<void>) {
    setOcupado(true)
    setMsg(null)
    try {
      await fn()
    } finally {
      setOcupado(false)
    }
  }

  const salvarRascunho = () =>
    acao(async () => {
      const id = await salvar()
      if (id) onSalvo(id, pedido ? 'Pedido salvo.' : 'Pedido criado em rascunho.')
    })

  const mandar = () => {
    // A janela do WhatsApp abre AQUI, no clique, antes de qualquer await:
    // depois de esperar o banco, o Safari do iPhone (e às vezes o Chrome)
    // já não considera gesto do usuário e bloqueia o pop-up — o pedido
    // ficaria "enviado" sem a mensagem ter saído. O texto só depende do
    // formulário; o número do pedido novo ainda não existe de todo jeito.
    if (editavel) {
      const problema = problemaParaSalvar()
      if (problema) return setMsg(problema)
    }
    const texto = textoPedido({
      numero: pedido?.numero ?? null,
      fornecedor: fornecedor?.nome ?? '',
      forma: cab.forma,
      data_prevista: cab.data_prevista || null,
      condicao: cab.condicao_pagamento,
      forma_pagamento: cab.forma_pagamento ? FORMA_PAGAMENTO_LABEL[cab.forma_pagamento] : null,
      obs: cab.obs.trim() || null,
      itens: itensValor,
    })
    window.open(linkWhatsApp(fornecedor?.telefone, texto), '_blank', 'noopener')
    return acao(async () => {
      const id = editavel ? await salvar() : pedido?.id
      if (!id) return
      if (status === 'rascunho') {
        const r = await supabase
          .from('purchase_orders')
          .update({ status: 'enviado', enviado_em: new Date().toISOString() })
          .eq('id', id)
        if (r.error) return setMsg(r.error.message)
        await qc.invalidateQueries({ queryKey: ['pedidos'] })
      }
      onSalvo(id, 'Mensagem aberta no WhatsApp — pedido marcado como enviado. Quando o fornecedor responder, confirme.')
    })
  }

  const confirmar = () =>
    acao(async () => {
      if (pend.length) return setMsg(`Ainda não dá para confirmar:\n• ${pend.join('\n• ')}`)
      const id = await salvar()
      if (!id) return
      const { data, error } = await supabase.rpc('compra_confirmar', { p_pedido: id })
      if (error) return setMsg(error.message)
      await qc.invalidateQueries({ queryKey: ['pedidos'] })
      await qc.invalidateQueries({ queryKey: ['pagar'] })
      onSalvo(id, `Pedido confirmado — ${data ?? previa.length} conta(s) a pagar geradas no financeiro.`)
    })

  const cancelar = () =>
    acao(async () => {
      if (!pedido) return onFechar()
      const aviso =
        status === 'confirmado'
          ? 'Cancelar este pedido? As contas a pagar ainda não pagas serão canceladas junto.'
          : 'Cancelar este pedido?'
      if (!window.confirm(aviso)) return
      const { data, error } = await supabase.rpc('compra_cancelar', { p_pedido: pedido.id })
      if (error) return setMsg(error.message)
      await qc.invalidateQueries({ queryKey: ['pedidos'] })
      await qc.invalidateQueries({ queryKey: ['pagar'] })
      onSalvo(pedido.id, Number(data) > 0 ? `Pedido cancelado — ${data} conta(s) a pagar canceladas.` : 'Pedido cancelado.')
    })

  const set = (k: string, campo: keyof ItemForm, v: string) =>
    setLinhas(linhas.map((l) => (l.key === k ? { ...l, [campo]: v } : l)))

  const titulo = pedido ? `Pedido ${pedido.numero ?? ''} — ${pedido.fornecedor_nome ?? ''}` : 'Novo pedido de compra'

  return (
    <div className="mb-6 space-y-4">
      <Card
        title={
          <span className="flex items-center gap-2">
            {titulo} {pedido && <StatusPedidoBadge status={status} />}
          </span>
        }
        actions={
          <Button variant="ghost" onClick={onFechar}>
            Fechar
          </Button>
        }
      >
        {daLista && !pedido && (
          <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            {daLista.itens.length} item(ns) vieram da lista de compras ({daLista.origem}).
            {!daLista.fornecedorChave && ' Escolha o fornecedor.'} Passe os preços que o fornecedor informar.
          </p>
        )}
        {daLista && (daLista.eventosDaLista?.length ?? 0) > 1 && linhas.some((l) => l.descricao.trim() && !l.event_id) && (
          <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            A lista juntou itens de {daLista.eventosDaLista!.length} eventos. Ligue cada item ao evento na coluna "Evento":
            item sem evento entra em "Resultado por evento" como estoque da casa, e a margem dos eventos fica maior do
            que é.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select
            label="Fornecedor"
            required
            disabled={!editavel}
            value={cab.fornecedor_id}
            onChange={(e) => escolherFornecedor(e.target.value)}
          >
            <option value="">—</option>
            {fornecedores
              .filter((f) => f.ativo || f.id === cab.fornecedor_id)
              .map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
          </Select>
          <Select
            label="Como chega"
            disabled={!editavel}
            value={cab.forma}
            onChange={(e) => setCab({ ...cab, forma: e.target.value as FormaEntrega })}
          >
            <option value="entrega">Fornecedor entrega</option>
            <option value="retirada" disabled={Boolean(fornecedor) && !fornecedor?.endereco}>
              Pieggi retira{fornecedor && !fornecedor.endereco ? ' (sem endereço)' : ''}
            </option>
          </Select>
          <Input
            label={cab.forma === 'retirada' ? 'Data da retirada' : 'Data da entrega'}
            type="date"
            disabled={!editavel}
            value={cab.data_prevista}
            onChange={(e) => setCab({ ...cab, data_prevista: e.target.value })}
          />
          <Select
            label="Prazo de pagamento"
            disabled={!editavel}
            value={cab.condicao_pagamento}
            onChange={(e) => setCab({ ...cab, condicao_pagamento: e.target.value })}
          >
            {CONDICOES.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.label}
              </option>
            ))}
          </Select>
          <Select
            label="Forma de pagamento"
            disabled={!editavel}
            value={cab.forma_pagamento}
            onChange={(e) => setCab({ ...cab, forma_pagamento: e.target.value as FormaPagamento | '' })}
          >
            <option value="">—</option>
            {Object.entries(FORMA_PAGAMENTO_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Textarea
            label="Observação"
            rows={1}
            disabled={!editavel}
            value={cab.obs}
            onChange={(e) => setCab({ ...cab, obs: e.target.value })}
          />
        </div>
        {fornecedor && (
          <p className="mt-2 text-xs text-neutral-500">
            {fornecedor.telefone ? `WhatsApp ${fornecedor.telefone}` : 'Sem telefone no cadastro — o WhatsApp abre sem destinatário.'}
            {fornecedor.condicao_pagamento && ` · padrão: ${rotuloCondicao(fornecedor.condicao_pagamento)}`}
            {cab.forma === 'retirada' && fornecedor.endereco && ` · retirar em ${fornecedor.endereco}${fornecedor.horario ? ` (${fornecedor.horario})` : ''}`}
          </p>
        )}

        {/* ---------- itens ---------- */}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Qtd</Th>
                <Th>Un.</Th>
                <Th>Preço un.</Th>
                <Th>Evento</Th>
                <Th>Subtotal</Th>
                {(status === 'recebido' || difs.length > 0) && <Th>Chegou</Th>}
                {editavel && <Th></Th>}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const q = num(l.quantidade) ?? 0
                const p = num(l.preco_unitario)
                const dif = l.quantidade_recebida != null && Number(l.quantidade_recebida) !== q
                return (
                  <tr key={l.key} className={dif ? 'bg-red-50' : ''}>
                    <Td className="min-w-[220px]">
                      {editavel ? (
                        <Input value={l.descricao} onChange={(e) => set(l.key, 'descricao', e.target.value)} />
                      ) : (
                        l.descricao
                      )}
                    </Td>
                    <Td className="w-24">
                      {editavel ? (
                        <Input inputMode="decimal" value={l.quantidade} onChange={(e) => set(l.key, 'quantidade', e.target.value)} />
                      ) : (
                        q.toLocaleString('pt-BR')
                      )}
                    </Td>
                    <Td className="w-24">
                      {editavel ? <Input value={l.unidade} onChange={(e) => set(l.key, 'unidade', e.target.value)} /> : l.unidade}
                    </Td>
                    <Td className="w-28">
                      {editavel ? (
                        <Input
                          inputMode="decimal"
                          placeholder="a passar"
                          className={p == null ? '!border-amber-400' : ''}
                          value={l.preco_unitario}
                          onChange={(e) => set(l.key, 'preco_unitario', e.target.value)}
                        />
                      ) : p == null ? (
                        <Badge tone="amber">sem preço</Badge>
                      ) : (
                        formatBRL(p)
                      )}
                    </Td>
                    <Td className="min-w-[160px] text-xs">
                      {editavel ? (
                        <Select value={l.event_id} onChange={(e) => set(l.key, 'event_id', e.target.value)}>
                          <option value="">estoque / sem evento</option>
                          {eventos.map((ev) => (
                            <option key={ev.id} value={ev.id}>
                              {ev.nome}
                              {ev.primeiroDia ? ` · ${dataBR(ev.primeiroDia).slice(0, 5)}` : ''}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        (eventos.find((e) => e.id === l.event_id)?.nome ?? '—')
                      )}
                    </Td>
                    <Td className="whitespace-nowrap font-medium">{p == null ? '—' : formatBRL(q * p)}</Td>
                    {(status === 'recebido' || difs.length > 0) && (
                      <Td className={`whitespace-nowrap ${dif ? 'font-semibold text-red-700' : 'text-neutral-500'}`}>
                        {l.quantidade_recebida == null ? '—' : `${Number(l.quantidade_recebida).toLocaleString('pt-BR')} ${l.unidade}`}
                      </Td>
                    )}
                    {editavel && (
                      <Td>
                        <Button variant="ghost" className="!px-2" onClick={() => setLinhas(linhas.filter((x) => x.key !== l.key))}>
                          ✕
                        </Button>
                      </Td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          {editavel ? (
            <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => setLinhas([...linhas, novaLinha()])}>
              + Item
            </Button>
          ) : (
            <span />
          )}
          <div className="text-right">
            <div className="pg-key">Total</div>
            <div className="pg-metric text-2xl">{formatBRL(total)}</div>
          </div>
        </div>

        {/* ---------- o que vai virar no financeiro ---------- */}
        {(status === 'rascunho' || status === 'enviado') && previa.length > 0 && (
          <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            Ao confirmar, vira no contas a pagar:{' '}
            {previa.map((p) => `${p.parcela}/${p.parcelas} ${formatBRL(p.valor)} vence ${dataBR(p.vencimento)}`).join(' · ')}
            {!cab.data_prevista && ' (contando de hoje — preencha a data prevista)'}
          </p>
        )}
        {pedido && (status === 'confirmado' || status === 'recebido') && (
          <p className="mt-4 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
            No financeiro: {pedido.parcelas_total} conta(s) a pagar · {pedido.parcelas_pagas} paga(s)
            {pedido.valor_pago > 0 && ` (${formatBRL(pedido.valor_pago)})`}.
            {verFinanceiro && (
              <Link to="/financeiro/pagar" className="ml-1 font-semibold underline">
                Ver contas a pagar
              </Link>
            )}
          </p>
        )}
        {pedido?.status === 'cancelado' && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            Pedido cancelado{pedido.cancelado_em ? ` em ${dataBR(pedido.cancelado_em)}` : ''}.
          </p>
        )}
        {difs.length > 0 && status === 'recebido' && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
            Recebido com divergência: {difs.map((d) => `${d.descricao} (${d.diferenca > 0 ? '+' : ''}${d.diferenca} ${d.unidade})`).join(' · ')} —
            diferença de {formatBRL(difs.reduce((t, d) => t + d.valor, 0))}.
          </p>
        )}
        {pedido?.forma === 'retirada' && (status === 'confirmado' || status === 'enviado') && (
          <p className="mt-3 text-xs">
            Retirada {dataBR(pedido.data_prevista)} na {pedido.fornecedor_nome} —{' '}
            <Link to="/rua/transporte" className="font-semibold underline">
              programar retirada →
            </Link>
          </p>
        )}

        {msg && <p className="mt-4 whitespace-pre-line rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{msg}</p>}

        {/* ---------- ações ---------- */}
        {pedirCompra && (
          <div className="mt-5 flex flex-wrap gap-2">
            {editavel && (
              <Button variant="secondary" disabled={ocupado} onClick={salvarRascunho}>
                {pedido ? 'Salvar' : 'Salvar rascunho'}
              </Button>
            )}
            {(status === 'rascunho' || status === 'enviado') && (
              <Button variant="secondary" disabled={ocupado || !cab.fornecedor_id} onClick={mandar}>
                {status === 'enviado' ? 'Reenviar no WhatsApp' : 'Mandar no WhatsApp'}
              </Button>
            )}
            {(status === 'rascunho' || status === 'enviado') && (
              <Button disabled={ocupado} onClick={confirmar} title={pend.join(' · ')}>
                Fornecedor confirmou
              </Button>
            )}
            {pedido && ['rascunho', 'enviado', 'confirmado'].includes(status) && (
              <Button variant="danger" disabled={ocupado} onClick={cancelar}>
                Cancelar pedido
              </Button>
            )}
          </div>
        )}
        {/* receber: compras E quem está na porta (logística) — o banco só deixa gravar o que chegou */}
        {podeReceber && status === 'confirmado' && !recebendo && (
          <Button className="mt-3 w-full !py-4 md:w-auto" onClick={() => setRecebendo(true)}>
            Receber mercadoria
          </Button>
        )}
        {(status === 'rascunho' || status === 'enviado') && pend.length > 0 && itensValor.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">Para confirmar falta: {pend.join(' · ')}</p>
        )}
      </Card>

      {recebendo && pedido && itensBanco && (
        <Recebimento
          pedidoId={pedido.id}
          numero={pedido.numero}
          itens={itensBanco}
          onPronto={(m) => {
            setRecebendo(false)
            onSalvo(pedido.id, m)
          }}
        />
      )}
    </div>
  )
}
