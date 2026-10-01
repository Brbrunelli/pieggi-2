// ============================================================
// CHECKLIST DA RUA — com evidência
//
// A call: fotos chegam fora de padrão, mesa sem registro, touca
// esquecida. Aqui o item que exige foto SÓ se marca tirando a foto —
// não existe "marquei e mando depois".
//
// A lista é derivada (modelos ativos × serviços do dia); o banco guarda
// só o que foi feito (`event_checks`). Desmarcar apaga a linha.
// ============================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { horaCurta } from '@/lib/campo'
import { Badge, Button, Card } from '@/components/ui'
import { FotoBotao, FotoMiniatura } from './Foto'
import { invalidarCampo } from './EtapasCampo'
import {
  MOMENTO_LABEL,
  type ChecklistMomento,
  type ChecklistTemplate,
  type EventCheck,
  type ServiceType,
} from '@/types'

const MOMENTOS: ChecklistMomento[] = ['saida', 'montagem', 'reposicao', 'desmontagem']

type CheckComNome = EventCheck & { profiles: { nome: string } | null }

export default function Checklist({
  eventId,
  dia,
  tiposDoDia,
}: {
  eventId: string
  dia: string
  tiposDoDia: ServiceType[]
}) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { conferirCampo } = usePermissoes()

  const { data: modelos } = useQuery({
    queryKey: ['checklist-modelos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('ativo', true)
        .order('ordem')
      if (error) throw error
      return data as ChecklistTemplate[]
    },
  })

  const { data: feitos } = useQuery({
    queryKey: ['campo-checks', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_checks')
        .select('*, profiles:feito_por (nome)')
        .eq('event_id', eventId)
      if (error) throw error
      return data as unknown as CheckComNome[]
    },
  })

  const marcar = useMutation({
    mutationFn: async ({ t, foto }: { t: ChecklistTemplate; foto: string | null }) => {
      const { error } = await supabase.from('event_checks').upsert(
        {
          event_id: eventId,
          template_id: t.id,
          dia,
          foto_path: foto,
          feito_por: session?.user.id,
          feito_em: new Date().toISOString(),
        },
        { onConflict: 'event_id,template_id,dia' }
      )
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['campo-checks', eventId] })
      await invalidarCampo(qc, eventId)
    },
  })

  const desmarcar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('event_checks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['campo-checks', eventId] })
      await invalidarCampo(qc, eventId)
    },
  })

  const doDia = (modelos ?? []).filter(
    (t) => !t.service_types?.length || t.service_types.some((s) => tiposDoDia.includes(s))
  )
  const feitoDe = (t: ChecklistTemplate) =>
    (feitos ?? []).find((f) => f.template_id === t.id && f.dia === dia)
  const completo = (t: ChecklistTemplate) => {
    const f = feitoDe(t)
    return Boolean(f && (!t.exige_foto || f.foto_path))
  }
  const obrigatorios = doDia.filter((t) => t.obrigatorio)
  const ok = obrigatorios.filter(completo).length
  const erro = (marcar.error ?? desmarcar.error) as Error | null

  return (
    <Card
      title="Checklist"
      actions={
        <Badge tone={ok === obrigatorios.length ? 'green' : ok ? 'amber' : 'neutral'}>
          {ok}/{obrigatorios.length} obrigatório
        </Badge>
      }
    >
      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">🛑 {erro.message}</p>}
      <div className="flex flex-col gap-5">
        {MOMENTOS.map((m) => {
          const itens = doDia.filter((t) => t.momento === m)
          if (!itens.length) return null
          return (
            <div key={m}>
              <div className="pg-key mb-2">{MOMENTO_LABEL[m]}</div>
              <div className="flex flex-col divide-y divide-[var(--pg-border)]">
                {itens.map((t) => {
                  const f = feitoDe(t)
                  const feito = completo(t)
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                      {!t.exige_foto ? (
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 accent-green-700"
                          checked={Boolean(f)}
                          disabled={!conferirCampo || marcar.isPending || desmarcar.isPending}
                          onChange={() =>
                            f ? desmarcar.mutate(f.id) : marcar.mutate({ t, foto: null })
                          }
                        />
                      ) : (
                        <span
                          className={`grid h-5 w-5 shrink-0 place-items-center rounded text-[11px] ${
                            feito ? 'bg-green-700 text-white' : 'border border-[var(--pg-border)]'
                          }`}
                        >
                          {feito ? '✓' : ''}
                        </span>
                      )}
                      <div className="min-w-[180px] flex-1">
                        <div className={`text-sm ${feito ? 'text-neutral-500' : ''}`}>
                          {t.texto}
                          {!t.obrigatorio && <span className="ml-1 text-[11px] text-neutral-400">(opcional)</span>}
                        </div>
                        {t.detalhe && <div className="text-[11px] text-neutral-500">{t.detalhe}</div>}
                        {f && (
                          <div className="text-[11px] text-neutral-400">
                            {f.profiles?.nome ?? 'equipe'} · {horaCurta(f.feito_em)}
                          </div>
                        )}
                      </div>
                      {f?.foto_path && <FotoMiniatura path={f.foto_path} />}
                      {conferirCampo && (t.exige_foto || f) && (
                        <FotoBotao
                          eventId={eventId}
                          pasta="checklist"
                          rotulo={f?.foto_path ? 'Refazer' : t.exige_foto ? 'Foto' : 'Anexar foto'}
                          onFoto={(path) => marcar.mutateAsync({ t, foto: path })}
                        />
                      )}
                      {conferirCampo && t.exige_foto && f && (
                        <Button variant="ghost" className="!px-2 !py-1" onClick={() => desmarcar.mutate(f.id)}>
                          Desfazer
                        </Button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {!conferirCampo && (
        <p className="mt-3 text-xs text-neutral-400">Só a expedição, a logística e o admin marcam o checklist.</p>
      )}
    </Card>
  )
}
