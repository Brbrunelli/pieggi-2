// ============================================================
// PAINEL — os números da rua no período
//
// O fechamento comercial (faturamento, pax, ticket) já estava no
// Painel. Isto completa o lado da operação que a call pediu: quanto se
// perdeu de material, quanto a equipe custou contra a verba de 8% e o
// que ficou sem fechar. Período por COMPETÊNCIA (dia do evento).
// ============================================================

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Card } from '@/components/ui'
import { formatBRL } from '@/engine'
import { hojeLocal } from '@/engine/datas'

export default function PainelRua({ de, ate }: { de: string; ate: string }) {
  const { verEquipe } = usePermissoes()
  const hoje = hojeLocal()

  const { data } = useQuery({
    queryKey: ['painel-rua', de, ate, verEquipe],
    queryFn: async () => {
      const { data: serv } = await supabase
        .from('event_services')
        .select('event_id, dia, events!inner(pipeline, campo_etapa)')
        .gte('dia', de)
        .lte('dia', ate)
        .eq('events.pipeline', 'aprovado')
      const linhas = (serv ?? []) as unknown as {
        event_id: string
        dia: string
        events: { campo_etapa: string | null }
      }[]
      const ids = Array.from(new Set(linhas.map((l) => l.event_id)))
      // evento que já passou (último dia antes de hoje) e não foi encerrado
      const ultimoDia = new Map<string, string>()
      for (const l of linhas) if ((ultimoDia.get(l.event_id) ?? '') < l.dia) ultimoDia.set(l.event_id, l.dia)
      const etapa = new Map(linhas.map((l) => [l.event_id, l.events.campo_etapa]))
      const passados = ids.filter((id) => ultimoDia.get(id)! < hoje)
      const encerrados = passados.filter((id) => etapa.get(id) === 'encerrado').length

      if (!ids.length) return { eventos: 0, passados: 0, encerrados: 0, prejuizo: 0, custo: 0, verba: 0, abertas: 0 }

      const [mat, equipe, oc] = await Promise.all([
        supabase.from('event_materials_conferencia').select('prejuizo').in('event_id', ids),
        verEquipe
          ? supabase.from('event_staff_custo').select('custo, verba').in('event_id', ids)
          : Promise.resolve({ data: [] }),
        supabase
          .from('event_ocorrencias')
          .select('id', { count: 'exact', head: true })
          .in('event_id', ids)
          .eq('resolvida', false),
      ])
      const custos = (equipe.data ?? []) as { custo: number | null; verba: number | null }[]
      return {
        eventos: ids.length,
        passados: passados.length,
        encerrados,
        prejuizo: ((mat.data ?? []) as { prejuizo: number | null }[]).reduce((s, m) => s + Number(m.prejuizo ?? 0), 0),
        custo: custos.reduce((s, c) => s + Number(c.custo ?? 0), 0),
        verba: custos.reduce((s, c) => s + Number(c.verba ?? 0), 0),
        abertas: oc.count ?? 0,
      }
    },
  })

  const pendentes = data ? data.passados - data.encerrados : 0
  const pctEquipe = data && data.verba > 0 ? (data.custo / data.verba) * 8 : null

  return (
    <section className="mt-6">
      <div className="pg-key mb-2.5">Rua no período (dia do evento)</div>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Card>
          <div className="pg-key">Eventos encerrados</div>
          <div className="pg-metric mt-2 text-[28px] leading-none">
            {data ? `${data.encerrados}/${data.passados}` : '—'}
          </div>
          {pendentes > 0 && (
            <Link to="/rua" className="mt-1 block text-xs text-amber-700 underline">
              {pendentes} já aconteceu e não fechou
            </Link>
          )}
        </Card>
        <Card>
          <div className="pg-key">Prejuízo de material</div>
          <div className={`pg-metric mt-2 text-[28px] leading-none ${data?.prejuizo ? 'text-red-700' : ''}`}>
            {data ? formatBRL(data.prejuizo) : '—'}
          </div>
          <div className="mt-1 text-xs text-neutral-500">quebra + o que não voltou</div>
        </Card>
        {verEquipe && (
          <Card>
            <div className="pg-key">Equipe sobre o orçamento</div>
            <div
              className={`pg-metric mt-2 text-[28px] leading-none ${pctEquipe != null && pctEquipe > 8 ? 'text-red-700' : ''}`}
            >
              {pctEquipe != null ? `${pctEquipe.toFixed(1)}%` : '—'}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {data ? `${formatBRL(data.custo)} · meta 8%` : ''}
            </div>
          </Card>
        )}
        <Card>
          <div className="pg-key">Ocorrências abertas</div>
          <div className={`pg-metric mt-2 text-[28px] leading-none ${data?.abertas ? 'text-red-700' : ''}`}>
            {data ? data.abertas : '—'}
          </div>
          <div className="mt-1 text-xs text-neutral-500">dos eventos do período</div>
        </Card>
      </div>
    </section>
  )
}
