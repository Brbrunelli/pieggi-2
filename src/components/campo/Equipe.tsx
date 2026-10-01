// ============================================================
// EQUIPE DO EVENTO — escala da Adriana
//
// Quem vai, que horas sai, quanto recebe e se apareceu. O custo da
// equipe é comparado com a verba (8% — mesma regra da página da
// Adriana na comanda): a call registrou a queda de 15% para 8%, e o
// sistema avisa no evento, não no fechamento do mês.
//
// Presença (presente/faltou) é o que libera o encerramento do evento —
// e é a base para pagar o freela.
//
// Contrato + ASO (0037): o seletor só deixa escalar quem está APTO
// naquele dia e livre (não escalado em outro evento no mesmo dia); os
// demais aparecem desabilitados com o motivo. Nome livre (fora do
// cadastro) continua possível — às vezes é o sobrinho da copeira que
// cobriu uma falta às 5h —, mas com aviso vermelho: ninguém verificou
// contrato nem ASO dessa pessoa.
//
// Voltar um cancelado/faltou para escalado ou confirmado passa pela MESMA
// checagem do escalar (apto no dia + sem conflito). Função vem da lista
// fixa (SeletorFuncao) para casar com as vagas da Escala. A saída
// sugerida é a da comanda aprovada (dias[].saida), a mesma da expedição.
// ============================================================

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input } from '@/components/ui'
import { formatBRL } from '@/engine'
import { invalidarCampo } from './EtapasCampo'
import SeletorFreela, { opcoesFreela } from '@/components/pessoas/SeletorFreela'
import { useExigirDocs, useFreelasComSituacao } from '@/components/pessoas/useFreelas'
import SeletorFuncao from '@/components/pessoas/SeletorFuncao'
import { funcaoCanonica, saidaOficial, STATUS_OCUPA, type EscaladoDia } from '@/engine/freelas'
import {
  STAFF_STATUS_LABEL,
  type EventStaff,
  type StaffStatus,
} from '@/types'

const vazio = { freelancer_id: '', nome: '', funcao: '', horario_fim: '', valor: '' }

/** "150,50" / "1.150,50" / "150.5" → número; vazio/inválido → null */
function numero(s: string): number | null {
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return s.trim() && Number.isFinite(n) ? n : null
}

export default function Equipe({
  eventId,
  dia,
  saidaSugerida,
}: {
  eventId: string
  dia: string
  /** servir −3h — só o recuo; vale a saída da comanda aprovada */
  saidaSugerida: string | null
}) {
  const qc = useQueryClient()
  const { verEquipe, escalar } = usePermissoes()
  const [form, setForm] = useState(vazio)
  // null = ainda não mexeu: segue a saída oficial quando ela carregar
  const [saidaDigitada, setSaidaDigitada] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  // a saída da comanda aprovada mais nova — a mesma do checklist de expedição
  const { data: snapshot } = useQuery({
    queryKey: ['equipe-comanda', eventId],
    enabled: verEquipe,
    queryFn: async () => {
      const { data } = await supabase
        .from('production_orders')
        .select('versao, snapshot')
        .eq('event_id', eventId)
        .not('aprovado_em', 'is', null)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()
      return ((data as { snapshot: Parameters<typeof saidaOficial>[0] } | null)?.snapshot ?? null)
    },
  })
  const oficial = saidaOficial(snapshot, dia, null)
  const saidaPadrao = oficial.hora ?? saidaSugerida ?? ''
  const horarioSaida = saidaDigitada ?? saidaPadrao

  const { data: escala } = useQuery({
    queryKey: ['campo-equipe', eventId],
    enabled: verEquipe,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_staff')
        .select('*')
        .eq('event_id', eventId)
        .order('horario_saida', { nullsFirst: false })
      if (error) throw error
      return data as EventStaff[]
    },
  })

  const { data: custo } = useQuery({
    queryKey: ['campo-equipe-custo', eventId],
    enabled: verEquipe,
    queryFn: async () => {
      const { data } = await supabase
        .from('event_staff_custo')
        .select('custo, pessoas, verba')
        .eq('event_id', eventId)
        .maybeSingle()
      return data as { custo: number; pessoas: number; verba: number | null } | null
    },
  })

  const { freelas, situacao } = useFreelasComSituacao(verEquipe)
  const exigirDocs = useExigirDocs(verEquipe)

  // todo mundo escalado NESTE DIA, em qualquer evento — para o conflito
  const { data: ocupados } = useQuery({
    queryKey: ['escala-dia', dia],
    enabled: escalar,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_staff')
        .select('id, event_id, freelancer_id, dia, status, events(nome)')
        .eq('dia', dia)
      if (error) throw error
      return (data as unknown as (EscaladoDia & { events: { nome: string } | null })[]).map((s) => ({
        ...s,
        evento_nome: s.event_id === eventId ? 'este evento' : (s.events?.nome ?? null),
      }))
    },
  })

  const opcoes = opcoesFreela(freelas, situacao, ocupados ?? [], dia, exigirDocs)

  async function atualizar() {
    await qc.invalidateQueries({ queryKey: ['campo-equipe', eventId] })
    await qc.invalidateQueries({ queryKey: ['campo-equipe-custo', eventId] })
    await qc.invalidateQueries({ queryKey: ['escala-dia', dia] })
    await qc.invalidateQueries({ queryKey: ['escala-semana'] })
    await invalidarCampo(qc, eventId)
  }

  const adicionar = useMutation({
    mutationFn: async () => {
      const op = opcoes.find((x) => x.freela.id === form.freelancer_id)
      const f = op?.freela
      if (op && !op.pode) throw new Error(`${op.freela.nome} não pode ser escalado neste dia: ${op.motivo}.`)
      const nome = f?.nome ?? form.nome.trim()
      if (!nome) throw new Error('Escolha um freelancer ou escreva o nome.')
      const { error } = await supabase.from('event_staff').insert({
        event_id: eventId,
        freelancer_id: f?.id ?? null,
        nome,
        funcao: funcaoCanonica(form.funcao || f?.funcao_padrao || null) ?? (form.funcao || f?.funcao_padrao || null),
        dia,
        horario_saida: horarioSaida || null,
        horario_fim: form.horario_fim || null,
        valor: form.valor.trim() ? valorOk(form.valor) : (f?.valor_padrao ?? null),
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setForm(vazio)
      setMsg(null)
      await atualizar()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  function valorOk(s: string): number {
    const n = numero(s)
    if (n == null || n < 0) throw new Error(`Valor "${s}" não é um número (ex.: 180 ou 150,50).`)
    return n
  }

  const mudar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<EventStaff> }) => {
      // reativar (cancelado/faltou → escalado/confirmado/presente) passa pela mesma regra do escalar
      const linha = (escala ?? []).find((s) => s.id === id)
      if (linha && campos.status && STATUS_OCUPA.includes(campos.status) && !STATUS_OCUPA.includes(linha.status)) {
        if (linha.freelancer_id) {
          const freela = freelas.find((x) => x.id === linha.freelancer_id)
          if (freela) {
            const outros = (ocupados ?? []).filter((o) => o.id !== id)
            const op = opcoesFreela([freela], situacao, outros, dia, exigirDocs)[0]
            if (!op.pode) throw new Error(`${freela.nome} não pode voltar para a escala: ${op.motivo}.`)
          }
        } else if (!confirm(`${linha.nome} está fora do cadastro (sem contrato/ASO verificado). Reativar mesmo assim?`)) {
          return
        }
      }
      const { error } = await supabase.from('event_staff').update(campos).eq('id', id)
      if (error) throw error
    },
    onSuccess: atualizar,
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('event_staff').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: atualizar,
  })

  if (!verEquipe)
    return (
      <Card title="Equipe">
        <p className="text-sm text-neutral-500">A escala é da logística, do admin e do financeiro.</p>
      </Card>
    )

  const doDia = (escala ?? []).filter((s) => s.dia === dia)
  const estourou = custo?.verba != null && Number(custo.custo) > Number(custo.verba)

  return (
    <Card
      title="Equipe"
      actions={
        custo && (
          <Badge tone={estourou ? 'red' : 'green'}>
            {formatBRL(Number(custo.custo))}
            {custo.verba != null && ` / verba ${formatBRL(Number(custo.verba))}`}
          </Badge>
        )
      }
    >
      {estourou && (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ O custo da equipe passou da verba de 8% deste evento.
        </p>
      )}
      {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {!doDia.length ? (
        <EmptyState>Ninguém escalado para este dia.</EmptyState>
      ) : (
        <div className="flex flex-col divide-y divide-[var(--pg-border)]">
          {doDia.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
              <div className="min-w-[150px] flex-1">
                <div className="text-sm font-medium">
                  {s.nome}
                  {!['cancelado', 'faltou'].includes(s.status) &&
                    (s.freelancer_id ? (
                      !situacao(s.freelancer_id, dia).apto && (
                        <span className="ml-2 text-[11px] font-semibold text-red-700">
                          🛑 {situacao(s.freelancer_id, dia).motivos.join(' · ')} — trocar
                        </span>
                      )
                    ) : (
                      <span className="ml-2 text-[11px] font-semibold text-red-700">sem contrato/ASO verificado</span>
                    ))}
                </div>
                <div className="text-[11px] text-neutral-500">
                  {s.funcao ?? 'sem função'}
                  {s.horario_saida && ` · sai ${s.horario_saida.slice(0, 5)}`}
                  {s.horario_fim && ` · até ${s.horario_fim.slice(0, 5)}`}
                  {s.valor != null && ` · ${formatBRL(Number(s.valor))}`}
                </div>
              </div>
              <select
                className="rounded-lg border border-[var(--pg-border)] bg-transparent px-2 py-1.5 text-xs"
                value={s.status}
                disabled={!escalar}
                onChange={(e) => mudar.mutate({ id: s.id, campos: { status: e.target.value as StaffStatus } })}
              >
                {Object.entries(STAFF_STATUS_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {s.status === 'presente' && (
                <span className="flex gap-0.5" title="Avaliação (1 a 5)">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      disabled={!escalar}
                      className={`text-base ${(s.avaliacao ?? 0) >= n ? 'text-amber-500' : 'text-neutral-300'}`}
                      onClick={() => mudar.mutate({ id: s.id, campos: { avaliacao: n } })}
                    >
                      ★
                    </button>
                  ))}
                </span>
              )}
              {escalar && (
                <Button variant="ghost" className="!px-2 !py-1" onClick={() => remover.mutate(s.id)}>
                  Remover
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {escalar && (
        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[var(--pg-border)] pt-4 md:grid-cols-[1.4fr_1fr_1fr_90px_90px_100px_auto] md:items-end">
          <div className="col-span-2 md:col-span-1">
            <SeletorFreela
              opcoes={opcoes}
              value={form.freelancer_id}
              vazio="— fora do cadastro —"
              onChange={(f) =>
                setForm({
                  ...form,
                  freelancer_id: f?.id ?? '',
                  funcao: f?.funcao_padrao ?? form.funcao,
                  valor: f?.valor_padrao != null ? String(f.valor_padrao) : form.valor,
                })
              }
            />
          </div>
          <Input
            label="ou nome"
            value={form.nome}
            disabled={Boolean(form.freelancer_id)}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
          />
          <SeletorFuncao value={form.funcao} onChange={(funcao) => setForm({ ...form, funcao })} />
          <Input
            label={oficial.fonte === 'comanda' ? 'Saída (comanda)' : 'Saída'}
            type="time"
            value={horarioSaida}
            onChange={(e) => setSaidaDigitada(e.target.value)}
          />
          <Input
            label="Até"
            type="time"
            value={form.horario_fim}
            onChange={(e) => setForm({ ...form, horario_fim: e.target.value })}
          />
          <Input
            label="Valor (R$)"
            inputMode="decimal"
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
          />
          <Button variant="secondary" disabled={adicionar.isPending} onClick={() => adicionar.mutate()}>
            Escalar
          </Button>
          {!form.freelancer_id && form.nome.trim() && (
            <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700 md:col-span-7 dark:bg-red-900/20">
              🛑 {form.nome.trim()} está fora do cadastro: sem contrato/ASO verificado. Só escale assim em emergência —
              e cadastre em Freelancers com os documentos depois.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
