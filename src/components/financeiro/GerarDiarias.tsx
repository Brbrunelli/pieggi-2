// ============================================================
// GERAR PAGAMENTO DAS DIÁRIAS — da escala da rua para o contas a pagar
//
// A rua marca quem esteve PRESENTE (event_staff); o financeiro paga. Aqui
// as diárias presentes do período, ainda sem título, viram UM título por
// freelancer — com o PIX na descrição, para pagar sem abrir outro
// cadastro. Faltou não paga; diária já paga não entra de novo (o banco
// trava pela tabela payable_diarias).
//
// Diária SEM VALOR fica fora do lote (senão viraria título de R$ 0 e
// nunca mais voltaria): aparece embaixo, para a logística completar.
//
// Regra do Bruno: todo freela precisa de CONTRATO ASSINADO + ASO. O
// financeiro é o último portão, então a prévia AVISA (não bloqueia) quem
// trabalhou sem estar apto no dia — com a mesma regra da frente Pessoas
// (situacaoFreela), sem duplicar nada aqui.
//
// A prévia usa a mesma função (agruparDiarias) que o banco repete.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui'
import { formatBRL } from '@/engine'
import {
  agruparDiarias,
  dataBR,
  diariasSemValor,
  hojeISO,
  somarDias,
  type DiariaStaff,
  type GrupoDiarias,
} from '@/engine/financeiro'
import { situacaoFreela } from '@/engine/freelas'
import type { FreelancerDocumento } from '@/tipos/pessoas'

type Staff = DiariaStaff & { funcao?: string | null; events: { nome: string } | null }

export default function GerarDiarias({ onPronto, onFechar }: { onPronto: (msg: string) => void; onFechar: () => void }) {
  const qc = useQueryClient()
  const hoje = hojeISO()
  const [de, setDe] = useState(somarDias(hoje, -7))
  const [ate, setAte] = useState(hoje)
  const [vencimento, setVencimento] = useState(hoje)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['diarias-a-pagar'],
    queryFn: async () => {
      const [staff, freelas, pagas, docs] = await Promise.all([
        supabase.from('event_staff').select('*, events(nome)').eq('status', 'presente'),
        supabase.from('freelancers').select('id, nome, pix'),
        supabase.from('payable_diarias').select('event_staff_id'),
        supabase.from('freelancer_documentos').select('*'),
      ])
      const e = staff.error ?? freelas.error ?? pagas.error
      if (e) throw e
      return {
        staff: (staff.data ?? []) as Staff[],
        freelancers: (freelas.data ?? []) as { id: string; nome: string; pix: string | null }[],
        pagas: new Set(((pagas.data ?? []) as { event_staff_id: string }[]).map((x) => x.event_staff_id)),
        // antes da 0037 (ou sem permissão de leitura) não há como saber:
        // null = não avisa nada, em vez de acusar todo mundo de "sem contrato"
        docs: docs.error ? null : ((docs.data ?? []) as FreelancerDocumento[]),
      }
    },
  })

  const grupos = useMemo(
    () => (data ? agruparDiarias(data.staff, data.freelancers, data.pagas, de, ate) : []),
    [data, de, ate]
  )
  const foraDoLote = useMemo(
    () => (data ? (diariasSemValor(data.staff, data.pagas, de, ate) as Staff[]) : []),
    [data, de, ate]
  )
  const nomeEvento = (id: string) => data?.staff.find((s) => s.event_id === id)?.events?.nome ?? 'evento'
  const total = grupos.reduce((t, g) => t + g.valor, 0)
  const semPix = grupos.filter((g) => !g.pix).length

  /** motivos de não estar apto, somando todos os dias trabalhados (null = não dá para saber) */
  function pendenciasDocs(g: GrupoDiarias): string[] | null {
    if (!data?.docs) return null
    if (!g.freelancer_id) return ['sem cadastro de freela']
    const docs = data.docs.filter((d) => d.freelancer_id === g.freelancer_id)
    const motivos = new Set<string>()
    for (const d of g.dias) for (const m of situacaoFreela(docs, d).motivos) motivos.add(m)
    return [...motivos]
  }
  const inaptos = grupos.filter((g) => (pendenciasDocs(g) ?? []).length > 0).length

  async function gerar() {
    setOcupado(true)
    setErro(null)
    const { data: n, error } = await supabase.rpc('payables_gerar_diarias', { p_de: de, p_ate: ate, p_vencimento: vencimento })
    setOcupado(false)
    if (error) return setErro(error.message)
    await qc.invalidateQueries({ queryKey: ['pagar'] })
    await qc.invalidateQueries({ queryKey: ['diarias-a-pagar'] })
    onPronto(`${n ?? grupos.length} título(s) de diárias gerados — vencimento ${dataBR(vencimento)}.`)
  }

  const linkCadastro = (texto: string) => (
    <Link to="/rua/freelancers" className="font-semibold underline">
      {texto}
    </Link>
  )

  return (
    <Card
      title="Gerar pagamento das diárias"
      className="mb-6"
      actions={
        <Button variant="ghost" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Input label="Diárias de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        <Input label="até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Input label="Vencimento do pagamento" type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
      </div>

      <div className="mt-5">
        {!grupos.length ? (
          <EmptyState>Nenhuma diária PRESENTE com valor e sem pagamento neste período.</EmptyState>
        ) : (
          <div className="space-y-2">
            {grupos.map((g) => {
              const pend = pendenciasDocs(g)
              return (
                <div
                  key={g.chave}
                  className={`flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 ${
                    pend?.length ? 'border-red-300' : 'border-[var(--pg-border)]'
                  }`}
                >
                  <div>
                    <div className="text-sm font-medium">{g.nome}</div>
                    <div className="text-xs text-neutral-500">
                      {g.dias.length} diária(s) · {g.dias.map((d) => dataBR(d).slice(0, 5)).join(', ')} ·{' '}
                      {g.eventIds.map(nomeEvento).join(', ')}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      {g.pix ? (
                        <span className="font-mono">PIX {g.pix}</span>
                      ) : (
                        <Badge tone="red">sem PIX no cadastro</Badge>
                      )}
                      {pend?.map((m) => (
                        <Badge key={m} tone="red">
                          {m}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="pg-metric text-lg">{formatBRL(g.valor)}</div>
                </div>
              )
            })}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <span className="text-sm">
                {grupos.length} título(s) · total <b>{formatBRL(total)}</b>
                {semPix > 0 && (
                  <span className="ml-2 text-xs text-red-700">
                    {semPix} sem PIX — {linkCadastro('completar o cadastro do freela')} antes de pagar
                  </span>
                )}
              </span>
              <Button onClick={gerar} disabled={ocupado}>
                {ocupado ? 'Gerando…' : `Gerar ${grupos.length} título(s)`}
              </Button>
            </div>
            {inaptos > 0 && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                {inaptos} freela(s) trabalharam sem contrato assinado ou com ASO fora da validade no dia. O pagamento não é
                bloqueado (a diária foi trabalhada), mas regularize em {linkCadastro('Freelancers')}: é o risco trabalhista e
                sanitário que a regra quer evitar.
              </p>
            )}
          </div>
        )}

        {foraDoLote.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <div className="font-semibold">Fora deste lote — falta o valor da diária ({foraDoLote.length})</div>
            <ul className="mt-1 space-y-0.5">
              {foraDoLote.map((s) => (
                <li key={s.id}>
                  {s.nome}
                  {s.funcao ? ` (${s.funcao})` : ''} · {dataBR(s.dia).slice(0, 5)} · {s.events?.nome ?? 'evento'}
                </li>
              ))}
            </ul>
            <p className="mt-1">Continuam pendentes: depois que a logística puser o valor na escala, entram na próxima geração.</p>
          </div>
        )}

        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        <p className="mt-3 text-xs text-neutral-500">
          Só entra quem a rua marcou como PRESENTE. Quem faltou não gera pagamento; diária já paga não entra de novo.
        </p>
      </div>
    </Card>
  )
}
