// ============================================================
// CONFIRMAÇÃO DE ENDEREÇO — o que a rua precisa saber para chegar
//
// Endereço errado e doca desconhecida eram a principal causa de atraso.
// Confirmar agora exige as três respostas que o motorista e a equipe
// usam no local, e o nome de quem confirmou do lado do cliente:
//
//   1. endereço completo
//   2. andar / sala / auditório
//   3. como a carga entra (doca, portaria de serviço, elevador, horário)
//   4. COM QUEM foi confirmado
//
// Pode ser feito na venda (comercial) ou no pós-venda / logística. O
// endereço continua editável a qualquer momento — editar derruba a
// confirmação (no banco) e a mudança fica no histórico.
// ============================================================

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { horaCurta } from '@/lib/campo'
import { Badge, Button, Card, Input, Textarea } from '@/components/ui'

export interface EnderecoEvento {
  id: string
  endereco: string | null
  local_detalhe: string | null
  acesso_carga?: string | null
  endereco_confirmado: boolean
  endereco_confirmado_com?: string | null
  endereco_confirmado_em?: string | null
}

/** Perguntas que o comercial faz ao cliente — as mesmas em toda tela. */
export const PERGUNTAS_ENDERECO = [
  'Qual o endereço completo (número, bloco, torre)?',
  'Em que andar / sala / auditório será servido?',
  'Por onde a carga entra? Tem doca? Qual rua da doca? Precisa cadastrar placa/motorista antes?',
  'Tem elevador de carga? Horário permitido para carga e descarga?',
  'Com quem a equipe fala ao chegar (nome e telefone)?',
]

export default function ConfirmacaoEndereco({
  evento,
  compacto = false,
}: {
  evento: EnderecoEvento
  compacto?: boolean
}) {
  const qc = useQueryClient()
  const { editarComercial, escalar } = usePermissoes()
  const podeConfirmar = editarComercial || escalar
  const [aberto, setAberto] = useState(false)
  const [form, setForm] = useState({
    endereco: evento.endereco ?? '',
    local: evento.local_detalhe ?? '',
    acesso: evento.acesso_carga ?? '',
    com: '',
  })

  const { data: historico } = useQuery({
    queryKey: ['endereco-log', evento.id],
    enabled: !compacto,
    queryFn: async () => {
      const { data } = await supabase
        .from('event_endereco_log')
        .select('campo, de, para, criado_em, profiles:user_id (nome)')
        .eq('event_id', evento.id)
        .order('criado_em', { ascending: false })
        .limit(6)
      return (data ?? []) as unknown as {
        campo: string
        de: string | null
        para: string | null
        criado_em: string
        profiles: { nome: string } | null
      }[]
    },
  })

  const confirmar = useMutation({
    mutationFn: async () => {
      const faltam = [
        !form.endereco.trim() && 'endereço',
        !form.local.trim() && 'andar/sala',
        !form.acesso.trim() && 'como a carga entra',
        !form.com.trim() && 'com quem foi confirmado',
      ].filter(Boolean)
      if (faltam.length) throw new Error(`Falta: ${faltam.join(', ')}.`)
      const { error } = await supabase.rpc('confirmar_endereco', {
        p_event: evento.id,
        p_endereco: form.endereco,
        p_local: form.local,
        p_acesso: form.acesso,
        p_com: form.com,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setAberto(false)
      await qc.invalidateQueries()
    },
  })

  const semAcesso = evento.endereco_confirmado && !evento.acesso_carga?.trim()

  return (
    <Card
      title="Endereço e acesso"
      actions={
        evento.endereco_confirmado && !semAcesso ? (
          <Badge tone="green">confirmado</Badge>
        ) : semAcesso ? (
          <Badge tone="amber">confirmado sem acesso de carga</Badge>
        ) : (
          <Badge tone="red">a confirmar</Badge>
        )
      }
    >
      <div className="text-sm">
        <div className="font-medium">{evento.endereco || '— sem endereço —'}</div>
        <div className="text-neutral-600">{evento.local_detalhe || <i>andar/sala não informado</i>}</div>
        <div className="mt-1 text-neutral-600">
          <span className="pg-key mr-1">Acesso</span>
          {evento.acesso_carga || <i>como a carga entra não informado</i>}
        </div>
        {evento.endereco_confirmado && evento.endereco_confirmado_com && (
          <div className="mt-2 text-xs text-green-800">
            ✓ Confirmado com <b>{evento.endereco_confirmado_com}</b>
            {evento.endereco_confirmado_em && ` em ${horaCurta(evento.endereco_confirmado_em)}`}
          </div>
        )}
      </div>

      {podeConfirmar && !aberto && (
        <Button
          variant={evento.endereco_confirmado && !semAcesso ? 'ghost' : 'primary'}
          className={evento.endereco_confirmado && !semAcesso ? 'mt-3 !px-0' : 'mt-3'}
          onClick={() => {
            setForm({
              endereco: evento.endereco ?? '',
              local: evento.local_detalhe ?? '',
              acesso: evento.acesso_carga ?? '',
              com: '',
            })
            setAberto(true)
          }}
        >
          {evento.endereco_confirmado && !semAcesso ? 'Corrigir / reconfirmar' : 'Confirmar com o cliente'}
        </Button>
      )}

      {aberto && (
        <div className="mt-4 flex flex-col gap-3 border-t border-[var(--pg-border)] pt-4">
          <ul className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
            <li className="pg-key mb-1">Pergunte ao cliente</li>
            {PERGUNTAS_ENDERECO.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
          <Input label="Endereço completo" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          <Input
            label="Andar / sala / auditório / torre"
            value={form.local}
            onChange={(e) => setForm({ ...form, local: e.target.value })}
          />
          <Textarea
            label="Como a carga entra"
            rows={2}
            placeholder="Doca pela Rua X, nº 120 · portaria de serviço · elevador de carga até 8h · cadastrar placa 1 dia antes"
            value={form.acesso}
            onChange={(e) => setForm({ ...form, acesso: e.target.value })}
          />
          <Input
            label="Confirmado com (nome do cliente)"
            placeholder="ex.: Mariana, recepção do 12º"
            value={form.com}
            onChange={(e) => setForm({ ...form, com: e.target.value })}
          />
          {confirmar.isError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">🛑 {(confirmar.error as Error).message}</p>
          )}
          <div className="flex gap-2">
            <Button disabled={confirmar.isPending} onClick={() => confirmar.mutate()}>
              {confirmar.isPending ? 'Salvando…' : 'Confirmar endereço'}
            </Button>
            <Button variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {!compacto && Boolean(historico?.length) && (
        <div className="mt-4 border-t border-[var(--pg-border)] pt-3">
          <div className="pg-key mb-1">Mudanças</div>
          <ul className="flex flex-col gap-1 text-[11px] text-neutral-500">
            {historico!.map((h, i) => (
              <li key={i}>
                {horaCurta(h.criado_em)} · {h.profiles?.nome ?? 'sistema'} mudou <b>{h.campo}</b>: “{h.de ?? '—'}” → “
                {h.para ?? '—'}”
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
