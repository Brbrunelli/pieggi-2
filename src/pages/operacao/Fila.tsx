// ============================================================
// FILA DE TRABALHO DA OPERAÇÃO
// Lista os eventos com contrato assinado e o que falta fazer em
// cada fase — Programação, Comandas, Plaquinhas. Ordena por
// urgência (quanto falta para o evento) e destaca o que atrasou.
// ============================================================

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, PageTitle, Td, Th } from '@/components/ui'
import { ETAPA_FECHADO, nomeCliente, type PieggiEvent } from '@/types'
import { formatDiaMes } from '@/engine'

export type FaseOperacao = 'programacao' | 'producao'

interface ConfigFase {
  titulo: string
  emoji: string
  tabela: 'schedules' | 'production_orders'
  rota: FaseOperacao
  /** dias antes do evento em que a fase precisa estar pronta */
  prazoDias: number
  descricao: string
  labelPronto: string
}

const CONFIG: Record<FaseOperacao, ConfigFase> = {
  programacao: {
    titulo: 'Programação',
    emoji: '📋',
    tabela: 'schedules',
    rota: 'programacao',
    prazoDias: 4,
    descricao:
      'Ficha operacional das copeiras — cardápio, quantidades e checklist. É o único ponto editável da operação.',
    labelPronto: 'Aprovada',
  },
  producao: {
    titulo: 'Produção',
    emoji: '🔥',
    // a comanda é o artefato que marca a fase; a plaquinha sai no mesmo
    // clique, então acompanhar as duas tabelas diria a mesma coisa
    tabela: 'production_orders',
    rota: 'producao',
    prazoDias: 2,
    descricao:
      'Comanda das 6 estações (.docx) e plaquinhas trilíngues (PDF) — geradas juntas da programação aprovada.',
    labelPronto: 'Gerada',
  },
}

type Situacao = 'nao_iniciado' | 'em_montagem' | 'pronto'

interface ItemFila {
  evento: PieggiEvent & { clients: { nome: string } | null }
  primeiraData: string | null
  diasAte: number | null
  situacao: Situacao
  atrasado: boolean
}

export default function FilaOperacao({ fase }: { fase: FaseOperacao }) {
  const cfg = CONFIG[fase]

  const { data, isLoading } = useQuery({
    queryKey: ['fila-operacao', fase],
    queryFn: async (): Promise<ItemFila[]> => {
      const [evRes, servRes, artRes] = await Promise.all([
        supabase
          .from('events')
          .select('*, clients(nome)')
          .eq('pipeline', ETAPA_FECHADO)
          .not('status', 'in', '("concluido","cancelado")'),
        supabase.from('event_services').select('event_id, dia'),
        supabase.from(cfg.tabela).select('event_id, aprovado_em'),
      ])
      if (evRes.error) throw evRes.error

      const hoje = new Date().toISOString().slice(0, 10)
      const servicos = (servRes.data ?? []) as { event_id: string; dia: string }[]
      const artefatos = (artRes.data ?? []) as { event_id: string; aprovado_em: string | null }[]

      return (evRes.data as (PieggiEvent & { clients: { nome: string } | null })[])
        .map((evento) => {
          const dias = servicos.filter((s) => s.event_id === evento.id).map((s) => s.dia).sort()
          const primeiraData = dias[0] ?? null
          const diasAte = primeiraData
            ? Math.round((new Date(primeiraData).getTime() - new Date(hoje).getTime()) / 86400000)
            : null

          const art = artefatos.filter((a) => a.event_id === evento.id)
          const situacao: Situacao = !art.length
            ? 'nao_iniciado'
            : art.some((a) => a.aprovado_em)
              ? 'pronto'
              : 'em_montagem'

          return {
            evento,
            primeiraData,
            diasAte,
            situacao,
            atrasado: situacao !== 'pronto' && diasAte != null && diasAte <= cfg.prazoDias,
          }
        })
        .sort((a, b) => (a.diasAte ?? 9999) - (b.diasAte ?? 9999))
    },
  })

  const pendentes = (data ?? []).filter((i) => i.situacao !== 'pronto')
  const prontos = (data ?? []).filter((i) => i.situacao === 'pronto')
  const atrasados = pendentes.filter((i) => i.atrasado)

  return (
    <div>
      <PageTitle>
        {cfg.emoji} {cfg.titulo}
      </PageTitle>
      <p className="mb-6 text-sm text-neutral-500">
        {cfg.descricao} Só aparecem eventos com <b>contrato assinado</b>.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <div className={`text-3xl font-bold ${atrasados.length ? 'text-red-600' : ''}`}>
            {atrasados.length}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
            🔴 No prazo limite ({cfg.prazoDias}d)
          </div>
        </Card>
        <Card>
          <div className="text-3xl font-bold">{pendentes.length}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">A fazer</div>
        </Card>
        <Card>
          <div className="text-3xl font-bold text-green-700">{prontos.length}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
            {cfg.labelPronto}
          </div>
        </Card>
      </div>

      <Card title={`Fila de trabalho (${pendentes.length})`} className="mb-6">
        {isLoading ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !pendentes.length ? (
          <EmptyState>
            Nada pendente por aqui. 🎉
            <br />
            <span className="text-xs">
              Eventos aparecem nesta fila assim que o contrato é assinado no{' '}
              <Link to="/eventos" className="underline">
                pipeline
              </Link>
              .
            </span>
          </EmptyState>
        ) : (
          <Tabela itens={pendentes} cfg={cfg} />
        )}
      </Card>

      {prontos.length > 0 && (
        <Card title={`${cfg.labelPronto} (${prontos.length})`}>
          <Tabela itens={prontos} cfg={cfg} />
        </Card>
      )}
    </div>
  )
}

function Tabela({ itens, cfg }: { itens: ItemFila[]; cfg: ConfigFase }) {
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <Th>Evento</Th>
          <Th>Cliente</Th>
          <Th>Data</Th>
          <Th>Pax</Th>
          <Th>Situação</Th>
          <Th></Th>
        </tr>
      </thead>
      <tbody>
        {itens.map((i) => (
          <tr key={i.evento.id} className={i.atrasado ? 'bg-red-50' : ''}>
            <Td>
              <Link to={`/eventos/${i.evento.id}`} className="font-medium hover:underline">
                {i.evento.nome}
              </Link>
            </Td>
            <Td>{nomeCliente(i.evento)}</Td>
            <Td className="whitespace-nowrap">
              {i.primeiraData ? (
                <span
                  className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                    i.atrasado
                      ? 'bg-red-100 text-red-700'
                      : i.diasAte != null && i.diasAte <= 7
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-neutral-100 text-neutral-600'
                  }`}
                >
                  {formatDiaMes(i.primeiraData)}
                  {i.diasAte != null && i.diasAte >= 0 && ` · ${i.diasAte}d`}
                  {i.diasAte != null && i.diasAte < 0 && ' · passou'}
                </span>
              ) : (
                <span className="text-xs text-neutral-400">sem data</span>
              )}
            </Td>
            <Td>{i.evento.pax ?? '—'}</Td>
            <Td>
              {i.situacao === 'pronto' ? (
                <Badge tone="green">✅ {cfg.labelPronto}</Badge>
              ) : i.situacao === 'em_montagem' ? (
                <Badge tone="amber">Em montagem</Badge>
              ) : (
                <Badge tone="neutral">Não iniciada</Badge>
              )}
            </Td>
            <Td className="text-right">
              <Link to={`/eventos/${i.evento.id}/${cfg.rota}`}>
                <Button variant={i.situacao === 'pronto' ? 'ghost' : 'secondary'}>
                  {i.situacao === 'pronto' ? 'Ver' : 'Abrir'} →
                </Button>
              </Link>
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
