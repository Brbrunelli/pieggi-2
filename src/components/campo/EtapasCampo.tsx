// ============================================================
// ETAPAS DA RUA — onde o evento está e o que falta para avançar
//
// A lista "falta para avançar" vem do BANCO (campo_pendencias), a mesma
// função que campo_avancar usa para recusar. A tela não tem cópia da
// regra: se ela diz que pode, o banco aceita; se o banco recusa, a tela
// já estava mostrando por quê.
// ============================================================

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, Input } from '@/components/ui'
import { CAMPO_ETAPAS, proximaEtapaCampo, type CampoEtapa } from '@/types'

export function invalidarCampo(qc: ReturnType<typeof useQueryClient>, eventId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['campo-pendencias', eventId] }),
    qc.invalidateQueries({ queryKey: ['campo-evento', eventId] }),
    qc.invalidateQueries({ queryKey: ['esteira', eventId] }),
  ])
}

export default function EtapasCampo({
  eventId,
  etapa,
}: {
  eventId: string
  etapa: CampoEtapa | null
}) {
  const qc = useQueryClient()
  const { conferirCampo, escalar, ehAdmin } = usePermissoes()
  const proxima = proximaEtapaCampo(etapa)
  const infoProxima = CAMPO_ETAPAS.find((e) => e.key === proxima)
  const [voltando, setVoltando] = useState(false)
  const [motivo, setMotivo] = useState('')

  const { data: pendencias, isLoading } = useQuery({
    queryKey: ['campo-pendencias', eventId, proxima],
    enabled: Boolean(proxima),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('campo_pendencias', {
        p_event: eventId,
        p_para: proxima,
      })
      if (error) throw error
      return (data ?? []) as string[]
    },
  })

  const avancar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('campo_avancar', { p_event: eventId })
      if (error) throw error
    },
    onSuccess: () => invalidarCampo(qc, eventId),
  })

  const voltar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('campo_voltar', { p_event: eventId, p_motivo: motivo })
      if (error) throw error
    },
    onSuccess: async () => {
      setVoltando(false)
      setMotivo('')
      await invalidarCampo(qc, eventId)
    },
  })

  const idxAtual = etapa ? CAMPO_ETAPAS.findIndex((e) => e.key === etapa) : -1
  // encerrar é fechar a conta do evento — a cozinha não encerra
  const podeAvancar = proxima === 'encerrado' ? escalar : conferirCampo
  const livre = !isLoading && (pendencias ?? []).length === 0

  return (
    <Card
      title="Fase de campo"
      actions={
        etapa === 'encerrado' ? (
          <Badge tone="green">Encerrado</Badge>
        ) : (
          <Badge tone={etapa ? 'amber' : 'neutral'}>
            {etapa ? CAMPO_ETAPAS[idxAtual].label : 'Ainda na casa'}
          </Badge>
        )
      }
    >
      {/* trilha das 4 etapas */}
      <div className="mb-4 grid grid-cols-4 gap-1.5">
        {CAMPO_ETAPAS.map((e, i) => (
          <div
            key={e.key}
            className={
              'rounded-lg px-2 py-2 text-center text-[11px] font-semibold tracking-[0.06em] ' +
              (i <= idxAtual
                ? 'bg-green-700 text-white'
                : i === idxAtual + 1
                  ? 'border border-[var(--pg-text)]'
                  : 'border border-[var(--pg-border)] text-neutral-400')
            }
          >
            {i <= idxAtual ? '✓ ' : ''}
            {e.label.toUpperCase()}
          </div>
        ))}
      </div>

      {infoProxima && (
        <>
          <p className="mb-2 text-xs text-neutral-500">
            Para <b>{infoProxima.label.toLowerCase()}</b>: {infoProxima.exige}.
          </p>
          {isLoading ? (
            <p className="text-sm text-neutral-500">Conferindo…</p>
          ) : livre ? (
            <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
              ✅ Tudo conferido — pode avançar.
            </p>
          ) : (
            <ul className="mb-3 flex flex-col gap-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {pendencias!.map((p) => (
                <li key={p}>• {p}</li>
              ))}
            </ul>
          )}
          {avancar.isError && (
            <p className="mb-3 whitespace-pre-line rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              🛑 {(avancar.error as Error).message}
            </p>
          )}
          {podeAvancar ? (
            <Button
              className="w-full sm:w-auto"
              disabled={!livre || avancar.isPending}
              onClick={() => avancar.mutate()}
            >
              {avancar.isPending ? 'Salvando…' : infoProxima.acao}
            </Button>
          ) : (
            <p className="text-xs text-neutral-400">
              {proxima === 'encerrado'
                ? 'Só a logística ou o admin encerram o evento.'
                : 'Só a expedição, a logística e o admin movem a fase de campo.'}
            </p>
          )}
        </>
      )}

      {/* desfazer: só admin, sempre com motivo (fica no histórico) */}
      {ehAdmin && etapa && (
        <div className="mt-4 border-t border-[var(--pg-border)] pt-3">
          {!voltando ? (
            <Button variant="ghost" className="!px-0" onClick={() => setVoltando(true)}>
              ↩ Voltar uma etapa
            </Button>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Motivo (fica no histórico)"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </div>
              <Button
                variant="danger"
                disabled={!motivo.trim() || voltar.isPending}
                onClick={() => voltar.mutate()}
              >
                Voltar etapa
              </Button>
              <Button variant="ghost" onClick={() => setVoltando(false)}>
                Cancelar
              </Button>
            </div>
          )}
          {voltar.isError && (
            <p className="mt-2 text-sm text-red-700">🛑 {(voltar.error as Error).message}</p>
          )}
        </div>
      )}
    </Card>
  )
}
