import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
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
  type PriceItem,
  type PriceTable,
  type ServiceItem,
} from '@/types'
import {
  calcPreco,
  fecharOrcamento,
  formatBRL,
  formatDiaMes,
  repasseWtc,
  round2,
  validarDesconto,
} from '@/engine'
import {
  orcamentoPorUnidade,
  rotuloTotalDias,
  type PrecoUnidade,
} from '@/engine/unidades'
import {
  cmvReal,
  custoDoCardapio,
  descontoMaximo,
  type CustoErp,
} from '@/engine/cmv'
import { baixarBlob, salvarDocumento, shapesDoSlide, SLIDES_CARDAPIO } from '@/lib/documentos'
import { PedidosFaseBanner, pendentesDaFase, usePedidos } from '@/components/PedidosEspeciais'
import { PainelComercial, propostaEditavel, usePropostaComercial } from '@/components/StatusComercial'
import CardapioAuto, { type CardapioPorServico } from '@/components/CardapioAuto'
import { cabecalhoSlide, cardapioParaSlide } from '@/engine/cardapio'
import OpcoesProposta, {
  precoDaOpcao,
  totalDaOpcao,
  type FormatoOrcamento,
  type OpcaoProposta,
} from '@/components/OpcoesProposta'
import type { LinhaOrcamentoTabela } from '@/lib/pptx'

interface LinhaServico {
  servico: EventService
  precoPax: number | null
  fonte: 'tabela' | 'manual' | 'sem_preco'
}

export default function Proposta() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { profile } = useAuth()
  const { data: pedidos } = usePedidos(id)
  const { data: propostaComercial } = usePropostaComercial(id)
  const editavel = propostaEditavel(propostaComercial?.status_cliente)

  // ---------- dados ----------
  const { data: evento } = useQuery({
    queryKey: ['evento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, clients(*), price_tables(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PieggiEvent & { clients: Client | null; price_tables: PriceTable | null }
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

  const { data: precos } = useQuery({
    queryKey: ['precos-tabela', evento?.price_table_id],
    enabled: Boolean(evento?.price_table_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_items')
        .select('*')
        .eq('price_table_id', evento!.price_table_id!)
      if (error) throw error
      return data as PriceItem[]
    },
  })

  // preços por unidade (modelo feira/stand — ITAM, Beauty Fair)
  const { data: precosUnidade } = useQuery({
    queryKey: ['precos-unidade', evento?.price_table_id],
    enabled: Boolean(evento?.price_table_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_units')
        .select('grupo, base, preco')
        .eq('price_table_id', evento!.price_table_id!)
        .eq('ativo', true)
      if (error) throw error
      return (data ?? []).map((p) => ({ ...p, preco: Number(p.preco) })) as PrecoUnidade[]
    },
  })

  // custo do ERP — base do CMV real (migration 0015)
  const { data: erpProdutos } = useQuery({
    queryKey: ['erp-produtos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('erp_produtos')
        .select('catalog_item_id, produto, categoria, custo, unidade_comercial')
        .eq('ativo', true)
      if (error) throw error
      return (data ?? []).map((p) => ({
        catalogItemId: p.catalog_item_id,
        produto: p.produto,
        categoria: p.categoria,
        custo: Number(p.custo),
        unidadeComercial: p.unidade_comercial,
      })) as CustoErp[]
    },
  })

  // de que grupo de venda é cada categoria do catálogo
  const { data: mapaUnidades } = useQuery({
    queryKey: ['venda-por-unidade'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rule_params')
        .select('valor')
        .eq('chave', 'venda_por_unidade')
        .maybeSingle()
      return (data?.valor ?? { grupos: {}, rotulos: {} }) as {
        grupos: Record<string, string>
        rotulos: Record<string, string>
      }
    },
  })

  const { data: catalogo } = useQuery({
    queryKey: ['catalogo-ativo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('*')
        .eq('ativo', true)
        .eq('proibido', false)
        .order('categoria')
        .order('nome')
      if (error) throw error
      return data as CatalogItem[]
    },
  })

  const { data: itensSalvos } = useQuery({
    queryKey: ['service-items', id],
    enabled: Boolean(servicos?.length),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_items')
        .select('*')
        .in('event_service_id', servicos!.map((s) => s.id))
      if (error) throw error
      return data as ServiceItem[]
    },
  })

  // ---------- estado ----------
  const [precosManuais, setPrecosManuais] = useState<Record<string, number>>({})
  const [desconto, setDesconto] = useState(0)
  const [slidesEscolhidos, setSlidesEscolhidos] = useState<number[]>([])
  // null = ainda não decidido pela pessoa; vale o padrão pelo tipo de cliente
  const [institucional, setInstitucional] = useState<boolean | null>(null)
  // null = usa o modo gravado no evento (pacote por padrão)
  const [modoCobranca, setModoCobranca] = useState<'pacote' | 'unidade' | null>(null)
  const [cardapios, setCardapios] = useState<CardapioPorServico>({})
  const [opcoes, setOpcoes] = useState<OpcaoProposta[]>([])
  const [observacoes, setObservacoes] = useState<string[]>([])
  const [formato, setFormato] = useState<FormatoOrcamento>('simples')
  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  // mapa de slides do template (configurável em Admin → Parâmetros de regra)
  const { data: mapaSlides } = useQuery({
    queryKey: ['template-proposta'],
    queryFn: async () => {
      const { data } = await supabase
        .from('rule_params')
        .select('valor')
        .eq('chave', 'template_proposta')
        .maybeSingle()
      return (data?.valor ?? null) as {
        sempre: number[]
        dados: number
        orcamento: number
        institucional: number[]
        cardapio: { n: number; label: string }[]
        orcamento_comparativo?: number
      } | null
    },
  })
  const slidesInstitucionais = mapaSlides?.institucional ?? []
  const slidesCardapio = mapaSlides?.cardapio ?? SLIDES_CARDAPIO
  const slideComparativo = mapaSlides?.orcamento_comparativo

  // Cliente externo não conhece a casa: a proposta abre com a apresentação
  // institucional. StartSe/Inteli/WTC são casa — vão direto ao orçamento.
  const clienteDaCasa = ['startse', 'inteli', 'wtc'].includes(evento?.clients?.tipo ?? '')
  const usarInstitucional = institucional ?? !clienteDaCasa

  // Pacote = preço/pax da linha contratada. Unidade = preço por unidade ×
  // un/pax × pax × dias (feira e stand, modelo ITAM/Intersolar).
  const porUnidade = (modoCobranca ?? evento?.modo_cobranca ?? 'pacote') === 'unidade'
  const diasDoEvento = new Set((servicos ?? []).map((s) => s.dia)).size || 1

  // carrega a última proposta salva (desconto, preços manuais, slides)
  useEffect(() => {
    if (!id) return
    supabase
      .from('proposals')
      .select('*')
      .eq('event_id', id)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const d = data.dados as {
          desconto_pct?: number
          precos_manuais?: Record<string, number>
          slides?: number[]
          institucional?: boolean
          cardapios?: CardapioPorServico
          opcoes?: OpcaoProposta[]
          observacoes?: string[]
          formato?: FormatoOrcamento
        }
        if (d.desconto_pct != null) setDesconto(d.desconto_pct)
        if (d.precos_manuais) setPrecosManuais(d.precos_manuais)
        if (d.slides) setSlidesEscolhidos(d.slides)
        if (d.institucional != null) setInstitucional(d.institucional)
        if (d.cardapios) setCardapios(d.cardapios)
        if (d.opcoes) setOpcoes(d.opcoes)
        if (d.observacoes) setObservacoes(d.observacoes)
        if (d.formato) setFormato(d.formato)
      })
  }, [id])

  // ---------- preço por serviço ----------
  const linhas: LinhaServico[] = useMemo(() => {
    return (servicos ?? []).map((s) => {
      const manual = precosManuais[s.id]
      if (manual != null) return { servico: s, precoPax: manual, fonte: 'manual' }
      const item = (precos ?? []).find(
        (p) => p.service_type === s.service_type && p.service_line === s.service_line
      )
      return item
        ? { servico: s, precoPax: Number(item.preco_pax), fonte: 'tabela' }
        : { servico: s, precoPax: null, fonte: 'sem_preco' }
    })
  }, [servicos, precos, precosManuais])

  const pax = evento?.pax ?? 0
  // cada serviço usa o SEU pax (coffee 30 × almoço 45 no mesmo evento)
  const subtotais = linhas.map((l) =>
    l.precoPax != null
      ? calcPreco({
          precoPax: l.precoPax,
          pax: paxDoServico(l.servico, pax),
          reposicaoPct: Number(l.servico.reposicao_pct),
        })
      : null
  )
  const subtotalServicos = round2(subtotais.reduce((acc, s) => acc + (s?.comReposicao ?? 0), 0))

  // impacto financeiro dos pedidos especiais do cliente
  const impactosExtras = round2(
    (pedidos ?? [])
      .filter((p) => !p.resolvido && p.impacto_valor)
      .reduce((a, p) => a + Number(p.impacto_valor), 0)
  )

  // fechamento real: + logística e taxa de serviço quando o cliente não é isento
  const fechamento = fecharOrcamento({
    subtotalServicos,
    impactosExtras,
    descontoPct: desconto,
    isentoLogistica: evento?.clients?.isento_logistica ?? false,
    isentoTaxa: evento?.clients?.isento_taxa_servico ?? false,
  })
  const total = fechamento.total

  const kindTabela = evento?.price_tables?.kind ?? 'externos'
  // trava por desconto, com CMV base ESTIMADO (20%, ou 22,7% no WTC)
  const cmvEstimado = validarDesconto(kindTabela, desconto)
  const wtc = kindTabela === 'wtc' ? repasseWtc(total) : null
  const aDefinir = evento?.preco_a_definir ?? false

  // ---------- CMV real, a partir do custo do ERP ----------
  // Soma o custo dos itens que o compositor escolheu e compara com o
  // subtotal dos serviços (logística e taxa não são comida). Só vale
  // quando há cardápio montado e custo cadastrado.
  const custoCardapio = useMemo(() => {
    const itens = Object.values(cardapios).flat()
    if (!itens.length || !erpProdutos?.length) return null
    return custoDoCardapio(itens, erpProdutos, pax)
  }, [cardapios, erpProdutos, pax])

  const coberturaCmv = custoCardapio?.itensTotal
    ? round2((custoCardapio.itensComCusto / custoCardapio.itensTotal) * 100)
    : 0

  /**
   * Receita dos serviços QUE TÊM cardápio montado.
   *
   * Usar o subtotal inteiro dividiria o custo de um serviço pela receita
   * de todos — o CMV sairia baixo demais justamente no caso perigoso
   * (evento com coffee montado e almoço ainda não montado), e desconto
   * ruim passaria batido.
   */
  const servicosSemCardapio = linhas.filter((l) => !(cardapios[l.servico.id] ?? []).length).length
  const receitaComCardapio = round2(
    linhas.reduce(
      (acc, l, i) =>
        acc + ((cardapios[l.servico.id] ?? []).length ? (subtotais[i]?.comReposicao ?? 0) : 0),
      0
    )
  )

  const cmvDoErp = custoCardapio
    ? cmvReal({
        custoTotal: custoCardapio.custoTotal,
        receita: receitaComCardapio,
        descontoPct: desconto,
        cobertura: coberturaCmv,
      })
    : null

  /**
   * O CMV real só BLOQUEIA quando dá para confiar nele.
   *
   * Hoje o ERP cobre só a família Coffee Break, e nem todo item casa —
   * a cobertura fica em torno de 60%. Travar a geração da proposta num
   * número calculado sobre pouco mais da metade do cardápio pararia a
   * operação por causa de dado faltando, não de margem ruim. Abaixo do
   * piso o real aparece na tela como alerta e quem trava é o estimado.
   */
  const COBERTURA_MINIMA_PARA_TRAVAR = 80
  const cmvConfiavel =
    cmvDoErp != null &&
    cmvDoErp.status !== 'sem_dados' &&
    coberturaCmv >= COBERTURA_MINIMA_PARA_TRAVAR &&
    // serviço sem cardápio montado = custo desconhecido: não trava
    servicosSemCardapio === 0

  const cmv = cmvConfiavel
    ? { status: cmvDoErp!.status, mensagem: cmvDoErp!.mensagem, cmvResultante: cmvDoErp!.cmvResultante }
    : cmvEstimado

  // ---------- validações de cardápio ----------
  const itensPorServico = useMemo(() => {
    const map: Record<string, (ServiceItem & { catalogo?: CatalogItem })[]> = {}
    for (const it of itensSalvos ?? []) {
      const cat = catalogo?.find((c) => c.id === it.catalog_item_id)
      ;(map[it.event_service_id] ??= []).push({ ...it, catalogo: cat })
    }
    return map
  }, [itensSalvos, catalogo])

  const avisos = useMemo(() => {
    const out: string[] = []
    // repetição de base no mesmo dia (cruzado entre serviços)
    const porDia: Record<string, { base: string; nome: string }[]> = {}
    for (const s of servicos ?? []) {
      for (const it of itensPorServico[s.id] ?? []) {
        const base = it.catalogo?.base_sabor
        if (base) (porDia[s.dia] ??= []).push({ base, nome: it.catalogo!.nome })
      }
    }
    for (const [dia, itens] of Object.entries(porDia)) {
      const vistos: Record<string, string[]> = {}
      for (const i of itens) (vistos[i.base] ??= []).push(i.nome)
      for (const [base, nomes] of Object.entries(vistos)) {
        if (nomes.length > 1)
          out.push(
            `Base "${base}" repetida no dia ${formatDiaMes(dia)}: ${nomes.join(' + ')} — nunca repetir a base principal no mesmo dia.`
          )
      }
    }
    // contraponto por serviço (1 veg + 1 não-veg nas escolhas)
    for (const s of servicos ?? []) {
      const itens = itensPorServico[s.id] ?? []
      if (itens.length < 2) continue
      const temVeg = itens.some(
        (i) => i.catalogo?.selo === 'vegetariano' || i.catalogo?.selo === 'vegano'
      )
      const temCarne = itens.some((i) => !i.catalogo?.selo)
      if (!temVeg || !temCarne)
        out.push(
          `${SERVICE_TYPE_LABEL[s.service_type]} ${formatDiaMes(s.dia)}: falta contraponto (sempre 1 vegetariano + 1 não-vegetariano).`
        )
    }
    // escalonamento de sabores
    if (pax > 120) out.push('Mais de 120 convidados: dividir cada produto em 3 sabores.')
    else if (pax > 50) out.push('Mais de 50 convidados: dividir cada produto em 2 sabores.')
    return out
  }, [servicos, itensPorServico, pax])

  // ---------- ações ----------
  async function salvarProposta(): Promise<boolean> {
    setMsg(null)
    const { data: ultima } = await supabase
      .from('proposals')
      .select('id, versao')
      .eq('event_id', id!)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()

    const dados = {
      desconto_pct: desconto,
      precos_manuais: precosManuais,
      slides: slidesEscolhidos,
      institucional: usarInstitucional,
      // CMV real do momento em que a proposta foi salva — dá para auditar
      // depois por que um desconto passou
      cmv_real: cmvDoErp
        ? {
            base: cmvDoErp.cmvBase,
            resultante: cmvDoErp.cmvResultante,
            cobertura: coberturaCmv,
            custo: custoCardapio?.custoTotal ?? null,
            travou: cmvConfiavel,
          }
        : null,
      opcoes,
      observacoes,
      formato,
      cardapios,
      fechamento: fechamento.linhas,
      linhas: linhas.map((l, i) => ({
        servico: `${SERVICE_TYPE_LABEL[l.servico.service_type]} ${l.servico.service_line ? SERVICE_LINE_LABEL[l.servico.service_line] : ''}`,
        dia: l.servico.dia,
        pax: paxDoServico(l.servico, pax),
        preco_pax: l.precoPax,
        reposicao_pct: Number(l.servico.reposicao_pct),
        total: subtotais[i]?.comReposicao ?? null,
      })),
    }

    const payload = {
      event_id: id!,
      desconto_pct: desconto,
      cmv_status: cmv.status,
      preco_total: total,
      dados,
    }

    const r = ultima
      ? await supabase.from('proposals').update(payload).eq('id', ultima.id)
      : await supabase.from('proposals').insert({ ...payload, versao: 1 })
    if (r.error) {
      setMsg(`Erro ao salvar: ${r.error.message}`)
      return false
    }

    // o orçamento do evento (base da verba 8%) é SEMPRE o total da proposta
    await supabase.from('events').update({ orcamento_valor: total }).eq('id', id!)
    if (evento?.status === 'rascunho') {
      await supabase.from('events').update({ status: 'proposta_em_montagem' }).eq('id', id!)
      await qc.invalidateQueries({ queryKey: ['evento', id] })
    }
    setMsg('✅ Proposta salva.')
    return true
  }

  /** Salva o estado atual antes de mudar a situação comercial. */
  async function aoAprovarPeloCliente() {
    await salvarProposta()
  }

  async function gerarPptx() {
    if (!evento || !servicos?.length) return
    if (cmv.status === 'bloqueado') {
      setMsg(`🛑 ${cmv.mensagem}`)
      return
    }
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

      // ---------- tabela do orçamento (quantas linhas precisar) ----------
      const tabela: LinhaOrcamentoTabela[] = []

      const totaisOpcoes = opcoes.map((op) =>
        totalDaOpcao(
          op,
          servicos,
          precos ?? [],
          pax,
          evento.clients?.isento_logistica ?? false,
          evento.clients?.isento_taxa_servico ?? false
        )
      )
      // sem o slide de colunas configurado, o comparativo cairia num slide de
      // 3 colunas e a proposta sairia sem preço nenhum — melhor usar linhas
      const comparativo =
        formato === 'comparativo' && opcoes.length > 0 && slideComparativo != null
      const cabecalhosTabela = comparativo
        ? ['Descritivo', 'PAX', ...opcoes.map((o) => SERVICE_LINE_LABEL[o.linha])]
        : undefined

      // ---------- venda por unidade (feira/stand — modelo ITAM) ----------
      // Uma linha por grupo de venda, com as quantidades que o cardápio
      // prometeu: o que vai no prato e o que é cobrado são o mesmo número.
      const unidades = porUnidade
        ? orcamentoPorUnidade({
            // itens de UM dia: os serviços se repetem, a multiplicação é por `dias`
            itens: servicos
              .filter((s) => s.dia === dias[0])
              .flatMap((s) => cardapios[s.id] ?? []),
            pax,
            dias: dias.length,
            precos: precosUnidade ?? [],
            grupos: mapaUnidades?.grupos ?? {},
            rotulos: mapaUnidades?.rotulos ?? {},
          })
        : null

      const fechoUnidades = unidades
        ? fecharOrcamento({
            subtotalServicos: unidades.subtotal,
            descontoPct: desconto || undefined,
            isentoLogistica: evento.clients?.isento_logistica ?? false,
            isentoTaxa: evento.clients?.isento_taxa_servico ?? false,
            juntarTaxaELogistica: true, // "Serviço (10%) e logística" numa linha
          })
        : null

      if (unidades && fechoUnidades) {
        for (const l of unidades.linhas)
          tabela.push({ descricao: l.descricao, pax: l.pax, valor: formatBRL(l.valor) })
        fechoUnidades.linhas
          .filter((f) => f.tipo !== 'servicos')
          .forEach((f) =>
            tabela.push({ descricao: f.descricao, pax: '—', valor: formatBRL(f.valor) })
          )
        if (unidades.avisos.length) setMsg(`⚠️ ${unidades.avisos.join(' · ')}`)
      } else if (comparativo) {
        // mesmas linhas, uma coluna de preço por pacote (lado a lado)
        servicos.forEach((s) => {
          tabela.push({
            descricao: `${SERVICE_TYPE_LABEL[s.service_type]} — ${formatDiaMes(s.dia)}${
              Number(s.reposicao_pct) > 0 ? ' (com reposição)' : ''
            }`,
            pax: String(paxDoServico(s, pax)),
            valor: '',
            valores: opcoes.map((op) => {
              const p = precoDaOpcao(op, s, precos ?? [])
              return p == null
                ? '—'
                : formatBRL(
                    calcPreco({
                      precoPax: p,
                      pax: paxDoServico(s, pax),
                      reposicaoPct: Number(s.reposicao_pct),
                    }).comReposicao
                  )
            }),
          })
        })
        if (!(evento.clients?.isento_logistica ?? false))
          tabela.push({
            descricao: 'Transporte e logística',
            pax: '—',
            valor: '',
            valores: opcoes.map(() => formatBRL(250)),
          })
        if (!(evento.clients?.isento_taxa_servico ?? false))
          tabela.push({
            descricao: 'Taxa de serviço (10%)',
            pax: '—',
            valor: '',
            valores: totaisOpcoes.map((t) => formatBRL(round2(t / 11))),
          })
        tabela.push({
          descricao: 'Total Geral',
          pax: '',
          valor: '',
          valores: totaisOpcoes.map((t) => formatBRL(t)),
          total: true,
        })
      } else if (opcoes.length) {
        // proposta com opções A/B/C — uma linha por pacote
        for (const op of opcoes) {
          const t = totalDaOpcao(
            op,
            servicos,
            precos ?? [],
            pax,
            evento.clients?.isento_logistica ?? false,
            evento.clients?.isento_taxa_servico ?? false
          )
          tabela.push({
            descricao: op.nome,
            pax: String(pax),
            valor: aDefinir ? 'a definir' : formatBRL(t),
          })
        }
        tabela.push({
          descricao: 'A contratante escolhe um dos pacotes acima · valores já incluem serviço e logística',
          pax: '',
          valor: '',
          observacao: true,
        })
      } else {
        // composição única — serviços + adicionais + logística + taxa
        linhas.forEach((l, i) => {
          tabela.push({
            descricao: `${SERVICE_TYPE_LABEL[l.servico.service_type]}${
              l.servico.service_line ? ` ${SERVICE_LINE_LABEL[l.servico.service_line]}` : ''
            } — ${formatDiaMes(l.servico.dia)}${
              Number(l.servico.reposicao_pct) > 0 ? ' (com reposição)' : ''
            }`,
            pax: String(paxDoServico(l.servico, pax)),
            valor: aDefinir ? 'a definir' : subtotais[i] ? formatBRL(subtotais[i]!.comReposicao) : '',
          })
        })
        fechamento.linhas
          .filter((f) => ['extra', 'logistica', 'taxa'].includes(f.tipo))
          .forEach((f) =>
            tabela.push({
              descricao: f.descricao,
              pax: '—',
              valor: aDefinir ? 'a definir' : formatBRL(f.valor),
            })
          )
      }

      // restrições alimentares como cortesia
      if ((evento.restricoes?.length ?? 0) > 0) {
        tabela.push({
          descricao: 'Produtos sem lactose e sem glúten (vide cardápio para celíacos e sem lactose)',
          pax: String(evento.restricoes.reduce((a, r) => a + (r.pax || 0), 0)),
          valor: 'Cortesia',
        })
      }

      // observações livres
      observacoes
        .filter((o) => o.trim())
        .forEach((o) => tabela.push({ descricao: o, pax: '', valor: '', observacao: true }))

      // totais — com desconto mostra as duas linhas
      if (fechoUnidades) {
        tabela.push({
          descricao: 'Valores por unidade · reposição servida em lotes ao longo do dia',
          pax: '',
          valor: '',
          observacao: true,
        })
        tabela.push({
          descricao: rotuloTotalDias(dias),
          pax: String(pax),
          valor: formatBRL(fechoUnidades.total),
          total: true,
        })
      } else if (opcoes.length) {
        tabela.push({ descricao: 'Total Geral', pax: '', valor: 'R$ a definir', total: true })
      } else if (aDefinir) {
        tabela.push({ descricao: 'Total Geral', pax: '', valor: 'R$ a definir', total: true })
      } else if (desconto > 0) {
        const semDesc = fechamento.linhas
          .filter((f) => f.tipo !== 'desconto')
          .reduce((s, f) => s + f.valor, 0)
        tabela.push({ descricao: 'Total Geral sem desconto', pax: '', valor: formatBRL(round2(semDesc)), total: true })
        tabela.push({ descricao: `Total Geral com desconto (${desconto}%)`, pax: '', valor: formatBRL(total), total: true })
      } else {
        tabela.push({ descricao: 'Total Geral', pax: '', valor: formatBRL(total), total: true })
      }

      const linhasOrc = tabela
        .filter((t) => !t.observacao && !t.total)
        .slice(0, 4)
        .map((t) => ({ descritivo: t.descricao, pax: t.pax, valor: t.valor }))

      // com opções: um slide por opção · sem opções: um slide por serviço
      const slidesCardapioPptx = opcoes.length
        ? opcoes
            .map((op, i) => {
              const slide =
                slidesEscolhidos[i] ?? slidesEscolhidos[slidesEscolhidos.length - 1]
              return {
                slide,
                ...shapesDoSlide(slide),
                titulo: SERVICE_TYPE_LABEL[servicos[0].service_type].toUpperCase(),
                subtitulo: `${op.nome}  ·  ${pax} pessoas  ·  ${dataTxt}`,
                linhas: servicos.flatMap((s) => cardapioParaSlide(op.cardapios[s.id] ?? [])),
              }
            })
            .filter((c) => c.slide && c.linhas.length)
        : servicos
        .filter((s) => (cardapios[s.id] ?? []).length)
        .map((s, i) => {
          const cab = cabecalhoSlide(
            SERVICE_TYPE_LABEL[s.service_type],
            s.service_line ? SERVICE_LINE_LABEL[s.service_line] : null,
            s.periodo ? PERIOD_LABEL[s.periodo] : null,
            paxDoServico(s, pax),
            formatDiaMes(s.dia)
          )
          const slide = slidesEscolhidos[i] ?? slidesEscolhidos[slidesEscolhidos.length - 1]
          return {
            slide,
            ...shapesDoSlide(slide),
            titulo: cab.titulo,
            subtitulo: cab.subtitulo,
            linhas: cardapioParaSlide(cardapios[s.id] ?? []),
          }
        })
        .filter((c) => c.slide)

      const temRestricao = (evento.restricoes?.length ?? 0) > 0
      const restricaoPax = temRestricao
        ? String(evento.restricoes.reduce((a, r) => a + (r.pax || 0), 0))
        : ''

      const { gerarPropostaPptx } = await import('@/lib/pptx')
      const blob = await gerarPropostaPptx({
        cliente: nomeCliente(evento),
        evento: evento.nome,
        contato: evento.contato ?? '',
        pax: String(pax),
        data: dataTxt,
        horario: inicio && fim ? `${inicio} às ${fim}` : 'A definir',
        tabela,
        cabecalhosTabela,
        slideOrcamento: comparativo ? slideComparativo : undefined,
        linhas: linhasOrc,
        restricaoPax,
        restricaoValor: temRestricao ? 'Cortesia' : '',
        total: aDefinir ? 'R$ a definir' : formatBRL(total),
        slidesCardapio: slidesEscolhidos,
        slidesInstitucionais: usarInstitucional ? slidesInstitucionais : [],
        todosInstitucionais: slidesInstitucionais,
        todosCardapio: slidesCardapio.map((s) => s.n),
        // ordem final: capa → institucional (só externo) → dados → orçamento
        // → cardápios → capa final
        ordemSlides: [
          ...(mapaSlides?.sempre ?? [1]).slice(0, 1),
          ...(usarInstitucional ? slidesInstitucionais : []),
          mapaSlides?.dados ?? 2,
          (comparativo ? slideComparativo : undefined) ?? mapaSlides?.orcamento ?? 3,
          ...slidesEscolhidos,
          ...(mapaSlides?.sempre ?? [1, 13]).slice(1),
        ],
        // cardápio real (grupo + quantidade + sabores) — um slide por serviço
        cardapios: slidesCardapioPptx,
      })

      const nome = `Pieggi Proposta - ${nomeCliente(evento)} - ${evento.nome} - ${
        evento.contato ?? 'contato'
      } - ${dias[0]?.split('-').reverse().slice(0, 2).join('-') ?? ''}.pptx`

      baixarBlob(blob, nome)
      await salvarDocumento(evento.id, blob, nome, 'proposta_pptx')
      await salvarProposta()
      setMsg(`✅ Proposta gerada: ${nome}`)
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao gerar o arquivo.'}`)
    } finally {
      setGerando(false)
    }
  }

  if (!evento) return <p className="text-sm text-neutral-500">Carregando…</p>

  const linhasOrcamentoTotal =
    linhas.length +
    fechamento.linhas.filter((f) => ['extra', 'logistica', 'taxa'].includes(f.tipo)).length

  // 🧮 Conferência final — o "agente pica em contas" confere tudo antes do OK
  const semPreco = linhas.filter((l) => l.fonte === 'sem_preco')
  const semHorario = (servicos ?? []).filter((s) => !s.hora_inicio || !s.hora_fim)
  const pedidosPend = pendentesDaFase(pedidos, 'proposta')
  const checks: { ok: boolean; nivel: 'erro' | 'aviso'; label: string }[] = [
    { ok: Boolean(evento.price_table_id), nivel: 'erro', label: 'Tabela de preço definida (1ª pergunta) e registrada no topo' },
    { ok: Boolean(pax), nivel: 'erro', label: `PAX exato informado (${pax || '—'})` },
    { ok: evento.endereco_confirmado, nivel: 'erro', label: 'Endereço completo CONFIRMADO (nunca deduzido)' },
    { ok: semHorario.length === 0, nivel: 'erro', label: semHorario.length ? `${semHorario.length} serviço(s) sem horário início+fim` : 'Todos os serviços com horário início + fim' },
    { ok: semPreco.length === 0, nivel: 'erro', label: semPreco.length ? `${semPreco.length} serviço(s) SEM PREÇO na tabela` : 'Todos os serviços com preço (tabela ou manual justificado)' },
    { ok: cmv.status !== 'bloqueado', nivel: 'erro', label: `Trava CMV: ${cmv.mensagem}` },
    { ok: pedidosPend.length === 0, nivel: 'erro', label: pedidosPend.length ? `${pedidosPend.length} pedido(s) especial(is) não verificados` : 'Pedidos especiais do cliente verificados' },
    { ok: avisos.length === 0, nivel: 'aviso', label: avisos.length ? `${avisos.length} aviso(s) de cardápio (contraponto/base repetida/sabores)` : 'Cardápio sem avisos (contraponto, base, escalonamento)' },
    { ok: linhasOrcamentoTotal <= 4, nivel: 'aviso', label: linhasOrcamentoTotal > 4 ? `${linhasOrcamentoTotal} linhas de orçamento — o slide comporta 4` : 'Orçamento cabe no slide (até 4 linhas)' },
    { ok: !aDefinir, nivel: 'aviso', label: aDefinir ? 'Preço a definir — o slide sai sem valores (cliente novo)' : 'Valores fechados no slide' },
    { ok: true, nivel: 'aviso', label: `Bebidas do cliente: ${evento.clients ? `${evento.clients.marca_refri} + ${evento.clients.marca_cerveja} + água ${evento.clients.marca_agua}` : 'padrão Coca + Heineken'} — sempre LATA/long neck, nunca 1L` },
  ]
  const errosChecklist = checks.filter((c) => !c.ok && c.nivel === 'erro')

  return (
    <div>
      <PageTitle
        actions={
          <div className="flex gap-2">
            {profile?.role === 'admin' && (
              <Link to={`/eventos/${id}/estudio`}>
                <Button variant="secondary">🎨 Estúdio (CMV)</Button>
              </Link>
            )}
            <Link to={`/eventos/${id}`}>
              <Button variant="secondary">← Voltar ao evento</Button>
            </Link>
          </div>
        }
      >
        Proposta — {evento.nome}
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone="blue">{evento.price_tables?.nome ?? 'SEM TABELA'}</Badge>
        <span>{pax} pax</span>
        <span className="text-neutral-400">·</span>
        <span>{evento.clients?.nome ?? 'Cliente avulso'}</span>
        {kindTabela === 'wtc' && wtc && (
          <span className="text-xs text-amber-700">
            (interno: repasse 12% = {formatBRL(wtc.repasse)} · líquido Pieggi ={' '}
            {formatBRL(wtc.liquidoPieggi)} — nunca no slide)
          </span>
        )}
      </div>

      <PedidosFaseBanner eventId={id!} fase="proposta" />

      {!editavel && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          🔒 <b>Proposta fechada com o cliente</b> — os valores e o cardápio estão travados. Para
          renegociar, use &quot;Reabrir&quot; no painel de situação comercial abaixo.
        </div>
      )}

      {!servicos?.length ? (
        <Card>
          <EmptyState>
            Cadastre os serviços do evento antes de montar a proposta.{' '}
            <Link to={`/eventos/${id}`} className="font-semibold underline">
              Ir para o evento
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* ---------- preço ---------- */}
          <Card title="💰 Preço por serviço">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Serviço</Th>
                  <Th>Preço/pax</Th>
                  <Th>Reposição</Th>
                  <Th>Subtotal</Th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.servico.id}>
                    <Td>
                      {SERVICE_TYPE_LABEL[l.servico.service_type]}{' '}
                      {l.servico.service_line ? SERVICE_LINE_LABEL[l.servico.service_line] : ''}
                      <span className="ml-1 text-xs text-neutral-400">
                        {formatDiaMes(l.servico.dia)}
                        {l.servico.periodo ? ` · ${PERIOD_LABEL[l.servico.periodo]}` : ''}
                      </span>
                      <span
                        className={`ml-1 text-xs ${
                          l.servico.pax ? 'font-semibold text-blue-700' : 'text-neutral-400'
                        }`}
                      >
                        {paxDoServico(l.servico, pax)} pax
                        {l.servico.pax ? '' : ' (do evento)'}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-24 rounded border border-neutral-300 px-2 py-1 text-sm"
                          value={l.precoPax ?? ''}
                          placeholder="R$/pax"
                          onChange={(e) =>
                            setPrecosManuais({
                              ...precosManuais,
                              [l.servico.id]: Number(e.target.value),
                            })
                          }
                        />
                        {l.fonte === 'tabela' && <Badge tone="green">tabela</Badge>}
                        {l.fonte === 'manual' && <Badge tone="amber">manual</Badge>}
                        {l.fonte === 'sem_preco' && <Badge tone="red">sem preço na tabela</Badge>}
                      </div>
                    </Td>
                    <Td>
                      {Number(l.servico.reposicao_pct) > 0 ? (
                        <Badge tone="amber">+{Number(l.servico.reposicao_pct)}%</Badge>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td className="font-medium">
                      {subtotais[i] ? formatBRL(subtotais[i]!.comReposicao) : '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-neutral-100 pt-4">
              <Input
                label="Desconto (%)"
                type="number"
                min="0"
                max="100"
                step="0.5"
                className="!w-28"
                value={desconto || ''}
                onChange={(e) => setDesconto(Number(e.target.value) || 0)}
              />
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  cmv.status === 'ok'
                    ? 'bg-green-50 text-green-700'
                    : cmv.status === 'bloqueado'
                      ? 'bg-red-50 text-red-700'
                      : 'bg-amber-50 text-amber-700'
                }`}
              >
                {cmv.mensagem} <span className="text-xs">(interno — nunca no slide)</span>
              </div>

              {/* CMV real — só aparece quando há cardápio montado e custo no ERP */}
              {cmvDoErp && cmvDoErp.status !== 'sem_dados' && custoCardapio && (
                <div className="w-full rounded-lg border border-neutral-200 p-3 text-sm">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <b>📊 CMV real (custo do ERP)</b>
                    <Badge
                      tone={
                        cmvDoErp.status === 'ok'
                          ? 'green'
                          : cmvDoErp.status === 'bloqueado'
                            ? 'red'
                            : 'amber'
                      }
                    >
                      {cmvDoErp.cmvResultante}%
                    </Badge>
                    <span className="text-xs text-neutral-500">
                      cardápio {cmvDoErp.cmvBase}% · custo {formatBRL(custoCardapio.custoTotal)} sobre{' '}
                      {formatBRL(receitaComCardapio)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-4 text-xs text-neutral-600">
                    <span>
                      Desconto máximo sem furar o teto de 30%:{' '}
                      <b>{descontoMaximo(cmvDoErp.cmvBase)}%</b>
                    </span>
                    <span>
                      Cobertura: <b>{coberturaCmv}%</b> ({custoCardapio.itensComCusto} de{' '}
                      {custoCardapio.itensTotal} itens com custo)
                    </span>
                    <span className="text-neutral-400">
                      estimativa antiga: {cmvEstimado.cmvResultante}%
                    </span>
                  </div>

                  {servicosSemCardapio > 0 && (
                    <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      ⚠️ {servicosSemCardapio} serviço(s) ainda <b>sem cardápio montado</b> — ficaram
                      fora da conta (receita e custo). Monte o cardápio de todos para o CMV valer
                      pelo evento inteiro.
                    </p>
                  )}

                  {!cmvConfiavel ? (
                    <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      ⚠️ {round2(100 - coberturaCmv)}% do cardápio ainda não tem custo no ERP, então
                      este número <b>não trava</b> a proposta — quem trava é a estimativa por
                      desconto. E o CMV real tende a ser <b>maior</b> que o mostrado, nunca menor,
                      porque o que falta é bebida e insumo.
                    </p>
                  ) : (
                    <p className="mt-2 rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-700">
                      Cobertura acima de {COBERTURA_MINIMA_PARA_TRAVAR}% — <b>este número trava</b> a
                      geração da proposta quando passa de 30%.
                    </p>
                  )}

                  {custoCardapio.semCusto.length > 0 && (
                    <details className="mt-2 text-xs text-neutral-500">
                      <summary className="cursor-pointer">
                        {custoCardapio.semCusto.length} item(ns) sem custo
                      </summary>
                      <ul className="mt-1 list-inside list-disc">
                        {custoCardapio.semCusto.map((s, i) => (
                          <li key={i}>
                            {s.nome}{' '}
                            <span className="text-neutral-400">
                              (
                              {s.motivo === 'sem_cadastro'
                                ? 'não cadastrado no ERP'
                                : 'unidade comercial incompatível'}
                              )
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
              <div className="ml-auto text-right">
                <div className="space-y-0.5 text-sm">
                  {fechamento.linhas.map((f, i) => (
                    <div key={i} className="flex justify-between gap-6">
                      <span className="text-neutral-500">{f.descricao}</span>
                      <span className={f.valor < 0 ? 'text-red-600' : ''}>
                        {formatBRL(f.valor)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 border-t border-neutral-200 pt-1 text-2xl font-bold">
                  {aDefinir ? 'R$ a definir' : formatBRL(total)}
                </div>
                {aDefinir && (
                  <div className="text-xs text-amber-600">
                    valores calculados: {formatBRL(total)} (não vão para o slide)
                  </div>
                )}
              </div>
            </div>
          </Card>


          {/* ---------- observações do orçamento ---------- */}
          <Card title="📝 Observações do orçamento (saem no slide, abaixo das linhas)">
            {observacoes.map((o, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <Input
                  value={o}
                  disabled={!editavel}
                  placeholder="Ex.: Valores já incluem a reposição do tempo contratado — serviço de 1h30."
                  onChange={(e) => {
                    const novo = [...observacoes]
                    novo[i] = e.target.value
                    setObservacoes(novo)
                  }}
                />
                {editavel && (
                  <Button
                    variant="ghost"
                    onClick={() => setObservacoes(observacoes.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                )}
              </div>
            ))}
            {editavel && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setObservacoes([...observacoes, ''])}>
                  + Observação
                </Button>
                {[
                  'Valores já incluem a reposição do tempo contratado.',
                  'Insumos de montagem, materiais descartáveis e mesa posta inclusos nos valores.',
                  'Equipe de montagem e desmontagem — favor consultar Pieggi para dimensionamento.',
                  'Visita técnica prévia obrigatória para garantir a qualidade da entrega.',
                ].map((s) => (
                  <Button
                    key={s}
                    variant="ghost"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => setObservacoes([...observacoes, s])}
                  >
                    + {s.slice(0, 34)}…
                  </Button>
                ))}
              </div>
            )}
          </Card>

          {/* ---------- opções A/B/C ---------- */}
          <OpcoesProposta
            opcoes={opcoes}
            servicos={servicos}
            precos={precos ?? []}
            catalogo={catalogo ?? []}
            paxEvento={pax}
            isentoLogistica={evento.clients?.isento_logistica ?? false}
            isentoTaxa={evento.clients?.isento_taxa_servico ?? false}
            editavel={editavel}
            formato={formato}
            onChange={setOpcoes}
            onFormato={setFormato}
          />
          {/* ---------- cardápio montado pelo sistema ---------- */}
          <CardapioAuto
            servicos={servicos}
            catalogo={catalogo ?? []}
            paxEvento={pax}
            cardapios={cardapios}
            editavel={editavel}
            onChange={(c) => setCardapios(c)}
          />

          {/* ---------- conferência final (agente detalhista) ---------- */}
          <Card title="🧮 Conferência final — nada passa sem conferir">
            <ul className="space-y-1.5">
              {checks.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span>{c.ok ? '✅' : c.nivel === 'erro' ? '❌' : '⚠️'}</span>
                  <span className={c.ok ? 'text-neutral-600' : c.nivel === 'erro' ? 'font-medium text-red-700' : 'text-amber-700'}>
                    {c.label}
                  </span>
                </li>
              ))}
            </ul>
            {errosChecklist.length > 0 && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                🛑 {errosChecklist.length} item(ns) críticos pendentes — a aprovação fica bloqueada.
              </p>
            )}
          </Card>

          {/* ---------- geração ---------- */}
          <Card title="📄 Gerar proposta (.pptx no template oficial)">
            <div className="mb-4 rounded-lg bg-neutral-50 p-3">
              <Select
                label="Como o cliente compra"
                className="!w-96"
                value={porUnidade ? 'unidade' : 'pacote'}
                onChange={(e) => setModoCobranca(e.target.value as 'pacote' | 'unidade')}
              >
                <option value="pacote">Pacote — preço por pessoa da linha contratada</option>
                <option value="unidade">Por unidade — feira e stand (modelo ITAM)</option>
              </Select>
              <p className="mt-2 text-xs text-neutral-500">
                {porUnidade ? (
                  <>
                    Uma linha por grupo de venda com a quantidade que o cardápio prometeu (
                    <b>&quot;Salgados artesanais — 2 un/pax&quot;</b>), multiplicada pelo pax e pelos{' '}
                    <b>{diasDoEvento} dia(s)</b> do evento. Serviço e logística saem numa linha só.{' '}
                    {precosUnidade?.length ? (
                      <>
                        {precosUnidade.length} grupo(s) com preço unitário nesta tabela.
                      </>
                    ) : (
                      <b className="text-red-600">
                        Nenhum preço unitário cadastrado para a tabela deste cliente — o orçamento
                        sai vazio. Cadastre em price_units.
                      </b>
                    )}
                  </>
                ) : (
                  <>
                    Uma linha por serviço: preço/pax da linha contratada × pax × reposição. É o
                    formato da maioria das propostas.
                  </>
                )}
              </p>
            </div>
            {slidesInstitucionais.length > 0 ? (
              <label className="mb-4 flex items-start gap-2 rounded-lg bg-blue-50 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={usarInstitucional}
                  onChange={(e) => setInstitucional(e.target.checked)}
                />
                <span>
                  <b>Incluir apresentação institucional</b> ({slidesInstitucionais.length} slides) —
                  entra logo depois da capa.{' '}
                  {clienteDaCasa ? (
                    <>
                      Cliente da casa (<b>{evento.clients?.tipo}</b>): vem <b>desmarcado</b>, já
                      conhecem a Pieggi.
                    </>
                  ) : (
                    <>
                      Cliente <b>externo</b>: vem <b>marcado</b> por padrão — ainda não conhece a
                      casa (tipos de serviço, diferenciais, quem está conosco).
                    </>
                  )}
                </span>
              </label>
            ) : (
              <p className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                ⚠️ O template atual não tem slides institucionais mapeados. Para propostas de
                cliente novo, suba o deck completo como <code>template-proposta.pptx</code> e
                informe os números desses slides em <b>Admin → Parâmetros de regra →
                template_proposta → institucional</b>.
              </p>
            )}

            <p className="mb-3 text-sm text-neutral-600">
              Slides de cardápio do template a manter (capas, dados e orçamento ficam sempre):
            </p>
            <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-3">
              {slidesCardapio.map((sl) => (
                <label key={sl.n} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={slidesEscolhidos.includes(sl.n)}
                    onChange={(e) =>
                      setSlidesEscolhidos(
                        e.target.checked
                          ? [...slidesEscolhidos, sl.n]
                          : slidesEscolhidos.filter((n) => n !== sl.n)
                      )
                    }
                  />
                  {sl.label}
                </label>
              ))}
            </div>

            {linhasOrcamentoTotal > 4 && (
              <p className="mb-3 text-sm text-amber-700">
                ⚠️ O slide de orçamento tem 4 linhas — este evento gera {linhasOrcamentoTotal}{' '}
                (serviços + logística/taxa/adicionais); só as 4 primeiras entram no slide.
              </p>
            )}

            {msg && (
              <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={salvarProposta} disabled={!editavel}>
                Salvar rascunho
              </Button>
              <Button onClick={gerarPptx} disabled={gerando}>
                {gerando ? 'Gerando…' : 'Gerar .pptx'}
              </Button>
            </div>
          </Card>

          {/* ---------- ciclo comercial: pendente → aprovada/recusada ---------- */}
          <PainelComercial
            eventId={id!}
            podeEnviar={errosChecklist.length === 0}
            onAprovada={aoAprovarPeloCliente}
          />
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Cardápio de um serviço
