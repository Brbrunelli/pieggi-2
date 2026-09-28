// ============================================================
// FLUXO COMERCIAL DA PROPOSTA
//   rascunho → enviada (PENDENTE do cliente) → aprovada | recusada
// A proposta continua EDITÁVEL enquanto não estiver aprovada.
// Ao aprovar, os serviços sobem na agenda do Google com a cor do
// tipo de cliente (tangerina = Externos · azul = StartSe).
// ============================================================

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Input, Textarea } from '@/components/ui'

export type StatusCliente = 'rascunho' | 'enviada' | 'aprovada' | 'recusada'

export const STATUS_LABEL: Record<StatusCliente, string> = {
  rascunho: '📝 Em montagem',
  enviada: '⏳ Pendente — aguardando o cliente',
  aprovada: '✅ Aprovada pelo cliente',
  recusada: '❌ Recusada',
}

const STATUS_TONE: Record<StatusCliente, 'neutral' | 'amber' | 'green' | 'red'> = {
  rascunho: 'neutral',
  enviada: 'amber',
  aprovada: 'green',
  recusada: 'red',
}

/** A proposta só trava para edição depois que o cliente aprova. */
export function propostaEditavel(status: StatusCliente | undefined): boolean {
  return status !== 'aprovada'
}

export interface PropostaComercial {
  id: string
  status_cliente: StatusCliente
  enviada_em: string | null
  respondida_em: string | null
  validade: string | null
  motivo_recusa: string | null
}

export function usePropostaComercial(eventId: string | undefined) {
  return useQuery({
    queryKey: ['proposta-comercial', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data } = await supabase
        .from('proposals')
        .select('id, status_cliente, enviada_em, respondida_em, validade, motivo_recusa, dados')
        .eq('event_id', eventId!)
        .order('versao', { ascending: false })
        .limit(5)
      // ignora o registro do Estúdio (versao 999 / modo estudio)
      const oficial = (data ?? []).find(
        (p) => (p.dados as { modo?: string })?.modo !== 'estudio'
      )
      return (oficial ?? null) as PropostaComercial | null
    },
  })
}

export function StatusBadge({ status }: { status: StatusCliente | undefined }) {
  const s = status ?? 'rascunho'
  return <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>
}

/**
 * Painel do ciclo comercial — fica na tela da Proposta.
 * `onAprovada` roda depois que o cliente aprova (avança a esteira).
 */
export function PainelComercial({
  eventId,
  podeEnviar,
  onAprovada,
}: {
  eventId: string
  podeEnviar: boolean
  onAprovada?: () => Promise<void> | void
}) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { data: proposta } = usePropostaComercial(eventId)

  const [validade, setValidade] = useState('')
  const [motivo, setMotivo] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [pedindoRecusa, setPedindoRecusa] = useState(false)

  const status = proposta?.status_cliente ?? 'rascunho'

  const { data: agenda } = useQuery({
    queryKey: ['agenda', eventId],
    queryFn: async () => {
      const { data } = await supabase
        .from('calendar_events')
        .select('id, titulo, html_link, color_id, inicio')
        .eq('event_id', eventId)
        .order('inicio')
      return data ?? []
    },
  })

  async function atualizar(campos: Record<string, unknown>) {
    if (!proposta) {
      setMsg('🛑 Salve a proposta antes (o rascunho ainda não existe).')
      return false
    }
    const { error } = await supabase.from('proposals').update(campos).eq('id', proposta.id)
    if (error) {
      setMsg(`🛑 ${error.message}`)
      return false
    }
    await qc.invalidateQueries({ queryKey: ['proposta-comercial', eventId] })
    return true
  }

  async function enviarAoCliente() {
    setOcupado(true)
    setMsg(null)
    const ok = await atualizar({
      status_cliente: 'enviada',
      enviada_em: new Date().toISOString(),
      respondida_em: null,
      motivo_recusa: null,
      validade: validade || null,
    })
    if (ok) {
      await supabase.from('events').update({ status: 'proposta_enviada' }).eq('id', eventId)
      await qc.invalidateQueries({ queryKey: ['evento', eventId] })
      setMsg('✅ Proposta marcada como ENVIADA — pendente da resposta do cliente. Continua editável.')
    }
    setOcupado(false)
  }

  async function clienteAprovou() {
    setOcupado(true)
    setMsg(null)
    const ok = await atualizar({
      status_cliente: 'aprovada',
      respondida_em: new Date().toISOString(),
      aprovado_por: session?.user.id,
      aprovado_em: new Date().toISOString(),
    })
    if (!ok) return setOcupado(false)

    await supabase.from('events').update({ status: 'proposta_aprovada' }).eq('id', eventId)
    await supabase.from('approvals').insert({
      event_id: eventId,
      fase: 'proposta',
      user_id: session?.user.id,
      obs: 'Aprovada pelo cliente',
    })
    await onAprovada?.()

    // sobe na agenda do Google
    setMsg('✅ Aprovada! Publicando na agenda…')
    try {
      const { data, error } = await supabase.functions.invoke('agenda', {
        body: { event_id: eventId, acao: 'sincronizar' },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      const n = (data?.resultados ?? []).length
      const conv = (data?.convidados ?? []).length
      await qc.invalidateQueries({ queryKey: ['agenda', eventId] })
      setMsg(
        `✅ Proposta aprovada e ${n} compromisso(s) publicados na agenda` +
          (conv ? ` com ${conv} convidado(s).` : '.') +
          (data?.aviso ? `\n⚠️ ${data.aviso}` : '')
      )
    } catch (e) {
      setMsg(
        `✅ Proposta aprovada. ⚠️ Agenda não sincronizou: ${
          e instanceof Error ? e.message : 'erro'
        } — verifique a Edge Function "agenda" (ver supabase/README.md).`
      )
    }
    await qc.invalidateQueries({ queryKey: ['evento', eventId] })
    setOcupado(false)
  }

  async function clienteRecusou() {
    setOcupado(true)
    setMsg(null)
    const ok = await atualizar({
      status_cliente: 'recusada',
      respondida_em: new Date().toISOString(),
      motivo_recusa: motivo || null,
    })
    if (ok) {
      // o card também sai do funil: recusa aqui e "Perdidos" no Kanban
      // são o mesmo fato — antes ficavam dessincronizados
      await supabase
        .from('events')
        .update({
          status: 'proposta_recusada',
          pipeline: 'perdido',
          motivo_perda: motivo || null,
        })
        .eq('id', eventId)
      await qc.invalidateQueries({ queryKey: ['evento', eventId] })
      await qc.invalidateQueries({ queryKey: ['eventos'] })
      setPedindoRecusa(false)
      setMotivo('')
      setMsg('Evento declinado. Use "Reabrir e enviar nova versão" quando quiser retomar.')
    }
    setOcupado(false)
  }

  /** Motivo + confirmação — usado tanto no rascunho quanto na proposta enviada. */
  function BlocoRecusa() {
    return (
      <div className="rounded-lg bg-neutral-50 p-3">
        <Textarea
          label="Motivo da recusa (opcional — vai para o funil como motivo da perda)"
          rows={2}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
        <div className="mt-2 flex gap-2">
          <Button variant="danger" onClick={clienteRecusou} disabled={ocupado}>
            Confirmar recusa
          </Button>
          <Button variant="ghost" onClick={() => setPedindoRecusa(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  async function reabrir() {
    setOcupado(true)
    setMsg(null)
    const eraAprovada = status === 'aprovada'
    const ok = await atualizar({
      status_cliente: 'rascunho',
      enviada_em: null,
      respondida_em: null,
      motivo_recusa: null,
    })
    if (ok) {
      // se estava em Perdidos, volta para o funil — senão o card fica preso
      // na zona de perdidos e parece que não dá para refazer a proposta
      const { data: ev } = await supabase
        .from('events')
        .select('pipeline')
        .eq('id', eventId)
        .maybeSingle()
      const patch: Record<string, unknown> = { status: 'proposta_em_montagem' }
      if (ev?.pipeline === 'perdido') {
        patch.pipeline = 'quente'
        patch.motivo_perda = null
      }
      await supabase.from('events').update(patch).eq('id', eventId)
      await qc.invalidateQueries({ queryKey: ['eventos'] })
      if (eraAprovada) {
        // some da agenda enquanto não for reaprovada
        try {
          await supabase.functions.invoke('agenda', {
            body: { event_id: eventId, acao: 'remover' },
          })
          await qc.invalidateQueries({ queryKey: ['agenda', eventId] })
        } catch {
          /* agenda pode não estar configurada */
        }
      }
      await qc.invalidateQueries({ queryKey: ['evento', eventId] })
      setMsg('Proposta reaberta para edição.')
    }
    setOcupado(false)
  }

  async function ressincronizarAgenda() {
    setOcupado(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('agenda', {
        body: { event_id: eventId, acao: 'sincronizar' },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      await qc.invalidateQueries({ queryKey: ['agenda', eventId] })
      setMsg(
        `✅ Agenda atualizada (${(data?.resultados ?? []).length} compromisso(s)).` +
          (data?.aviso ? `\n⚠️ ${data.aviso}` : '')
      )
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao sincronizar'}`)
    }
    setOcupado(false)
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          Situação comercial <StatusBadge status={status} />
        </span>
      }
    >
      {status === 'rascunho' && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            A proposta está em montagem. Ao enviar, ela fica <b>pendente</b> até o cliente responder —
            e continua editável nesse período.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Validade (opcional)"
              type="date"
              className="!w-44"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
            />
            <Button onClick={enviarAoCliente} disabled={ocupado || !podeEnviar}>
              📤 Marcar como enviada ao cliente
            </Button>
            {/* Dá para declinar sem ter enviado: cliente que some, some antes
                de a proposta virar "enviada". Sem isto o evento ficava preso. */}
            <Button variant="secondary" onClick={() => setPedindoRecusa(true)} disabled={ocupado}>
              ❌ Cliente recusou / declinar
            </Button>
          </div>
          {!podeEnviar && (
            <p className="text-xs text-amber-700">
              Resolva os itens críticos da conferência antes de enviar.
            </p>
          )}
          {pedindoRecusa && <BlocoRecusa />}
        </div>
      )}

      {status === 'enviada' && (
        <div className="space-y-3">
          <p className="text-sm text-amber-800">
            ⏳ <b>Pendente do cliente</b>
            {proposta?.enviada_em &&
              ` desde ${new Date(proposta.enviada_em).toLocaleDateString('pt-BR')}`}
            {proposta?.validade &&
              ` · validade ${new Date(proposta.validade + 'T12:00').toLocaleDateString('pt-BR')}`}
            . Você pode continuar ajustando e gerando novas versões do .pptx.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              className="!bg-green-700 hover:!bg-green-600"
              onClick={clienteAprovou}
              disabled={ocupado}
            >
              ✅ Cliente APROVOU
            </Button>
            <Button variant="secondary" onClick={() => setPedindoRecusa(true)} disabled={ocupado}>
              ❌ Cliente recusou
            </Button>
            <Button variant="ghost" onClick={reabrir} disabled={ocupado}>
              ↩ Voltar para montagem
            </Button>
          </div>
          {pedindoRecusa && <BlocoRecusa />}
        </div>
      )}

      {status === 'aprovada' && (
        <div className="space-y-3">
          <p className="text-sm text-green-800">
            ✅ Fechada com o cliente
            {proposta?.respondida_em &&
              ` em ${new Date(proposta.respondida_em).toLocaleDateString('pt-BR')}`}
            . A proposta está <b>travada para edição</b> — reabra se precisar renegociar.
          </p>

          {agenda && agenda.length > 0 && (
            <div className="rounded-lg border border-neutral-200 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                📅 Na agenda do Google
              </p>
              <ul className="space-y-1 text-sm">
                {agenda.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: a.color_id === '7' ? '#4285F4' : '#F4511E' }}
                      title={a.color_id === '7' ? 'Pavão (azul)' : 'Tangerina'}
                    />
                    <span className="flex-1">{a.titulo}</span>
                    {a.html_link && (
                      <a
                        href={a.html_link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 underline"
                      >
                        abrir
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={ressincronizarAgenda} disabled={ocupado}>
              🔄 Ressincronizar agenda
            </Button>
            <Button variant="ghost" onClick={reabrir} disabled={ocupado}>
              ↩ Reabrir para renegociar (remove da agenda)
            </Button>
          </div>
        </div>
      )}

      {status === 'recusada' && (
        <div className="space-y-3">
          <p className="text-sm text-red-800">
            ❌ Recusada pelo cliente
            {proposta?.motivo_recusa && ` — ${proposta.motivo_recusa}`}
          </p>
          <Button variant="secondary" onClick={reabrir} disabled={ocupado}>
            ↩ Reabrir e enviar nova versão
          </Button>
        </div>
      )}

      {msg && (
        <p className="mt-3 whitespace-pre-line rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>
      )}
    </Card>
  )
}
