import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import ChecklistPronto, { type ParteFase } from '@/components/MarcarPronto'
import { Badge, Button, Card, EmptyState, PageTitle } from '@/components/ui'
import { nomeCliente, type CatalogItem, type Client, type DietSeal, type EventService, type PieggiEvent } from '@/types'
import { formatDiaMes } from '@/engine'
import type { CardPlaquinha } from '@/lib/pdf-plaquinhas'
import { baixarBlob, salvarDocumento } from '@/lib/documentos'
import { contarPendentes, PedidosFaseBanner } from '@/components/PedidosEspeciais'

// itens que NUNCA geram plaquinha (produto com rótulo próprio / decoração / estrutura)
const NAO_GERA =
  /(água (com|sem) gás|agua (com|sem) gás|garrafinha|refrigerante|cerveja|vinho\b|heinz|sachê|sache|açúcar|acucar|adoçante|adocante|mexedor|frutas laminadas|favo de mel|etiquetas|programação impressa|caixa |kit de limpeza|uniforme|luvas|toucas|gelo\b|copos|pratos|garfos|transformador|extensão|placa|bandeja|champanheira|réchaud|rechaud|galheteiro|tabasco|molho da |opção sem lactose)/i

const CAT_MAP: Record<string, { sub: string; en: string; es: string }> = {
  mini_lanche: { sub: 'MINI LANCHE', en: 'SANDWICH', es: 'SÁNDWICH' },
  bebezinho: { sub: 'CUP CAKE', en: 'CUPCAKE', es: 'CUPCAKE' },
  verrine: { sub: 'VERRINE', en: 'VERRINE', es: 'VERRINE' },
  shot_funcional: { sub: 'SHOT', en: 'SHOT', es: 'SHOT' },
  shot_vitaminado: { sub: 'SHOT', en: 'SHOT', es: 'SHOT' },
  petit_four_salgado: { sub: 'PETIT FOUR', en: 'PETIT FOUR', es: 'PETIT FOUR' },
  petit_four_doce: { sub: 'PETIT FOUR', en: 'PETIT FOUR', es: 'PETIT FOUR' },
  croissant: { sub: 'CROISSANT', en: 'CROISSANT', es: 'CROISSANT' },
  tramezzino: { sub: 'TRAMEZZINO', en: 'TRAMEZZINO', es: 'TRAMEZZINO' },
  barquete: { sub: 'BARQUETE', en: 'TAPIOCA BOAT', es: 'BARQUETA' },
  tartelete: { sub: 'TARTELETE', en: 'TARTLET', es: 'TARTALETA' },
  quiche: { sub: 'QUICHE', en: 'QUICHE', es: 'QUICHE' },
  canape: { sub: 'CANAPÉ', en: 'CANAPÉ', es: 'CANAPÉ' },
  pasta_board: { sub: 'PASTA NA TÁBUA', en: 'CHEESE SPREAD', es: 'PASTA' },
  doce_confeitaria: { sub: '', en: '', es: '' },
  wrap: { sub: 'WRAP', en: 'WRAP', es: 'WRAP' },
  tapioca: { sub: 'TAPIOCA', en: 'TAPIOCA', es: 'TAPIOCA' },
}

const SELO_LABEL: Record<DietSeal, string> = {
  vegetariano: '🥬 Vegetariano',
  vegano: '🌱 Vegano',
  sem_gluten: 'Sem glúten',
  sem_lactose: 'Sem lactose',
  sem_acucar: 'Sem açúcar',
}

// cores dos selos (preview) — verde veg/vegano, azul SL, amarelo SG, cinza s/açúcar
const SELO_COR: Record<DietSeal, string> = {
  vegetariano: '#2E8B3D',
  vegano: '#21732E',
  sem_lactose: '#2659B3',
  sem_gluten: '#D9A61A',
  sem_acucar: '#737373',
}

const SELO_SIGLA: Record<DietSeal, string> = {
  vegetariano: 'VEG',
  vegano: 'VGN',
  sem_lactose: 'S/L',
  sem_gluten: 'S/G',
  sem_acucar: 'S/A',
}

/** Preview de designer — a célula como sai impressa (dobra 50/50). */
function CardPreview({ card }: { card: CardPlaquinha }) {
  return (
    <div
      className="relative overflow-hidden rounded border border-neutral-300 bg-white"
      style={{ aspectRatio: '283/271' }}
    >
      {/* metade de cima = dobra (100% branca) */}
      <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-neutral-200" />
      <span className="absolute right-1 top-1/2 -translate-y-4 text-[8px] text-neutral-300">
        dobra ↑
      </span>
      {/* conteúdo — metade de baixo, ancorado à base */}
      <div className="absolute inset-x-0 bottom-0 flex h-1/2 items-end p-1.5">
        <div className="flex w-full items-end gap-1.5">
          {/* bloco esquerdo: banner + PG */}
          <div className="flex shrink-0 flex-col items-center gap-0.5">
            <div className="flex h-5 w-16 items-center justify-center bg-black text-[9px] font-black tracking-widest text-white">
              PIEGGI
            </div>
            <div className="text-lg font-black leading-none" style={{ color: '#5F5F5F' }}>
              PG
            </div>
          </div>
          {/* selo */}
          {card.selo && (
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center self-start rounded-full text-[7px] font-bold text-white"
              style={{ backgroundColor: SELO_COR[card.selo] }}
            >
              {SELO_SIGLA[card.selo]}
            </div>
          )}
          {/* texto */}
          <div className="min-w-0 flex-1 self-start text-center">
            <div
              className={`font-bold italic leading-tight ${
                card.titulo.length > 28 ? 'text-[10px]' : card.titulo.length > 16 ? 'text-xs' : 'text-sm'
              }`}
            >
              {card.titulo.toUpperCase() || '—'}
            </div>
            {card.sub && (
              <div className="text-[9px] font-bold italic leading-tight">{card.sub.toUpperCase()}</div>
            )}
            {card.en && <div className="truncate text-[8px] italic text-neutral-500">{card.en}</div>}
            {card.es && <div className="truncate text-[8px] italic text-neutral-500">{card.es}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

interface BlocoProg {
  serviceId: string
  titulo: string
  linhas: { qtd: string; receita: string; item: string }[]
}

export default function Plaquinhas() {
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
      if (error) throw error
      return data as EventService[]
    },
  })

  const { data: snapshotProg } = useQuery({
    queryKey: ['schedule-snapshot', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('schedules')
        .select('snapshot')
        .eq('event_id', id!)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as { snapshot: { blocos?: BlocoProg[] } } | null
    },
  })

  const { data: catalogo } = useQuery({
    queryKey: ['catalogo-todos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('catalog_items').select('*')
      if (error) throw error
      return data as CatalogItem[]
    },
  })

  const [cards, setCards] = useState<CardPlaquinha[] | null>(null)
  const [carregouSalvo, setCarregouSalvo] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  // ---------- derivação automática dos cards ----------
  const cardsIniciais = useMemo((): CardPlaquinha[] => {
    if (!servicos?.length) return []
    const blocos = snapshotProg?.snapshot?.blocos ?? []
    const porServico = new Map(servicos.map((s) => [s.id, s]))
    const out: CardPlaquinha[] = []
    const vistos = new Set<string>() // dedup no PDF inteiro (decisão travada)
    let poosDia: string | null = null // pão de queijo agrupado — 1 card por evento

    function push(c: CardPlaquinha) {
      const chave = `${c.titulo}|${c.sub}`.toLowerCase()
      if (vistos.has(chave)) return
      vistos.add(chave)
      out.push(c)
    }

    for (const bloco of blocos) {
      const serv = porServico.get(bloco.serviceId)
      if (!serv) continue
      const dia = serv.dia

      for (const l of bloco.linhas) {
        // linhas de instrução da produção (finalização no local, alertas de
        // cardápio) não são item servido — nunca viram plaquinha
        if (!l.qtd && !l.item && /^(FINALIZAR|⚠)/.test(l.receita)) continue

        const texto = `${l.receita} ${l.item}`
        const t = texto.toLowerCase()
        if (NAO_GERA.test(t)) continue

        // pão de queijo — agrupar trad + integral num card único
        if (t.includes('pão de queijo') || t.includes('pao de queijo')) {
          if (/vegano/.test(t)) {
            push({ dia, titulo: 'PÃO DE QUEIJO', sub: 'VEGANO — CORTESIA', en: 'CHEESE BREAD / Vegan', es: 'PAN DE QUESO / Vegano', selo: 'vegano' })
          } else if (/sem lactose/.test(t)) {
            push({ dia, titulo: 'PÃO DE QUEIJO', sub: 'SEM LACTOSE', en: 'CHEESE BREAD / Lactose Free', es: 'PAN DE QUESO / Sin Lactosa', selo: 'sem_lactose' })
          } else if (!poosDia) {
            poosDia = dia
            push({ dia, titulo: 'TRADICIONAL E INTEGRAL', sub: 'PÃO DE QUEIJO', en: 'CHEESE BREAD / Traditional & Multigrain', es: 'PAN DE QUESO / Tradicional y Multigrano', selo: 'vegetariano' })
          }
          continue
        }

        // salada de frutas — 2 cards
        if (t.includes('salada de frutas')) {
          push({ dia, titulo: 'SALADA DE FRUTAS', sub: '', en: 'FRUIT SALAD', es: 'ENSALADA DE FRUTAS', selo: 'vegano' })
          push({ dia, titulo: 'IOGURTE, GRANOLA, AVEIA, SUCRILHOS E MEL', sub: 'ADICIONAIS', en: 'TOPPINGS', es: 'ADICIONALES', selo: null })
          continue
        }

        // bebidas padrão (categoria no título — exceção da hierarquia)
        if (/^caf[ée]\b|caf[ée] tradicional/.test(t) || l.item.toLowerCase() === 'café') {
          push({ dia, titulo: 'CAFÉ', sub: 'TRADICIONAL', en: 'COFFEE / Traditional', es: 'CAFÉ / Tradicional', selo: null })
          continue
        }
        if (/leite vegetal|leite de aveia/.test(t)) {
          push({ dia, titulo: 'LEITE DE AVEIA', sub: '', en: 'OAT MILK', es: 'LECHE DE AVENA', selo: 'vegano' })
          continue
        }
        if (/leite sem lactose/.test(t)) {
          push({ dia, titulo: 'LEITE', sub: 'SEM LACTOSE', en: 'MILK / Lactose Free', es: 'LECHE / Sin Lactosa', selo: 'sem_lactose' })
          continue
        }
        if (/^leite\b|\bleite\b/.test(l.item.toLowerCase())) {
          push({ dia, titulo: 'LEITE', sub: 'QUENTE', en: 'MILK / Hot', es: 'LECHE / Caliente', selo: 'vegetariano' })
          continue
        }
        if (/água quente|agua quente/.test(t)) {
          push({ dia, titulo: 'ÁGUA QUENTE', sub: 'PARA CHÁ', en: 'HOT WATER / For Tea', es: 'AGUA CALIENTE / Para Té', selo: null })
          continue
        }
        if (/chá|cha mate|chá mate/.test(l.item.toLowerCase())) {
          push({ dia, titulo: 'CHÁ', sub: 'GELADO', en: 'TEA / Iced', es: 'TÉ / Helado', selo: 'vegano' })
          continue
        }
        if (/suco/.test(t)) {
          const m = t.match(/suco de ([a-zà-ú çãõéíáê]+)/)
          const sabor = (m?.[1] ?? 'laranja').trim().toUpperCase()
          push({ dia, titulo: 'SUCO', sub: sabor, en: `JUICE / ${sabor}`, es: `JUGO / ${sabor}`, selo: 'vegano' })
          continue
        }
        // §8 — o achocolatado é bebida da mesa e TEM plaquinha
        if (/achocolatado|nescau/.test(t)) {
          push({ dia, titulo: 'ACHOCOLATADO', sub: 'EM PÓ', en: 'CHOCOLATE MILK / Powder', es: 'ACHOCOLATADO / En Polvo', selo: 'vegetariano' })
          continue
        }

        // item do catálogo — título = sabor, sub = categoria
        const cat = catalogo?.find(
          (c) => c.nome.length > 4 && t.includes(c.nome.toLowerCase())
        )
        if (cat) {
          if (cat.proibido) continue
          const map = CAT_MAP[cat.categoria] ?? { sub: '', en: '', es: '' }
          push({
            dia,
            titulo: cat.nome.toUpperCase(),
            sub: map.sub,
            en: cat.nome_en ? `${map.en}${map.en ? ' / ' : ''}${cat.nome_en}` : map.en,
            es: cat.nome_es ? `${map.es}${map.es ? ' / ' : ''}${cat.nome_es}` : map.es,
            selo: cat.selo,
          })
          continue
        }

        // fallback: usa o texto da linha (título = receita curta, sub = item)
        // §16.4 — o recipiente (copo bolha × cup de vidro) é detalhe de
        // expedição e NUNCA aparece na plaquinha
        const receitaCurta = l.receita
          .split('—')[0]
          .split('[')[0]
          .replace(/\s*\((?:copo bolha|cup de vidro)\)/gi, '')
          .trim()
        if (receitaCurta.length > 2) {
          push({ dia, titulo: receitaCurta.toUpperCase(), sub: l.item.toUpperCase(), en: '', es: '', selo: null })
        }
      }
    }

    // cards CONTÉM {X} — quando há restrições (ficam após os de identificação)
    for (const r of evento?.restricoes ?? []) {
      const tipo = r.tipo.toUpperCase()
      out.push({
        dia: servicos[0].dia,
        titulo: `CONTÉM ${tipo}`,
        sub: '',
        en: `CONTAINS ${tipo}`,
        es: `CONTIENE ${tipo}`,
        selo: null,
        tipo: 'contem',
      })
    }

    return out
  }, [servicos, snapshotProg, catalogo, evento?.restricoes])

  // snapshot salvo → senão derivação
  useEffect(() => {
    if (!id || carregouSalvo) return
    supabase
      .from('signage_sets')
      .select('cards')
      .eq('event_id', id)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const salvos = data?.cards as CardPlaquinha[] | undefined
        if (salvos?.length) {
          setCards(salvos)
          setCarregouSalvo(true)
        }
      })
  }, [id, carregouSalvo])

  useEffect(() => {
    if (!carregouSalvo && cardsIniciais.length && !cards) setCards(cardsIniciais)
  }, [cardsIniciais, carregouSalvo, cards])

  // ---------- ações ----------
  async function salvar(): Promise<boolean> {
    if (!cards) return false
    setMsg(null)
    const { data: ultima } = await supabase
      .from('signage_sets')
      .select('id')
      .eq('event_id', id!)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()
    const payload = { event_id: id!, cards }
    const r = ultima
      ? await supabase.from('signage_sets').update(payload).eq('id', ultima.id)
      : await supabase.from('signage_sets').insert({ ...payload, versao: 1 })
    if (r.error) {
      setMsg(`Erro ao salvar: ${r.error.message}`)
      return false
    }
    setMsg('✅ Plaquinhas salvas.')
    return true
  }

  async function aprovar() {
    const pedidos = await contarPendentes(id!, 'plaquinhas')
    if (pedidos > 0) {
      setMsg(`🛑 ${pedidos} pedido(s) especial(is) do cliente não verificados nesta fase — verificar antes de aprovar.`)
      return
    }
    const ok = await salvar()
    if (!ok) return
    await supabase
      .from('signage_sets')
      .update({ aprovado_por: session?.user.id, aprovado_em: new Date().toISOString() })
      .eq('event_id', id!)
    await supabase.from('events').update({ status: 'plaquinhas_geradas' }).eq('id', id!)
    await supabase.from('approvals').insert({ event_id: id!, fase: 'plaquinhas', user_id: session?.user.id })
    await qc.invalidateQueries({ queryKey: ['evento', id] })
    setMsg('✅ Plaquinhas APROVADAS — evento avançou para a fase Compras.')
  }

  async function gerarPdf() {
    if (!evento || !cards?.length) return
    setGerando(true)
    setMsg(null)
    try {
      const { gerarPlaquinhasPdf } = await import('@/lib/pdf-plaquinhas')
      const blob = await gerarPlaquinhasPdf(cards)
      const dia0 = servicos?.[0]?.dia ?? ''
      const nome = `Pieggi Plaquinha - ${nomeCliente(evento)} - ${evento.nome} - ${
        evento.contato ?? 'contato'
      } - ${dia0.split('-').reverse().join('-')}.pdf`
      baixarBlob(blob, nome)
      // leitura gera só para imprimir — não sobe versão nem salva rascunho
      if (editarOperacao) {
        await salvarDocumento(evento.id, blob, nome, 'plaquinha_pdf')
        await salvar()
      }
      setMsg(`✅ PDF gerado: ${nome} (${cards.length} cards + par do site)`)
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao gerar o PDF.'}`)
    } finally {
      setGerando(false)
    }
  }

  function editar(i: number, campo: keyof CardPlaquinha, valor: string) {
    setCards((prev) => {
      if (!prev) return prev
      const novo = [...prev]
      novo[i] = { ...novo[i], [campo]: campo === 'selo' ? ((valor || null) as DietSeal | null) : valor }
      return novo
    })
  }

  if (!evento) return <p className="text-sm text-neutral-500">Carregando…</p>

  const semProg = !snapshotProg?.snapshot?.blocos?.length
  const dias = Array.from(new Set(servicos?.map((s) => s.dia) ?? [])).sort()

  // baixa da equipe: uma linha por dia (é assim que o PDF sai — PageBreak
  // entre dias) mais a conferência final contra a comanda
  const partesPronto: ParteFase[] = [
    ...dias.map((d) => ({
      chave: `impresso|${d}`,
      rotulo: `Impressas, cortadas e dobradas — ${formatDiaMes(d)}`,
    })),
    { chave: 'conferido', rotulo: 'Conferidas com a comanda (selos, restrições e cards CONTÉM)' },
    { chave: 'separado', rotulo: 'Separadas na caixa do evento' },
  ]

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
        Plaquinhas — {evento.nome}
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone="blue">PT / EN / ES · A4 2×3 · dobra 50/50</Badge>
        {cards && <span>{cards.length} cards + par "VISITE NOSSO SITE"</span>}
        {(evento.restricoes?.length ?? 0) > 0 && (
          <Badge tone="red">cards CONTÉM gerados p/ restrições</Badge>
        )}
        {!editarOperacao && (
          <Badge tone="blue">
            {ehCozinha ? 'Cozinha — leitura, impressão e baixa' : 'Somente leitura'}
          </Badge>
        )}
      </div>

      <PedidosFaseBanner eventId={id!} fase="plaquinhas" />

      {semProg ? (
        <Card>
          <EmptyState>
            As plaquinhas leem a <b>programação aprovada</b>. Monte e salve a Programação primeiro.{' '}
            <Link to={`/eventos/${id}/programacao`} className="font-semibold underline">
              Ir para a Programação
            </Link>
          </EmptyState>
        </Card>
      ) : !cards ? (
        <p className="text-sm text-neutral-500">Montando cards…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {editarOperacao && (
              <Button
                variant="secondary"
                onClick={() => {
                  setCards(cardsIniciais)
                  setCarregouSalvo(true)
                  setMsg('Cards regenerados da programação (edições descartadas).')
                }}
              >
                ↻ Regenerar da programação
              </Button>
            )}
            {editarOperacao && (
              <Button variant="secondary" onClick={salvar}>Salvar rascunho</Button>
            )}
            <Button onClick={gerarPdf} disabled={gerando}>
              {gerando ? 'Gerando…' : 'Gerar PDF'}
            </Button>
            {editarOperacao && (
              <Button className="!bg-green-700 hover:!bg-green-600" onClick={aprovar}>
                ✓ Aprovar plaquinhas
              </Button>
            )}
          </div>

          {msg && <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

          <ChecklistPronto
            eventId={id!}
            fase="plaquinhas"
            partes={partesPronto}
            titulo="✅ Impressão — dar baixa do que já ficou pronto"
            ajuda="Marque conforme imprime e dobra. A lista de cards continua sendo editada pelo admin."
          />

          <Card title="Cards (aprovar a lista ANTES de imprimir — título = sabor, sub = categoria)">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
                  <th className="w-24 px-2 py-1.5">Dia</th>
                  <th className="px-2 py-1.5">Título (sabor)</th>
                  <th className="w-40 px-2 py-1.5">Sub (categoria)</th>
                  <th className="w-48 px-2 py-1.5">EN</th>
                  <th className="w-48 px-2 py-1.5">ES</th>
                  <th className="w-36 px-2 py-1.5">Selo</th>
                  {editarOperacao && <th className="w-8"></th>}
                </tr>
              </thead>
              <tbody>
                {cards.map((c, i) => (
                  <tr key={i} className={c.tipo === 'contem' ? 'bg-red-50' : ''}>
                    <td className="px-1 py-0.5">
                      <select
                        className="w-full rounded border border-transparent px-1 py-1 text-xs hover:border-neutral-300 disabled:opacity-60"
                        disabled={!editarOperacao}
                        value={c.dia}
                        onChange={(e) => editar(i, 'dia', e.target.value)}
                      >
                        {dias.map((d) => (
                          <option key={d} value={d}>{formatDiaMes(d)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        className={`${campo} font-semibold`}
                        readOnly={!editarOperacao}
                        value={c.titulo}
                        onChange={(e) => editar(i, 'titulo', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        className={campo}
                        readOnly={!editarOperacao}
                        value={c.sub}
                        onChange={(e) => editar(i, 'sub', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        className={`${campo} text-xs text-neutral-500`}
                        readOnly={!editarOperacao}
                        value={c.en}
                        onChange={(e) => editar(i, 'en', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        className={`${campo} text-xs text-neutral-500`}
                        readOnly={!editarOperacao}
                        value={c.es}
                        onChange={(e) => editar(i, 'es', e.target.value)}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <select
                        className="w-full rounded border border-transparent px-1 py-1 text-xs hover:border-neutral-300 disabled:opacity-60"
                        disabled={!editarOperacao}
                        value={c.selo ?? ''}
                        onChange={(e) => editar(i, 'selo', e.target.value)}
                      >
                        <option value="">— sem selo (carne)</option>
                        {(Object.keys(SELO_LABEL) as DietSeal[]).map((s) => (
                          <option key={s} value={s}>{SELO_LABEL[s]}</option>
                        ))}
                      </select>
                    </td>
                    {editarOperacao && (
                      <td className="px-1 text-center">
                        <button
                          className="text-neutral-300 hover:text-red-600"
                          onClick={() => setCards((p) => p?.filter((_, j) => j !== i) ?? p)}
                        >
                          ✕
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {editarOperacao && (
              <Button
                variant="ghost"
                className="mt-2 !px-2 !py-1 text-xs"
                onClick={() =>
                  setCards((p) =>
                    p
                      ? [...p, { dia: dias[0] ?? '', titulo: '', sub: '', en: '', es: '', selo: null }]
                      : p
                  )
                }
              >
                + Card
              </Button>
            )}

            {/* 👁 QA de designer — preview idêntico à folha antes de imprimir */}
            <div className="mt-6">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                👁 Preview de impressão (QA de designer — conferir dobra, selos, legibilidade)
              </p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
                {cards.map((c, i) => (
                  <CardPreview key={i} card={c} />
                ))}
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500">
              Regras aplicadas: dedup no PDF inteiro · pão de queijo trad+integral agrupados ·
              salada de frutas em 2 cards · água/refri/cerveja/vinho/Heinz/frutas laminadas não geram card ·
              nunca escrever "vegetariano/vegano/salgado/doce" no texto (o selo sinaliza) ·
              PageBreak entre dias · par do site no fim. Selos oficiais: suba
              <code className="mx-1">selo-vegetariano.png, selo-vegano.png, selo-sem-lactose.png,
              selo-sem-gluten.png, selo-sem-acucar.png, qr-site.png</code>
              no bucket <b>assets</b> (senão o PDF usa selos desenhados).
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
