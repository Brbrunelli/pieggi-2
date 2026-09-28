import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, PageTitle } from '@/components/ui'
import {
  nomeCliente,
  paxDoServico,
  PERIOD_LABEL,
  SERVICE_LINE_LABEL,
  SERVICE_TYPE_LABEL,
  type CatalogItem,
  type Client,
  type EventService,
  type PieggiEvent,
  type ServiceItem,
} from '@/types'
import {
  qtdAlmoco,
  qtdAuditorio,
  qtdCoffeeBreak,
  qtdDips,
  qtdWelcomeCoffee,
  formatDiaMes,
  type CoffeeLinha,
  type QtdItem,
} from '@/engine'
import { paoDoLanche, recipienteDe } from '@/engine/cardapio'
import {
  avisoMarcas,
  finalizacaoNoLocal,
  itemForaDoServico,
  linhaArranjoFlores,
  receitaCompleta,
} from '@/engine/operacao'
import type { LinhaProgramacao, ServicoProgramacao } from '@/lib/docx-programacao'
import { baixarBlob, salvarDocumento } from '@/lib/documentos'
import { contarPendentes, PedidosFaseBanner } from '@/components/PedidosEspeciais'
import EsteiraEvento from '@/components/EsteiraEvento'

interface BlocoServico {
  serviceId: string
  titulo: string
  linhas: LinhaProgramacao[]
  obsEquipe: string
  ehAuditorio: boolean
}

const cima = Math.ceil

export default function Programacao() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { session } = useAuth()
  const { editarOperacao, ehCozinha } = usePermissoes()

  const { data: evento } = useQuery({
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

  const { data: itensSalvos } = useQuery({
    queryKey: ['service-items', id],
    enabled: Boolean(servicos?.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_items')
        .select('*, catalog_items(*)')
        .in('event_service_id', servicos!.map((s) => s.id))
      if (error) throw error
      return data as (ServiceItem & { catalog_items: CatalogItem | null })[]
    },
  })

  const [blocos, setBlocos] = useState<BlocoServico[]>([])
  const [carregouSnapshot, setCarregouSnapshot] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  const pax = evento?.pax ?? 0

  // monta os blocos iniciais (engine + cardápio escolhido) — Auditório sempre primeiro
  const blocosIniciais = useMemo(() => {
    if (!servicos?.length || !pax) return []
    const out: BlocoServico[] = servicos.map((s) => {
      const paxServico = paxDoServico(s, pax)
      return {
        serviceId: s.id,
        titulo: tituloServico(s, paxServico),
        linhas: montarLinhas(
          s,
          paxServico,
          (itensSalvos ?? []).filter((i) => i.event_service_id === s.id)
        ),
        obsEquipe: s.obs ?? '',
        ehAuditorio: s.service_type === 'auditorio',
      }
    })
    return [...out.filter((b) => b.ehAuditorio), ...out.filter((b) => !b.ehAuditorio)]
  }, [servicos, itensSalvos, pax])

  // carrega o snapshot salvo; senão usa o inicial
  useEffect(() => {
    if (!id || carregouSnapshot) return
    supabase
      .from('schedules')
      .select('*')
      .eq('event_id', id)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const snap = data?.snapshot as { blocos?: BlocoServico[] } | undefined
        if (snap?.blocos?.length) {
          setBlocos(snap.blocos)
          setCarregouSnapshot(true)
        }
      })
  }, [id, carregouSnapshot])

  useEffect(() => {
    if (!carregouSnapshot && blocosIniciais.length && !blocos.length) {
      setBlocos(blocosIniciais)
    }
  }, [blocosIniciais, carregouSnapshot, blocos.length])

  // ---------- ações ----------
  async function salvar(): Promise<boolean> {
    setMsg(null)
    const { data: ultima } = await supabase
      .from('schedules')
      .select('id')
      .eq('event_id', id!)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()
    const payload = { event_id: id!, snapshot: { blocos } }
    const r = ultima
      ? await supabase.from('schedules').update(payload).eq('id', ultima.id)
      : await supabase.from('schedules').insert({ ...payload, versao: 1 })
    if (r.error) {
      setMsg(`Erro ao salvar: ${r.error.message}`)
      return false
    }
    if (evento?.status === 'proposta_aprovada') {
      await supabase.from('events').update({ status: 'programacao_em_montagem' }).eq('id', id!)
      await qc.invalidateQueries({ queryKey: ['evento', id] })
    }
    setMsg('✅ Programação salva.')
    return true
  }

  async function aprovar() {
    const pendentes = await contarPendentes(id!, 'programacao')
    if (pendentes > 0) {
      setMsg(`🛑 ${pendentes} pedido(s) especial(is) do cliente não verificados nesta fase — verificar antes de aprovar.`)
      return
    }
    const ok = await salvar()
    if (!ok) return
    await supabase
      .from('schedules')
      .update({ aprovado_por: session?.user.id, aprovado_em: new Date().toISOString() })
      .eq('event_id', id!)
    await supabase.from('events').update({ status: 'programacao_aprovada' }).eq('id', id!)
    await supabase.from('approvals').insert({ event_id: id!, fase: 'programacao', user_id: session?.user.id })
    await qc.invalidateQueries({ queryKey: ['evento', id] })
    setMsg('✅ Programação APROVADA — evento avançou para a fase Comandas.')
  }

  async function gerarDocx() {
    if (!evento || !servicos?.length) return
    setGerando(true)
    setMsg(null)
    try {
      const dias = Array.from(new Set(servicos.map((s) => s.dia))).sort()
      const dataTxt =
        dias.length === 1
          ? formatDiaMes(dias[0])
          : `${formatDiaMes(dias[0])} a ${formatDiaMes(dias[dias.length - 1])}`
      const inicio = servicos[0].hora_inicio?.slice(0, 5) ?? ''
      const fim = servicos[servicos.length - 1].hora_fim?.slice(0, 5) ?? ''

      const { gerarProgramacaoDocx } = await import('@/lib/docx-programacao')
      const blob = await gerarProgramacaoDocx({
        contratante: nomeCliente(evento),
        evento: evento.nome,
        contato: evento.contato ?? '',
        data: dataTxt,
        pax: String(pax),
        horario: inicio && fim ? `${inicio} às ${fim}` : '',
        endereco: evento.endereco ?? '',
        local: evento.local_detalhe ?? undefined,
        obs: evento.obs ?? undefined,
        restricoes: evento.restricoes ?? [],
        servicos: [
          ...blocos.map(
            (b): ServicoProgramacao => ({
              titulo: b.titulo,
              linhas: b.linhas.filter((l) => l.qtd || l.receita || l.item),
              obsEquipe: b.obsEquipe || undefined,
            })
          ),
          // §14.12 e §14.15 — valem para o evento inteiro, não por serviço
          {
            titulo: 'ESTRUTURA E BEBIDAS DO EVENTO',
            linhas: [
              linhaArranjoFlores(formatDiaMes(dias[0] ?? ''), evento.nome),
              {
                qtd: '',
                receita: avisoMarcas(evento.clients?.tipo),
                item: 'Marcas de bebida',
              },
            ],
          },
        ],
      })

      const ano = dias[0]?.slice(0, 4) ?? ''
      const ddmm = dias[0]?.split('-').reverse().slice(0, 2).join('-') ?? ''
      const nome = `Pieggi Programacao - ${nomeCliente(evento)} - ${evento.nome} - ${
        evento.contato ?? 'contato'
      } - ${ddmm}-${ano}.docx`

      baixarBlob(blob, nome)
      // leitura gera só para imprimir — não sobe versão nem salva rascunho
      if (editarOperacao) {
        await salvarDocumento(evento.id, blob, nome, 'programacao_docx')
        await salvar()
      }
      setMsg(`✅ Programação gerada: ${nome}`)
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao gerar o arquivo.'}`)
    } finally {
      setGerando(false)
    }
  }

  // ---------- edição de linhas ----------
  function editarLinha(bi: number, li: number, campo: keyof LinhaProgramacao, valor: string) {
    setBlocos((prev) => {
      const novo = [...prev]
      const linhas = [...novo[bi].linhas]
      linhas[li] = { ...linhas[li], [campo]: valor }
      novo[bi] = { ...novo[bi], linhas }
      return novo
    })
  }

  function addLinha(bi: number) {
    setBlocos((prev) => {
      const novo = [...prev]
      novo[bi] = { ...novo[bi], linhas: [...novo[bi].linhas, { qtd: '', receita: '', item: '' }] }
      return novo
    })
  }

  function removerLinha(bi: number, li: number) {
    setBlocos((prev) => {
      const novo = [...prev]
      novo[bi] = { ...novo[bi], linhas: novo[bi].linhas.filter((_, j) => j !== li) }
      return novo
    })
  }

  function regenerar() {
    setBlocos(blocosIniciais)
    setCarregouSnapshot(true)
    setMsg('Linhas regeneradas a partir do cardápio e das regras (edições manuais descartadas).')
  }

  if (!evento) return <p className="text-sm text-neutral-500">Carregando…</p>

  const propostaAprovada = ![
    'rascunho',
    'proposta_em_montagem',
  ].includes(evento.status)

  // no modo leitura o campo continua sendo <input> (mesma tabela, mesma
  // altura) — só perde o hover de edição
  const campo =
    'w-full rounded border border-transparent px-1.5 py-1 focus:outline-none ' +
    (editarOperacao
      ? 'hover:border-neutral-300 focus:border-neutral-900'
      : 'cursor-default bg-transparent')

  return (
    <div>
      <PageTitle
        actions={
          <Link to={`/eventos/${id}`}>
            <Button variant="secondary">← Voltar ao evento</Button>
          </Link>
        }
      >
        Programação — {evento.nome}
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span>{pax} pax</span>
        <span className="text-neutral-400">·</span>
        <span>{evento.clients?.nome ?? 'Cliente avulso'}</span>
        {!editarOperacao && (
          <Badge tone="blue">
            {ehCozinha ? 'Cozinha — leitura e impressão' : 'Somente leitura'}
          </Badge>
        )}
        {!propostaAprovada && (
          <Badge tone="amber">⚠️ Proposta ainda não aprovada — programação parte do orçamento aprovado</Badge>
        )}
        {evento.restricoes?.length > 0 && (
          <Badge tone="red">
            {evento.restricoes.length} restrição(ões) — banner + linha sem lactose em todos os serviços
          </Badge>
        )}
      </div>

      <EsteiraEvento eventId={id!} fase="programacao" />
      <PedidosFaseBanner eventId={id!} fase="programacao" />

      {!servicos?.length ? (
        <Card>
          <EmptyState>
            Cadastre os serviços do evento antes de montar a programação.{' '}
            <Link to={`/eventos/${id}`} className="font-semibold underline">
              Ir para o evento
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {editarOperacao && (
              <Button variant="secondary" onClick={regenerar}>
                ↻ Regenerar do cardápio/regras
              </Button>
            )}
            {editarOperacao && (
              <Button variant="secondary" onClick={salvar}>
                Salvar rascunho
              </Button>
            )}
            <Button onClick={gerarDocx} disabled={gerando}>
              {gerando ? 'Gerando…' : 'Gerar .docx'}
            </Button>
            {editarOperacao && (
              <Button
                className="!bg-green-700 hover:!bg-green-600"
                onClick={aprovar}
              >
                ✓ Aprovar programação (OK explícito)
              </Button>
            )}
          </div>

          {msg && <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

          {blocos.map((b, bi) => (
            <Card
              key={b.serviceId}
              title={
                <span>
                  {b.titulo}{' '}
                  {b.ehAuditorio && <Badge tone="blue">sempre na 1ª folha</Badge>}
                </span>
              }
              actions={
                editarOperacao ? (
                  <Button variant="secondary" onClick={() => addLinha(bi)}>
                    + Linha
                  </Button>
                ) : undefined
              }
            >
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                    <th className="w-36 px-2 py-1.5">Quantidade</th>
                    <th className="px-2 py-1.5">Receita</th>
                    <th className="w-44 px-2 py-1.5">Item</th>
                    <th className="w-24 px-2 py-1.5">Destaque</th>
                    {editarOperacao && <th className="w-8"></th>}
                  </tr>
                </thead>
                <tbody>
                  {b.linhas.map((l, li) => (
                    <tr
                      key={li}
                      className={
                        l.destaque === 'amarelo'
                          ? 'bg-yellow-50'
                          : l.destaque === 'vermelho'
                            ? 'bg-red-50'
                            : ''
                      }
                    >
                      <td className="px-1 py-0.5">
                        <input
                          className={campo}
                          readOnly={!editarOperacao}
                          value={l.qtd}
                          onChange={(e) => editarLinha(bi, li, 'qtd', e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          className={campo}
                          readOnly={!editarOperacao}
                          value={l.receita}
                          onChange={(e) => editarLinha(bi, li, 'receita', e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <input
                          className={`${campo} font-medium`}
                          readOnly={!editarOperacao}
                          value={l.item}
                          onChange={(e) => editarLinha(bi, li, 'item', e.target.value)}
                        />
                      </td>
                      <td className="px-1 py-0.5">
                        <select
                          className="w-full rounded border border-transparent px-1 py-1 text-xs hover:border-neutral-300 disabled:opacity-60"
                          disabled={!editarOperacao}
                          value={l.destaque ?? ''}
                          onChange={(e) =>
                            editarLinha(bi, li, 'destaque', e.target.value as never)
                          }
                        >
                          <option value="">—</option>
                          <option value="amarelo">Amarelo (restrição)</option>
                          <option value="vermelho">Vermelho (alerta)</option>
                        </select>
                      </td>
                      {editarOperacao && (
                        <td className="px-1 text-center">
                          <button
                            className="text-neutral-300 hover:text-red-600"
                            onClick={() => removerLinha(bi, li)}
                          >
                            ✕
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* quem não edita só vê a tarja quando ela existe — campo vazio
                  na tela da equipe é ruído */}
              {(editarOperacao || b.obsEquipe) && (
                <div className="mt-3">
                  <input
                    className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm placeholder:text-amber-400"
                    placeholder="Tarja amarela — OBS para a equipe (opcional, ex.: levar biombos)"
                    readOnly={!editarOperacao}
                    value={b.obsEquipe}
                    onChange={(e) =>
                      setBlocos((prev) => {
                        const novo = [...prev]
                        novo[bi] = { ...novo[bi], obsEquipe: e.target.value }
                        return novo
                      })
                    }
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Montagem inicial das linhas (engine + cardápio escolhido)
// ------------------------------------------------------------

function tituloServico(s: EventService, pax: number): string {
  const partes = [
    `${SERVICE_TYPE_LABEL[s.service_type].toUpperCase()}${
      s.service_line ? ' ' + SERVICE_LINE_LABEL[s.service_line].toUpperCase() : ''
    }`,
    s.periodo ? PERIOD_LABEL[s.periodo].toUpperCase() : null,
    s.hora_inicio && s.hora_fim ? `${s.hora_inicio.slice(0, 5)}–${s.hora_fim.slice(0, 5)}` : null,
    formatDiaMes(s.dia),
    `${pax} PAX`,
  ].filter(Boolean)
  return partes.join(' — ')
}

function destaqueDoItem(c: CatalogItem | null): LinhaProgramacao['destaque'] {
  // Regra do amarelo: SÓ vegano / sem glúten / sem lactose / sem açúcar.
  // Vegetariano sozinho NÃO leva amarelo.
  if (!c?.selo) return null
  return c.selo === 'vegetariano' ? null : 'amarelo'
}

function montarLinhas(
  s: EventService,
  pax: number,
  escolhidos: (ServiceItem & { catalog_items: CatalogItem | null })[]
): LinhaProgramacao[] {
  const repo = Number(s.reposicao_pct)
  const fator = (f: number) => cima(pax * f * (1 + repo / 100))

  // linhas base do engine
  let engine: QtdItem[] = []
  switch (s.service_type) {
    case 'welcome_coffee':
      engine = qtdWelcomeCoffee(pax)
      break
    case 'auditorio':
      engine = qtdAuditorio(pax, 1, s.service_line === 'cortesia')
      break
    case 'coffee_break': {
      const linha = (s.service_line ?? 'executive') as CoffeeLinha
      if (['basic', 'standard', 'executive', 'master'].includes(linha))
        engine = qtdCoffeeBreak(pax, linha, repo)
      break
    }
    case 'coquetel':
      engine = qtdDips(pax)
      break
    case 'almoco':
    case 'jantar':
      engine = qtdAlmoco(pax)
      break
    default:
      engine = []
  }

  const linhas: LinhaProgramacao[] = []

  // categorias com placeholder no engine que serão substituídas pelos itens nomeados
  const temMiniLanche = escolhidos.some((e) => e.catalog_items?.categoria === 'mini_lanche')
  const temBebezinho = escolhidos.some((e) => e.catalog_items?.categoria === 'bebezinho')
  const temVerrine = escolhidos.some((e) =>
    ['verrine', 'shot_funcional', 'shot_vitaminado'].includes(e.catalog_items?.categoria ?? '')
  )

  for (const q of engine) {
    if (temMiniLanche && q.item.startsWith('Mini lanche')) continue
    if (temBebezinho && q.item.startsWith('Bolo / bebezinho')) continue
    if (temVerrine && q.item.startsWith('Verrine / shot')) continue
    linhas.push({
      qtd: `${q.quantidade} ${q.unidade}`,
      receita: q.memoria,
      item: q.item,
    })
  }

  // itens escolhidos no cardápio → linhas nomeadas com quantidade distribuída
  const miniLanches = escolhidos.filter((e) => e.catalog_items?.categoria === 'mini_lanche')
  if (miniLanches.length) {
    const totalFator = s.service_line === 'basic' ? 1.5 : 1.1
    const total = fator(totalFator)
    const carnes = miniLanches.filter((e) => !e.catalog_items?.selo)
    const vegs = miniLanches.filter((e) => e.catalog_items?.selo)
    for (const m of carnes) {
      linhas.push({
        qtd: `${cima((total * 0.8) / Math.max(1, carnes.length))} un`,
        receita: receitaCompleta(m.catalog_items, [paoDoLanche(m.catalog_items!, false)]),
        item: 'Mini lanche',
      })
    }
    for (const m of vegs) {
      linhas.push({
        qtd: `${cima((total * 0.2) / Math.max(1, vegs.length))} un`,
        // §14.9: aveia/alecrim viram cenoura e a troca sai marcada
        receita: receitaCompleta(m.catalog_items, [paoDoLanche(m.catalog_items!, true)]),
        item: 'Mini lanche',
        destaque: destaqueDoItem(m.catalog_items),
      })
    }
  }

  const bebezinhos = escolhidos.filter((e) => e.catalog_items?.categoria === 'bebezinho')
  if (bebezinhos.length) {
    const total = fator(1.1)
    const porSabor = cima(total / bebezinhos.length)
    for (const b of bebezinhos) {
      linhas.push({
        qtd: `${porSabor} un`,
        receita: receitaCompleta(b.catalog_items),
        item: 'Bebezinho (cup cake)',
      })
      // §14.5 — vai sem recheio, copeira monta
      const fin = finalizacaoNoLocal(b.catalog_items)
      if (fin) linhas.push({ qtd: '', receita: fin.aviso, item: '', destaque: 'vermelho' })
    }
  }

  const verrines = escolhidos.filter((e) =>
    ['verrine', 'shot_funcional', 'shot_vitaminado'].includes(e.catalog_items?.categoria ?? '')
  )
  if (verrines.length) {
    const total = fator(1.1)
    const porSabor = cima(total / verrines.length)
    for (const v of verrines) {
      const cat = v.catalog_items!.categoria
      // §14.4 — SEMPRE escrever o recipiente ao lado do sabor
      const rec = recipienteDe(cat, s.service_type)
      linhas.push({
        qtd: `${porSabor} un`,
        receita: receitaCompleta(v.catalog_items, [
          rec ? `servir em ${rec}` : null,
          cat !== 'verrine' ? 'sempre vegano, leite vegetal' : null,
        ]),
        item: cat === 'verrine' ? 'Verrine' : 'Shot',
        destaque: destaqueDoItem(v.catalog_items),
      })
    }
  }

  // demais itens escolhidos (wrap, tapioca, croissant, tartelete, canapé…)
  const outros = escolhidos.filter(
    (e) =>
      !['mini_lanche', 'bebezinho', 'verrine', 'shot_funcional', 'shot_vitaminado'].includes(
        e.catalog_items?.categoria ?? ''
      )
  )
  for (const o of outros) {
    const c = o.catalog_items
    if (!c) continue
    linhas.push({
      qtd: `${fator(1.1)} un`,
      // §14.11 — item + descritivo completo do cardápio
      receita: receitaCompleta(c, [c.obs]),
      item: c.categoria.replace(/_/g, ' '),
      destaque: destaqueDoItem(c),
    })
    // §14.7 / §14.13 — o que a copeira monta no local
    const fin = finalizacaoNoLocal(c)
    if (fin) linhas.push({ qtd: '', receita: fin.aviso, item: '', destaque: 'vermelho' })
    // §14.10 — item que não pertence a este serviço
    if (itemForaDoServico(c, s.service_type))
      linhas.push({
        qtd: '',
        receita: `⚠ "${c.nome}" não pertence ao cardápio de ${SERVICE_TYPE_LABEL[s.service_type]} — conferir com o comercial.`,
        item: '',
        destaque: 'vermelho',
      })
  }

  return linhas
}
