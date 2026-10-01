// ============================================================
// ESCALA DA SEMANA — a visão da Adriana
//
// A aba Equipe de cada evento mostra UM evento; a Adriana pensa na
// SEMANA: quantas copeiras e garçons cada evento pede em cada dia, quem
// já está escalado, quem falta e quanto isso custa.
//
//   vaga  (escala_vagas, 0037)  "o evento X precisa de 3 copeiras no
//                                dia D, saindo 09h30"
//   escalado (event_staff)      quem ocupa a vaga
//
// Vaga aberta fica VERMELHA, preenchida fica VERDE. Escalado SEM
// liberação (sem contrato, ASO vencido no dia, nome fora do cadastro)
// não preenche: a vaga fica ÂMBAR ("preenchida com pendência — trocar")
// e entra na conta das vagas abertas do topo. Escalar daqui só
// oferece quem está APTO no dia (contrato assinado + ASO válido) e
// LIVRE (não está em outro evento no mesmo dia) — o banco trava de novo
// no insert. O convite sai pronto pelo WhatsApp (evento, dia, saída,
// função, endereço) e a confirmação do freela é marcada aqui.
//
// Entram os eventos com contrato ASSINADO (pipeline 'aprovado') que têm
// serviço no dia — evento sem contrato não sai, então não se escala.
//
// Horário de saída: o da comanda aprovada (production_orders.snapshot,
// dias[].saida) — o mesmo do checklist de expedição. "Servir − 3h" só
// quando ainda não há comanda (saidaOficial, src/engine/freelas.ts).
// Função da vaga: lista fixa (SeletorFuncao), nunca texto livre.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle } from '@/components/ui'
import { formatBRL, formatDiaMes } from '@/engine'
import {
  contarVaga,
  funcaoCanonica,
  hojeLocal,
  linkWhatsApp,
  mensagemConvite,
  mesmaFuncao,
  rotuloSituacao,
  saidaOficial,
  STATUS_OCUPA,
  type EscaladoDia,
  type SaidaOficial,
} from '@/engine/freelas'
import SeletorFreela, { opcoesFreela } from '@/components/pessoas/SeletorFreela'
import SeletorFuncao from '@/components/pessoas/SeletorFuncao'
import { useExigirDocs, useFreelasComSituacao } from '@/components/pessoas/useFreelas'
import { STAFF_STATUS_LABEL, type EventStaff, type StaffStatus } from '@/types'
import type { EscalaVaga } from '@/tipos/pessoas'
import { isoLocal } from '@/engine/datas'

// ---------- datas ----------
const isoDe = (d: Date) => isoLocal(d)
function somar(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoDe(d)
}
/** segunda-feira da semana de `iso` */
function segunda(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  const dow = (d.getUTCDay() + 6) % 7
  return somar(iso, -dow)
}
const nomeDia = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })

type Snapshot = Parameters<typeof saidaOficial>[0]

interface EventoEscala {
  id: string
  nome: string
  endereco: string | null
  local_detalhe: string | null
  pipeline: string
  event_services: { dia: string; hora_inicio: string | null }[]
}

type Escalado = EventStaff & { events: { nome: string } | null }

const ATIVO = (s: { status: string }) => STATUS_OCUPA.includes(s.status)

/**
 * Cada escalado vai para a primeira vaga da mesma função; o que sobra
 * fica "fora das vagas". A contagem (contarVaga) separa preenchida
 * (apto), pendência (escalado sem liberação) e aberta.
 */
function distribuir(vagas: EscalaVaga[], escalados: Escalado[], apto: (id: string, dia: string) => boolean) {
  const usados = new Set<string>()
  const linhas = vagas.map((v) => {
    const ocupantes = escalados.filter((s) => !usados.has(s.id) && mesmaFuncao(s.funcao, v.funcao))
    ocupantes.forEach((s) => usados.add(s.id))
    return { vaga: v, ocupantes, conta: contarVaga(v.quantidade, ocupantes, apto) }
  })
  return { linhas, fora: escalados.filter((s) => !usados.has(s.id)) }
}

export default function Escala() {
  const qc = useQueryClient()
  const { escalar, verEquipe } = usePermissoes()
  const hoje = hojeLocal()
  const [inicio, setInicio] = useState(() => segunda(hoje))
  const fim = somar(inicio, 6)
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => somar(inicio, i)), [inicio])
  const [msg, setMsg] = useState<string | null>(null)

  const { freelas, situacao } = useFreelasComSituacao(verEquipe)
  const exigirDocs = useExigirDocs(verEquipe)
  const apto = (id: string, d: string) => situacao(id, d).apto
  const telefoneDe = useMemo(() => new Map(freelas.map((f) => [f.id, f.telefone])), [freelas])

  const { data: eventos } = useQuery({
    queryKey: ['escala-eventos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, nome, endereco, local_detalhe, pipeline, event_services(dia, hora_inicio)')
        .eq('pipeline', 'aprovado')
      if (error) throw error
      return data as unknown as EventoEscala[]
    },
  })

  const { data: vagas } = useQuery({
    queryKey: ['escala-vagas', inicio],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('escala_vagas')
        .select('*')
        .gte('dia', inicio)
        .lte('dia', fim)
        .order('funcao')
      // sem a 0037 a tabela não existe: a semana mostra só os escalados
      if (error) return [] as EscalaVaga[]
      return data as EscalaVaga[]
    },
  })

  const { data: staff } = useQuery({
    queryKey: ['escala-semana', inicio],
    enabled: verEquipe,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_staff')
        .select('*, events(nome)')
        .gte('dia', inicio)
        .lte('dia', fim)
        .order('nome')
      if (error) throw error
      return data as Escalado[]
    },
  })

  // a comanda aprovada mais nova de cada evento: é dela a saída oficial
  const idsEventos = (eventos ?? []).map((e) => e.id)
  const { data: snapshots } = useQuery({
    queryKey: ['escala-comandas', idsEventos.join(',')],
    enabled: idsEventos.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('production_orders')
        .select('event_id, versao, snapshot')
        .in('event_id', idsEventos)
        .not('aprovado_em', 'is', null)
        .order('versao', { ascending: false })
      const m = new Map<string, Snapshot>()
      if (error) return m
      for (const po of (data ?? []) as { event_id: string; snapshot: Snapshot }[])
        if (!m.has(po.event_id)) m.set(po.event_id, po.snapshot)
      return m
    },
  })

  async function atualizar() {
    await qc.invalidateQueries({ queryKey: ['escala-vagas'] })
    await qc.invalidateQueries({ queryKey: ['escala-semana'] })
    await qc.invalidateQueries({ queryKey: ['escala-dia'] })
    await qc.invalidateQueries({ queryKey: ['campo-equipe'] })
    await qc.invalidateQueries({ queryKey: ['campo-equipe-custo'] })
  }

  // ---------- o que a semana tem ----------
  const porDia = useMemo(
    () =>
      dias.map((d) => {
        const evs = (eventos ?? [])
          .filter((e) => e.event_services.some((s) => s.dia === d))
          .map((e) => {
            const horas = e.event_services
              .filter((s) => s.dia === d)
              .map((s) => s.hora_inicio)
              .filter(Boolean)
              .sort() as string[]
            const hora = horas[0]?.slice(0, 5) ?? null
            const vs = (vagas ?? []).filter((v) => v.event_id === e.id && v.dia === d)
            const escalados = (staff ?? []).filter((s) => s.event_id === e.id && s.dia === d)
            return {
              evento: e,
              hora,
              saida: saidaOficial(snapshots?.get(e.id), d, hora),
              vagas: vs,
              escalados,
              ...distribuir(vs, escalados, apto),
            }
          })
          .sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
        return { dia: d, eventos: evs }
      }),
    [dias, eventos, vagas, staff, snapshots, situacao] // apto deriva de situacao
  )

  const ativos = (staff ?? []).filter(ATIVO)
  const custo = ativos.reduce((t, s) => t + Number(s.valor ?? 0), 0)
  const totalVagas = (vagas ?? []).reduce((t, v) => t + v.quantidade, 0)
  // vaga com escalado sem liberação NÃO está preenchida: conta como aberta
  let abertas = 0
  let pendentes = 0
  for (const d of porDia)
    for (const e of d.eventos)
      for (const l of e.linhas) {
        abertas += l.conta.abertas + l.conta.pendentes
        pendentes += l.conta.pendentes
      }
  const semConfirmar = ativos.filter((s) => s.status === 'escalado').length
  const inaptos = ativos.filter((s) => s.dia >= hoje && (!s.freelancer_id || !situacao(s.freelancer_id, s.dia).apto))

  // ---------- ações ----------
  const escalarFreela = useMutation({
    mutationFn: async (p: { vaga: EscalaVaga; freelancerId: string; valor: string }) => {
      const f = freelas.find((x) => x.id === p.freelancerId)
      if (!f) throw new Error('Escolha um freelancer.')
      const ocupados = ocupadosDo(p.vaga.dia)
      const op = opcoesFreela([f], situacao, ocupados, p.vaga.dia, exigirDocs)[0]
      if (!op.pode) throw new Error(`${f.nome} não pode ser escalado: ${op.motivo}.`)
      const { error } = await supabase.from('event_staff').insert({
        event_id: p.vaga.event_id,
        freelancer_id: f.id,
        nome: f.nome,
        funcao: p.vaga.funcao,
        dia: p.vaga.dia,
        horario_saida: p.vaga.horario_saida,
        valor: p.valor ? Number(p.valor.replace(',', '.')) : f.valor_padrao,
      })
      if (error) throw error
      return f.nome
    },
    onSuccess: async (nome) => {
      setMsg(`${nome} escalado — mande o convite pelo WhatsApp e marque quando confirmar.`)
      await atualizar()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: StaffStatus }) => {
      const { error } = await supabase.from('event_staff').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: atualizar,
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const salvarVaga = useMutation({
    mutationFn: async (v: Omit<EscalaVaga, 'id'>) => {
      const funcao = funcaoCanonica(v.funcao)
      if (!funcao) throw new Error('Escolha a função da vaga na lista.')
      if (!(v.quantidade > 0)) throw new Error('Quantidade precisa ser maior que zero.')
      const { error } = await supabase.from('escala_vagas').insert({ ...v, funcao })
      if (error) throw error
    },
    onSuccess: atualizar,
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const mudarVaga = useMutation({
    mutationFn: async ({ id, quantidade }: { id: string; quantidade: number }) => {
      const r =
        quantidade <= 0
          ? await supabase.from('escala_vagas').delete().eq('id', id)
          : await supabase.from('escala_vagas').update({ quantidade }).eq('id', id)
      if (r.error) throw r.error
    },
    onSuccess: atualizar,
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  function ocupadosDo(dia: string): EscaladoDia[] {
    return (staff ?? [])
      .filter((s) => s.dia === dia)
      .map((s) => ({ ...s, evento_nome: s.events?.nome ?? null }))
  }

  const temEvento = porDia.some((d) => d.eventos.length)

  return (
    <div>
      <PageTitle
        lead="LOGÍSTICA"
        actions={
          <>
            <Button variant="secondary" onClick={() => setInicio(somar(inicio, -7))}>
              ← Semana anterior
            </Button>
            <Button variant="secondary" onClick={() => setInicio(segunda(hoje))}>
              Esta semana
            </Button>
            <Button variant="secondary" onClick={() => setInicio(somar(inicio, 7))}>
              Próxima →
            </Button>
          </>
        }
      >
        Escala da semana
      </PageTitle>

      <p className="mb-4 text-sm text-neutral-500">
        {formatDiaMes(inicio)} a {formatDiaMes(fim)} · eventos com contrato assinado · só aparece para escalar quem tem
        contrato assinado + ASO válido no dia e não está em outro evento.
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumo
          titulo="Vagas abertas"
          valor={String(abertas)}
          tom={abertas ? 'red' : 'green'}
          sub={`de ${totalVagas} vaga(s)${pendentes ? ` · ${pendentes} com escalado sem liberação` : ''}`}
        />
        <Resumo titulo="Escalados" valor={String(ativos.length)} sub={`${semConfirmar} sem confirmar`} tom={semConfirmar ? 'amber' : undefined} />
        <Resumo titulo="Custo da semana" valor={formatBRL(custo)} sub="escalados + confirmados + presentes" />
        <Resumo
          titulo="Sem liberação"
          valor={String(inaptos.length)}
          tom={inaptos.length ? 'red' : 'green'}
          sub={inaptos.length ? 'escalados que precisam ser trocados' : 'todos com contrato + ASO'}
        />
      </div>

      {inaptos.length > 0 && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
          <b>🛑 Escalados sem liberação para o dia:</b>
          <ul className="mt-1 list-disc pl-5">
            {inaptos.map((s) => (
              <li key={s.id}>
                {s.nome} — {s.events?.nome} em {formatDiaMes(s.dia)}:{' '}
                {s.freelancer_id ? situacao(s.freelancer_id, s.dia).motivos.join(' · ') : 'fora do cadastro (sem contrato/ASO verificado)'}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!exigirDocs && (
        <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-100">
          <b>Período de transição:</b> a trava de contrato + ASO ainda está desligada. Quem está sem documento pode ser
          escalado, mas a vaga fica âmbar. Lance os documentos em Freelancers e depois ligue a regra
          "exigir_docs_freela" em Regras.
        </div>
      )}

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm dark:bg-white/5">{msg}</p>}

      {!temEvento && <EmptyState>Nenhum evento com contrato assinado nesta semana.</EmptyState>}

      <div className="flex flex-col gap-4">
        {porDia.map(({ dia, eventos: evs }) =>
          !evs.length ? (
            temEvento && (
              <div key={dia} className="px-1 text-xs text-neutral-400">
                <span className="capitalize">{nomeDia(dia)}</span>, {formatDiaMes(dia)} — sem evento
              </div>
            )
          ) : (
            <Card
              key={dia}
              title={
                <span className={dia === hoje ? 'text-green-700' : ''}>
                  <span className="capitalize">{nomeDia(dia)}</span>, {formatDiaMes(dia)}
                  {dia === hoje && ' · hoje'}
                </span>
              }
            >
              <div className="flex flex-col gap-6">
                {evs.map(({ evento, hora, saida, vagas: vs, escalados, linhas, fora }) => (
                  <BlocoEvento
                    key={evento.id}
                    dia={dia}
                    hoje={hoje}
                    evento={evento}
                    hora={hora}
                    saida={saida}
                    vagas={vs}
                    escalados={escalados}
                    linhas={linhas}
                    fora={fora}
                    podeEscalar={escalar}
                    opcoes={opcoesFreela(freelas, situacao, ocupadosDo(dia), dia, exigirDocs)}
                    situacao={situacao}
                    telefoneDe={telefoneDe}
                    onEscalar={(vaga, freelancerId, valor) => escalarFreela.mutate({ vaga, freelancerId, valor })}
                    onStatus={(id, status) => mudarStatus.mutate({ id, status })}
                    onNovaVaga={(v) => salvarVaga.mutate(v)}
                    onQuantidade={(id, quantidade) => mudarVaga.mutate({ id, quantidade })}
                    ocupado={escalarFreela.isPending}
                  />
                ))}
              </div>
            </Card>
          )
        )}
      </div>
    </div>
  )
}

function Resumo({ titulo, valor, sub, tom }: { titulo: string; valor: string; sub?: string; tom?: 'red' | 'green' | 'amber' }) {
  const cor = tom === 'red' ? 'text-red-700' : tom === 'green' ? 'text-green-700' : tom === 'amber' ? 'text-amber-700' : ''
  return (
    <div className="rounded-lg border border-[var(--pg-border)] p-3">
      <div className="pg-key">{titulo}</div>
      <div className={`mt-1 text-xl font-semibold ${cor}`}>{valor}</div>
      {sub && <div className="text-[11px] text-neutral-500">{sub}</div>}
    </div>
  )
}

// ---------- um evento num dia ----------

type Linha = ReturnType<typeof distribuir>['linhas'][number]

const BORDA = { red: 'border-l-red-600', amber: 'border-l-amber-500', green: 'border-l-green-600' }
const TEXTO = { red: 'font-semibold text-red-700', amber: 'font-semibold text-amber-700', green: 'text-green-700' }

function BlocoEvento({
  dia,
  hoje,
  evento,
  hora,
  saida,
  vagas,
  escalados,
  linhas,
  fora,
  podeEscalar,
  opcoes,
  situacao,
  telefoneDe,
  onEscalar,
  onStatus,
  onNovaVaga,
  onQuantidade,
  ocupado,
}: {
  dia: string
  hoje: string
  evento: EventoEscala
  hora: string | null
  saida: SaidaOficial
  vagas: EscalaVaga[]
  escalados: Escalado[]
  linhas: Linha[]
  fora: Escalado[]
  podeEscalar: boolean
  opcoes: ReturnType<typeof opcoesFreela>
  situacao: ReturnType<typeof useFreelasComSituacao>['situacao']
  telefoneDe: Map<string, string | null>
  onEscalar: (v: EscalaVaga, freelancerId: string, valor: string) => void
  onStatus: (id: string, s: StaffStatus) => void
  onNovaVaga: (v: Omit<EscalaVaga, 'id'>) => void
  onQuantidade: (id: string, q: number) => void
  ocupado: boolean
}) {
  const [novaVaga, setNovaVaga] = useState(false)
  const [nv, setNv] = useState({ funcao: '', quantidade: '1', horario_saida: saida.hora ?? '' })

  /** "−" pede confirmação quando apaga a vaga ou fica menor que a equipe já escalada */
  function menos({ vaga, ocupantes }: Linha) {
    const q = vaga.quantidade - 1
    const ativos = ocupantes.filter(ATIVO).length
    if (q <= 0) {
      const extra = ativos ? ` ${ativos} escalado(s) nela vão para "fora das vagas".` : ''
      if (!confirm(`Apagar a vaga de ${vaga.funcao}?${extra}`)) return
    } else if (q < ativos) {
      if (!confirm(`A vaga fica com ${q} lugar(es), mas há ${ativos} escalado(s) de ${vaga.funcao}. Continuar?`)) return
    }
    onQuantidade(vaga.id, q)
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link to={`/eventos/${evento.id}/campo`} className="text-base font-semibold hover:text-green-700">
            {evento.nome}
          </Link>
          <div className="text-[11px] text-neutral-500">
            {hora ? `serviço às ${hora}` : 'sem horário'}
            {saida.hora &&
              ` · saída ${saida.hora} ${saida.fonte === 'comanda' ? '(comanda)' : '(servir − 3h, sem comanda aprovada)'}`}
            {evento.endereco && ` · ${evento.endereco}`}
          </div>
        </div>
        {podeEscalar && (
          <Button variant="ghost" onClick={() => setNovaVaga(!novaVaga)}>
            + vaga
          </Button>
        )}
      </div>

      {novaVaga && (
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-lg bg-neutral-50 p-3 sm:grid-cols-[1.5fr_80px_110px_auto] sm:items-end dark:bg-white/5">
          <div className="col-span-2 sm:col-span-1">
            <SeletorFuncao value={nv.funcao} onChange={(funcao) => setNv({ ...nv, funcao })} />
          </div>
          <Input label="Qtd." inputMode="numeric" value={nv.quantidade} onChange={(e) => setNv({ ...nv, quantidade: e.target.value })} />
          <Input label="Saída" type="time" value={nv.horario_saida} onChange={(e) => setNv({ ...nv, horario_saida: e.target.value })} />
          <Button
            className="col-span-2 sm:col-span-1"
            onClick={() => {
              onNovaVaga({
                event_id: evento.id,
                dia,
                funcao: nv.funcao,
                quantidade: Number(nv.quantidade),
                horario_saida: nv.horario_saida || null,
                obs: null,
              })
              setNovaVaga(false)
              setNv({ funcao: '', quantidade: '1', horario_saida: saida.hora ?? '' })
            }}
          >
            Salvar vaga
          </Button>
        </div>
      )}

      {!vagas.length && !escalados.length && (
        <p className="rounded-lg border border-dashed border-[var(--pg-border)] px-3 py-3 text-sm text-neutral-500">
          Nenhuma vaga cadastrada para este dia. {podeEscalar && 'Use "+ vaga" para dizer quantas pessoas de cada função vão.'}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {linhas.map((l) => {
          const { vaga, ocupantes, conta } = l
          return (
            <div
              key={vaga.id}
              className={`rounded-lg border-l-4 bg-[var(--pg-surface)] px-3 py-2 ${BORDA[conta.tom]} border border-[var(--pg-border)]`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <b className="capitalize">{vaga.funcao}</b>{' '}
                  <span className={TEXTO[conta.tom]}>
                    {conta.preenchidas}/{vaga.quantidade}
                  </span>
                  {vaga.horario_saida && <span className="text-neutral-500"> · sai {vaga.horario_saida.slice(0, 5)}</span>}
                  {saida.fonte === 'comanda' && vaga.horario_saida && vaga.horario_saida.slice(0, 5) !== saida.hora && (
                    <span className="text-[11px] text-neutral-500"> (comanda: {saida.hora})</span>
                  )}{' '}
                  {conta.abertas > 0 && <Badge tone="red">{conta.abertas} aberta(s)</Badge>}{' '}
                  {conta.pendentes > 0 && <Badge tone="amber">{conta.pendentes} com pendência — trocar</Badge>}
                </div>
                {podeEscalar && (
                  <span className="flex items-center gap-2">
                    <button
                      className="h-10 min-w-10 rounded-full border border-[var(--pg-border)] px-3 text-base"
                      onClick={() => menos(l)}
                      title="Uma vaga a menos"
                    >
                      −
                    </button>
                    <button
                      className="h-10 min-w-10 rounded-full border border-[var(--pg-border)] px-3 text-base"
                      onClick={() => onQuantidade(vaga.id, vaga.quantidade + 1)}
                      title="Uma vaga a mais"
                    >
                      +
                    </button>
                  </span>
                )}
              </div>
              {ocupantes.map((s) => (
                <LinhaEscalado
                  key={s.id}
                  s={s}
                  hoje={hoje}
                  evento={evento}
                  saida={saida}
                  podeEscalar={podeEscalar}
                  situacao={situacao}
                  telefoneDe={telefoneDe}
                  onStatus={onStatus}
                />
              ))}
              {podeEscalar && conta.abertas > 0 && (
                <PreencherVaga vaga={vaga} opcoes={opcoes} onEscalar={onEscalar} ocupado={ocupado} />
              )}
            </div>
          )
        })}

        {fora.length > 0 && (
          <div className="rounded-lg border border-[var(--pg-border)] px-3 py-2">
            <div className="pg-key">Escalados fora das vagas</div>
            {fora.map((s) => (
              <LinhaEscalado
                key={s.id}
                s={s}
                hoje={hoje}
                evento={evento}
                saida={saida}
                podeEscalar={podeEscalar}
                situacao={situacao}
                telefoneDe={telefoneDe}
                onStatus={onStatus}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PreencherVaga({
  vaga,
  opcoes,
  onEscalar,
  ocupado,
}: {
  vaga: EscalaVaga
  opcoes: ReturnType<typeof opcoesFreela>
  onEscalar: (v: EscalaVaga, freelancerId: string, valor: string) => void
  ocupado: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [fid, setFid] = useState('')
  const [valor, setValor] = useState('')
  // quem já faz essa função primeiro
  const ordenadas = [...opcoes].sort(
    (a, b) =>
      Number(b.pode) - Number(a.pode) ||
      Number(mesmaFuncao(b.freela.funcao_padrao, vaga.funcao)) - Number(mesmaFuncao(a.freela.funcao_padrao, vaga.funcao))
  )
  if (!aberto)
    return (
      <Button variant="secondary" className="mt-2 w-full sm:w-auto" onClick={() => setAberto(true)}>
        Escalar {vaga.funcao}
      </Button>
    )
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_110px_auto] sm:items-end">
      <SeletorFreela
        opcoes={ordenadas}
        value={fid}
        onChange={(f) => {
          setFid(f?.id ?? '')
          setValor(f?.valor_padrao != null ? String(f.valor_padrao) : '')
        }}
      />
      <Input label="Diária (R$)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
      <div className="flex gap-2">
        <Button
          disabled={!fid || ocupado}
          onClick={() => {
            onEscalar(vaga, fid, valor)
            setAberto(false)
            setFid('')
          }}
        >
          Escalar
        </Button>
        <Button variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function LinhaEscalado({
  s,
  hoje,
  evento,
  saida,
  podeEscalar,
  situacao,
  telefoneDe,
  onStatus,
}: {
  s: Escalado
  hoje: string
  evento: EventoEscala
  saida: SaidaOficial
  podeEscalar: boolean
  situacao: ReturnType<typeof useFreelasComSituacao>['situacao']
  telefoneDe: Map<string, string | null>
  onStatus: (id: string, s: StaffStatus) => void
}) {
  const sit = s.freelancer_id ? situacao(s.freelancer_id, s.dia) : null
  const telefone = s.freelancer_id ? (telefoneDe.get(s.freelancer_id) ?? null) : null
  const link = linkWhatsApp(
    telefone,
    mensagemConvite({
      nome: s.nome,
      evento: evento.nome,
      dia: s.dia,
      funcao: s.funcao,
      // o combinado com o freela; sem ele, a saída da comanda (a da expedição)
      horarioSaida: s.horario_saida ?? saida.hora,
      endereco: evento.endereco,
      localDetalhe: evento.local_detalhe,
    })
  )
  const tom: Record<string, 'neutral' | 'green' | 'amber' | 'red' | 'blue'> = {
    escalado: 'amber',
    confirmado: 'green',
    presente: 'green',
    faltou: 'red',
    cancelado: 'neutral',
  }
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--pg-border)] pt-2 ${ATIVO(s) ? '' : 'opacity-50'}`}>
      <div className="min-w-[140px] flex-1 text-sm">
        <span className="font-medium">{s.nome}</span>
        {s.valor != null && <span className="text-[11px] text-neutral-500"> · {formatBRL(Number(s.valor))}</span>}
        {ATIVO(s) && sit && !sit.apto && (
          <div className="text-[11px] font-semibold text-red-700">🛑 {sit.motivos.join(' · ')} — trocar</div>
        )}
        {ATIVO(s) && sit && sit.apto && sit.vencendo.length > 0 && (
          <div className="text-[11px] text-amber-700">⚠️ {rotuloSituacao(sit).texto}</div>
        )}
        {ATIVO(s) && !s.freelancer_id && (
          <div className="text-[11px] font-semibold text-red-700">sem contrato/ASO verificado</div>
        )}
      </div>
      <Badge tone={tom[s.status] ?? 'neutral'}>{STAFF_STATUS_LABEL[s.status]}</Badge>
      {podeEscalar && ATIVO(s) && (
        <>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-green-700 px-4 py-2 text-xs font-semibold text-green-700 hover:bg-green-700 hover:text-white"
            >
              WhatsApp
            </a>
          ) : (
            <span className="text-[11px] text-neutral-400">sem telefone</span>
          )}
          {s.status === 'escalado' && (
            <Button variant="secondary" className="!px-3 !py-2" onClick={() => onStatus(s.id, 'confirmado')}>
              Confirmou
            </Button>
          )}
          {s.dia >= hoje && (
            <Button
              variant="ghost"
              className="!px-2 !py-1"
              onClick={() => confirm(`Cancelar ${s.nome} neste dia?`) && onStatus(s.id, 'cancelado')}
            >
              Cancelar
            </Button>
          )}
        </>
      )}
    </div>
  )
}
