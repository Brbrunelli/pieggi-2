// ============================================================
// CONTAS A RECEBER
//
// Lê a view `receivables_abertos`, não a tabela: "atrasado" é vencimento
// no passado + ainda a receber, calculado na hora. Guardar esse status
// numa coluna significaria um dado que envelhece sozinho e mente até
// alguém rodar uma rotina para corrigir.
//
// Os títulos nascem junto com a nota (Notas fiscais → 1º vencimento e
// parcelas), mas dá para lançar à mão: entrada paga antes de emitir nota
// é comum na casa.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import type { Receivable } from '@/types'
import { formatBRL } from '@/engine'
import { hojeLocal } from '@/engine/datas'

type Filtro = 'abertos' | 'atrasados' | 'recebidos' | 'todos'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'abertos', label: 'A receber' },
  { key: 'atrasados', label: 'Atrasados' },
  { key: 'recebidos', label: 'Recebidos' },
  { key: 'todos', label: 'Todos' },
]

function dataBR(iso: string): string {
  return iso.split('-').reverse().join('/')
}

export default function Receber() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const [filtro, setFiltro] = useState<Filtro>('abertos')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [baixando, setBaixando] = useState<Receivable | null>(null)
  const [novo, setNovo] = useState(false)
  const [form, setForm] = useState({
    descricao: '',
    valor: '',
    vencimento: '',
    forma_pagamento: '',
  })
  const [baixa, setBaixa] = useState({ valor_pago: '', pago_em: '', forma_pagamento: '' })

  const { data: titulos } = useQuery({
    queryKey: ['receber'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('receivables_abertos')
        .select('*')
        .order('vencimento')
      if (error) throw error
      return data as Receivable[]
    },
  })

  const lista = useMemo(() => {
    const t = titulos ?? []
    switch (filtro) {
      case 'abertos':
        return t.filter((x) => x.status === 'a_receber')
      case 'atrasados':
        return t.filter((x) => x.status === 'a_receber' && x.atrasado)
      case 'recebidos':
        return t.filter((x) => x.status === 'recebido')
      default:
        return t
    }
  }, [titulos, filtro])

  const soma = (fn: (t: Receivable) => boolean) =>
    (titulos ?? []).filter(fn).reduce((s, t) => s + Number(t.valor), 0)

  const aReceber = soma((t) => t.status === 'a_receber')
  const atrasado = soma((t) => t.status === 'a_receber' && Boolean(t.atrasado))
  const proximos7 = soma(
    (t) =>
      t.status === 'a_receber' &&
      !t.atrasado &&
      (t.dias_ate_vencer ?? 999) <= 7
  )
  const recebidoMes = (titulos ?? [])
    .filter(
      (t) => t.status === 'recebido' && (t.pago_em ?? '').slice(0, 7) === new Date().toISOString().slice(0, 7)
    )
    .reduce((s, t) => s + Number(t.valor_pago ?? t.valor), 0)

  async function lancar() {
    if (!form.descricao || !form.valor || !form.vencimento) {
      setMsg('🛑 Descrição, valor e vencimento são obrigatórios.')
      return
    }
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase.from('receivables').insert({
      descricao: form.descricao,
      valor: Number(form.valor),
      vencimento: form.vencimento,
      forma_pagamento: form.forma_pagamento || null,
      created_by: session?.user.id,
    })
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setNovo(false)
      setForm({ descricao: '', valor: '', vencimento: '', forma_pagamento: '' })
      setMsg('✅ Título lançado.')
      await qc.invalidateQueries({ queryKey: ['receber'] })
    }
    setOcupado(false)
  }

  function abrirBaixa(t: Receivable) {
    setBaixando(t)
    setBaixa({
      valor_pago: String(t.valor),
      pago_em: hojeLocal(),
      forma_pagamento: t.forma_pagamento ?? '',
    })
  }

  async function darBaixa() {
    if (!baixando) return
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase
      .from('receivables')
      .update({
        status: 'recebido',
        valor_pago: baixa.valor_pago ? Number(baixa.valor_pago) : baixando.valor,
        pago_em: baixa.pago_em || hojeLocal(),
        forma_pagamento: baixa.forma_pagamento || null,
      })
      .eq('id', baixando.id)
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setBaixando(null)
      setMsg('✅ Recebimento registrado.')
      await qc.invalidateQueries({ queryKey: ['receber'] })
    }
    setOcupado(false)
  }

  return (
    <div>
      <PageTitle
        lead="FINANCEIRO"
        actions={
          <Button variant="secondary" onClick={() => setNovo(!novo)}>
            {novo ? 'Fechar' : '+ Lançar título'}
          </Button>
        }
      >
        Contas a receber
      </PageTitle>

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {/* ---------- indicadores ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Card>
          <div className="pg-key">A receber</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">{formatBRL(aReceber)}</div>
        </Card>
        <Card>
          <div className="pg-key">Atrasado</div>
          <div
            className={`pg-metric mt-2 text-[28px] leading-none ${atrasado > 0 ? 'text-red-700' : ''}`}
          >
            {formatBRL(atrasado)}
          </div>
        </Card>
        <Card>
          <div className="pg-key">Vence em 7 dias</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">{formatBRL(proximos7)}</div>
        </Card>
        <Card>
          <div className="pg-key">Recebido no mês</div>
          <div className="pg-metric mt-2 text-[28px] leading-none text-green-700">
            {formatBRL(recebidoMes)}
          </div>
        </Card>
      </div>

      {/* ---------- lançar à mão ---------- */}
      {novo && (
        <Card title="Lançar título manualmente" className="mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Input
                label="Descrição"
                placeholder="Ex.: Entrada — Convenção Comercial"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>
            <Input
              label="Valor (R$)"
              type="number"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
            <Input
              label="Vencimento"
              type="date"
              value={form.vencimento}
              onChange={(e) => setForm({ ...form, vencimento: e.target.value })}
            />
            <div className="md:col-span-2">
              <Input
                label="Forma de pagamento"
                placeholder="PIX, boleto, transferência…"
                value={form.forma_pagamento}
                onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
              />
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
        <Card title={`Registrar recebimento — ${baixando.descricao}`} className="mb-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              label="Valor recebido (R$)"
              type="number"
              step="0.01"
              value={baixa.valor_pago}
              onChange={(e) => setBaixa({ ...baixa, valor_pago: e.target.value })}
            />
            <Input
              label="Data do recebimento"
              type="date"
              value={baixa.pago_em}
              onChange={(e) => setBaixa({ ...baixa, pago_em: e.target.value })}
            />
            <Input
              label="Forma"
              placeholder="PIX, boleto…"
              value={baixa.forma_pagamento}
              onChange={(e) => setBaixa({ ...baixa, forma_pagamento: e.target.value })}
            />
          </div>
          {Number(baixa.valor_pago) !== Number(baixando.valor) && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              ⚠️ Valor diferente do título ({formatBRL(Number(baixando.valor))}) — o título será
              baixado inteiro com o valor informado. Para pagamento parcial, lance dois títulos.
            </p>
          )}
          <div className="mt-4 flex gap-3">
            <Button onClick={darBaixa} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Confirmar recebimento'}
            </Button>
            <Button variant="ghost" onClick={() => setBaixando(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}

      {/* ---------- lista ---------- */}
      <div className="mb-4 flex rounded-full border border-[var(--pg-border)] p-0.5">
        {FILTROS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
              filtro === f.key
                ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                : 'text-neutral-500 hover:text-[var(--pg-text)]'
            }`}
          >
            {f.label.toUpperCase()}
          </button>
        ))}
      </div>

      <Card>
        {!lista.length ? (
          <EmptyState>Nenhum título neste filtro.</EmptyState>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Descrição</Th>
                <Th>Parcela</Th>
                <Th>Vencimento</Th>
                <Th>Valor</Th>
                <Th>Situação</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr
                  key={t.id}
                  className={t.status === 'a_receber' && t.atrasado ? 'bg-red-50' : ''}
                >
                  <Td>
                    {t.event_id ? (
                      <Link to={`/eventos/${t.event_id}`} className="hover:underline">
                        {t.descricao}
                      </Link>
                    ) : (
                      t.descricao
                    )}
                  </Td>
                  <Td className="text-xs text-neutral-500">
                    {t.parcelas > 1 ? `${t.parcela}/${t.parcelas}` : '—'}
                  </Td>
                  <Td className="whitespace-nowrap font-mono text-xs">
                    {dataBR(t.vencimento)}
                    {t.status === 'a_receber' && t.dias_ate_vencer != null && (
                      <span className="ml-1 text-neutral-400">
                        · {t.dias_ate_vencer < 0 ? `${-t.dias_ate_vencer}d atrás` : `${t.dias_ate_vencer}d`}
                      </span>
                    )}
                  </Td>
                  <Td className="font-semibold">{formatBRL(Number(t.valor))}</Td>
                  <Td>
                    {t.status === 'recebido' ? (
                      <Badge tone="green">
                        Recebido{t.pago_em ? ` em ${dataBR(t.pago_em)}` : ''}
                      </Badge>
                    ) : t.atrasado ? (
                      <Badge tone="red">Atrasado</Badge>
                    ) : (
                      <Badge tone="neutral">A receber</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    {t.status === 'a_receber' && (
                      <Button
                        variant="secondary"
                        className="!px-3 !py-1.5"
                        onClick={() => abrirBaixa(t)}
                      >
                        Dar baixa
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
