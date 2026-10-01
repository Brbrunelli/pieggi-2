// ============================================================
// PAINEL — visão gerencial da esteira
//
// Duas leituras na mesma tela:
//   1. NÚMERO — faturamento, pessoas, ticket médio, receita por mês
//   2. RISCO  — o que está travado e estoura prazo se ninguém agir hoje
//
// O número vem do orçamento dos eventos FECHADOS (contrato assinado).
// Proposta em aberto não conta como receita — senão o painel mente.
// ============================================================

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Badge, Card, EmptyState, PageTitle, Td, Th } from '@/components/ui'
import {
  ETAPA_FECHADO,
  EVENT_STATUS_LABEL,
  FASES,
  faseAtual,
  PIPELINE,
  SERVICE_TYPE_LABEL,
  type PieggiEvent,
  type ServiceLine,
  type ServiceType,
} from '@/types'
import { calcPreco, formatBRL, formatDiaMes } from '@/engine'
import { usePermissoes } from '@/lib/permissoes'
import PainelRua from '@/components/campo/PainelRua'
import { hojeLocal, isoLocal } from '@/engine/datas'

interface ServicoLeve {
  id: string
  event_id: string
  dia: string
  hora_inicio: string | null
  service_type: ServiceType
  service_line: ServiceLine | null
  reposicao_pct: number | string
  pax: number | null
}

interface ItemEscolhido {
  event_service_id: string
  quantidade: number | string | null
  unidade: string
  catalog_items: { nome: string; categoria: string } | null
  descricao_livre: string | null
}

interface CustoErpLeve {
  catalog_item_id: string | null
  produto: string
  categoria: string | null
  custo: number | string | null
  unidade_comercial: string
}

/** Uma linha da curva ABC. */
interface LinhaAbc {
  nome: string
  valor: number
  detalhe: string
  pct: number
  acumulado: number
  classe: 'A' | 'B' | 'C'
}

/**
 * Curva ABC clássica: ordena por valor, acumula, e corta em 80% (A) e
 * 95% (B). O resto é C — a cauda que ocupa espaço e não paga a conta.
 */
function montarAbc(itens: { nome: string; valor: number; detalhe: string }[]): LinhaAbc[] {
  const total = itens.reduce((s, i) => s + i.valor, 0)
  if (total <= 0) return []
  let acc = 0
  return itens
    .filter((i) => i.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .map((i) => {
      const pct = (i.valor / total) * 100
      acc += pct
      return {
        ...i,
        pct,
        acumulado: acc,
        classe: acc <= 80 ? 'A' : acc <= 95 ? 'B' : 'C',
      } as LinhaAbc
    })
}

interface EventoCEO extends PieggiEvent {
  clients: { nome: string } | null
  /** dia do primeiro serviço — quando o evento ACONTECE (competência) */
  primeiraData: string | null
  /** quando o cliente aprovou — quando o comercial FECHOU */
  fechadoEm: string | null
  diasAte: number | null
  pedidosPendentes: number
  /** `financeiro` some para quem não pode ver valores */
  alertas: { nivel: 'vermelho' | 'amarelo'; texto: string; financeiro?: boolean }[]
}

/**
 * As duas leituras do mesmo mês:
 *
 *   FECHAMENTO  — o que o comercial vendeu no mês (data do aceite)
 *   COMPETÊNCIA — o que a operação entrega no mês (data do evento)
 *
 * Um evento fechado em maio para agosto conta no fechamento de maio e na
 * competência de agosto. Somar os dois no mesmo número esconde os dois.
 */
type Base = 'fechamento' | 'competencia'

const BASES: { key: Base; label: string; descricao: string; dataDe: (e: EventoCEO) => string | null }[] =
  [
    {
      key: 'fechamento',
      label: 'FECHAMENTO',
      descricao: 'o que o comercial fechou no mês — pela data do aceite do cliente',
      dataDe: (e) => e.fechadoEm,
    },
    {
      key: 'competencia',
      label: 'COMPETÊNCIA',
      descricao: 'o que a operação entrega no mês — pela data do evento',
      dataDe: (e) => e.primeiraData,
    },
  ]

// prazo mínimo (dias antes do evento) para cada fase estar CONCLUÍDA.
// Os índices seguem FASES: 0 proposta · 1 contrato · 2 programação ·
// 3 produção · 4 compras.
const PRAZO_FASE: { idx: number; dias: number; nome: string }[] = [
  { idx: 0, dias: 10, nome: 'Proposta aprovada' },
  { idx: 1, dias: 7, nome: 'Contrato assinado' },
  { idx: 2, dias: 4, nome: 'Programação aprovada' },
  { idx: 3, dias: 2, nome: 'Produção gerada (comanda + plaquinha)' },
]

const MES_CURTO = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ']

// ------------------------------------------------------------
// Peças visuais
// ------------------------------------------------------------

function Kpi({
  rotulo,
  valor,
  variacao,
  nota,
}: {
  rotulo: string
  valor: string
  variacao?: number | null
  nota?: string
}) {
  return (
    <Card>
      <div className="pg-key">{rotulo}</div>
      <div className="pg-metric mt-2 text-[32px] leading-none">{valor}</div>
      {variacao != null && Number.isFinite(variacao) ? (
        <div
          className={`mt-1.5 text-xs font-semibold ${variacao < 0 ? 'text-red-700' : 'text-green-700'}`}
        >
          {variacao < 0 ? '▼' : '▲'} {Math.abs(variacao).toFixed(1).replace('.', ',')}%{' '}
          <span className="font-normal text-neutral-500">vs. período anterior</span>
        </div>
      ) : (
        nota && <div className="mt-1.5 text-xs text-neutral-500">{nota}</div>
      )}
    </Card>
  )
}

/**
 * Barras em CSS puro — sem biblioteca de gráfico.
 * O mês que cai dentro do período escolhido sai em verde.
 */
function ReceitaPorMes({
  meses,
}: {
  meses: { rotulo: string; chave: string; valor: number; dentro?: boolean }[]
}) {
  const topo = Math.max(...meses.map((m) => m.valor), 1)
  return (
    <div>
      <div className="flex h-[190px] items-end gap-2.5">
        {meses.map((m) => (
          <div
            key={m.chave}
            title={`${m.rotulo}: ${formatBRL(m.valor)}`}
            className={`flex-1 rounded-t-[3px] transition-all duration-1000 hover:bg-green-700 ${
              m.dentro ? 'bg-green-700' : 'bg-[var(--pg-text)]'
            }`}
            style={{
              height: `${Math.max((m.valor / topo) * 100, m.valor > 0 ? 4 : 0)}%`,
              transitionTimingFunction: 'cubic-bezier(.16,1,.3,1)',
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex gap-2.5">
        {meses.map((m) => (
          <span
            key={m.chave}
            className={`pg-key flex-1 text-center ${m.dentro ? '!text-[var(--pg-text)]' : ''}`}
          >
            {m.rotulo}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Tabela da curva ABC com a barra de participação e a classe. */
function CurvaAbc({
  linhas,
  unidade,
  vazio,
  rodape,
}: {
  linhas: LinhaAbc[]
  unidade: 'moeda'
  vazio: string
  rodape?: string
}) {
  if (!linhas.length) return <EmptyState>{vazio}</EmptyState>
  const total = linhas.reduce((s, l) => s + l.valor, 0)
  const corClasse = { A: 'green', B: 'amber', C: 'neutral' } as const

  return (
    <div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <Th> </Th>
            <Th>Item</Th>
            <Th>{unidade === 'moeda' ? 'Valor' : 'Qtd'}</Th>
            <Th>Part.</Th>
            <Th>Acum.</Th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.nome} className="transition-colors hover:bg-[var(--pg-bg)]">
              <Td className="w-8">
                <Badge tone={corClasse[l.classe]}>{l.classe}</Badge>
              </Td>
              <Td>
                <div className="font-medium">{l.nome}</div>
                <div className="pg-key !normal-case">{l.detalhe}</div>
              </Td>
              <Td className="whitespace-nowrap font-mono text-xs">{formatBRL(l.valor)}</Td>
              <Td className="w-32">
                <div className="flex items-center gap-2">
                  <div className="h-1 flex-1 rounded-full bg-[var(--pg-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--pg-text)]"
                      style={{ width: `${l.pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-neutral-500">
                    {l.pct.toFixed(0)}%
                  </span>
                </div>
              </Td>
              <Td className="font-mono text-[10px] text-neutral-500">
                {l.acumulado.toFixed(0)}%
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-neutral-500">
        Total {formatBRL(total)} · <b>A</b> até 80% do acumulado · <b>B</b> até 95% · <b>C</b> o
        resto.
        {rodape && ` ${rodape}`}
      </p>
    </div>
  )
}

// ------------------------------------------------------------

/** Primeiro e último dia do mês de uma data ISO. */
function limitesDoMes(iso: string): [string, string] {
  const d = new Date(iso + 'T12:00')
  const ini = new Date(d.getFullYear(), d.getMonth(), 1)
  const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  const fmt = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
  return [fmt(ini), fmt(fim)]
}

function somaDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00')
  d.setDate(d.getDate() + n)
  return isoLocal(d)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 86400000) + 1
}

export default function Dashboard() {
  // a cozinha usa este painel como agenda de produção: mesma tela, sem
  // faturamento, ticket, curva ABC nem funil
  const { verValores } = usePermissoes()
  const [base, setBase] = useState<Base>('fechamento')
  const [periodo, setPeriodo] = useState<{ de: string; ate: string }>(() => {
    const [de, ate] = limitesDoMes(hojeLocal())
    return { de, ate }
  })

  const { data, isLoading } = useQuery({
    queryKey: ['painel'],
    queryFn: async () => {
      const [evRes, servRes, pedRes, logRes, precoRes, itensRes, erpRes] = await Promise.all([
        supabase.from('events').select('*, clients(nome)').neq('status', 'cancelado'),
        supabase
          .from('event_services')
          .select('id, event_id, dia, hora_inicio, service_type, service_line, reposicao_pct, pax'),
        supabase
          .from('special_requests')
          .select('event_id, fases, verificacoes, resolvido')
          .eq('resolvido', false),
        // quando cada evento virou "aprovado" = data do fechamento comercial
        supabase
          .from('pipeline_log')
          .select('event_id, criado_em')
          .eq('para', 'aprovado')
          .order('criado_em', { ascending: true }),
        supabase.from('price_items').select('price_table_id, service_type, service_line, preco_pax'),
        supabase
          .from('service_items')
          .select('event_service_id, quantidade, unidade, descricao_livre, catalog_items(nome, categoria)'),
        supabase
          .from('erp_produtos')
          .select('catalog_item_id, produto, categoria, custo, unidade_comercial')
          .eq('ativo', true),
      ])
      if (evRes.error) throw evRes.error

      const hoje = hojeLocal()
      const servicos = (servRes.data ?? []) as ServicoLeve[]

      // primeira aprovação de cada evento (reaprovar depois não muda a venda)
      const primeiraAprovacao = new Map<string, string>()
      for (const l of (logRes.data ?? []) as { event_id: string; criado_em: string }[]) {
        if (!primeiraAprovacao.has(l.event_id)) primeiraAprovacao.set(l.event_id, l.criado_em)
      }
      const pedidos = (pedRes.data ?? []) as {
        event_id: string
        fases: string[]
        verificacoes: Record<string, unknown>
      }[]

      const eventos = (evRes.data as (PieggiEvent & { clients: { nome: string } | null })[]).map(
        (e): EventoCEO => {
          const dias = servicos
            .filter((s) => s.event_id === e.id)
            .map((s) => s.dia)
            .sort()
          const primeiraData = dias[0] ?? null
          const diasAte = primeiraData
            ? Math.round((new Date(primeiraData).getTime() - new Date(hoje).getTime()) / 86400000)
            : null
          const idx = faseAtual(e.status)

          const pendCount = pedidos
            .filter((p) => p.event_id === e.id)
            .reduce((a, p) => a + p.fases.filter((f) => !(f in p.verificacoes)).length, 0)

          const alertas: EventoCEO['alertas'] = []
          if (e.status === 'proposta_enviada')
            alertas.push({
              nivel: diasAte != null && diasAte <= 7 ? 'vermelho' : 'amarelo',
              texto: 'Proposta pendente — cobrar resposta do cliente',
            })
          if (e.status === 'proposta_recusada')
            alertas.push({ nivel: 'amarelo', texto: 'Proposta recusada — reabrir ou encerrar' })
          if (!e.endereco_confirmado)
            alertas.push({ nivel: 'amarelo', texto: 'Endereço não confirmado' })
          if (!e.orcamento_valor)
            alertas.push({
              nivel: 'amarelo',
              texto: 'Sem valor de orçamento (verba 8% não calcula)',
              financeiro: true,
            })
          if (!primeiraData)
            alertas.push({ nivel: 'amarelo', texto: 'Nenhum serviço/data cadastrado' })
          if (pendCount > 0)
            alertas.push({
              nivel: 'vermelho',
              texto: `${pendCount} verificação(ões) de pedido especial pendente(s)`,
            })
          if (diasAte != null && diasAte >= 0) {
            for (const p of PRAZO_FASE) {
              if (idx <= p.idx && diasAte <= p.dias) {
                alertas.push({
                  nivel: 'vermelho',
                  texto: `TRAVADO: faltam ${diasAte} dia(s) e "${p.nome}" ainda não aconteceu`,
                })
                break
              }
            }
          }

          // o log é a fonte; se o evento foi aprovado antes do log existir,
          // vale o carimbo da última mudança de etapa
          const fechadoEm =
            primeiraAprovacao.get(e.id)?.slice(0, 10) ??
            (e.pipeline === 'aprovado' ? (e.pipeline_em ?? '').slice(0, 10) || null : null)

          return { ...e, primeiraData, fechadoEm, diasAte, pedidosPendentes: pendCount, alertas }
        }
      )

      return {
        eventos,
        servicos,
        hoje,
        precos: (precoRes.data ?? []) as {
          price_table_id: string
          service_type: ServiceType
          service_line: ServiceLine | null
          preco_pax: number | string
        }[],
        itens: (itensRes.data ?? []) as unknown as ItemEscolhido[],
        erp: (erpRes.data ?? []) as unknown as CustoErpLeve[],
      }
    },
  })

  const eventos = data?.eventos ?? []
  const servicos = data?.servicos ?? []
  const precos = data?.precos ?? []
  const itens = data?.itens ?? []
  const erp = data?.erp ?? []
  const hoje = data?.hoje ?? hojeLocal()

  const ativos = eventos.filter((e) => e.status !== 'concluido')
  const travados = ativos.filter((e) => e.alertas.some((a) => a.nivel === 'vermelho'))

  // ---------- números: fechamento × competência ----------
  // Só evento aprovado vira dinheiro. Proposta em aberto não é receita.
  const aprovados = eventos.filter((e) => e.pipeline === ETAPA_FECHADO)
  const cfg = BASES.find((b) => b.key === base)!

  /** Eventos cuja data (da leitura escolhida) cai no intervalo. */
  const noPeriodo = (b: Base, de: string, ate: string) => {
    const dataDe = BASES.find((x) => x.key === b)!.dataDe
    return aprovados.filter((e) => {
      const d = dataDe(e)
      return d != null && d >= de && d <= ate
    })
  }

  const resumo = (b: Base, de: string, ate: string) => {
    const lista = noPeriodo(b, de, ate)
    return {
      valor: lista.reduce((s, e) => s + Number(e.orcamento_valor ?? 0), 0),
      qtd: lista.length,
      pax: lista.reduce((s, e) => s + (e.pax ?? 0), 0),
    }
  }

  const atual = resumo(base, periodo.de, periodo.ate)

  // período anterior de MESMA duração — assim a comparação vale para
  // qualquer recorte, não só para mês cheio
  const duracao = diasEntre(periodo.de, periodo.ate)
  const anterior = resumo(base, somaDias(periodo.de, -duracao), somaDias(periodo.de, -1))
  const variacao =
    anterior.valor > 0 ? ((atual.valor - anterior.valor) / anterior.valor) * 100 : null

  // a outra leitura do mesmo período, para referência
  const outraBase: Base = base === 'fechamento' ? 'competencia' : 'fechamento'
  const outra = resumo(outraBase, periodo.de, periodo.ate)

  const ticketEvento = atual.qtd > 0 ? atual.valor / atual.qtd : 0
  const ticketPax = atual.pax > 0 ? atual.valor / atual.pax : 0

  const desloca = (mes: string, n: number) => {
    const d = new Date(mes + '-15T12:00')
    d.setMonth(d.getMonth() + n)
    return d.toISOString().slice(0, 7)
  }

  // 8 meses terminando no mês do fim do período (o gráfico continua mensal
  // mesmo com recorte por dia — serve para ver a tendência ao redor)
  const mesFim = periodo.ate.slice(0, 7)
  const meses = Array.from({ length: 8 }, (_, i) => {
    const m = desloca(mesFim, -(7 - i))
    const [ini, fim] = limitesDoMes(m + '-15')
    return {
      rotulo: MES_CURTO[Number(m.slice(5, 7)) - 1],
      chave: m,
      valor: resumo(base, ini, fim).valor,
      dentro: m >= periodo.de.slice(0, 7) && m <= mesFim,
    }
  })

  const fmtDia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  /** "JUL/26" quando é mês cheio; "03/08 a 12/08" quando é recorte. */
  const rotuloPeriodo = (() => {
    const [ini, fim] = limitesDoMes(periodo.de)
    if (periodo.de === ini && periodo.ate === fim)
      return `${MES_CURTO[Number(periodo.de.slice(5, 7)) - 1]}/${periodo.de.slice(2, 4)}`
    if (periodo.de === periodo.ate) return fmtDia(periodo.de)
    return `${fmtDia(periodo.de)} a ${fmtDia(periodo.ate)}`
  })()

  const mesCheio = (() => {
    const [ini, fim] = limitesDoMes(periodo.de)
    return periodo.de === ini && periodo.ate === fim
  })()

  /** Atalhos de período. */
  const atalhos: { label: string; aplicar: () => { de: string; ate: string } }[] = [
    { label: 'HOJE', aplicar: () => ({ de: hoje, ate: hoje }) },
    { label: '7 DIAS', aplicar: () => ({ de: somaDias(hoje, -6), ate: hoje }) },
    { label: '30 DIAS', aplicar: () => ({ de: somaDias(hoje, -29), ate: hoje }) },
    {
      label: 'ESTE MÊS',
      aplicar: () => {
        const [de, ate] = limitesDoMes(hoje)
        return { de, ate }
      },
    },
    {
      label: 'MÊS PASSADO',
      aplicar: () => {
        const [de, ate] = limitesDoMes(desloca(hoje.slice(0, 7), -1) + '-15')
        return { de, ate }
      },
    },
    { label: 'ANO', aplicar: () => ({ de: `${hoje.slice(0, 4)}-01-01`, ate: `${hoje.slice(0, 4)}-12-31` }) },
  ]

  // ---------- curvas ABC ----------
  // Os eventos do mês, na leitura escolhida. As duas curvas usam a mesma
  // base, então "o que fechei em julho" e "o que entrego em julho" têm
  // cada um o seu mix — que raramente é o mesmo.
  const eventosDoMes = aprovados.filter((e) => (() => { const d = cfg.dataDe(e); return d != null && d >= periodo.de && d <= periodo.ate })())
  const idsDoMes = new Set(eventosDoMes.map((e) => e.id))
  const servicosDoMes = servicos.filter((s) => idsDoMes.has(s.event_id))

  /** ABC de serviço — por receita: preço/pax × pax × reposição. */
  const abcServico = (() => {
    const porTipo = new Map<string, { valor: number; qtd: number }>()
    let semPreco = 0
    for (const s of servicosDoMes) {
      const ev = eventosDoMes.find((e) => e.id === s.event_id)
      const preco = precos.find(
        (p) =>
          p.price_table_id === ev?.price_table_id &&
          p.service_type === s.service_type &&
          (p.service_line ?? null) === (s.service_line ?? null)
      )
      if (!preco) {
        semPreco++
        continue
      }
      const paxS = s.pax ?? ev?.pax ?? 0
      const valor = calcPreco({
        precoPax: Number(preco.preco_pax),
        pax: paxS,
        reposicaoPct: Number(s.reposicao_pct ?? 0),
      }).comReposicao
      const atualTipo = porTipo.get(s.service_type) ?? { valor: 0, qtd: 0 }
      porTipo.set(s.service_type, { valor: atualTipo.valor + valor, qtd: atualTipo.qtd + 1 })
    }
    const linhas = montarAbc(
      [...porTipo].map(([tipo, v]) => ({
        nome: SERVICE_TYPE_LABEL[tipo as ServiceType] ?? tipo,
        valor: v.valor,
        detalhe: `${v.qtd} serviço(s)`,
      }))
    )
    return { linhas, semPreco }
  })()

  /** ABC de itens — por CUSTO: quantidade × custo do ERP. */
  const abcItem = (() => {
    const idsServico = new Set(servicosDoMes.map((s) => s.id))
    const semAcento = (t: string) =>
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

    const porNome = new Map<string, CustoErpLeve>()
    for (const p of erp) porNome.set(semAcento(p.produto), p)

    const acumulado = new Map<string, { custo: number; unidades: number; semCusto: boolean }>()
    let semCadastro = 0

    for (const it of itens) {
      if (!idsServico.has(it.event_service_id)) continue
      const nome = it.catalog_items?.nome ?? it.descricao_livre
      if (!nome) continue
      const qtd = Number(it.quantidade ?? 0)
      if (!qtd) continue

      // casa com o ERP: nome exato, senão o produto que contém o sabor
      const alvo = semAcento(nome)
      const achado =
        porNome.get(alvo) ??
        erp
          .filter(
            (p) =>
              (!it.catalog_items || p.categoria === it.catalog_items.categoria) &&
              semAcento(p.produto).includes(alvo)
          )
          .sort((a, b) => a.produto.length - b.produto.length)[0]

      // só soma custo de item vendido por unidade dos dois lados
      const daUnidade =
        achado && /^unidade$/i.test(achado.unidade_comercial.trim()) && it.unidade === 'un'
      if (!achado || !daUnidade) semCadastro++

      const linha = acumulado.get(nome) ?? { custo: 0, unidades: 0, semCusto: false }
      linha.unidades += qtd
      if (daUnidade) linha.custo += Number(achado!.custo ?? 0) * qtd
      else linha.semCusto = true
      acumulado.set(nome, linha)
    }

    const linhas = montarAbc(
      [...acumulado].map(([nome, v]) => ({
        nome,
        valor: v.custo,
        detalhe: `${Math.round(v.unidades).toLocaleString('pt-BR')} un`,
      }))
    )
    const semCusto = [...acumulado].filter(([, v]) => v.semCusto && v.custo === 0).length
    return { linhas, semCusto, semCadastro }
  })()

  // ---------- produção de hoje ----------
  const producaoHoje = servicos
    .filter((s) => s.dia === hoje)
    .map((s) => ({ ...s, evento: eventos.find((e) => e.id === s.event_id) }))
    .filter((s) => s.evento)
    .sort((a, b) => (a.hora_inicio ?? '').localeCompare(b.hora_inicio ?? ''))

  // ---------- próximos ----------
  const proximos = ativos
    .filter((e) => e.diasAte != null && e.diasAte >= 0)
    .sort((a, b) => (a.diasAte ?? 999) - (b.diasAte ?? 999))
    .slice(0, 8)

  const compacto = (v: number) =>
    v >= 1000 ? `R$ ${(v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',')}k` : formatBRL(v)

  return (
    <div>
      <PageTitle lead="PAINEL">Operacional</PageTitle>

      {verValores && (
      <>
      {/* ---------- seletor: leitura + mês ---------- */}
      <section className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
          {BASES.map((b) => (
            <button
              key={b.key}
              onClick={() => setBase(b.key)}
              className={`rounded-full px-5 py-2 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                base === b.key
                  ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                  : 'text-neutral-500 hover:text-[var(--pg-text)]'
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* setas: andam mês a mês quando o recorte é mês cheio,
              senão deslocam o intervalo pela própria duração */}
          <button
            onClick={() =>
              setPeriodo((p) => {
                if (mesCheio) {
                  const [de, ate] = limitesDoMes(desloca(p.de.slice(0, 7), -1) + '-15')
                  return { de, ate }
                }
                const d = diasEntre(p.de, p.ate)
                return { de: somaDias(p.de, -d), ate: somaDias(p.ate, -d) }
              })
            }
            className="rounded-full border border-[var(--pg-border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--pg-text)] hover:text-[var(--pg-bg)]"
            title="Período anterior"
          >
            ‹
          </button>

          <input
            type="date"
            value={periodo.de}
            max={periodo.ate}
            onChange={(e) => setPeriodo((p) => ({ ...p, de: e.target.value || p.de }))}
            className="rounded-lg border border-[var(--pg-border)] bg-transparent px-3 py-1.5 font-mono text-xs text-[var(--pg-text)] outline-none focus:border-[var(--pg-text)]"
          />
          <span className="text-xs text-neutral-500">até</span>
          <input
            type="date"
            value={periodo.ate}
            min={periodo.de}
            onChange={(e) => setPeriodo((p) => ({ ...p, ate: e.target.value || p.ate }))}
            className="rounded-lg border border-[var(--pg-border)] bg-transparent px-3 py-1.5 font-mono text-xs text-[var(--pg-text)] outline-none focus:border-[var(--pg-text)]"
          />

          <button
            onClick={() =>
              setPeriodo((p) => {
                if (mesCheio) {
                  const [de, ate] = limitesDoMes(desloca(p.de.slice(0, 7), 1) + '-15')
                  return { de, ate }
                }
                const d = diasEntre(p.de, p.ate)
                return { de: somaDias(p.de, d), ate: somaDias(p.ate, d) }
              })
            }
            className="rounded-full border border-[var(--pg-border)] px-3 py-1.5 text-sm transition-colors hover:bg-[var(--pg-text)] hover:text-[var(--pg-bg)]"
            title="Próximo período"
          >
            ›
          </button>
        </div>
      </section>

      {/* atalhos de período */}
      <section className="mb-3 flex flex-wrap gap-1.5">
        {atalhos.map((a) => {
          const alvo = a.aplicar()
          const ativo = alvo.de === periodo.de && alvo.ate === periodo.ate
          return (
            <button
              key={a.label}
              onClick={() => setPeriodo(alvo)}
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold tracking-[0.1em] transition-all duration-300 ${
                ativo
                  ? 'border-[var(--pg-text)] bg-[var(--pg-text)] text-[var(--pg-bg)]'
                  : 'border-[var(--pg-border)] text-neutral-500 hover:border-[var(--pg-text)] hover:text-[var(--pg-text)]'
              }`}
            >
              {a.label}
            </button>
          )
        })}
      </section>

      <p className="mb-3.5 text-xs text-neutral-500">
        Vendo <b>{cfg.label.toLowerCase()}</b> — {cfg.descricao}.
      </p>

      {/* ---------- indicadores do mês ---------- */}
      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <Kpi
          rotulo={base === 'fechamento' ? `Fechado em ${rotuloPeriodo}` : `A entregar em ${rotuloPeriodo}`}
          valor={isLoading ? '—' : compacto(atual.valor)}
          variacao={variacao}
          nota="só eventos aprovados"
        />
        <Kpi
          rotulo={base === 'fechamento' ? 'Negócios fechados' : 'Eventos no mês'}
          valor={isLoading ? '—' : String(atual.qtd)}
          nota={`${ativos.length} evento(s) ativo(s) no total`}
        />
        <Kpi
          rotulo="Pessoas"
          valor={isLoading ? '—' : atual.pax.toLocaleString('pt-BR')}
          nota={base === 'fechamento' ? 'pax vendido no mês' : 'pax a atender no mês'}
        />
        <Kpi
          rotulo="TM por pessoa"
          valor={isLoading ? '—' : ticketPax > 0 ? formatBRL(ticketPax) : '—'}
          nota="valor ÷ pessoas"
        />
        <Kpi
          rotulo="TM por evento"
          valor={isLoading ? '—' : ticketEvento > 0 ? formatBRL(ticketEvento) : '—'}
          nota="valor ÷ eventos"
        />
      </section>

      {/* a outra leitura do mesmo mês — para não confundir as duas */}
      <button
        onClick={() => setBase(outraBase)}
        className="mt-2.5 text-xs text-neutral-500 transition-colors hover:text-[var(--pg-text)]"
      >
        {outraBase === 'competencia' ? 'Competência' : 'Fechamento'} de {rotuloPeriodo}:{' '}
        <b>{compacto(outra.valor)}</b> em {outra.qtd} evento(s) ·{' '}
        <span className="underline">ver esta leitura</span>
      </button>

      <PainelRua de={periodo.de} ate={periodo.ate} />
      </>
      )}

      {/* ---------- receita e produção do dia ---------- */}
      <section
        className={`mt-3.5 grid gap-3.5 ${verValores ? 'lg:grid-cols-[1.6fr_1fr]' : ''}`}
      >
        {verValores && (
          <Card title={`Por mês · ${cfg.label.toLowerCase()}`}>
            <ReceitaPorMes meses={meses} />
          </Card>
        )}

        <Card title="Produção de hoje">
          {!producaoHoje.length ? (
            <p className="py-8 text-center text-sm text-neutral-500">Nenhum serviço hoje.</p>
          ) : (
            <ul>
              {producaoHoje.map((s, i) => (
                <li
                  key={i}
                  className="flex gap-3 border-b border-[var(--pg-border)] py-2.5 text-[13px] last:border-0"
                >
                  <b className="pg-key w-12 shrink-0 !normal-case">
                    {s.hora_inicio?.slice(0, 5) ?? '—'}
                  </b>
                  <Link to={`/eventos/${s.event_id}`} className="hover:underline">
                    {SERVICE_TYPE_LABEL[s.service_type]} ·{' '}
                    <span className="text-neutral-500">
                      {s.evento?.clients?.nome ?? s.evento?.nome}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* ---------- curvas ABC ---------- */}
      {verValores && (
      <section className="mt-9">
        <div className="pg-headline mb-1">
          <b>CURVA ABC · {rotuloPeriodo}</b>
          <i>O que sustenta</i>
        </div>
        <p className="mb-4 text-xs text-neutral-500">
          Sobre os eventos de <b>{cfg.label.toLowerCase()}</b> do mês. Serviço por{' '}
          <b>receita</b>; item por <b>custo</b> — que é onde o dinheiro sai.
        </p>

        <div className="grid gap-3.5 lg:grid-cols-2">
          <Card title="ABC de serviço · por receita">
            <CurvaAbc
              linhas={abcServico.linhas}
              unidade="moeda"
              vazio="Nenhum serviço com preço no mês."
              rodape={
                abcServico.semPreco
                  ? `${abcServico.semPreco} serviço(s) sem preço na tabela ficaram de fora.`
                  : undefined
              }
            />
          </Card>

          <Card title="ABC de item · por custo">
            <CurvaAbc
              linhas={abcItem.linhas}
              unidade="moeda"
              vazio="Nenhum item de cardápio escolhido no mês."
              rodape={
                abcItem.semCusto
                  ? `${abcItem.semCusto} item(ns) sem custo no ERP ficaram fora do valor (a quantidade continua contada).`
                  : undefined
              }
            />
          </Card>
        </div>
      </section>
      )}

      {/* ---------- travados: a decisão do dia ---------- */}
      {travados.length > 0 && (
        <section className="mt-9">
          <div className="pg-headline mb-4">
            <b>ATENÇÃO</b>
            <i>Travados</i>
          </div>
          <Card className="!border-red-700">
            <ul className="divide-y divide-[var(--pg-border)]">
              {travados.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/eventos/${e.id}`}
                    className="flex items-start gap-3 py-3 transition-colors hover:text-green-700"
                  >
                    <div className="flex-1">
                      <span className="font-semibold">{e.nome}</span>{' '}
                      <span className="text-[13px] text-neutral-500">
                        {e.clients?.nome ?? ''} · {e.pax ?? '?'} pax
                        {e.primeiraData &&
                          ` · ${formatDiaMes(e.primeiraData)} (${e.diasAte} dia${e.diasAte === 1 ? '' : 's'})`}
                      </span>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                        {e.alertas
                          .filter((a) => verValores || !a.financeiro)
                          .map((a, i) => (
                          <span
                            key={i}
                            className={`text-xs ${a.nivel === 'vermelho' ? 'text-red-700' : 'text-amber-700'}`}
                          >
                            {a.texto}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Badge tone="red">{EVENT_STATUS_LABEL[e.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* ---------- funil comercial ---------- */}
      {verValores && (
      <section className="mt-9">
        <div className="pg-headline mb-4">
          <b>COMERCIAL</b>
          <i>Funil</i>
        </div>
        <div className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
          {PIPELINE.map((col) => {
            const doFunil = ativos.filter((e) => e.pipeline === col.key)
            const valor = doFunil.reduce((s, e) => s + Number(e.orcamento_valor ?? 0), 0)
            return (
              <Link key={col.key} to="/eventos" className="group">
                <Card className="h-full">
                  <div className="pg-key">{col.label}</div>
                  <div className="pg-metric mt-2 text-[28px] leading-none">{doFunil.length}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {valor > 0 ? compacto(valor) : '—'}
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      </section>
      )}

      {/* ---------- agenda ---------- */}
      <section className="mt-9">
        <div className="pg-headline mb-4">
          <b>AGENDA</b>
          <i>Próximos eventos</i>
        </div>
        {isLoading ? (
          <EmptyState>Carregando…</EmptyState>
        ) : !proximos.length ? (
          <EmptyState>Nenhum evento com data futura cadastrada.</EmptyState>
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--pg-border)] bg-[var(--pg-surface)]">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Evento</Th>
                  <Th>Data</Th>
                  <Th>Pax</Th>
                  {verValores && <Th>Valor</Th>}
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {proximos.map((e) => (
                  <tr key={e.id} className="transition-colors hover:bg-[var(--pg-bg)]">
                    <Td>{e.clients?.nome ?? e.cliente_nome ?? 'Avulso'}</Td>
                    <Td>
                      <Link to={`/eventos/${e.id}`} className="hover:underline">
                        {e.nome}
                      </Link>
                    </Td>
                    <Td className="font-mono text-xs">
                      {e.primeiraData ? formatDiaMes(e.primeiraData) : '—'}
                      {e.diasAte != null && (
                        <span className="ml-1 text-neutral-500">· {e.diasAte}d</span>
                      )}
                    </Td>
                    <Td>{e.pax ?? '—'}</Td>
                    {verValores && (
                      <Td>{e.orcamento_valor ? formatBRL(Number(e.orcamento_valor)) : '—'}</Td>
                    )}
                    <Td>
                      <Badge
                        tone={
                          e.pipeline === ETAPA_FECHADO
                            ? 'green'
                            : e.alertas.some((a) => a.nivel === 'vermelho')
                              ? 'red'
                              : 'neutral'
                        }
                      >
                        {EVENT_STATUS_LABEL[e.status]}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- andamento da esteira ---------- */}
      <section className="mt-9">
        <div className="pg-headline mb-4">
          <b>ESTEIRA</b>
          <i>Andamento</i>
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-5">
          {FASES.map((f, fi) => {
            const naFase = ativos
              .filter((e) => faseAtual(e.status) === fi)
              .sort((a, b) => (a.diasAte ?? 999) - (b.diasAte ?? 999))
            return (
              <Card key={f.key} title={`${fi + 1} · ${f.label}`}>
                <div className="space-y-2">
                  {naFase.map((e) => {
                    const vermelho = e.alertas.some((a) => a.nivel === 'vermelho')
                    return (
                      <Link
                        key={e.id}
                        to={`/eventos/${e.id}`}
                        className={`block rounded-lg border p-2.5 text-[13px] transition-all duration-300 hover:-translate-y-0.5 ${
                          vermelho
                            ? 'border-red-700'
                            : e.alertas.length
                              ? 'border-amber-700'
                              : 'border-[var(--pg-border)]'
                        }`}
                      >
                        <div className="font-medium leading-tight">{e.nome}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {e.clients?.nome ?? 'Avulso'} · {e.pax ?? '?'} pax
                        </div>
                        {e.primeiraData && (
                          <div className="pg-key mt-1.5">
                            {formatDiaMes(e.primeiraData)}
                            {e.diasAte != null && e.diasAte >= 0 && ` · ${e.diasAte}d`}
                          </div>
                        )}
                      </Link>
                    )
                  })}
                  {!naFase.length && (
                    <p className="py-3 text-center text-xs text-neutral-300">—</p>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-neutral-500">
        Trava de prazo: proposta aprovada até 7 dias antes · programação até 4 · comandas até 2 ·
        plaquinhas até 1. Pedido especial não verificado bloqueia a aprovação da fase.
      </p>
    </div>
  )
}
