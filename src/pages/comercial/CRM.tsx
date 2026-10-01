// ============================================================
// CRM — a carteira de clientes do comercial
//
// Bruno: "quando um novo cliente entra ele automaticamente é cadastrado
// no CRM". Todo evento novo (formulário ou briefing) passa por
// garantirClienteNoCRM — o cliente nasce aqui sozinho, com o selo
// "novo (automático)" até alguém revisar o cadastro.
//
// Nada nesta tela é digitado: tudo sai do que já aconteceu.
//   eventos realizados  contrato assinado e data já passou
//   próximo evento      o primeiro por vir (qualquer etapa do funil)
//   receita / ticket    contas a receber do cliente (sem as canceladas)
//   último contato      último envio de CS
//   NPS médio           respostas do CS
//   status              lead (só proposta) · ativo (evento ≤ 180 dias
//                       ou por vir) · inativo (último há > 180 dias)
//
// Ao abrir um cliente, a linha do tempo junta funil, contrato, NPS e
// ocorrências da rua. Pipedrive: integração fica para depois.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import { formatBRL, formatDiaMes } from '@/engine'
import { hojeLocal } from '@/engine/freelas'
import { dataDoEvento, ehAutomatico, resumoCliente, type ResumoCliente } from '@/lib/crm'
import LinhaDoTempo, { type ContratoCRM, type EnvioCRM, type OcorrenciaCRM } from '@/components/crm/LinhaDoTempo'
import AvisoSemCadastro from '@/components/crm/AvisoSemCadastro'
import { PIPELINE } from '@/types'
import { ORIGEM_LABEL, STATUS_CRM_LABEL, type ClienteCRM, type EventoCRM, type StatusCRM } from '@/tipos/pessoas'

type Filtro = 'todos' | StatusCRM | 'novos'
const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'ativo', label: 'Ativos' },
  { key: 'lead', label: 'Leads' },
  { key: 'inativo', label: 'Inativos' },
  { key: 'novos', label: 'Novos (automático)' },
]
const TOM_STATUS: Record<StatusCRM, 'green' | 'amber' | 'neutral'> = { ativo: 'green', lead: 'amber', inativo: 'neutral' }

interface Receita {
  id: string
  event_id: string | null
  client_id: string | null
  valor: number
  valor_pago: number | null
  status: string
}

/** lista que pode não existir/ser negada pela RLS: vazio em vez de erro */
async function talvez<T>(q: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const { data, error } = await q
  return error ? [] : ((data ?? []) as T[])
}

export default function CRM() {
  const qc = useQueryClient()
  const { verValores, editarComercial, verComercial } = usePermissoes()
  const hoje = hojeLocal()
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [abertoId, setAbertoId] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['crm'],
    queryFn: async () => {
      const [clientes, eventos, receitas, envios, contratos, ocorrencias] = await Promise.all([
        talvez<ClienteCRM>(supabase.from('clients').select('*').order('nome')),
        talvez<EventoCRM>(
          supabase
            .from('events')
            .select(
              'id, nome, client_id, cliente_nome, contato, contato_telefone, contato_email, pipeline, pipeline_em, campo_etapa, orcamento_valor, created_at, event_services(dia)'
            )
        ),
        talvez<Receita>(supabase.from('receivables').select('id, event_id, client_id, valor, valor_pago, status')),
        talvez<EnvioCRM>(
          supabase.from('cs_envios').select('id, event_id, titulo, canal, status, enviado_em, respondido_em, nps, resposta')
        ),
        talvez<ContratoCRM>(supabase.from('contracts').select('id, event_id, status, enviado_em, assinado_em, valor')),
        talvez<OcorrenciaCRM>(
          supabase.from('event_ocorrencias').select('id, event_id, tipo, descricao, registrado_em, resolvida, resolucao')
        ),
      ])
      return { clientes, eventos, receitas, envios, contratos, ocorrencias }
    },
  })

  const carteira = useMemo(() => {
    if (!data) return []
    return data.clientes.map((c) => {
      const eventos = data.eventos.filter((e) => e.client_id === c.id)
      const ids = new Set(eventos.map((e) => e.id))
      const receitas = data.receitas.filter((r) => r.client_id === c.id || (r.event_id && ids.has(r.event_id)))
      const envios = data.envios.filter((s) => ids.has(s.event_id))
      return {
        cliente: c,
        eventos,
        envios,
        contratos: data.contratos.filter((x) => ids.has(x.event_id)),
        ocorrencias: data.ocorrencias.filter((x) => ids.has(x.event_id)),
        resumo: resumoCliente(eventos, receitas, envios, hoje),
      }
    })
  }, [data, hoje])

  const semCadastro = (data?.eventos ?? []).filter((e) => !e.client_id && e.cliente_nome?.trim())

  const contagem = (f: Filtro) =>
    carteira.filter((x) => (f === 'todos' ? true : f === 'novos' ? ehAutomatico(x.cliente) : x.resumo.status === f)).length

  const lista = carteira
    .filter((x) => (filtro === 'todos' ? true : filtro === 'novos' ? ehAutomatico(x.cliente) : x.resumo.status === filtro))
    .filter((x) => `${x.cliente.nome} ${x.cliente.email ?? ''} ${x.cliente.contato ?? ''}`.toLowerCase().includes(busca.toLowerCase()))
    .sort(
      (a, b) =>
        Number(ehAutomatico(b.cliente)) - Number(ehAutomatico(a.cliente)) ||
        (b.resumo.proximo ? 1 : 0) - (a.resumo.proximo ? 1 : 0) ||
        a.cliente.nome.localeCompare(b.cliente.nome)
    )

  const aberto = carteira.find((x) => x.cliente.id === abertoId) ?? null

  if (!verComercial)
    return (
      <div>
        <PageTitle lead="COMERCIAL">CRM</PageTitle>
        <EmptyState>O CRM é do comercial e do admin.</EmptyState>
      </div>
    )

  return (
    <div>
      <PageTitle
        lead="COMERCIAL"
        actions={
          <span title="A sincronização com o Pipedrive fica para depois — nada é enviado nem lido de lá ainda.">
            <Badge tone="neutral">Pipedrive · em breve</Badge>
          </span>
        }
      >
        CRM
      </PageTitle>

      <AvisoSemCadastro
        eventos={semCadastro}
        podeCadastrar={editarComercial}
        onFeito={async () => {
          await qc.invalidateQueries({ queryKey: ['crm'] })
          await qc.invalidateQueries({ queryKey: ['eventos'] })
        }}
      />

      {aberto && (
        <FichaCliente
          item={aberto}
          verValores={verValores}
          onFechar={() => setAbertoId(null)}
        />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:max-w-sm">
          <Input placeholder="Buscar cliente, contato ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {FILTROS.map((f) => (
          <Button key={f.key} variant={filtro === f.key ? 'primary' : 'secondary'} onClick={() => setFiltro(f.key)}>
            {f.label} ({contagem(f.key)})
          </Button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !lista.length ? (
          <EmptyState>Nenhum cliente neste filtro.</EmptyState>
        ) : (
          <>
            {/* celular */}
            <div className="flex flex-col divide-y divide-[var(--pg-border)] md:hidden">
              {lista.map((x) => (
                <button
                  key={x.cliente.id}
                  type="button"
                  className="flex flex-col items-start gap-1 py-3 text-left"
                  onClick={() => {
                    setAbertoId(x.cliente.id)
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  <span className="flex flex-wrap items-center gap-2 text-base font-medium">
                    {x.cliente.nome}
                    <Badge tone={TOM_STATUS[x.resumo.status]}>{STATUS_CRM_LABEL[x.resumo.status]}</Badge>
                    {ehAutomatico(x.cliente) && <Badge tone="blue">novo (automático)</Badge>}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {x.resumo.realizados} realizado(s)
                    {x.resumo.proximo && ` · próximo ${formatDiaMes(dataDoEvento(x.resumo.proximo))}`}
                    {verValores && x.resumo.receita > 0 && ` · ${formatBRL(x.resumo.receita)}`}
                    {x.resumo.nps != null && ` · NPS ${x.resumo.nps.toFixed(1)}`}
                  </span>
                </button>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Status</Th>
                    <Th>Realizados</Th>
                    <Th>Próximo evento</Th>
                    {verValores && <Th>Receita</Th>}
                    {verValores && <Th>Ticket médio</Th>}
                    <Th>Último contato</Th>
                    <Th>NPS</Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((x) => (
                    <tr
                      key={x.cliente.id}
                      className={`cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/5 ${abertoId === x.cliente.id ? 'bg-neutral-50 dark:bg-white/5' : ''}`}
                      onClick={() => {
                        setAbertoId(x.cliente.id)
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                    >
                      <Td>
                        <span className="font-medium">{x.cliente.nome}</span>
                        {ehAutomatico(x.cliente) && (
                          <span className="ml-2">
                            <Badge tone="blue">novo (automático)</Badge>
                          </span>
                        )}
                        {(x.cliente.contato || x.cliente.email) && (
                          <div className="text-[11px] text-neutral-500">
                            {[x.cliente.contato, x.cliente.email].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <Badge tone={TOM_STATUS[x.resumo.status]}>{STATUS_CRM_LABEL[x.resumo.status]}</Badge>
                      </Td>
                      <Td>{x.resumo.realizados}</Td>
                      <Td>
                        {x.resumo.proximo ? (
                          <>
                            {formatDiaMes(dataDoEvento(x.resumo.proximo))} · {x.resumo.proximo.nome}
                            <div className="text-[11px] text-neutral-500">
                              {PIPELINE.find((p) => p.key === x.resumo.proximo!.pipeline)?.label}
                            </div>
                          </>
                        ) : (
                          <span className="text-neutral-400">—</span>
                        )}
                      </Td>
                      {verValores && <Td>{x.resumo.receita ? formatBRL(x.resumo.receita) : '—'}</Td>}
                      {verValores && <Td>{x.resumo.ticket != null ? formatBRL(x.resumo.ticket) : '—'}</Td>}
                      <Td>{x.resumo.ultimoContato ? formatDiaMes(x.resumo.ultimoContato.slice(0, 10)) : '—'}</Td>
                      <Td>
                        <Nps r={x.resumo} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}

function Nps({ r }: { r: ResumoCliente }) {
  if (r.nps == null) return <span className="text-neutral-400">—</span>
  const tom = r.nps >= 9 ? 'green' : r.nps >= 7 ? 'amber' : 'red'
  return (
    <Badge tone={tom}>
      {r.nps.toFixed(1)} ({r.respostasNps})
    </Badge>
  )
}

function FichaCliente({
  item,
  verValores,
  onFechar,
}: {
  item: {
    cliente: ClienteCRM
    eventos: EventoCRM[]
    envios: EnvioCRM[]
    contratos: ContratoCRM[]
    ocorrencias: OcorrenciaCRM[]
    resumo: ResumoCliente
  }
  verValores: boolean
  onFechar: () => void
}) {
  const { cliente: c, resumo: r } = item
  return (
    <Card
      className="mb-6"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {c.nome}
          <Badge tone={TOM_STATUS[r.status]}>{STATUS_CRM_LABEL[r.status]}</Badge>
          {ehAutomatico(c) && <Badge tone="blue">novo (automático)</Badge>}
        </span>
      }
      actions={
        <Button variant="ghost" onClick={onFechar}>
          Fechar
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-3 text-sm">
          {ehAutomatico(c) && (
            <p className="rounded-lg bg-neutral-50 px-3 py-2 text-[13px] dark:bg-white/5">
              Entrou sozinho no CRM
              {c.origem && <> pelo <b>{ORIGEM_LABEL[c.origem] ?? c.origem}</b></>}
              {c.created_at && <> em {c.created_at.slice(0, 10).split('-').reverse().join('/')}</>}. Revise o cadastro
              (tipo, marcas, endereço) em{' '}
              <Link to="/admin/clientes" className="underline">
                Clientes
              </Link>
              .
            </p>
          )}
          <Dado rotulo="Contato" valor={[c.contato, c.telefone, c.email].filter(Boolean).join(' · ') || '—'} />
          <Dado rotulo="Endereço" valor={c.endereco ?? '—'} />
          <Dado rotulo="Eventos" valor={`${item.eventos.length} no funil · ${r.realizados} realizado(s)`} />
          <Dado
            rotulo="Próximo"
            valor={r.proximo ? `${formatDiaMes(dataDoEvento(r.proximo))} — ${r.proximo.nome}` : '—'}
          />
          {verValores && (
            <Dado
              rotulo="Receita"
              valor={
                r.receita
                  ? `${formatBRL(r.receita)} (recebido ${formatBRL(r.recebido)})${r.ticket != null ? ` · ticket ${formatBRL(r.ticket)}` : ''}`
                  : '—'
              }
            />
          )}
          <Dado rotulo="NPS médio" valor={r.nps != null ? `${r.nps.toFixed(1)} em ${r.respostasNps} resposta(s)` : 'sem resposta'} />
        </div>
        <div>
          <div className="pg-key mb-3">Linha do tempo</div>
          <LinhaDoTempo
            eventos={item.eventos}
            contratos={item.contratos}
            envios={item.envios}
            ocorrencias={item.ocorrencias}
            verValores={verValores}
          />
        </div>
      </div>
    </Card>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <div className="pg-key">{rotulo}</div>
      <div>{valor}</div>
    </div>
  )
}
