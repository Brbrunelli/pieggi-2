// ============================================================
// BAIXA DA EQUIPE
//
// Checklist do que já ficou pronto dentro de uma fase. A linha existir em
// `station_progress` É o "pronto" — desmarcar apaga a linha. Não há update:
// quem marcou e quando é histórico, não campo editável.
//
// Quem marca: admin e equipe (producao/compras). O comercial vê e não mexe.
// ============================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Card } from '@/components/ui'

export type FaseBaixa = 'comandas' | 'plaquinhas'

/** Uma parte marcável da fase (uma estação de um dia, uma etapa de impressão). */
export interface ParteFase {
  /** identificador estável — muda se mudar, a baixa se perde */
  chave: string
  rotulo: string
}

export interface Baixa {
  id: string
  chave: string
  rotulo: string
  pronto_em: string
  pronto_por: string | null
  profiles: { nome: string } | null
}

export function useBaixas(eventId: string | undefined, fase: FaseBaixa) {
  return useQuery({
    queryKey: ['station-progress', eventId, fase],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('station_progress')
        .select('id, chave, rotulo, pronto_em, pronto_por, profiles:pronto_por (nome)')
        .eq('event_id', eventId!)
        .eq('fase', fase)
      if (error) throw error
      return (data ?? []) as unknown as Baixa[]
    },
  })
}

function horaCurta(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(
    d.getHours()
  ).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ChecklistPronto({
  eventId,
  fase,
  partes,
  titulo,
  ajuda,
}: {
  eventId: string
  fase: FaseBaixa
  partes: ParteFase[]
  titulo: string
  ajuda?: string
}) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { marcarPronto } = usePermissoes()
  const { data: baixas } = useBaixas(eventId, fase)

  const porChave = new Map((baixas ?? []).map((b) => [b.chave, b]))

  const alternar = useMutation({
    mutationFn: async (parte: ParteFase) => {
      const atual = porChave.get(parte.chave)
      if (atual) {
        const { error } = await supabase.from('station_progress').delete().eq('id', atual.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('station_progress').insert({
        event_id: eventId,
        fase,
        chave: parte.chave,
        rotulo: parte.rotulo,
        pronto_por: session?.user.id,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['station-progress', eventId, fase] }),
  })

  if (!partes.length) return null
  const feitas = partes.filter((p) => porChave.has(p.chave)).length

  return (
    <Card
      title={titulo}
      actions={
        <Badge tone={feitas === partes.length ? 'green' : feitas ? 'amber' : 'neutral'}>
          {feitas}/{partes.length} pronto
        </Badge>
      }
    >
      {ajuda && <p className="mb-3 text-xs text-neutral-500">{ajuda}</p>}
      {alternar.isError && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          🛑 {(alternar.error as Error).message}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {partes.map((p) => {
          const b = porChave.get(p.chave)
          return (
            <label
              key={p.chave}
              className={
                'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors duration-200 ' +
                (b ? 'bg-green-50/60 ' : '') +
                (marcarPronto ? 'cursor-pointer hover:bg-[var(--pg-border)]/30' : 'cursor-default')
              }
            >
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0 accent-green-700 disabled:opacity-40"
                checked={Boolean(b)}
                disabled={!marcarPronto || alternar.isPending}
                onChange={() => alternar.mutate(p)}
              />
              <span className={b ? 'flex-1 text-neutral-500 line-through' : 'flex-1'}>{p.rotulo}</span>
              {b && (
                <span className="shrink-0 text-[11px] text-neutral-400">
                  {b.profiles?.nome ?? 'equipe'} · {horaCurta(b.pronto_em)}
                </span>
              )}
            </label>
          )
        })}
      </div>
      {!marcarPronto && (
        <p className="mt-3 text-xs text-neutral-400">
          Só a equipe de produção e o admin dão baixa.
        </p>
      )}
    </Card>
  )
}
