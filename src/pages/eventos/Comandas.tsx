import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import ChecklistPronto, { type ParteFase } from '@/components/MarcarPronto'
import { Badge, Button, Card, EmptyState, Input, PageTitle } from '@/components/ui'
import type { CatalogItem, Client, EventService, PieggiEvent } from '@/types'
import { calcVerba, formatBRL, formatDiaMes } from '@/engine'
import {
  ESTACAO_LABEL,
  gerarEstrutura,
  horarioSaida,
  rotearItem,
  type EstacaoComanda,
} from '@/engine/roteamento'
import type { ComandaLinha } from '@/lib/docx-comanda'
import { baixarBlob, salvarDocumento } from '@/lib/documentos'
import { contarPendentes, PedidosFaseBanner, usePedidos } from '@/components/PedidosEspeciais'
import { nomeCliente } from '@/types'

type SecaoDia = 'quente' | 'fria' | 'confeitaria' | 'congelado' | 'insumos' | 'adicionais'

/**
 * §8 — soma as verrines/shots por tipo de recipiente.
 *
 * A programação escreve "servir em cup de vidro" ou "servir em copo
 * bolha" ao lado do sabor; aqui isso vira contagem para a expedição
 * separar o que volta (vidro) do que é descartável (bolha). Misturar os
 * dois é o erro que a §8 chama de proibido.
 */
function contarRecipientes(dias: DiaComandas[]): { cupsVidro: number; coposBolha: number } {
  let cupsVidro = 0
  let coposBolha = 0
  for (const d of dias) {
    for (const secao of Object.values(d.secoes)) {
      for (const l of secao) {
        const qtd = parseInt(l.qtd, 10)
        if (!Number.isFinite(qtd)) continue
        const txt = l.receita.toLowerCase()
        if (txt.includes('cup de vidro')) cupsVidro += qtd
        else if (txt.includes('copo bolha')) coposBolha += qtd
      }
    }
  }
  return { cupsVidro, coposBolha }
}

interface DiaComandas {
  diaISO: string
  saida: string
  secoes: Record<SecaoDia, ComandaLinha[]>
  indefinidos: ComandaLinha[]
}

interface EstadoComandas {
  dias: DiaComandas[]
  bebidasEstrutura: ComandaLinha[]
  fornecedores: ComandaLinha[]
  locacao: ComandaLinha[]
  freelancers: string
}

const SECOES: { key: SecaoDia; label: string }[] = [
  { key: 'quente', label: '🔥 Produção — Cozinha Quente' },
  { key: 'fria', label: '🧊 Produção — Cozinha Fria / Garde Manger' },
  { key: 'confeitaria', label: '🍰 Produção — Confeitaria' },
  { key: 'congelado', label: '❄ Expedição-Alimentação — CONGELADO (copeira assa no local)' },
  { key: 'insumos', label: '📦 Expedição-Alimentação — INSUMOS' },
  { key: 'adicionais', label: '🟠 Expedição-Alimentação — Comprados prontos (âmbar)' },
]

export default function Comandas() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { session } = useAuth()
  const { editarOperacao, ehCozinha, verValores } = usePermissoes()

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

  const { data: snapshotProgramacao } = useQuery({
    queryKey: ['schedule-snapshot', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('schedules')
        .select('snapshot, aprovado_em')
        .eq('event_id', id!)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as { snapshot: { blocos?: BlocoProg[] }; aprovado_em: string | null } | null
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

  interface BlocoProg {
    serviceId: string
    titulo: string
    linhas: { qtd: string; receita: string; item: string; destaque?: 'amarelo' | 'vermelho' | 'azul' | null }[]
  }

  const { data: pedidos } = usePedidos(id)

  const [estado, setEstado] = useState<EstadoComandas | null>(null)
  const [carregouSalvo, setCarregouSalvo] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  const pax = evento?.pax ?? 0
  const startseFixo =
    evento?.clients?.tipo === 'startse' ||
    evento?.clients?.tipo === 'wtc' ||
    Boolean((evento?.clients?.regras as { ponto_fixo?: boolean } | undefined)?.ponto_fixo)

  // ---------- montagem inicial (roteamento) ----------
  const estadoInicial = useMemo((): EstadoComandas | null => {
    if (!evento || !servicos?.length) return null
    const blocos = snapshotProgramacao?.snapshot?.blocos ?? []
    const porServico = new Map(servicos.map((s) => [s.id, s]))
    const dias = Array.from(new Set(servicos.map((s) => s.dia))).sort()

    const diasComandas: DiaComandas[] = dias.map((diaISO) => {
      const servDia = servicos.filter((s) => s.dia === diaISO)
      const primeira = servDia.reduce<string | null>(
        (min, s) => (!min || (s.hora_inicio && s.hora_inicio < min) ? s.hora_inicio : min),
        null
      )
      return {
        diaISO,
        saida: horarioSaida(primeira),
        secoes: { quente: [], fria: [], confeitaria: [], congelado: [], insumos: [], adicionais: [] },
        indefinidos: [],
      }
    })

    const bebidas: ComandaLinha[] = []
    const fornecedores: ComandaLinha[] = []

    for (const bloco of blocos) {
      const serv = porServico.get(bloco.serviceId)
      if (!serv) continue
      const dia = diasComandas.find((d) => d.diaISO === serv.dia)
      if (!dia) continue
      const tag = bloco.titulo.split(' — ').slice(0, 2).join(' ')

      // a linha vermelha de finalização (§17.13) tem que sair na MESMA
      // estação do item que ela explica, senão a cozinha não vê o aviso
      let ultimaRota: EstacaoComanda = 'indefinido'

      for (const l of bloco.linhas) {
        const texto = `${l.receita} ${l.item}`
        // tenta achar o item do catálogo pelo nome dentro da receita
        const cat =
          catalogo?.find(
            (c) => c.nome.length > 4 && texto.toLowerCase().includes(c.nome.toLowerCase())
          ) ?? null
        const ehFinalizacao = !l.qtd && !l.item && /^(FINALIZAR|⚠)/.test(l.receita)
        const rota: EstacaoComanda = ehFinalizacao ? ultimaRota : rotearItem(texto, cat)
        if (!ehFinalizacao) ultimaRota = rota
        const linha: ComandaLinha = {
          qtd: l.qtd,
          receita: `${l.receita} [${tag}]`,
          item: l.item,
          destaque: l.destaque ?? null,
        }
        switch (rota) {
          case 'quente':
          case 'fria':
          case 'confeitaria':
          case 'congelado':
            dia.secoes[rota].push(linha)
            break
          case 'alimentacao': {
            // INSUMOS = o que a casa manda para a mesa (sachê, pó de café).
            // ADICIONAIS = comprado pronto no mercado (iogurte, granola,
            // coalhada, croutons). Antes os dois ramos do ternário eram
            // iguais e tudo saía rotulado como "comprado pronto".
            const ehInsumo =
              /(sachê|sache|açúcar|acucar|adoçante|adocante|pó de café|po de cafe|coador|filtro)/i.test(texto)
            dia.secoes[ehInsumo ? 'insumos' : 'adicionais'].push(linha)
            break
          }
          case 'bebidas':
            bebidas.push({ ...linha, receita: `${l.receita} [${formatDiaMes(serv.dia)} ${tag}]` })
            break
          case 'adriana':
            fornecedores.push({
              ...linha,
              receita: `FORNECEDOR: ${cat?.fornecedor?.toUpperCase() ?? 'LETÍCIA'} — ${l.receita} (Adriana buscar) [${formatDiaMes(serv.dia)}]`,
            })
            break
          default:
            dia.indefinidos.push(linha)
        }
      }
    }

    // estrutura automática
    const tiposCafe = ['welcome_coffee', 'coffee_break', 'auditorio', 'brunch']
    const temHH = servicos.some((s) => ['coquetel', 'bar', 'coquetel_pizza'].includes(s.service_type))
    const temAlmoco = servicos.some((s) => ['almoco', 'jantar'].includes(s.service_type))
    const pratosQuentes = diasComandas.reduce((a, d) => a + d.secoes.quente.length, 0)
    const estrutura = gerarEstrutura({
      pax,
      qtdServicosCafe: servicos.filter((s) => tiposCafe.includes(s.service_type)).length,
      qtdPeriodosCoffee: servicos.filter((s) => s.service_type === 'coffee_break').length,
      temHH,
      temAlmocoJantar: temAlmoco,
      temSalada: temAlmoco,
      temHamburguerOuBatata: diasComandas.some((d) =>
        d.secoes.quente.some((l) => /hambúrguer|hamburguer|batata/i.test(l.receita + l.item))
      ),
      pratosQuentes: Math.max(pratosQuentes, temAlmoco ? 6 : 0),
      startseFixo,
      // §8 — conta o recipiente que a programação escreveu ao lado do sabor
      ...contarRecipientes(diasComandas),
      // §17.2 — sachês por dose de café; auditório também serve café
      mlCafe: servicos.reduce((soma, s) => {
        const paxS = s.pax ?? pax
        // auditório serve 150 ml/pax/período; coffee e welcome, 100 ml/pax
        if (s.service_type === 'auditorio') return soma + paxS * 150
        return soma + (tiposCafe.includes(s.service_type) ? paxS * 100 : 0)
      }, 0),
      periodosAchocolatado: servicos.filter((s) => s.service_type === 'coffee_break').length,
    })

    // ⚠️ Observações/pedidos do cliente entram na comanda do DESTINO escolhido
    const ativos = (pedidos ?? []).filter((p) => !p.resolvido)
    const linhaPedido = (desc: string): ComandaLinha => ({
      qtd: '⚠',
      receita: `PEDIDO DO CLIENTE: ${desc}`,
      item: 'ATENÇÃO',
      destaque: 'vermelho',
    })
    for (const p of ativos) {
      const linha = linhaPedido(p.descricao)
      if (p.destino === 'cozinha') {
        for (const d of diasComandas) {
          d.secoes.quente.push(linha)
          d.secoes.fria.push(linha)
          d.secoes.confeitaria.push(linha)
        }
      } else if (p.destino === 'expedicao') {
        bebidas.push(linha)
      } else if (p.destino === 'adriana') {
        fornecedores.push(linha)
      }
    }

    return {
      dias: diasComandas,
      bebidasEstrutura: [
        ...bebidas,
        ...estrutura.map((e) => ({ qtd: e.qtd, receita: e.receita, item: e.item, destaque: e.destaque })),
      ],
      fornecedores,
      locacao: [],
      freelancers: '',
    }
  }, [evento, servicos, snapshotProgramacao, catalogo, pax, startseFixo, pedidos])

  // snapshot salvo → senão inicial
  useEffect(() => {
    if (!id || carregouSalvo) return
    supabase
      .from('production_orders')
      .select('snapshot')
      .eq('event_id', id)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const snap = data?.snapshot as EstadoComandas | undefined
        if (snap?.dias?.length) {
          setEstado(snap)
          setCarregouSalvo(true)
        }
      })
  }, [id, carregouSalvo])

  useEffect(() => {
    if (!carregouSalvo && estadoInicial && !estado) setEstado(estadoInicial)
  }, [estadoInicial, carregouSalvo, estado])

  const verba = evento?.orcamento_valor ? calcVerba(Number(evento.orcamento_valor)) : null

  // ---------- ações ----------
  async function salvar(): Promise<boolean> {
    if (!estado) return false
    setMsg(null)
    const { data: ultima } = await supabase
      .from('production_orders')
      .select('id')
      .eq('event_id', id!)
      .order('versao', { ascending: false })
      .limit(1)
      .maybeSingle()
    const payload = { event_id: id!, verba, snapshot: estado }
    const r = ultima
      ? await supabase.from('production_orders').update(payload).eq('id', ultima.id)
      : await supabase.from('production_orders').insert({ ...payload, versao: 1 })
    if (r.error) {
      setMsg(`Erro ao salvar: ${r.error.message}`)
      return false
    }
    setMsg('✅ Comandas salvas.')
    return true
  }

  async function aprovar() {
    const pendentes = estado?.dias.reduce((a, d) => a + d.indefinidos.length, 0) ?? 0
    if (pendentes > 0) {
      setMsg(`🛑 Há ${pendentes} item(ns) sem estação definida — rotear antes de aprovar (nunca chutar).`)
      return
    }
    const pedidos = await contarPendentes(id!, 'comandas')
    if (pedidos > 0) {
      setMsg(`🛑 ${pedidos} pedido(s) especial(is) do cliente não verificados nesta fase — verificar antes de aprovar.`)
      return
    }
    const ok = await salvar()
    if (!ok) return
    await supabase
      .from('production_orders')
      .update({ aprovado_por: session?.user.id, aprovado_em: new Date().toISOString() })
      .eq('event_id', id!)
    await supabase.from('events').update({ status: 'comandas_geradas' }).eq('id', id!)
    await supabase.from('approvals').insert({ event_id: id!, fase: 'comandas', user_id: session?.user.id })
    await qc.invalidateQueries({ queryKey: ['evento', id] })
    setMsg('✅ Comandas APROVADAS — evento avançou para a fase Plaquinhas.')
  }

  async function gerarDocx() {
    if (!evento || !estado) return
    setGerando(true)
    setMsg(null)
    try {
      const { gerarComandaDocx } = await import('@/lib/docx-comanda')
      const blob = await gerarComandaDocx({
        contratante: nomeCliente(evento),
        evento: evento.nome,
        contato: evento.contato ?? '',
        pax: String(pax),
        endereco: `${evento.endereco ?? ''}${evento.local_detalhe ? ' — ' + evento.local_detalhe : ''}`,
        restricoes: evento.restricoes ?? [],
        startseFixo,
        dias: estado.dias.map((d) => ({
          diaISO: d.diaISO,
          saida: d.saida,
          quente: d.secoes.quente,
          fria: d.secoes.fria,
          confeitaria: d.secoes.confeitaria,
          alimentacao: {
            congelado: d.secoes.congelado,
            // Alimentação = consolidado das cozinhas (Beatriz confere tudo)
            producao: [...d.secoes.quente, ...d.secoes.fria, ...d.secoes.confeitaria],
            insumos: d.secoes.insumos,
            adicionais: d.secoes.adicionais,
          },
        })),
        bebidasEstrutura: estado.bebidasEstrutura,
        adriana: {
          locacao: estado.locacao,
          fornecedores: estado.fornecedores,
          freelancers: estado.freelancers,
          // a comanda que a cozinha imprime sai SEM a verba — senão
          // esconder o número na tela e imprimi-lo em seguida é teatro
          verba: verValores && verba != null ? formatBRL(verba) : '',
        },
      })

      const dia0 = estado.dias[0]?.diaISO ?? ''
      const nome = `Pieggi Comanda - ${nomeCliente(evento)} - ${evento.nome} - ${
        evento.contato ?? 'contato'
      } - ${dia0.split('-').reverse().join('-')}.docx`
      baixarBlob(blob, nome)
      // quem não edita gera só para imprimir: não sobe versão nem salva
      // rascunho (a RLS recusaria, e o arquivo da equipe não é a versão oficial)
      if (editarOperacao) {
        await salvarDocumento(evento.id, blob, nome, 'comanda_docx')
        await salvar()
      }
      setMsg(`✅ Comandas geradas: ${nome}`)
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao gerar o arquivo.'}`)
    } finally {
      setGerando(false)
    }
  }

  // ---------- edição ----------
  function setLinhas(di: number, secao: SecaoDia, linhas: ComandaLinha[]) {
    setEstado((prev) => {
      if (!prev) return prev
      const dias = [...prev.dias]
      dias[di] = { ...dias[di], secoes: { ...dias[di].secoes, [secao]: linhas } }
      return { ...prev, dias }
    })
  }

  function moverIndefinido(di: number, li: number, destino: EstacaoComanda) {
    setEstado((prev) => {
      if (!prev) return prev
      const dias = [...prev.dias]
      const dia = { ...dias[di], indefinidos: [...dias[di].indefinidos] }
      const [linha] = dia.indefinidos.splice(li, 1)
      const novo = { ...prev }
      if (destino === 'bebidas') novo.bebidasEstrutura = [...prev.bebidasEstrutura, linha]
      else if (destino === 'adriana') novo.fornecedores = [...prev.fornecedores, linha]
      else if (destino === 'alimentacao')
        dia.secoes = { ...dia.secoes, adicionais: [...dia.secoes.adicionais, linha] }
      else if (destino !== 'indefinido')
        dia.secoes = { ...dia.secoes, [destino]: [...dia.secoes[destino as SecaoDia], linha] }
      dias[di] = dia
      novo.dias = dias
      return novo
    })
  }

  // ---------- baixa da equipe ----------
  // Uma parte por estação de cada dia: é assim que a comanda sai impressa e
  // é assim que a produção fecha — cozinha quente do dia 1, depois a fria…
  const partesPronto = useMemo((): ParteFase[] => {
    if (!estado) return []
    const out: ParteFase[] = []
    estado.dias.forEach((d, i) => {
      for (const { key, label } of SECOES) {
        if (!d.secoes[key].length) continue
        out.push({
          chave: `${d.diaISO}|${key}`,
          rotulo: `DIA ${i + 1} · ${formatDiaMes(d.diaISO)} — ${label.replace(/^\S+\s/, '')}`,
        })
      }
    })
    if (estado.bebidasEstrutura.length)
      out.push({ chave: 'expedicao', rotulo: 'Expedição — bebidas, estrutura e materiais' })
    if (estado.fornecedores.length || estado.locacao.length)
      out.push({ chave: 'adriana', rotulo: 'Página da Adriana — fornecedores, locação e freelancer' })
    return out
  }, [estado])

  if (!evento) return <p className="text-sm text-neutral-500">Carregando…</p>

  const semProgramacao = !snapshotProgramacao?.snapshot?.blocos?.length
  const pendentes = estado?.dias.reduce((a, d) => a + d.indefinidos.length, 0) ?? 0

  return (
    <div>
      <PageTitle
        actions={
          <Link to={`/eventos/${id}`}>
            <Button variant="secondary">← Voltar ao evento</Button>
          </Link>
        }
      >
        Comandas — {evento.nome}
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span>{pax} pax</span>
        {startseFixo && <Badge tone="blue">StartSe ponto fixo — sem kit limpeza/uniforme/transformador</Badge>}
        {/* dinheiro só para quem pode ver dinheiro */}
        {verValores &&
          (verba != null ? (
            <Badge tone="green">
              Verba (8% de {formatBRL(Number(evento.orcamento_valor))}): {formatBRL(verba)}
            </Badge>
          ) : (
            <Badge tone="amber">
              Verba não calculada — salve a Proposta (o total dela vira a base dos 8%)
            </Badge>
          ))}
        {pendentes > 0 && editarOperacao && <Badge tone="red">{pendentes} item(ns) a rotear</Badge>}
        {!editarOperacao && (
          <Badge tone="blue">
            {ehCozinha ? 'Cozinha — leitura e baixa de produção' : 'Somente leitura'}
          </Badge>
        )}
      </div>

      <PedidosFaseBanner eventId={id!} fase="comandas" />

      {semProgramacao ? (
        <Card>
          <EmptyState>
            As comandas partem da <b>programação aprovada</b>. Monte e salve a Programação primeiro.{' '}
            <Link to={`/eventos/${id}/programacao`} className="font-semibold underline">
              Ir para a Programação
            </Link>
          </EmptyState>
        </Card>
      ) : !estado ? (
        <p className="text-sm text-neutral-500">Roteando itens…</p>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            {editarOperacao && (
              <Button
                variant="secondary"
                onClick={() => {
                  if (estadoInicial) {
                    setEstado(estadoInicial)
                    setCarregouSalvo(true)
                    setMsg('Comandas regeneradas da programação (edições descartadas).')
                  }
                }}
              >
                ↻ Regenerar da programação
              </Button>
            )}
            {editarOperacao && (
              <Button variant="secondary" onClick={salvar}>Salvar rascunho</Button>
            )}
            <Button onClick={gerarDocx} disabled={gerando}>
              {gerando ? 'Gerando…' : 'Gerar .docx (6 comandas)'}
            </Button>
            {editarOperacao && (
              <Button className="!bg-green-700 hover:!bg-green-600" onClick={aprovar}>
                ✓ Aprovar comandas
              </Button>
            )}
          </div>

          {msg && <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

          <ChecklistPronto
            eventId={id!}
            fase="comandas"
            partes={partesPronto}
            titulo="✅ Produção — dar baixa do que já saiu"
            ajuda="Marque a estação quando a comanda dela estiver fechada. O admin acompanha por aqui; a edição das linhas continua com ele."
          />

          {estado.dias.map((dia, di) => (
            <div key={dia.diaISO} className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">
                  DIA {di + 1} — {formatDiaMes(dia.diaISO)}
                </h2>
                <Input
                  className="!w-96"
                  readOnly={!editarOperacao}
                  value={dia.saida}
                  onChange={(e) =>
                    setEstado((prev) => {
                      if (!prev) return prev
                      const dias = [...prev.dias]
                      dias[di] = { ...dias[di], saida: e.target.value }
                      return { ...prev, dias }
                    })
                  }
                />
              </div>

              {dia.indefinidos.length > 0 && (
                <Card
                  title={
                    editarOperacao
                      ? '❓ A ROTEAR — definir estação antes de aprovar (nunca chutar)'
                      : '❓ A ROTEAR — itens ainda sem estação (o admin define)'
                  }
                >
                  {dia.indefinidos.map((l, li) => (
                    <div key={li} className="mb-2 flex items-center gap-2 text-sm">
                      <span className="flex-1">
                        <b>{l.item}</b> — {l.receita} ({l.qtd})
                      </span>
                      <select
                        className="rounded border border-neutral-300 px-2 py-1 text-sm disabled:opacity-40"
                        defaultValue=""
                        disabled={!editarOperacao}
                        onChange={(e) => {
                          if (e.target.value) moverIndefinido(di, li, e.target.value as EstacaoComanda)
                        }}
                      >
                        <option value="">Rotear para…</option>
                        {(Object.keys(ESTACAO_LABEL) as EstacaoComanda[])
                          .filter((k) => k !== 'indefinido')
                          .map((k) => (
                            <option key={k} value={k}>
                              {ESTACAO_LABEL[k]}
                            </option>
                          ))}
                      </select>
                    </div>
                  ))}
                </Card>
              )}

              {SECOES.map(({ key, label }) =>
                dia.secoes[key].length || ['quente', 'fria', 'confeitaria'].includes(key) ? (
                  <Card key={key} title={label}>
                    <EditorLinhas
                      linhas={dia.secoes[key]}
                      onChange={(ls) => setLinhas(di, key, ls)}
                      readOnly={!editarOperacao}
                    />
                  </Card>
                ) : null
              )}
            </div>
          ))}

          <Card title="🥤 EXPEDIÇÃO — Bebidas, Estrutura e Materiais (consolidada — todos os dias)">
            <EditorLinhas
              linhas={estado.bebidasEstrutura}
              onChange={(ls) => setEstado((p) => (p ? { ...p, bebidasEstrutura: ls } : p))}
              readOnly={!editarOperacao}
            />
          </Card>

          <Card title="🟢 PÁGINA DA ADRIANA — Fornecedores (motorista busca) + Freelancer + Verba">
            <p className="mb-2 text-xs font-semibold uppercase text-neutral-500">Fornecedores</p>
            <EditorLinhas
              linhas={estado.fornecedores}
              onChange={(ls) => setEstado((p) => (p ? { ...p, fornecedores: ls } : p))}
              readOnly={!editarOperacao}
            />
            <p className="mb-2 mt-4 text-xs font-semibold uppercase text-neutral-500">
              Locação extra (só o que a Pieggi não tem)
            </p>
            <EditorLinhas
              linhas={estado.locacao}
              onChange={(ls) => setEstado((p) => (p ? { ...p, locacao: ls } : p))}
              readOnly={!editarOperacao}
            />
            <div className="mt-4 flex items-end gap-4">
              <Input
                label="Nº de freelancers"
                className="!w-40"
                readOnly={!editarOperacao}
                value={estado.freelancers}
                onChange={(e) => setEstado((p) => (p ? { ...p, freelancers: e.target.value } : p))}
              />
              {verValores && (
                <p className="pb-2 text-sm">
                  Verba (8%): <b>{verba != null ? formatBRL(verba) : '—'}</b>{' '}
                  <span className="text-xs text-neutral-400">
                    (nunca exibir o orçamento no documento)
                  </span>
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Editor de linhas reutilizável
// ------------------------------------------------------------
function EditorLinhas({
  linhas,
  onChange,
  readOnly = false,
}: {
  linhas: ComandaLinha[]
  onChange: (l: ComandaLinha[]) => void
  readOnly?: boolean
}) {
  function editar(i: number, campo: keyof ComandaLinha, valor: string) {
    const novo = [...linhas]
    novo[i] = { ...novo[i], [campo]: valor || (campo === 'destaque' ? null : valor) }
    onChange(novo)
  }
  // no modo leitura o campo continua sendo <input> (mesma altura, mesma
  // tabela) — só perde o hover de edição e a coluna do ✕
  const campo =
    'w-full rounded border border-transparent px-1.5 py-1 focus:outline-none ' +
    (readOnly
      ? 'cursor-default bg-transparent'
      : 'hover:border-neutral-300 focus:border-neutral-900')
  return (
    <div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-500">
            <th className="w-32 px-2 py-1.5">Qtd</th>
            <th className="px-2 py-1.5">Receita / descrição</th>
            <th className="w-44 px-2 py-1.5">Item</th>
            {!readOnly && <th className="w-8"></th>}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr
              key={i}
              className={
                l.destaque === 'amarelo' ? 'bg-yellow-50' : l.destaque === 'vermelho' ? 'bg-red-50' : l.destaque === 'azul' ? 'bg-blue-50' : ''
              }
            >
              <td className="px-1 py-0.5">
                <input
                  className={campo}
                  readOnly={readOnly}
                  value={l.qtd}
                  onChange={(e) => editar(i, 'qtd', e.target.value)}
                />
              </td>
              <td className="px-1 py-0.5">
                <input
                  className={campo}
                  readOnly={readOnly}
                  value={l.receita}
                  onChange={(e) => editar(i, 'receita', e.target.value)}
                />
              </td>
              <td className="px-1 py-0.5">
                <input
                  className={`${campo} font-medium`}
                  readOnly={readOnly}
                  value={l.item}
                  onChange={(e) => editar(i, 'item', e.target.value)}
                />
              </td>
              {!readOnly && (
                <td className="px-1 text-center">
                  <button
                    className="text-neutral-300 hover:text-red-600"
                    onClick={() => onChange(linhas.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!readOnly && (
        <Button
          variant="ghost"
          className="mt-1 !px-2 !py-1 text-xs"
          onClick={() => onChange([...linhas, { qtd: '', receita: '', item: '' }])}
        >
          + Linha
        </Button>
      )}
    </div>
  )
}
