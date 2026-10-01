// ============================================================
// ROTAS DO DIA — o quadro da Adriana
//
// Uma data, a rota de cada motorista: entregas, recolhimentos e
// retiradas em fornecedor, na ordem do horário. O quadro deixa à vista,
// antes de acontecer:
//
//   1. evento do dia SEM entrega programada;
//   2. retirada que a comanda pede e ninguém foi buscar;
//   3. o mesmo motorista em duas paradas que se sobrepõem;
//   4. parada cujo endereço/horário mudou depois de programada.
// ============================================================

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Textarea } from '@/components/ui'
import { ListaAlertas, useMotoristas } from '@/components/campo/Viagens'
import EnderecosAConfirmar from '@/components/EnderecosAConfirmar'
import { useFornecedores } from '@/pages/compras/Fornecedores'
import { formatDiaMes } from '@/engine'
import {
  normalizarChave,
  retiradasDaComanda,
  type LinhaFornecedorComanda,
  type RetiradaSugerida,
} from '@/engine/campo'
import {
  alertasViagem,
  horaBR,
  VIAGEM_STATUS_LABEL,
  VIAGEM_TIPO_LABEL,
  type ItemRetirada,
  type Viagem,
  type ViagemTipo,
} from '@/types'
import { hojeLocal, isoLocal } from '@/engine/datas'

function minutos(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Janela que a parada ocupa o motorista: da saída até a chegada (ou +1h). */
function janela(v: Viagem): [number, number] {
  const ini = minutos(v.saida_prevista)!
  const fim = minutos(v.chegada_prevista) ?? ini + 60
  return [ini, Math.max(fim, ini + 30)]
}

function maisUmDia(iso: string): string {
  const d = new Date(iso + 'T12:00')
  d.setDate(d.getDate() + 1)
  return isoLocal(d)
}

/** "120 un — Pão de batata (Convenção X)" ⇄ ItemRetirada */
function itensParaTexto(itens: ItemRetirada[]): string {
  return itens.map((i) => `${i.qtd} — ${i.descricao}${i.evento ? ` (${i.evento})` : ''}`).join('\n')
}
function textoParaItens(t: string): ItemRetirada[] {
  return t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [qtd, ...resto] = l.split(' — ')
      return resto.length ? { qtd: qtd.trim(), descricao: resto.join(' — ').trim() } : { qtd: '', descricao: l }
    })
}

interface EventoDoDia {
  id: string
  nome: string
  hora: string | null
  confirmado: boolean
}

const formVazio = {
  tipo: 'retirada' as ViagemTipo,
  motorista_id: '',
  event_id: '',
  fornecedor_id: '',
  saida: '',
  chegada: '',
  itens: '',
  obs: '',
}

export default function Transporte() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { programarViagem } = usePermissoes()
  const { data: motoristas } = useMotoristas()
  const { data: fornecedores } = useFornecedores()
  // ?dia=AAAA-MM-DD — o pedido de compra de retirada abre o quadro já no dia certo
  const [busca] = useSearchParams()
  const [dia, setDia] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(busca.get('dia') ?? '') ? busca.get('dia')! : hojeLocal()))
  const [form, setForm] = useState(formVazio)
  const [aberto, setAberto] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const { data: viagens, isLoading } = useQuery({
    queryKey: ['viagens-dia', dia],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viagens_conferencia')
        .select('*')
        .eq('dia', dia)
        .neq('status', 'cancelada')
        .order('saida_prevista')
      if (error) throw error
      return data as Viagem[]
    },
  })

  // eventos com serviço neste dia e contrato assinado
  const { data: eventosDoDia } = useQuery({
    queryKey: ['eventos-do-dia', dia],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_services')
        .select('event_id, hora_inicio, events!inner(nome, pipeline, endereco_confirmado)')
        .eq('dia', dia)
        .eq('events.pipeline', 'aprovado')
      if (error) throw error
      const m = new Map<string, EventoDoDia>()
      for (const s of (data ?? []) as unknown as {
        event_id: string
        hora_inicio: string | null
        events: { nome: string; endereco_confirmado: boolean }
      }[]) {
        const atual = m.get(s.event_id)
        if (!atual || (s.hora_inicio && (!atual.hora || s.hora_inicio < atual.hora)))
          m.set(s.event_id, {
            id: s.event_id,
            nome: s.events.nome,
            hora: s.hora_inicio,
            confirmado: s.events.endereco_confirmado,
          })
      }
      return Array.from(m.values()).sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
    },
  })

  // retiradas que as comandas pedem: eventos de HOJE e de AMANHÃ (o que
  // se serve amanhã cedo costuma ser buscado na véspera)
  const { data: sugeridas } = useQuery({
    queryKey: ['retiradas-sugeridas', dia],
    queryFn: async () => {
      const { data: serv } = await supabase
        .from('event_services')
        .select('event_id, dia, events!inner(nome, pipeline)')
        .in('dia', [dia, maisUmDia(dia)])
        .eq('events.pipeline', 'aprovado')
      const eventos = new Map(
        ((serv ?? []) as unknown as { event_id: string; dia: string; events: { nome: string } }[]).map((s) => [
          s.event_id,
          `${s.events.nome} · ${formatDiaMes(s.dia)}`,
        ])
      )
      if (!eventos.size) return [] as RetiradaSugerida[]
      const { data: pos } = await supabase
        .from('production_orders')
        .select('event_id, versao, snapshot')
        .in('event_id', Array.from(eventos.keys()))
        .not('aprovado_em', 'is', null)
        .order('versao', { ascending: false })
      const vistos = new Set<string>()
      const juntas = new Map<string, RetiradaSugerida>()
      for (const po of (pos ?? []) as { event_id: string; snapshot: { fornecedores?: LinhaFornecedorComanda[] } }[]) {
        if (vistos.has(po.event_id)) continue // só a versão mais nova
        vistos.add(po.event_id)
        for (const r of retiradasDaComanda(po.snapshot?.fornecedores ?? [], eventos.get(po.event_id)!)) {
          const j = juntas.get(r.chave) ?? { ...r, itens: [] }
          j.itens.push(...r.itens)
          juntas.set(r.chave, j)
        }
      }
      return Array.from(juntas.values())
    },
  })

  const fornecedorDa = (chave: string) =>
    fornecedores?.find((f) => normalizarChave(f.chave ?? '') === chave || normalizarChave(f.nome) === chave)

  const { porMotorista, conflitos } = useMemo(() => {
    const grupos = new Map<string, Viagem[]>()
    for (const v of viagens ?? []) {
      const k = v.motorista_nome ?? '— sem motorista —'
      grupos.set(k, [...(grupos.get(k) ?? []), v])
    }
    const conflitos = new Set<string>()
    for (const lista of grupos.values())
      for (let i = 0; i < lista.length; i++)
        for (let j = i + 1; j < lista.length; j++) {
          const [a1, a2] = janela(lista[i])
          const [b1, b2] = janela(lista[j])
          if (a1 < b2 && b1 < a2) {
            conflitos.add(lista[i].id)
            conflitos.add(lista[j].id)
          }
        }
    return { porMotorista: Array.from(grupos.entries()), conflitos }
  }, [viagens])

  const semEntrega = (eventosDoDia ?? []).filter(
    (e) => !(viagens ?? []).some((v) => v.event_id === e.id && v.tipo === 'entrega')
  )
  const retiradaPendente = (sugeridas ?? []).filter((r) => {
    const f = fornecedorDa(r.chave)
    return !(viagens ?? []).some((v) => v.tipo === 'retirada' && f && v.fornecedor_id === f.id)
  })
  const comAlerta = (viagens ?? []).filter((v) => alertasViagem(v).length).length

  async function atualizar() {
    await qc.invalidateQueries({ queryKey: ['viagens-dia', dia] })
    await qc.invalidateQueries({ queryKey: ['viagens-evento'] })
    await qc.invalidateQueries({ queryKey: ['minhas-viagens'] })
  }

  const programar = useMutation({
    mutationFn: async () => {
      if (!form.motorista_id) throw new Error('Escolha o motorista.')
      if (!form.saida) throw new Error('Informe o horário de saída.')
      if (form.tipo === 'retirada' && !form.fornecedor_id) throw new Error('Escolha o fornecedor.')
      if (form.tipo !== 'retirada' && !form.event_id) throw new Error('Escolha o evento.')
      const { error } = await supabase.from('viagens').insert({
        dia,
        tipo: form.tipo,
        motorista_id: form.motorista_id,
        event_id: form.event_id || null,
        fornecedor_id: form.tipo === 'retirada' ? form.fornecedor_id : null,
        saida_prevista: form.saida,
        chegada_prevista: form.chegada || null,
        itens: form.tipo === 'retirada' ? textoParaItens(form.itens) : [],
        obs: form.obs || null,
        created_by: session?.user.id,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setMsg('✅ Parada incluída na rota.')
      setForm({ ...formVazio, motorista_id: form.motorista_id })
      setAberto(false)
      await atualizar()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const cancelar = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('viagens').update({ status: 'cancelada' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: atualizar,
  })

  function programarRetirada(r: RetiradaSugerida) {
    const f = fornecedorDa(r.chave)
    setForm({
      ...formVazio,
      motorista_id: form.motorista_id,
      tipo: 'retirada',
      fornecedor_id: f?.id ?? '',
      itens: itensParaTexto(r.itens),
    })
    setMsg(f ? null : `⚠️ "${r.nome}" não está no cadastro de fornecedores — cadastre com endereço antes.`)
    setAberto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        lead="LOGÍSTICA"
        actions={
          programarViagem && (
            <Button onClick={() => setAberto(!aberto)}>{aberto ? 'Fechar' : '+ Parada na rota'}</Button>
          )
        }
      >
        Rotas do dia
      </PageTitle>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-48">
          <Input label="Dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 pb-1">
          <Badge tone={semEntrega.length ? 'red' : 'green'}>{semEntrega.length} evento(s) sem entrega</Badge>
          <Badge tone={retiradaPendente.length ? 'red' : 'green'}>{retiradaPendente.length} retirada(s) a programar</Badge>
          <Badge tone={conflitos.size ? 'red' : 'green'}>{conflitos.size} parada(s) em conflito</Badge>
          <Badge tone={comAlerta ? 'amber' : 'green'}>{comAlerta} com aviso</Badge>
        </div>
      </div>

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {/* ---------- nova parada ---------- */}
      {aberto && programarViagem && (
        <Card title={`Nova parada — ${formatDiaMes(dia)}`} className="mb-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ViagemTipo })}>
              <option value="retirada">Retirada no fornecedor</option>
              <option value="entrega">Entrega no evento</option>
              <option value="recolhimento">Recolhimento no evento</option>
            </Select>
            <Select label="Motorista" value={form.motorista_id} onChange={(e) => setForm({ ...form, motorista_id: e.target.value })}>
              <option value="">— escolher —</option>
              {(motoristas ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome || m.email}
                </option>
              ))}
            </Select>
            {form.tipo === 'retirada' ? (
              <div className="col-span-2">
                <Select
                  label="Fornecedor"
                  value={form.fornecedor_id}
                  onChange={(e) => setForm({ ...form, fornecedor_id: e.target.value })}
                >
                  <option value="">— escolher —</option>
                  {(fornecedores ?? [])
                    .filter((f) => f.ativo)
                    .map((f) => (
                      <option key={f.id} value={f.id} disabled={!f.endereco}>
                        {f.nome}
                        {!f.endereco ? ' (sem endereço)' : f.horario ? ` · ${f.horario}` : ''}
                      </option>
                    ))}
                </Select>
              </div>
            ) : (
              <div className="col-span-2">
                <Select label="Evento" value={form.event_id} onChange={(e) => setForm({ ...form, event_id: e.target.value })}>
                  <option value="">— escolher —</option>
                  {(eventosDoDia ?? []).map((e) => (
                    <option key={e.id} value={e.id} disabled={!e.confirmado}>
                      {horaBR(e.hora)} · {e.nome}
                      {!e.confirmado ? ' (endereço não confirmado)' : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <Input label="Sai às" type="time" value={form.saida} onChange={(e) => setForm({ ...form, saida: e.target.value })} />
            <Input label="Chega às" type="time" value={form.chegada} onChange={(e) => setForm({ ...form, chegada: e.target.value })} />
            <div className="col-span-2">
              <Input
                label="Instrução"
                placeholder="levar caixas térmicas, pagar na retirada…"
                value={form.obs}
                onChange={(e) => setForm({ ...form, obs: e.target.value })}
              />
            </div>
            {form.tipo === 'retirada' && (
              <div className="col-span-2 md:col-span-4">
                <Textarea
                  label="O que buscar (uma linha por item: qtd — item)"
                  rows={4}
                  value={form.itens}
                  onChange={(e) => setForm({ ...form, itens: e.target.value })}
                />
              </div>
            )}
          </div>
          <div className="mt-4">
            <Button disabled={programar.isPending} onClick={() => programar.mutate()}>
              {programar.isPending ? 'Salvando…' : 'Incluir na rota'}
            </Button>
          </div>
        </Card>
      )}

      {/* ---------- o que falta programar ---------- */}
      {semEntrega.length > 0 && (
        <Card title="⚠️ Eventos do dia sem entrega programada" className="mb-5">
          <div className="flex flex-col divide-y divide-[var(--pg-border)]">
            {semEntrega.map((e) => (
              <Link
                key={e.id}
                to={`/eventos/${e.id}/campo?aba=transporte`}
                className="flex items-center gap-3 py-2.5 text-sm hover:underline"
              >
                <span className="w-12 font-mono text-xs text-neutral-500">{horaBR(e.hora)}</span>
                <span className="flex-1">{e.nome}</span>
                {!e.confirmado && <Badge tone="red">endereço não confirmado</Badge>}
                <span className="text-xs">programar →</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {retiradaPendente.length > 0 && (
        <Card title="🛒 Retiradas que a comanda pede (eventos de hoje e amanhã)" className="mb-5">
          <div className="flex flex-col divide-y divide-[var(--pg-border)]">
            {retiradaPendente.map((r) => {
              const f = fornecedorDa(r.chave)
              return (
                <div key={r.chave} className="flex flex-wrap items-start gap-3 py-3">
                  <div className="min-w-[200px] flex-1">
                    <div className="text-sm font-semibold">
                      {f?.nome ?? r.nome}
                      {!f && <Badge tone="red">fora do cadastro</Badge>}
                      {f && !f.endereco && <Badge tone="amber">sem endereço</Badge>}
                    </div>
                    <ul className="mt-1 text-xs text-neutral-600">
                      {r.itens.map((i, n) => (
                        <li key={n}>
                          {i.qtd} — {i.descricao} <span className="text-neutral-400">({i.evento})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {programarViagem && (
                    <Button variant="secondary" className="!px-3 !py-1.5" onClick={() => programarRetirada(r)}>
                      Programar retirada
                    </Button>
                  )}
                </div>
              )
            })}
          </div>
        </Card>
      )}

      <EnderecosAConfirmar link={(id) => `/eventos/${id}/campo`} />

      {/* ---------- a rota de cada motorista ---------- */}
      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !porMotorista.length ? (
        <EmptyState>Nenhuma parada programada para este dia.</EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {porMotorista.map(([motorista, lista]) => (
            <Card key={motorista} title={motorista} actions={<Badge tone="neutral">{lista.length} parada(s)</Badge>}>
              <div className="flex flex-col divide-y divide-[var(--pg-border)]">
                {lista.map((v, n) => (
                  <div key={v.id} className="py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--pg-text)] text-[11px] font-semibold text-[var(--pg-bg)]">
                        {n + 1}
                      </span>
                      <span className="w-24 font-mono text-sm font-semibold">
                        {horaBR(v.saida_prevista)}
                        {v.chegada_prevista && <span className="text-neutral-400">→{horaBR(v.chegada_prevista)}</span>}
                      </span>
                      <Badge tone={v.tipo === 'entrega' ? 'blue' : v.tipo === 'retirada' ? 'amber' : 'neutral'}>
                        {VIAGEM_TIPO_LABEL[v.tipo]}
                      </Badge>
                      {v.event_id ? (
                        <Link to={`/eventos/${v.event_id}/campo?aba=transporte`} className="flex-1 text-sm hover:underline">
                          {v.evento_nome}
                        </Link>
                      ) : (
                        <span className="flex-1 text-sm">{v.fornecedor_nome}</span>
                      )}
                      {conflitos.has(v.id) && <Badge tone="red">conflito de horário</Badge>}
                      <Badge tone={v.status === 'concluida' ? 'green' : v.status === 'programada' ? 'neutral' : 'amber'}>
                        {VIAGEM_STATUS_LABEL[v.status]}
                      </Badge>
                      {programarViagem && v.status === 'programada' && (
                        <Button variant="ghost" className="!px-2 !py-1" onClick={() => cancelar.mutate(v.id)}>
                          Cancelar
                        </Button>
                      )}
                    </div>
                    <div className="ml-8 mt-0.5 text-xs text-neutral-500">
                      {v.endereco_atual}
                      {v.local_atual && ` — ${v.local_atual}`}
                    </div>
                    {v.tipo === 'retirada' && v.itens?.length > 0 && (
                      <div className="ml-8 mt-0.5 text-xs text-neutral-600">
                        {v.itens.map((i) => `${i.qtd} ${i.descricao}`).join(' · ')}
                      </div>
                    )}
                    <div className="ml-8">
                      <ListaAlertas v={v} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
