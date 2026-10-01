// ============================================================
// FLUXO DE CAIXA — o que entra × o que sai, dia a dia
//
// Junta as duas pontas: contas a RECEBER (pelo vencimento) e contas a
// PAGAR (pedidos confirmados, diárias, aluguel…). A partir de um saldo
// inicial digitado, projeta o saldo dia a dia por 30/60/90 dias e pinta
// de vermelho o dia em que o caixa não fecha — para o Bruno ver ANTES e
// antecipar recebimento ou negociar prazo.
//
// O saldo inicial fica só neste navegador (não é dado da empresa — é o
// extrato do banco que alguém olhou hoje). Atrasados dos dois lados
// entram no dia de hoje, destacados: é o que precisa acontecer já.
// Toda a conta está em engine/financeiro.ts (fluxoDeCaixa).
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import { dataBR, fluxoDeCaixa, hojeISO, type Lancamento } from '@/engine/financeiro'
import { usePagarAbertos } from '@/components/compras/dados'
import ResultadoEventos from '@/components/financeiro/ResultadoEventos'
import type { Receivable } from '@/types'

const CHAVE_SALDO = 'pg-caixa-saldo-inicial'
const HORIZONTES = [30, 60, 90]
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function lerSaldo(): string {
  try {
    return localStorage.getItem(CHAVE_SALDO) ?? ''
  } catch {
    return ''
  }
}

function diaSemana(iso: string): string {
  const [a, m, d] = iso.split('-').map(Number)
  return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]
}

export default function Caixa() {
  const hoje = hojeISO()
  const [saldoTexto, setSaldoTexto] = useState(lerSaldo)
  const [horizonte, setHorizonte] = useState(30)
  const [todosOsDias, setTodosOsDias] = useState(false)
  const [contarAtrasados, setContarAtrasados] = useState(true)

  const { data: receber } = useQuery({
    queryKey: ['receber'],
    queryFn: async () => {
      const { data, error } = await supabase.from('receivables_abertos').select('*').order('vencimento')
      if (error) throw error
      return data as Receivable[]
    },
  })
  const { data: pagar } = usePagarAbertos()

  function mudarSaldo(v: string) {
    setSaldoTexto(v)
    try {
      localStorage.setItem(CHAVE_SALDO, v)
    } catch {
      /* sem storage: vale só nesta visita */
    }
  }

  const saldoInicial = Number(saldoTexto.replace(/\./g, '').replace(',', '.')) || 0

  const fluxo = useMemo(() => {
    const entradas: Lancamento[] = (receber ?? [])
      .filter((r) => r.status === 'a_receber')
      .map((r) => ({ id: r.id, descricao: r.descricao, valor: Number(r.valor), vencimento: r.vencimento }))
    const saidas: Lancamento[] = (pagar ?? [])
      .filter((p) => p.status === 'a_pagar')
      .map((p) => ({ id: p.id, descricao: p.descricao, valor: Number(p.valor), vencimento: p.vencimento }))
    return fluxoDeCaixa({ saldoInicial, hoje, horizonte, entradas, saidas, contarAtrasados })
  }, [receber, pagar, saldoInicial, hoje, horizonte, contarAtrasados])

  const dias = todosOsDias ? fluxo.dias : fluxo.dias.filter((d, i) => i === 0 || d.entra || d.sai)
  const carregando = !receber || !pagar

  return (
    <div>
      <PageTitle
        lead="FINANCEIRO"
        actions={
          <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
            {HORIZONTES.map((h) => (
              <button
                key={h}
                onClick={() => setHorizonte(h)}
                className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                  horizonte === h ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]' : 'text-neutral-500 hover:text-[var(--pg-text)]'
                }`}
              >
                {h} DIAS
              </button>
            ))}
          </div>
        }
      >
        Fluxo de caixa
      </PageTitle>

      {/* ---------- saldo e indicadores ---------- */}
      <div className="mb-6 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Card>
          <Input
            label="Saldo em conta hoje (R$)"
            inputMode="decimal"
            placeholder="0,00"
            value={saldoTexto}
            onChange={(e) => mudarSaldo(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-neutral-400">guardado só neste navegador</p>
        </Card>
        <Card>
          <div className="pg-key">Entra em {horizonte} dias</div>
          <div className="pg-metric mt-2 text-[28px] leading-none text-green-700">{formatBRL(fluxo.totalEntra)}</div>
        </Card>
        <Card>
          <div className="pg-key">Sai em {horizonte} dias</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">{formatBRL(fluxo.totalSai)}</div>
        </Card>
        <Card>
          <div className="pg-key">Saldo no fim</div>
          <div className={`pg-metric mt-2 text-[28px] leading-none ${fluxo.saldoFinal < 0 ? 'text-red-700' : ''}`}>
            {formatBRL(fluxo.saldoFinal)}
          </div>
        </Card>
      </div>

      {!carregando && fluxo.primeiroNegativo && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          <b>O caixa fica negativo em {dataBR(fluxo.primeiroNegativo)}</b> ({diaSemana(fluxo.primeiroNegativo)}) —{' '}
          {fluxo.diasNegativos} dia(s) no vermelho no período. Pior dia: {dataBR(fluxo.menorSaldo!.data)} com{' '}
          {formatBRL(fluxo.menorSaldo!.saldo)}. Antecipe um recebimento ou negocie o prazo de uma conta.
        </div>
      )}

      {(fluxo.atrasadoReceber > 0 || fluxo.atrasadoPagar > 0) && (
        <div className="mb-4 flex flex-wrap gap-3 text-sm">
          {fluxo.atrasadoReceber > 0 && (
            <Link to="/financeiro/receber" className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 hover:underline">
              Atrasado a receber: <b>{formatBRL(fluxo.atrasadoReceber)}</b>
            </Link>
          )}
          {fluxo.atrasadoPagar > 0 && (
            <Link to="/financeiro/pagar" className="rounded-lg bg-red-50 px-3 py-2 text-red-900 hover:underline">
              Atrasado a pagar: <b>{formatBRL(fluxo.atrasadoPagar)}</b>
            </Link>
          )}
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            <input type="checkbox" className="h-4 w-4" checked={contarAtrasados} onChange={(e) => setContarAtrasados(e.target.checked)} />
            contar atrasados como se acontecessem hoje
          </label>
        </div>
      )}

      {/* ---------- dia a dia ---------- */}
      <Card
        title="Dia a dia"
        className="mb-6"
        actions={
          <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => setTodosOsDias(!todosOsDias)}>
            {todosOsDias ? 'Só dias com movimento' : 'Mostrar todos os dias'}
          </Button>
        }
      >
        {carregando ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !dias.length ? (
          <EmptyState>Nada a receber nem a pagar no período.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Dia</Th>
                  <Th>Entra</Th>
                  <Th>Sai</Th>
                  <Th>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {dias.map((d) => (
                  <tr key={d.data} className={d.negativo ? 'bg-red-50' : ''}>
                    <Td className="whitespace-nowrap font-mono text-xs">
                      {dataBR(d.data).slice(0, 5)} <span className="text-neutral-400">{diaSemana(d.data)}</span>
                      {d.data === hoje && <div className="text-[10px] font-semibold text-neutral-600">HOJE</div>}
                      {d.temAtrasado && <div className="text-[10px] font-semibold text-amber-700">+ atrasados</div>}
                    </Td>
                    <Td className="align-top">
                      {d.entra > 0 ? (
                        <>
                          <span className="font-semibold text-green-700">{formatBRL(d.entra)}</span>
                          {d.entradas.map((l) => (
                            <div key={l.id} className={`text-xs ${l.vencimento < hoje ? 'text-amber-700' : 'text-neutral-500'}`}>
                              {l.descricao}
                              {l.vencimento < hoje && ` (venceu ${dataBR(l.vencimento).slice(0, 5)})`}
                            </div>
                          ))}
                        </>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </Td>
                    <Td className="align-top">
                      {d.sai > 0 ? (
                        <>
                          <span className="font-semibold">{formatBRL(d.sai)}</span>
                          {d.saidas.map((l) => (
                            <div key={l.id} className={`text-xs ${l.vencimento < hoje ? 'text-red-700' : 'text-neutral-500'}`}>
                              {l.descricao}
                              {l.vencimento < hoje && ` (venceu ${dataBR(l.vencimento).slice(0, 5)})`}
                            </div>
                          ))}
                        </>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </Td>
                    <Td className={`whitespace-nowrap align-top font-semibold ${d.negativo ? 'text-red-700' : ''}`}>
                      {formatBRL(d.saldo)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ResultadoEventos hoje={hoje} horizonte={horizonte} payables={pagar ?? []} />
    </div>
  )
}
