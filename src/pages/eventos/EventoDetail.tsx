import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import {
  EVENT_STATUS_LABEL,
  FASES,
  faseAtual,
  operacaoLiberada,
  PERIOD_LABEL,
  PIPELINE,
  SERVICE_LINE_LABEL,
  SERVICE_TYPE_LABEL,
  type Client,
  type EventService,
  type PieggiEvent,
  type ServiceLine,
  type ServiceType,
} from '@/types'
import { calcReposicao, duracaoMin, formatDiaMes } from '@/engine'
import { PedidosEspeciaisCard } from '@/components/PedidosEspeciais'
import { StatusBadge, usePropostaComercial } from '@/components/StatusComercial'
import { usePermissoes } from '@/lib/permissoes'

export default function EventoDetail() {
  const { id } = useParams()
  const { verComercial, editarComercial } = usePermissoes()
  const { data: propostaComercial } = usePropostaComercial(id)

  const { data: evento, isLoading } = useQuery({
    queryKey: ['evento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, clients(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PieggiEvent & { clients: Client | null }
    },
  })

  const { data: servicos } = useQuery({
    queryKey: ['servicos', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_services')
        .select('*')
        .eq('event_id', id!)
        .order('dia')
        .order('hora_inicio')
      if (error) throw error
      return data as EventService[]
    },
  })

  if (isLoading || !evento) {
    return <p className="text-sm text-neutral-500">Carregando…</p>
  }

  const faseIdx = faseAtual(evento.status)
  const liberado = operacaoLiberada(evento.pipeline)
  const etapaLabel = PIPELINE.find((p) => p.key === evento.pipeline)?.label ?? 'Perdido'

  return (
    <div>
      <PageTitle
        actions={
          editarComercial ? (
            <Link to={`/eventos/${evento.id}/editar`}>
              <Button variant="secondary">Editar dados</Button>
            </Link>
          ) : undefined
        }
      >
        {evento.nome}
      </PageTitle>

      {/* Barra da esteira */}
      <div className="mb-6 flex items-center gap-2 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-4">
        {FASES.map((f, i) => (
          <div key={f.key} className="flex items-center gap-2">
            {i > 0 && <div className="h-px w-6 bg-neutral-300" />}
            <div
              className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium ${
                i < faseIdx
                  ? 'bg-green-100 text-green-800'
                  : i === faseIdx
                    ? 'bg-neutral-900 text-white'
                    : 'bg-neutral-100 text-neutral-400'
              }`}
            >
              <span>{i < faseIdx ? '✓' : i + 1}</span>
              {f.label}
            </div>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {propostaComercial && <StatusBadge status={propostaComercial.status_cliente} />}
          <Badge tone="blue">{EVENT_STATUS_LABEL[evento.status]}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card title="Dados do evento" className="lg:col-span-1">
          <dl className="space-y-2 text-sm">
            <Linha k="Cliente" v={evento.clients?.nome ?? 'Avulso'} />
            <Linha k="Contato" v={evento.contato ?? '—'} />
            <Linha k="PAX" v={evento.pax?.toString() ?? '—'} />
            <Linha
              k="Endereço"
              v={
                <>
                  {evento.endereco ?? '—'}
                  {evento.local_detalhe ? ` — ${evento.local_detalhe}` : ''}{' '}
                  {evento.endereco_confirmado ? (
                    <Badge tone="green">confirmado</Badge>
                  ) : (
                    <Badge tone="red">não confirmado</Badge>
                  )}
                </>
              }
            />
            {evento.restricoes?.length > 0 && (
              <Linha
                k="Restrições"
                v={
                  <span className="text-amber-700">
                    {evento.restricoes
                      .map((r) => `${r.tipo} (${r.pax}${r.critico ? ' — CRÍTICO' : ''})`)
                      .join(' · ')}
                  </span>
                }
              />
            )}
            {evento.clients?.regras && Object.keys(evento.clients.regras).length > 0 && (
              <Linha
                k="Regras do cliente"
                v={
                  <span className="text-xs text-neutral-500">
                    {(evento.clients.regras as { obs?: string }).obs ?? 'Ver cadastro do cliente'}
                  </span>
                }
              />
            )}
          </dl>
        </Card>

        <div className="space-y-6 lg:col-span-2">
          <PedidosEspeciaisCard eventId={evento.id} />
          <ServicosCard
            eventoId={evento.id}
            servicos={servicos ?? []}
            podeEditar={editarComercial}
          />

          <Card
            title={
              <span className="flex items-center gap-2">
                Fases da esteira
                {liberado ? (
                  <Badge tone="green">✅ Contrato assinado — operação liberada</Badge>
                ) : (
                  <Badge tone="amber">🔒 {etapaLabel} — operação bloqueada</Badge>
                )}
              </span>
            }
          >
            {!liberado && (
              <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Programação, Comandas e Plaquinhas só abrem com o <b>contrato assinado</b>.
                {verComercial ? (
                  <>
                    {' '}
                    Mova o evento no{' '}
                    <Link to="/eventos" className="font-semibold underline">
                      pipeline
                    </Link>{' '}
                    quando o cliente fechar.
                  </>
                ) : (
                  ' O comercial libera quando o cliente fechar.'
                )}
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {/* a proposta é a tela do orçamento — não abre para a cozinha */}
              {verComercial && (
                <>
                  <Link to={`/eventos/${evento.id}/proposta`}>
                    <Button>1 · Abrir Proposta</Button>
                  </Link>
                  <Link to={`/eventos/${evento.id}/contrato`}>
                    <Button>2 · Contrato</Button>
                  </Link>
                </>
              )}
              {liberado ? (
                <>
                  <Link to={`/eventos/${evento.id}/programacao`}>
                    <Button>3 · Abrir Programação</Button>
                  </Link>
                  <Link to={`/eventos/${evento.id}/producao`}>
                    <Button>4 · Abrir Produção</Button>
                  </Link>
                  <Link to="/compras">
                    <Button variant="secondary">5 · Compras</Button>
                  </Link>
                </>
              ) : (
                <>
                  <Button variant="secondary" disabled title="Requer contrato assinado">
                    🔒 3 · Programação
                  </Button>
                  <Button variant="secondary" disabled title="Requer contrato assinado">
                    🔒 4 · Produção (comanda + plaquinha)
                  </Button>
                </>
              )}
            </div>
            {verComercial && (
              <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-neutral-600">
                <li>Cadastrar todos os serviços do evento (tipo, linha, dia, horários).</li>
                <li>Na Proposta: montar cardápio, conferir preço/CMV e gerar o .pptx.</li>
                <li>
                  Marcar como <b>enviada</b> — fica pendente e editável até o cliente responder.
                </li>
                <li>
                  Cliente aprovou → esteira avança e os serviços sobem na <b>agenda do Google</b>.
                </li>
              </ol>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

function Linha({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{k}</dt>
      <dd>{v}</dd>
    </div>
  )
}

// ------------------------------------------------------------
// Serviços do evento (com cálculo automático de reposição)
// ------------------------------------------------------------

const TIPOS: ServiceType[] = [
  'welcome_coffee',
  'coffee_break',
  'auditorio',
  'brunch',
  'coquetel',
  'bar',
  'almoco',
  'jantar',
  'coquetel_pizza',
  'kit',
]

const LINHAS: ServiceLine[] = ['basic', 'standard', 'executive', 'master', 'premium', 'pizza', 'cortesia']

function ServicosCard({
  eventoId,
  servicos,
  podeEditar,
}: {
  eventoId: string
  servicos: EventService[]
  podeEditar: boolean
}) {
  const qc = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState({
    service_type: 'coffee_break' as ServiceType,
    service_line: 'executive' as ServiceLine,
    dia: '',
    periodo: 'manha' as 'manha' | 'tarde' | 'noite',
    hora_inicio: '',
    hora_fim: '',
    pax: '',
    cardapio_interno: '',
  })

  // Preview da reposição calculada pelo engine
  const preview =
    form.hora_inicio && form.hora_fim
      ? calcReposicao(form.service_type, duracaoMin(form.hora_inicio, form.hora_fim))
      : null

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!form.dia) return setErro('Informe o dia do serviço.')
    if (!form.hora_inicio || !form.hora_fim)
      return setErro('Informe horário de INÍCIO e FIM (gate — define a reposição).')

    const repo = calcReposicao(form.service_type, duracaoMin(form.hora_inicio, form.hora_fim))
    if (repo.status === 'nao_permitido') return setErro(repo.mensagem!)
    if (repo.status === 'escalar_diretor') return setErro(repo.mensagem!)

    const { error } = await supabase.from('event_services').insert({
      event_id: eventoId,
      service_type: form.service_type,
      service_line: form.service_line,
      dia: form.dia,
      periodo: form.periodo,
      hora_inicio: form.hora_inicio,
      hora_fim: form.hora_fim,
      reposicao_pct: repo.pct,
      pax: form.pax ? Number(form.pax) : null,
      cardapio_interno: form.cardapio_interno.trim() || null,
    })
    if (error) return setErro(error.message)
    setAberto(false)
    await qc.invalidateQueries({ queryKey: ['servicos', eventoId] })
  }

  async function remover(sid: string) {
    await supabase.from('event_services').delete().eq('id', sid)
    await qc.invalidateQueries({ queryKey: ['servicos', eventoId] })
  }

  return (
    <Card
      title="Serviços contratados"
      actions={
        podeEditar ? (
          <Button variant="secondary" onClick={() => setAberto(!aberto)}>
            {aberto ? 'Fechar' : '+ Adicionar serviço'}
          </Button>
        ) : undefined
      }
    >
      {podeEditar && aberto && (
        <form onSubmit={adicionar} className="mb-5 rounded-lg bg-neutral-50 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Select
              label="Serviço"
              value={form.service_type}
              onChange={(e) => setForm({ ...form, service_type: e.target.value as ServiceType })}
            >
              {TIPOS.map((t) => (
                <option key={t} value={t}>
                  {SERVICE_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            <Select
              label="Linha"
              value={form.service_line}
              onChange={(e) => setForm({ ...form, service_line: e.target.value as ServiceLine })}
            >
              {LINHAS.map((l) => (
                <option key={l} value={l}>
                  {SERVICE_LINE_LABEL[l]}
                </option>
              ))}
            </Select>
            <Input
              label="Dia"
              type="date"
              value={form.dia}
              onChange={(e) => setForm({ ...form, dia: e.target.value })}
              required
            />
            <Select
              label="Período"
              value={form.periodo}
              onChange={(e) =>
                setForm({ ...form, periodo: e.target.value as 'manha' | 'tarde' | 'noite' })
              }
            >
              <option value="manha">Manhã</option>
              <option value="tarde">Tarde</option>
              <option value="noite">Noite</option>
            </Select>
            <Input
              label="Início"
              type="time"
              value={form.hora_inicio}
              onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
              required
            />
            <Input
              label="Fim"
              type="time"
              value={form.hora_fim}
              onChange={(e) => setForm({ ...form, hora_fim: e.target.value })}
              required
            />
            <Input
              label="PAX deste serviço"
              type="number"
              min="1"
              placeholder="= do evento"
              value={form.pax}
              onChange={(e) => setForm({ ...form, pax: e.target.value })}
            />
            <div className="col-span-2">
              <Input
                label='Cardápio interno (regra "(interna)")'
                placeholder="Ex.: Executive — nome real Pieggi"
                value={form.cardapio_interno}
                onChange={(e) => setForm({ ...form, cardapio_interno: e.target.value })}
              />
            </div>
          </div>

          {preview && (
            <p
              className={`mt-3 text-sm ${
                preview.status === 'ok'
                  ? preview.pct > 0
                    ? 'text-amber-700'
                    : 'text-green-700'
                  : 'text-red-700'
              }`}
            >
              {preview.status === 'ok'
                ? preview.pct > 0
                  ? `⏱️ Reposição automática: +${preview.pct}% (tempo extra de ${preview.extraMin} min) — incide em preço E quantidade`
                  : '⏱️ Dentro da duração base — sem reposição'
                : `🛑 ${preview.mensagem}`}
            </p>
          )}
          {erro && <p className="mt-2 text-sm text-red-600">🛑 {erro}</p>}

          <div className="mt-4">
            <Button type="submit">Adicionar</Button>
          </div>
        </form>
      )}

      {!servicos.length ? (
        <EmptyState>Nenhum serviço cadastrado. Adicione os serviços contratados do evento.</EmptyState>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Dia</Th>
              <Th>Serviço</Th>
              <Th>Linha</Th>
              <Th>Horário</Th>
              <Th>Reposição</Th>
              {podeEditar && <Th></Th>}
            </tr>
          </thead>
          <tbody>
            {servicos.map((s) => (
              <tr key={s.id}>
                <Td>
                  {formatDiaMes(s.dia)}
                  {s.periodo ? ` · ${PERIOD_LABEL[s.periodo]}` : ''}
                </Td>
                <Td>
                  {SERVICE_TYPE_LABEL[s.service_type]}
                  {s.cardapio_interno && (
                    <span className="ml-1 text-xs text-neutral-400">
                      (interno: {s.cardapio_interno})
                    </span>
                  )}
                </Td>
                <Td>{s.service_line ? SERVICE_LINE_LABEL[s.service_line] : '—'}</Td>
                <Td>
                  {s.hora_inicio?.slice(0, 5)} – {s.hora_fim?.slice(0, 5)}
                </Td>
                <Td>
                  {Number(s.reposicao_pct) > 0 ? (
                    <Badge tone="amber">+{Number(s.reposicao_pct)}%</Badge>
                  ) : (
                    <Badge tone="green">—</Badge>
                  )}
                </Td>
                {podeEditar && (
                  <Td className="text-right">
                    <Button variant="ghost" onClick={() => remover(s.id)}>
                      ✕
                    </Button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
