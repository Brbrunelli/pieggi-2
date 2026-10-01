// ============================================================
// CONTAS A PAGAR
//
// O espelho de Contas a receber. Lê a view `payables_abertos`, não a
// tabela: "atrasado" é vencimento no passado + ainda a pagar, calculado
// na hora — nunca uma coluna que envelhece sozinha.
//
// De onde vêm os títulos:
//   1. pedido de compra CONFIRMADO → parcelas automáticas (compras não
//      redigita nada; o financeiro só paga);
//   2. DIÁRIAS de freelancer presentes → um título por freelancer, com o
//      PIX na descrição;
//   3. lançamento à mão (aluguel, imposto, manutenção…).
// Pedido recebido com divergência aparece marcado: confira antes de
// pagar o boleto cheio.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import { dataBR, hojeISO } from '@/engine/financeiro'
import { useEventosParaLigar, usePagarAbertos } from '@/components/compras/dados'
import GerarDiarias from '@/components/financeiro/GerarDiarias'
import { useFornecedores } from '@/pages/compras/Fornecedores'
import { CATEGORIA_PAGAR_LABEL, type CategoriaPagar, type Payable } from '@/tipos/compras'

type Filtro = 'abertos' | 'atrasados' | 'pagos' | 'todos'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'abertos', label: 'A pagar' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'todos', label: 'Todos' },
]

const formVazio = {
  categoria: 'outros' as CategoriaPagar,
  descricao: '',
  valor: '',
  vencimento: '',
  fornecedor_id: '',
  event_id: '',
  forma_pagamento: '',
  obs: '',
}

function origem(t: Payable) {
  if (t.purchase_order_id)
    return (
      <Link to={`/compras/pedidos?id=${t.purchase_order_id}`} className="hover:underline">
        Pedido {t.pedido_numero ?? ''}
      </Link>
    )
  if (t.categoria === 'freelancer') return 'Diárias'
  return 'Manual'
}

export default function Pagar() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { emitirNota } = usePermissoes()
  const { data: titulos } = usePagarAbertos()
  const { data: fornecedores } = useFornecedores()
  const { data: eventos } = useEventosParaLigar()
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [categoria, setCategoria] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [painel, setPainel] = useState<'novo' | 'diarias' | null>(null)
  const [form, setForm] = useState(formVazio)
  const [baixando, setBaixando] = useState<Payable | null>(null)
  const [baixa, setBaixa] = useState({ valor_pago: '', pago_em: '', forma_pagamento: '' })

  const hoje = hojeISO()
  const lista = useMemo(() => {
    let t = titulos ?? []
    if (categoria) t = t.filter((x) => x.categoria === categoria)
    switch (filtro) {
      case 'abertos':
        return t.filter((x) => x.status === 'a_pagar')
      case 'atrasados':
        return t.filter((x) => x.status === 'a_pagar' && x.atrasado)
      case 'pagos':
        return t.filter((x) => x.status === 'pago').sort((a, b) => (b.pago_em ?? '').localeCompare(a.pago_em ?? ''))
      default:
        return t
    }
  }, [titulos, filtro, categoria])

  const soma = (fn: (t: Payable) => boolean) => (titulos ?? []).filter(fn).reduce((s, t) => s + Number(t.valor), 0)
  const aPagar = soma((t) => t.status === 'a_pagar')
  const atrasado = soma((t) => t.status === 'a_pagar' && Boolean(t.atrasado))
  const proximos7 = soma((t) => t.status === 'a_pagar' && !t.atrasado && (t.dias_ate_vencer ?? 999) <= 7)
  const pagoMes = (titulos ?? [])
    .filter((t) => t.status === 'pago' && (t.pago_em ?? '').slice(0, 7) === hoje.slice(0, 7))
    .reduce((s, t) => s + Number(t.valor_pago ?? t.valor), 0)

  async function lancar() {
    if (!form.descricao || !form.valor || !form.vencimento) {
      setMsg('Descrição, valor e vencimento são obrigatórios.')
      return
    }
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase.from('payables').insert({
      categoria: form.categoria,
      descricao: form.descricao.trim(),
      valor: Number(form.valor.replace(',', '.')),
      vencimento: form.vencimento,
      fornecedor_id: form.fornecedor_id || null,
      event_id: form.event_id || null,
      forma_pagamento: form.forma_pagamento || null,
      obs: form.obs.trim() || null,
      created_by: session?.user.id,
    })
    setOcupado(false)
    if (error) return setMsg(error.message)
    setPainel(null)
    setForm(formVazio)
    setMsg('Conta lançada.')
    await qc.invalidateQueries({ queryKey: ['pagar'] })
  }

  function abrirBaixa(t: Payable) {
    setBaixando(t)
    setBaixa({ valor_pago: String(t.valor), pago_em: hoje, forma_pagamento: t.forma_pagamento ?? '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function darBaixa() {
    if (!baixando) return
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase
      .from('payables')
      .update({
        status: 'pago',
        valor_pago: baixa.valor_pago ? Number(baixa.valor_pago.replace(',', '.')) : baixando.valor,
        pago_em: baixa.pago_em || hoje,
        forma_pagamento: baixa.forma_pagamento || null,
      })
      .eq('id', baixando.id)
    setOcupado(false)
    if (error) return setMsg(error.message)
    setBaixando(null)
    setMsg('Pagamento registrado.')
    await qc.invalidateQueries({ queryKey: ['pagar'] })
    await qc.invalidateQueries({ queryKey: ['pedidos'] })
  }

  async function cancelar(t: Payable) {
    if (!window.confirm(`Cancelar "${t.descricao}"?`)) return
    // pelo banco (payables_cancelar): cancela E solta as diárias do título
    // numa operação só — a diária volta a poder ser gerada. Fazer isso daqui
    // dependia da RLS de payable_diarias e falhava em silêncio.
    const { data: soltas, error } = await supabase.rpc('payables_cancelar', { p_id: t.id })
    if (error) return setMsg(error.message)
    await qc.invalidateQueries({ queryKey: ['diarias-a-pagar'] })
    setMsg(
      Number(soltas) > 0
        ? `Conta cancelada — ${soltas} diária(s) voltaram para "Gerar pagamento das diárias".`
        : 'Conta cancelada.'
    )
    await qc.invalidateQueries({ queryKey: ['pagar'] })
  }

  return (
    <div>
      <PageTitle
        lead="FINANCEIRO"
        actions={
          emitirNota && (
            <>
              <Button variant="secondary" onClick={() => setPainel(painel === 'diarias' ? null : 'diarias')}>
                Gerar pagamento das diárias
              </Button>
              <Button variant="secondary" onClick={() => setPainel(painel === 'novo' ? null : 'novo')}>
                {painel === 'novo' ? 'Fechar' : '+ Lançar conta'}
              </Button>
            </>
          )
        }
      >
        Contas a pagar
      </PageTitle>

      {msg && <p className="mb-4 whitespace-pre-line rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {/* ---------- indicadores ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Card>
          <div className="pg-key">A pagar</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">{formatBRL(aPagar)}</div>
        </Card>
        <Card>
          <div className="pg-key">Atrasado</div>
          <div className={`pg-metric mt-2 text-[28px] leading-none ${atrasado > 0 ? 'text-red-700' : ''}`}>{formatBRL(atrasado)}</div>
        </Card>
        <Card>
          <div className="pg-key">Vence em 7 dias</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">{formatBRL(proximos7)}</div>
        </Card>
        <Card>
          <div className="pg-key">Pago no mês</div>
          <div className="pg-metric mt-2 text-[28px] leading-none text-green-700">{formatBRL(pagoMes)}</div>
        </Card>
      </div>

      {painel === 'diarias' && (
        <GerarDiarias
          onFechar={() => setPainel(null)}
          onPronto={(m) => {
            setPainel(null)
            setMsg(m)
          }}
        />
      )}

      {/* ---------- lançar à mão ---------- */}
      {painel === 'novo' && (
        <Card title="Lançar conta a pagar" className="mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Input
                label="Descrição"
                placeholder="Ex.: Aluguel da cozinha — outubro"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <Input label="Valor (R$)" type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} />
            <Input label="Vencimento" type="date" value={form.vencimento} onChange={(e) => setForm({ ...form, vencimento: e.target.value })} />
            <Select label="Categoria" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaPagar })}>
              {Object.entries(CATEGORIA_PAGAR_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Select label="Fornecedor (opcional)" value={form.fornecedor_id} onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}>
              <option value="">—</option>
              {(fornecedores ?? []).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
            <Select label="Evento (entra no resultado)" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
              <option value="">— despesa da casa —</option>
              {(eventos ?? []).map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.nome}
                </option>
              ))}
            </Select>
            <Input
              label="Forma de pagamento"
              placeholder="PIX, boleto, transferência…"
              value={form.forma_pagamento}
              onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
            />
            <div className="md:col-span-4">
              <Input label="Observação" value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={lancar} disabled={ocupado}>
              {ocupado ? 'Lançando…' : 'Lançar'}
            </Button>
          </div>
        </Card>
      )}

      {/* ---------- baixa ---------- */}
      {baixando && (
        <Card title={`Registrar pagamento — ${baixando.descricao}`} className="mb-6">
          {baixando.pedido_divergente && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
              O pedido {baixando.pedido_numero} foi recebido com divergência. Confira com compras se o boleto veio
              corrigido antes de pagar o valor cheio.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Valor pago (R$)" type="number" step="0.01" value={baixa.valor_pago} onChange={(e) => setBaixa({ ...baixa, valor_pago: e.target.value })} />
            <Input label="Data do pagamento" type="date" value={baixa.pago_em} onChange={(e) => setBaixa({ ...baixa, pago_em: e.target.value })} />
            <Input label="Forma" placeholder="PIX, boleto…" value={baixa.forma_pagamento} onChange={(e) => setBaixa({ ...baixa, forma_pagamento: e.target.value })} />
          </div>
          {Number(baixa.valor_pago) !== Number(baixando.valor) && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Valor diferente do título ({formatBRL(Number(baixando.valor))}) — o título será baixado inteiro com o valor
              informado. Para pagamento parcial, lance duas contas.
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <Button onClick={darBaixa} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Confirmar pagamento'}
            </Button>
            <Button variant="ghost" onClick={() => setBaixando(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* ---------- lista ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                filtro === f.key ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]' : 'text-neutral-500 hover:text-[var(--pg-text)]'
              }`}
            >
              {f.label.toUpperCase()}
            </button>
          ))}
        </div>
        <Select className="!w-48" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIA_PAGAR_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
      </div>

      <Card>
        {!lista.length ? (
          <EmptyState>Nenhuma conta neste filtro.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Descrição</Th>
                  <Th>Origem</Th>
                  <Th>Parcela</Th>
                  <Th>Vencimento</Th>
                  <Th>Valor</Th>
                  <Th>Situação</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((t) => (
                  <tr key={t.id} className={t.status === 'a_pagar' && t.atrasado ? 'bg-red-50' : ''}>
                    <Td>
                      <span className="font-medium">{t.descricao}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-neutral-500">
                        <span>{CATEGORIA_PAGAR_LABEL[t.categoria] ?? t.categoria}</span>
                        {t.evento_nome && t.event_id && (
                          <Link to={`/eventos/${t.event_id}`} className="hover:underline">
                            · {t.evento_nome}
                          </Link>
                        )}
                        {t.pedido_divergente && <Badge tone="red">recebido com divergência</Badge>}
                      </div>
                      {t.obs && <div className="text-xs text-neutral-400">{t.obs}</div>}
                    </Td>
                    <Td className="text-xs">{origem(t)}</Td>
                    <Td className="text-xs text-neutral-500">{t.parcelas > 1 ? `${t.parcela}/${t.parcelas}` : '—'}</Td>
                    <Td className="whitespace-nowrap font-mono text-xs">
                      {dataBR(t.vencimento)}
                      {t.status === 'a_pagar' && t.dias_ate_vencer != null && (
                        <span className="ml-1 text-neutral-400">
                          · {t.dias_ate_vencer < 0 ? `${-t.dias_ate_vencer}d atrás` : t.dias_ate_vencer === 0 ? 'hoje' : `${t.dias_ate_vencer}d`}
                        </span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap font-semibold">{formatBRL(Number(t.valor))}</Td>
                    <Td>
                      {t.status === 'pago' ? (
                        <Badge tone="green">Pago{t.pago_em ? ` em ${dataBR(t.pago_em)}` : ''}</Badge>
                      ) : t.atrasado ? (
                        <Badge tone="red">Atrasado</Badge>
                      ) : (
                        <Badge tone="neutral">A pagar</Badge>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-right">
                      {t.status === 'a_pagar' && emitirNota && (
                        <>
                          <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => abrirBaixa(t)}>
                            Dar baixa
                          </Button>
                          {!t.purchase_order_id && (
                            <Button variant="ghost" className="!px-2 !py-1.5" onClick={() => cancelar(t)}>
                              Cancelar
                            </Button>
                          )}
                        </>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-neutral-500">
          Conta de pedido só é cancelada cancelando o pedido em Compras — assim compras e financeiro não ficam com
          versões diferentes.
        </p>
      </Card>
    </div>
  )
}
