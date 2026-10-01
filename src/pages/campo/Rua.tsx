// ============================================================
// RUA — a agenda da logística
//
// A porta de entrada da Adriana e dos coordenadores: os eventos com
// contrato assinado, por dia, com a fase de campo de cada um. Um toque
// abre o evento na rua.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, PageTitle } from '@/components/ui'
import { formatDiaMes } from '@/engine'
import { CAMPO_ETAPAS, ETAPA_FECHADO, nomeCliente, type CampoEtapa } from '@/types'
import { hojeLocal } from '@/engine/datas'

interface EventoRua {
  id: string
  nome: string
  cliente_nome: string | null
  pax: number | null
  campo_etapa: CampoEtapa | null
  clients: { nome: string } | null
  event_services: { dia: string; hora_inicio: string | null }[]
}

type Filtro = 'ativos' | 'encerrados'

const DIA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function tomEtapa(e: CampoEtapa | null): 'neutral' | 'amber' | 'green' {
  if (!e) return 'neutral'
  return e === 'encerrado' ? 'green' : 'amber'
}

export default function Rua() {
  const [filtro, setFiltro] = useState<Filtro>('ativos')

  const { data, isLoading } = useQuery({
    queryKey: ['rua'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, nome, cliente_nome, pax, campo_etapa, clients(nome), event_services(dia, hora_inicio)')
        .eq('pipeline', ETAPA_FECHADO)
      if (error) throw error
      return data as unknown as EventoRua[]
    },
  })

  const grupos = useMemo(() => {
    const hoje = hojeLocal()
    const lista = (data ?? [])
      .map((e) => {
        const dias = e.event_services.map((s) => s.dia).sort()
        const hora = e.event_services
          .filter((s) => s.dia === dias[0] && s.hora_inicio)
          .map((s) => s.hora_inicio!)
          .sort()[0]
        return { ...e, inicio: dias[0], fim: dias[dias.length - 1], hora }
      })
      .filter((e) => e.inicio)
      .filter((e) =>
        filtro === 'ativos'
          ? e.campo_etapa !== 'encerrado'
          : e.campo_etapa === 'encerrado'
      )
      // encerrados: os mais recentes primeiro; ativos: o mais próximo primeiro.
      // Ativo já passado e não encerrado fica no topo — é pendência.
      .sort((a, b) =>
        filtro === 'ativos'
          ? a.inicio.localeCompare(b.inicio) || (a.hora ?? '').localeCompare(b.hora ?? '')
          : b.inicio.localeCompare(a.inicio)
      )
      .slice(0, filtro === 'encerrados' ? 60 : undefined)

    const porDia = new Map<string, typeof lista>()
    for (const e of lista) {
      const chave = filtro === 'ativos' && e.fim < hoje ? 'atrasados' : e.inicio
      porDia.set(chave, [...(porDia.get(chave) ?? []), e])
    }
    return Array.from(porDia.entries()).sort(([a], [b]) =>
      a === 'atrasados' ? -1 : b === 'atrasados' ? 1 : filtro === 'ativos' ? a.localeCompare(b) : b.localeCompare(a)
    )
  }, [data, filtro])

  const hoje = hojeLocal()

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle lead="LOGÍSTICA">Rua</PageTitle>

      <div className="mb-5 flex rounded-full border border-[var(--pg-border)] p-0.5 sm:inline-flex">
        {(['ativos', 'encerrados'] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`flex-1 rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] ${
              filtro === f ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]' : 'text-neutral-500'
            }`}
          >
            {f === 'ativos' ? 'A FAZER' : 'ENCERRADOS'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !grupos.length ? (
        <EmptyState>
          {filtro === 'ativos'
            ? 'Nenhum evento com contrato assinado esperando a rua.'
            : 'Nenhum evento encerrado ainda.'}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {grupos.map(([chave, eventos]) => (
            <Card
              key={chave}
              title={
                chave === 'atrasados'
                  ? '⚠️ Já aconteceram e não foram encerrados'
                  : `${chave === hoje ? 'HOJE · ' : ''}${DIA_SEMANA[new Date(chave + 'T12:00').getDay()]} ${formatDiaMes(chave)}`
              }
            >
              <div className="flex flex-col divide-y divide-[var(--pg-border)]">
                {eventos.map((e) => (
                  <Link
                    key={e.id}
                    to={`/eventos/${e.id}/campo`}
                    className="flex items-center gap-3 py-3 transition-colors hover:bg-[var(--pg-border)]/30"
                  >
                    <div className="w-12 shrink-0 font-mono text-xs text-neutral-500">
                      {e.hora?.slice(0, 5) ?? '—'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{e.nome}</div>
                      <div className="truncate text-[11px] text-neutral-500">
                        {nomeCliente(e)} · {e.pax ?? '—'} pax
                        {e.inicio !== e.fim && ` · até ${formatDiaMes(e.fim)}`}
                      </div>
                    </div>
                    <Badge tone={tomEtapa(e.campo_etapa)}>
                      {e.campo_etapa
                        ? CAMPO_ETAPAS.find((x) => x.key === e.campo_etapa)!.label
                        : 'Na casa'}
                    </Badge>
                  </Link>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
