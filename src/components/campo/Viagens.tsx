// ============================================================
// TRANSPORTE DO EVENTO — a Adriana programa, o motorista recebe
//
// A viagem é o horário OFICIAL de saída: substitui a estimativa
// "servir −3h, conferir Adriana" que ia impressa na comanda. Os avisos
// (endereço mudou, horário mudou, chegada em cima da hora) vêm da view
// do banco — os mesmos que o motorista vê no celular.
// ============================================================

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, Select } from '@/components/ui'
import { formatDiaMes } from '@/engine'
import {
  alertasViagem,
  horaBR,
  VIAGEM_STATUS_LABEL,
  VIAGEM_TIPO_LABEL,
  type EventService,
  type Viagem,
  type ViagemTipo,
} from '@/types'

type ServicoHora = Pick<EventService, 'dia' | 'hora_inicio' | 'hora_fim'>

/** "HH:MM" ± minutos, sem passar da meia-noite para o dia anterior */
function deslocar(hora: string | null, minutos: number): string {
  if (!hora) return ''
  const [h, m] = hora.split(':').map(Number)
  const t = Math.max(0, Math.min(1439, h * 60 + m + minutos))
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function useMotoristas() {
  return useQuery({
    queryKey: ['motoristas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, nome, email')
        .eq('role', 'motorista')
        .eq('ativo', true)
        .order('nome')
      if (error) throw error
      return data as { id: string; nome: string | null; email: string | null }[]
    },
  })
}

/** Regras de horário em rule_params (editáveis em Parâmetros de regra). */
export function useRegrasHorario() {
  return useQuery({
    queryKey: ['regras-horario'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rule_params')
        .select('chave, valor')
        .in('chave', ['saida_horas_antes', 'chegada_min_antes'])
      const m = new Map((data ?? []).map((r) => [r.chave, Number(r.valor)]))
      return {
        saidaMin: (m.get('saida_horas_antes') ?? 3) * 60,
        chegadaMin: m.get('chegada_min_antes') ?? 60,
      }
    },
  })
}

export function ListaAlertas({ v }: { v: Viagem }) {
  const alertas = alertasViagem(v)
  if (!alertas.length) return null
  return (
    <ul className="mt-2 flex flex-col gap-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
      {alertas.map((a) => (
        <li key={a}>⚠️ {a}</li>
      ))}
    </ul>
  )
}

export default function Viagens({ eventId, servicos }: { eventId: string; servicos: ServicoHora[] }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { programarViagem } = usePermissoes()
  const { data: motoristas } = useMotoristas()
  const { data: regras } = useRegrasHorario()
  const dias = Array.from(new Set(servicos.map((s) => s.dia))).sort()
  const [msg, setMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    dia: dias[0] ?? '',
    tipo: 'entrega' as ViagemTipo,
    motorista_id: '',
    veiculo: '',
    saida: '',
    chegada: '',
    contato_nome: '',
    contato_telefone: '',
    obs: '',
  })

  const { data: viagens } = useQuery({
    queryKey: ['viagens-evento', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viagens_conferencia')
        .select('*')
        .eq('event_id', eventId)
        .order('dia')
        .order('saida_prevista')
      if (error) throw error
      return data as Viagem[]
    },
  })

  /** sugere saída e chegada a partir do serviço do dia */
  function sugerir(dia: string, tipo: ViagemTipo) {
    const doDia = servicos.filter((s) => s.dia === dia)
    const inicio = doDia.map((s) => s.hora_inicio).filter(Boolean).sort()[0] ?? null
    const fim = doDia.map((s) => s.hora_fim).filter(Boolean).sort().slice(-1)[0] ?? null
    if (tipo === 'entrega')
      return {
        saida: deslocar(inicio, -(regras?.saidaMin ?? 180)),
        chegada: deslocar(inicio, -(regras?.chegadaMin ?? 60)),
      }
    return { saida: deslocar(fim, -60), chegada: deslocar(fim, 0) }
  }

  async function atualizar() {
    await qc.invalidateQueries({ queryKey: ['viagens-evento', eventId] })
    await qc.invalidateQueries({ queryKey: ['viagens-dia'] })
    await qc.invalidateQueries({ queryKey: ['producao-viagens', eventId] })
  }

  const programar = useMutation({
    mutationFn: async () => {
      if (!form.dia || !form.saida) throw new Error('Dia e horário de saída são obrigatórios.')
      if (!form.motorista_id) throw new Error('Escolha o motorista.')
      const { error } = await supabase.from('viagens').insert({
        event_id: eventId,
        dia: form.dia,
        tipo: form.tipo,
        motorista_id: form.motorista_id,
        veiculo: form.veiculo || null,
        saida_prevista: form.saida,
        chegada_prevista: form.chegada || null,
        contato_nome: form.contato_nome || null,
        contato_telefone: form.contato_telefone || null,
        obs: form.obs || null,
        created_by: session?.user.id,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setMsg('✅ Viagem programada — o motorista já vê no celular.')
      await atualizar()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const reconfirmar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('viagem_reconfirmar', { p_viagem: id })
      if (error) throw error
    },
    onSuccess: atualizar,
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viagens').update({ status: 'cancelada' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: atualizar,
  })

  const ativas = (viagens ?? []).filter((v) => v.status !== 'cancelada')
  const diasSemEntrega = dias.filter((d) => !ativas.some((v) => v.dia === d && v.tipo === 'entrega'))

  return (
    <Card
      title="Transporte"
      actions={
        diasSemEntrega.length ? (
          <Badge tone="red">{diasSemEntrega.length} dia(s) sem entrega</Badge>
        ) : (
          <Badge tone="green">entregas programadas</Badge>
        )
      }
    >
      {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {!ativas.length ? (
        <EmptyState>Nenhuma viagem programada.</EmptyState>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--pg-border)]">
          {ativas.map((v) => (
            <div key={v.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={v.tipo === 'entrega' ? 'blue' : 'neutral'}>{VIAGEM_TIPO_LABEL[v.tipo]}</Badge>
                <span className="text-sm font-semibold">
                  {formatDiaMes(v.dia)} · sai {horaBR(v.saida_prevista)}
                  {v.chegada_prevista && ` · chega ${horaBR(v.chegada_prevista)}`}
                </span>
                <span className="text-xs text-neutral-500">
                  serviço {horaBR(v.hora_servico_atual)} · {v.motorista_nome ?? 'sem motorista'}
                  {v.veiculo && ` · ${v.veiculo}`}
                </span>
                <Badge tone={v.status === 'concluida' ? 'green' : v.status === 'programada' ? 'neutral' : 'amber'}>
                  {VIAGEM_STATUS_LABEL[v.status]}
                </Badge>
              </div>
              <ListaAlertas v={v} />
              {programarViagem && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(v.endereco_mudou || v.horario_mudou) && (
                    <Button
                      variant="secondary"
                      className="!px-3 !py-1.5"
                      disabled={reconfirmar.isPending}
                      title="Conferi a mudança e a viagem continua valendo"
                      onClick={() => reconfirmar.mutate(v.id)}
                    >
                      Conferi — manter viagem
                    </Button>
                  )}
                  {v.status === 'programada' && (
                    <Button variant="ghost" className="!px-2 !py-1" onClick={() => cancelar.mutate(v.id)}>
                      Cancelar viagem
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {programarViagem && dias.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[var(--pg-border)] pt-4 md:grid-cols-4">
          <Select
            label="Dia"
            value={form.dia}
            onChange={(e) => setForm({ ...form, dia: e.target.value, ...sugerir(e.target.value, form.tipo) })}
          >
            {dias.map((d) => (
              <option key={d} value={d}>
                {formatDiaMes(d)}
              </option>
            ))}
          </Select>
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={(e) => {
              const tipo = e.target.value as ViagemTipo
              setForm({ ...form, tipo, ...sugerir(form.dia, tipo) })
            }}
          >
            <option value="entrega">Entrega (ida)</option>
            <option value="recolhimento">Recolhimento (volta)</option>
          </Select>
          <Select
            label="Motorista"
            value={form.motorista_id}
            onChange={(e) => setForm({ ...form, motorista_id: e.target.value })}
          >
            <option value="">— escolher —</option>
            {(motoristas ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome || m.email}
              </option>
            ))}
          </Select>
          <Input label="Veículo" placeholder="Fiorino, placa…" value={form.veiculo} onChange={(e) => setForm({ ...form, veiculo: e.target.value })} />
          <Input label="Sai da casa" type="time" value={form.saida} onChange={(e) => setForm({ ...form, saida: e.target.value })} />
          <Input label="Chega no local" type="time" value={form.chegada} onChange={(e) => setForm({ ...form, chegada: e.target.value })} />
          <Input
            label="Contato no local"
            placeholder="padrão: contato do evento"
            value={form.contato_nome}
            onChange={(e) => setForm({ ...form, contato_nome: e.target.value })}
          />
          <Input
            label="Telefone"
            inputMode="tel"
            value={form.contato_telefone}
            onChange={(e) => setForm({ ...form, contato_telefone: e.target.value })}
          />
          <div className="col-span-2 md:col-span-3">
            <Input
              label="Instrução para o motorista"
              placeholder="doca, portaria, estacionamento, elevador de carga…"
              value={form.obs}
              onChange={(e) => setForm({ ...form, obs: e.target.value })}
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={programar.isPending}
              onClick={() => {
                // primeira vez: preenche a sugestão antes de gravar vazio
                if (!form.saida) return setForm({ ...form, ...sugerir(form.dia, form.tipo) })
                programar.mutate()
              }}
            >
              {form.saida ? 'Programar viagem' : 'Sugerir horários'}
            </Button>
          </div>
        </div>
      )}
      {programarViagem && (
        <p className="mt-2 text-[11px] text-neutral-400">
          Sugestão: sai {Math.round((regras?.saidaMin ?? 180) / 60)}h antes do serviço e chega{' '}
          {regras?.chegadaMin ?? 60} min antes (Parâmetros de regra). Confira e ajuste.
        </p>
      )}
    </Card>
  )
}
