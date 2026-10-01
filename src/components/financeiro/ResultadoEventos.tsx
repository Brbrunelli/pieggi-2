// ============================================================
// RESULTADO POR EVENTO — quanto sobrou de cada evento assinado
//
// Receita (títulos a receber do evento) − custos ligados a ele:
//   insumos   = itens de pedido de compra marcados com o evento
//   equipe    = diárias da escala (previsto antes, real depois) + as vagas
//               da escala que ainda não têm gente, pelo valor de
//               referência da função — sem isso a margem prevista sai
//               otimista enquanto a Adriana ainda está escalando
//   material  = prejuízo de copo/prato que não voltou (conferência)
//   outros    = contas a pagar lançadas no evento (van, aluguel de item…)
// A regra está em engine/financeiro.ts (resultadoPorEvento). Compra sem
// evento é estoque da casa e não entra aqui — por isso vale ligar o item
// ao evento no pedido.
// ============================================================

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, Td, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import { dataBR, equipePrevista, resultadoPorEvento, somarDias } from '@/engine/financeiro'
import type { Payable } from '@/tipos/compras'

export default function ResultadoEventos({ hoje, horizonte, payables }: { hoje: string; horizonte: number; payables: Payable[] }) {
  const { data } = useQuery({
    queryKey: ['resultado-eventos'],
    queryFn: async () => {
      const [contratos, eventos, rec, itens, custo, mat, staff, vagas, freelas] = await Promise.all([
        supabase.from('contracts').select('event_id, status, valor').eq('status', 'assinado'),
        supabase.from('events').select('id, nome, event_services(dia)'),
        supabase.from('receivables_abertos').select('event_id, valor, status'),
        supabase.from('purchase_order_items').select('event_id, quantidade, quantidade_recebida, preco_unitario, purchase_orders(status)'),
        supabase.from('event_staff_custo').select('event_id, custo'),
        supabase.from('event_materials_conferencia').select('event_id, prejuizo'),
        supabase.from('event_staff').select('event_id, dia, funcao, status'),
        supabase.from('escala_vagas').select('event_id, dia, funcao, quantidade'),
        supabase.from('freelancers').select('funcao_padrao, valor_padrao, ativo'),
      ])
      const erro = [contratos, eventos, rec, itens, custo, mat, staff, freelas].find((r) => r.error)?.error
      if (erro) throw erro
      // escala_vagas é da 0037 (frente Pessoas): sem ela, só não há previsão
      return { contratos, eventos, rec, itens, custo, mat, staff, vagas: vagas.error ? [] : (vagas.data ?? []), freelas }
    },
  })

  if (!data) return null

  const de = somarDias(hoje, -30)
  const ate = somarDias(hoje, horizonte)
  const contratos = (data.contratos.data ?? []) as { event_id: string; valor: number | null }[]
  const evs = ((data.eventos.data ?? []) as { id: string; nome: string; event_services: { dia: string }[] | null }[])
    .filter((e) => contratos.some((c) => c.event_id === e.id))
    .map((e) => {
      const primeiroDia = (e.event_services ?? []).map((s) => s.dia).sort()[0] ?? null
      const c = contratos.find((x) => x.event_id === e.id)
      return { id: e.id, nome: e.nome, primeiroDia, contrato: c?.valor ?? null }
    })
    .filter((e) => !e.primeiroDia || (e.primeiroDia >= de && e.primeiroDia <= ate))
    .sort((a, b) => (a.primeiroDia ?? '').localeCompare(b.primeiroDia ?? ''))

  const linhas = resultadoPorEvento({
    eventos: evs,
    receivables: (data.rec.data ?? []) as never,
    itens: (
      (data.itens.data ?? []) as unknown as {
        event_id: string | null
        quantidade: number
        quantidade_recebida: number | null
        preco_unitario: number | null
        purchase_orders: { status: string } | { status: string }[] | null
      }[]
    ).map((i) => {
      const po = Array.isArray(i.purchase_orders) ? i.purchase_orders[0] : i.purchase_orders
      return { ...i, pedido_status: po?.status ?? 'rascunho' }
    }),
    equipeCusto: (data.custo.data ?? []) as never,
    previsao: equipePrevista({
      hoje,
      vagas: data.vagas as never,
      staff: (data.staff.data ?? []) as never,
      freelancers: (data.freelas.data ?? []) as never,
    }),
    materiais: (data.mat.data ?? []) as never,
    payables,
  })

  return (
    <Card title={`Resultado por evento · assinados de ${dataBR(de).slice(0, 5)} a ${dataBR(ate).slice(0, 5)}`}>
      {!linhas.length ? (
        <EmptyState>Nenhum evento com contrato assinado no período.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Evento</Th>
                <Th>Receita</Th>
                <Th>Insumos</Th>
                <Th>Equipe</Th>
                <Th>Material</Th>
                <Th>Outros</Th>
                <Th>Margem</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((r) => (
                <tr key={r.event_id}>
                  <Td>
                    <Link to={`/eventos/${r.event_id}`} className="font-medium hover:underline">
                      {r.nome}
                    </Link>
                    <div className="text-xs text-neutral-500">
                      {r.primeiroDia ? dataBR(r.primeiroDia) : 'sem data'}
                      {r.primeiroDia && r.primeiroDia > hoje && ' · previsto'}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {formatBRL(r.receita)}
                    {r.receitaIncompleta && (
                      <div className="mt-1">
                        <Badge tone="amber">contrato {formatBRL(Number(r.contrato))}</Badge>
                      </div>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-xs">{formatBRL(r.insumos)}</Td>
                  <Td className="whitespace-nowrap text-xs">
                    {formatBRL(r.equipe + r.equipePrevista)}
                    {r.vagasAbertas > 0 && (
                      <div className="mt-1 text-[11px] text-amber-700">
                        {r.equipePrevista > 0 && `${formatBRL(r.equipePrevista)} previstos · `}
                        {r.vagasAbertas} vaga(s) sem gente
                        {r.vagasSemReferencia > 0 && ` (${r.vagasSemReferencia} sem valor de referência)`}
                      </div>
                    )}
                  </Td>
                  <Td className={`whitespace-nowrap text-xs ${r.material > 0 ? 'text-red-700' : ''}`}>{formatBRL(r.material)}</Td>
                  <Td className="whitespace-nowrap text-xs">{formatBRL(r.outros)}</Td>
                  <Td className="whitespace-nowrap">
                    <span className={`font-semibold ${r.margem < 0 ? 'text-red-700' : 'text-green-700'}`}>{formatBRL(r.margem)}</span>
                    <div className="text-xs text-neutral-500">{r.pct == null ? '—' : `${r.pct.toLocaleString('pt-BR')}%`}</div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-500">
        Receita = títulos lançados no contas a receber (âmbar: ainda falta lançar parte do contrato). Insumos = itens de
        pedido ligados ao evento (vale o recebido quando conferido). Equipe = escala da rua + vagas ainda sem gente ×
        valor de referência da função (média do valor padrão dos freelas). Material = copo/prato perdido
        ou quebrado. Compra sem evento é estoque da casa e não entra.
      </p>
    </Card>
  )
}
