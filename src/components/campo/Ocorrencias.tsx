// ============================================================
// OCORRÊNCIAS — o que deu errado no local, com foto
//
// Quebra, atraso, reclamação. Qualquer um registra (o comercial ouve a
// reclamação pelo telefone); a rua e o comercial resolvem. Alimenta o
// CS — ninguém liga para o cliente pedindo nota sem saber que o réchaud
// apagou no meio do almoço.
// ============================================================

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { horaCurta } from '@/lib/campo'
import { Badge, Button, Card, EmptyState, Input, Select, Textarea } from '@/components/ui'
import { FotoBotao, FotoMiniatura } from './Foto'
import { OCORRENCIA_LABEL, type EventOcorrencia, type OcorrenciaTipo } from '@/types'

export default function Ocorrencias({ eventId }: { eventId: string }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { conferirCampo, editarComercial } = usePermissoes()
  const podeResolver = conferirCampo || editarComercial
  const [form, setForm] = useState({ tipo: 'quebra' as OcorrenciaTipo, descricao: '', foto: null as string | null })
  const [resolvendo, setResolvendo] = useState<{ id: string; texto: string } | null>(null)

  const { data } = useQuery({
    queryKey: ['campo-ocorrencias', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_ocorrencias')
        .select('*')
        .eq('event_id', eventId)
        .order('registrado_em', { ascending: false })
      if (error) throw error
      return data as EventOcorrencia[]
    },
  })

  const registrar = useMutation({
    mutationFn: async () => {
      if (!form.descricao.trim()) throw new Error('Descreva o que aconteceu.')
      const { error } = await supabase.from('event_ocorrencias').insert({
        event_id: eventId,
        tipo: form.tipo,
        descricao: form.descricao.trim(),
        foto_path: form.foto,
        registrado_por: session?.user.id,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setForm({ tipo: 'quebra', descricao: '', foto: null })
      await qc.invalidateQueries({ queryKey: ['campo-ocorrencias', eventId] })
    },
  })

  const resolver = useMutation({
    mutationFn: async () => {
      if (!resolvendo) return
      const { error } = await supabase
        .from('event_ocorrencias')
        .update({ resolvida: true, resolucao: resolvendo.texto.trim() || null })
        .eq('id', resolvendo.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setResolvendo(null)
      await qc.invalidateQueries({ queryKey: ['campo-ocorrencias', eventId] })
    },
  })

  const abertas = (data ?? []).filter((o) => !o.resolvida).length
  const erro = (registrar.error ?? resolver.error) as Error | null

  return (
    <Card
      title="Ocorrências"
      actions={abertas ? <Badge tone="red">{abertas} aberta(s)</Badge> : <Badge tone="neutral">nenhuma aberta</Badge>}
    >
      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">🛑 {erro.message}</p>}

      {!data?.length ? (
        <EmptyState>Nada registrado.</EmptyState>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--pg-border)]">
          {data.map((o) => (
            <div key={o.id} className="flex flex-wrap items-start gap-3 py-2.5">
              {o.foto_path && <FotoMiniatura path={o.foto_path} />}
              <div className="min-w-[180px] flex-1">
                <div className="flex items-center gap-2">
                  <Badge tone={o.resolvida ? 'green' : 'red'}>{OCORRENCIA_LABEL[o.tipo]}</Badge>
                  <span className="text-[11px] text-neutral-400">{horaCurta(o.registrado_em)}</span>
                </div>
                <p className="mt-1 text-sm">{o.descricao}</p>
                {o.resolvida && o.resolucao && (
                  <p className="mt-1 text-xs text-green-800">✓ {o.resolucao}</p>
                )}
                {resolvendo?.id === o.id && (
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <div className="flex-1">
                      <Input
                        label="Como foi resolvido"
                        value={resolvendo.texto}
                        onChange={(e) => setResolvendo({ ...resolvendo, texto: e.target.value })}
                      />
                    </div>
                    <Button disabled={resolver.isPending} onClick={() => resolver.mutate()}>
                      Resolver
                    </Button>
                  </div>
                )}
              </div>
              {podeResolver && !o.resolvida && resolvendo?.id !== o.id && (
                <Button variant="ghost" className="!px-2 !py-1" onClick={() => setResolvendo({ id: o.id, texto: '' })}>
                  Resolver
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2 border-t border-[var(--pg-border)] pt-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_1fr]">
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value as OcorrenciaTipo })}
          >
            {Object.entries(OCORRENCIA_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Textarea
            label="O que aconteceu"
            rows={2}
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <FotoBotao eventId={eventId} pasta="ocorrencia" onFoto={(foto) => setForm({ ...form, foto })} />
          {form.foto && <FotoMiniatura path={form.foto} />}
          <Button className="ml-auto" disabled={registrar.isPending} onClick={() => registrar.mutate()}>
            Registrar ocorrência
          </Button>
        </div>
      </div>
    </Card>
  )
}
