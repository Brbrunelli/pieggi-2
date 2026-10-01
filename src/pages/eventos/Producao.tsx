// ============================================================
// PRODUÇÃO — comanda + plaquinha, uma fase só
//
// Esta tela NÃO edita nada. A programação é o único ponto editável da
// operação; comanda e plaquinha são consequência dela. Antes eram duas
// fases com duas aprovações, e isso permitia imprimir plaquinha de uma
// versão e comanda de outra.
//
// Um clique gera os dois arquivos (.docx das 6 comandas + PDF trilíngue
// das plaquinhas), grava as duas versões e carimba as duas aprovações.
// Precisa mudar algo? Volta na Programação, ajusta e gera de novo.
// ============================================================

import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import ChecklistPronto, { type ParteFase } from '@/components/MarcarPronto'
import { Badge, Button, Card, EmptyState, PageTitle } from '@/components/ui'
import {
  nomeCliente,
  type CatalogItem,
  type Client,
  type EventService,
  type PieggiEvent,
} from '@/types'
import { calcVerba, formatBRL, formatDiaMes } from '@/engine'
import {
  montarComandas,
  montarPlaquinhas,
  SECOES,
  type BlocoProgramacao,
} from '@/engine/producao'
import { baixarBlob, salvarDocumento } from '@/lib/documentos'
import { contarPendentes, PedidosFaseBanner, usePedidos } from '@/components/PedidosEspeciais'
import EsteiraEvento from '@/components/EsteiraEvento'

export default function Producao() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { session } = useAuth()
  const { editarOperacao, ehCozinha, verValores } = usePermissoes()

  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

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

  const { data: programacao } = useQuery({
    queryKey: ['schedule-snapshot', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('schedules')
        .select('snapshot, aprovado_em')
        .eq('event_id', id!)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data as {
        snapshot: { blocos?: BlocoProgramacao[] }
        aprovado_em: string | null
      } | null
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

  /** Última produção gravada — mostra desde quando os arquivos existem. */
  const { data: ultima } = useQuery({
    queryKey: ['producao-versao', id],
    queryFn: async () => {
      const [com, pla] = await Promise.all([
        supabase
          .from('production_orders')
          .select('aprovado_em, updated_at')
          .eq('event_id', id!)
          .order('versao', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('signage_sets')
          .select('aprovado_em')
          .eq('event_id', id!)
          .order('versao', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])
      return {
        comandaEm: (com.data as { aprovado_em: string | null } | null)?.aprovado_em ?? null,
        plaquinhaEm: (pla.data as { aprovado_em: string | null } | null)?.aprovado_em ?? null,
      }
    },
  })

  const { data: pedidos } = usePedidos(id)

  // saída PROGRAMADA (viagem da Adriana, 0032). Quando existe, ela vai no
  // papel no lugar da estimativa "servir −3h, conferir Adriana" — era essa
  // estimativa que chegava errada na mão da equipe.
  const { data: entregas } = useQuery({
    queryKey: ['producao-viagens', id],
    queryFn: async () => {
      const { data } = await supabase
        .from('viagens')
        .select('dia, saida_prevista, profiles:motorista_id (nome)')
        .eq('event_id', id!)
        .eq('tipo', 'entrega')
        .neq('status', 'cancelada')
        .order('saida_prevista')
      return (data ?? []) as unknown as {
        dia: string
        saida_prevista: string
        profiles: { nome: string } | null
      }[]
    },
  })

  function saidaDoDia(diaISO: string, estimada: string): string {
    const v = entregas?.find((x) => x.dia === diaISO)
    if (!v) return estimada
    const [h, m] = v.saida_prevista.split(':')
    return `${h}h${m} — PROGRAMADA${v.profiles?.nome ? ` (motorista ${v.profiles.nome})` : ''}`
  }

  const pax = evento?.pax ?? 0
  const startseFixo =
    evento?.clients?.tipo === 'startse' ||
    evento?.clients?.tipo === 'wtc' ||
    Boolean((evento?.clients?.regras as { ponto_fixo?: boolean } | undefined)?.ponto_fixo)

  const blocos = programacao?.snapshot?.blocos ?? []

  // ---------- derivação: as duas saem da MESMA programação ----------
  const comandas = useMemo(
    () =>
      evento && servicos?.length
        ? montarComandas({
            pax,
            startseFixo,
            servicos,
            blocos,
            catalogo,
            pedidos: pedidos ?? [],
          })
        : null,
    [evento, servicos, blocos, catalogo, pedidos, pax, startseFixo]
  )

  const cards = useMemo(
    () =>
      servicos?.length
        ? montarPlaquinhas({
            servicos,
            blocos,
            catalogo,
            restricoes: evento?.restricoes ?? [],
          })
        : [],
    [servicos, blocos, catalogo, evento?.restricoes]
  )

  const verba = evento?.orcamento_valor ? calcVerba(Number(evento.orcamento_valor)) : null
  const aRotear = comandas?.dias.reduce((a, d) => a + d.indefinidos.length, 0) ?? 0
  const dias = Array.from(new Set(servicos?.map((s) => s.dia) ?? [])).sort()

  // ---------- baixa da equipe ----------
  const partesComandas = useMemo((): ParteFase[] => {
    if (!comandas) return []
    const out: ParteFase[] = []
    comandas.dias.forEach((d, i) => {
      for (const { key, label } of SECOES) {
        if (!d.secoes[key].length) continue
        out.push({
          chave: `${d.diaISO}|${key}`,
          rotulo: `DIA ${i + 1} · ${formatDiaMes(d.diaISO)} — ${label.replace(/^\S+\s/, '')}`,
        })
      }
    })
    if (comandas.bebidasEstrutura.length)
      out.push({ chave: 'expedicao', rotulo: 'Expedição — bebidas, estrutura e materiais' })
    if (comandas.fornecedores.length)
      out.push({ chave: 'adriana', rotulo: 'Página da Adriana — fornecedores e freelancer' })
    return out
  }, [comandas])

  const partesPlaquinhas: ParteFase[] = [
    ...dias.map((d) => ({
      chave: `impresso|${d}`,
      rotulo: `Impressas, cortadas e dobradas — ${formatDiaMes(d)}`,
    })),
    { chave: 'conferido', rotulo: 'Conferidas com a comanda (selos, restrições e cards CONTÉM)' },
    { chave: 'separado', rotulo: 'Separadas na caixa do evento' },
  ]

  // ------------------------------------------------------------
  // GERAR: comanda + plaquinha na mesma ação
  // ------------------------------------------------------------
  async function gerar() {
    if (!evento || !comandas) return
    setMsg(null)

    // gates: o que não pode sair errado para a cozinha
    if (!evento.endereco_confirmado) {
      setMsg(
        '🛑 Endereço do evento não confirmado. A comanda leva o endereço para a rua — confirme no cadastro do evento antes de gerar.'
      )
      return
    }
    if (aRotear > 0) {
      setMsg(
        `🛑 ${aRotear} item(ns) da programação sem estação definida. Ajuste a Programação — a produção não chuta estação.`
      )
      return
    }
    if (editarOperacao) {
      const pendentes =
        (await contarPendentes(id!, 'comandas')) + (await contarPendentes(id!, 'plaquinhas'))
      if (pendentes > 0) {
        setMsg(
          `🛑 ${pendentes} verificação(ões) de pedido especial em aberto nesta fase — verificar antes de gerar.`
        )
        return
      }
    }

    setGerando(true)
    try {
      const dia0 = comandas.dias[0]?.diaISO ?? ''
      const ddmm = dia0.split('-').reverse().join('-')
      const cliente = nomeCliente(evento)
      const contato = evento.contato ?? 'contato'

      // ---------- 1. comandas (.docx, 6 estações) ----------
      const { gerarComandaDocx } = await import('@/lib/docx-comanda')
      const blobDocx = await gerarComandaDocx({
        contratante: cliente,
        evento: evento.nome,
        contato: evento.contato ?? '',
        pax: String(pax),
        endereco: `${evento.endereco ?? ''}${evento.local_detalhe ? ' — ' + evento.local_detalhe : ''}`,
        restricoes: evento.restricoes ?? [],
        startseFixo,
        dias: comandas.dias.map((d) => ({
          diaISO: d.diaISO,
          saida: saidaDoDia(d.diaISO, d.saida),
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
        bebidasEstrutura: comandas.bebidasEstrutura,
        adriana: {
          locacao: comandas.locacao,
          fornecedores: comandas.fornecedores,
          freelancers: comandas.freelancers,
          // a comanda que a cozinha imprime sai SEM a verba
          verba: verValores && verba != null ? formatBRL(verba) : '',
        },
      })
      const nomeDocx = `Pieggi Comanda - ${cliente} - ${evento.nome} - ${contato} - ${ddmm}.docx`
      baixarBlob(blobDocx, nomeDocx)

      // ---------- 2. plaquinhas (PDF trilíngue) ----------
      const { gerarPlaquinhasPdf } = await import('@/lib/pdf-plaquinhas')
      const blobPdf = await gerarPlaquinhasPdf(cards)
      const nomePdf = `Pieggi Plaquinha - ${cliente} - ${evento.nome} - ${contato} - ${ddmm}.pdf`
      baixarBlob(blobPdf, nomePdf)

      // Quem não edita gera só para imprimir: não sobe versão nem aprova
      // (a RLS recusaria, e a cópia da cozinha não é a versão oficial).
      if (!editarOperacao) {
        setMsg(`✅ Arquivos gerados para impressão: ${nomeDocx} e ${nomePdf}`)
        return
      }

      // ---------- 3. grava as duas versões ----------
      await salvarDocumento(evento.id, blobDocx, nomeDocx, 'comanda_docx')
      await salvarDocumento(evento.id, blobPdf, nomePdf, 'plaquinha_pdf')

      const agora = new Date().toISOString()
      const [ultimaCom, ultimaPla] = await Promise.all([
        supabase
          .from('production_orders')
          .select('id')
          .eq('event_id', id!)
          .order('versao', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('signage_sets')
          .select('id')
          .eq('event_id', id!)
          .order('versao', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const cargaCom = {
        event_id: id!,
        verba,
        snapshot: comandas,
        aprovado_por: session?.user.id,
        aprovado_em: agora,
      }
      const rCom = ultimaCom.data
        ? await supabase.from('production_orders').update(cargaCom).eq('id', ultimaCom.data.id)
        : await supabase.from('production_orders').insert({ ...cargaCom, versao: 1 })
      if (rCom.error) throw rCom.error

      const cargaPla = {
        event_id: id!,
        cards,
        aprovado_por: session?.user.id,
        aprovado_em: agora,
      }
      const rPla = ultimaPla.data
        ? await supabase.from('signage_sets').update(cargaPla).eq('id', ultimaPla.data.id)
        : await supabase.from('signage_sets').insert({ ...cargaPla, versao: 1 })
      if (rPla.error) throw rPla.error

      // ---------- 4. carimba as duas aprovações e avança a esteira ----------
      await supabase.from('approvals').insert([
        { event_id: id!, fase: 'comandas', user_id: session?.user.id, obs: 'Produção gerada' },
        { event_id: id!, fase: 'plaquinhas', user_id: session?.user.id, obs: 'Produção gerada' },
      ])
      await supabase.from('events').update({ status: 'plaquinhas_geradas' }).eq('id', id!)

      await qc.invalidateQueries({ queryKey: ['evento', id] })
      await qc.invalidateQueries({ queryKey: ['producao-versao', id] })
      setMsg(`✅ Produção gerada e aprovada: ${nomeDocx} + ${nomePdf}`)
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao gerar a produção.'}`)
    } finally {
      setGerando(false)
    }
  }

  if (!evento) return <p className="text-sm text-neutral-500">Carregando…</p>

  const semProgramacao = !blocos.length
  const programacaoAprovada = Boolean(programacao?.aprovado_em)

  return (
    <div>
      <PageTitle
        lead="OPERAÇÃO"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to={`/eventos/${id}/programacao`}>
              <Button variant="secondary">Ver programação</Button>
            </Link>
            <Link to={`/eventos/${id}`}>
              <Button variant="secondary">← Voltar ao evento</Button>
            </Link>
          </div>
        }
      >
        Produção — {evento.nome}
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span>{pax} pax</span>
        {startseFixo && (
          <Badge tone="blue">StartSe ponto fixo — sem kit limpeza/uniforme/transformador</Badge>
        )}
        {verValores && verba != null && (
          <Badge tone="green">Verba (8%): {formatBRL(verba)}</Badge>
        )}
        {aRotear > 0 && <Badge tone="red">{aRotear} item(ns) sem estação</Badge>}
        {!editarOperacao && (
          <Badge tone="blue">
            {ehCozinha ? 'Cozinha — impressão e baixa' : 'Somente leitura'}
          </Badge>
        )}
      </div>

      <EsteiraEvento eventId={id!} fase="producao" />
      <PedidosFaseBanner eventId={id!} fase="comandas" />

      {semProgramacao ? (
        <Card>
          <EmptyState>
            A produção sai da <b>programação</b>. Monte e aprove a Programação primeiro — ela é o
            único ponto editável da operação.{' '}
            <Link to={`/eventos/${id}/programacao`} className="font-semibold underline">
              Ir para a Programação
            </Link>
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          {!programacaoAprovada && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              ⚠️ A programação está salva mas <b>ainda não foi aprovada</b>. Gerar a produção agora
              usa uma versão que pode mudar — aprove a programação antes.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={gerar} disabled={gerando || !comandas}>
              {gerando
                ? 'Gerando…'
                : editarOperacao
                  ? '⚙ Gerar produção (comanda + plaquinha)'
                  : '⬇ Baixar para imprimir'}
            </Button>
            {ultima?.comandaEm && (
              <span className="text-xs text-neutral-500">
                Última versão gerada em{' '}
                {new Date(ultima.comandaEm).toLocaleString('pt-BR', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          {msg && <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

          {aRotear > 0 && comandas && (
            <Card title="❓ Itens sem estação — resolver na Programação">
              <p className="mb-3 text-xs text-neutral-500">
                O roteamento não achou a estação destes itens. A produção não chuta: ajuste o texto
                na Programação (ou cadastre a estação do item no Catálogo) e volte aqui.
              </p>
              <ul className="space-y-1 text-sm">
                {comandas.dias.flatMap((d, i) =>
                  d.indefinidos.map((l, j) => (
                    <li key={`${i}-${j}`} className="text-red-700">
                      • DIA {i + 1} — <b>{l.item || 'sem item'}</b>: {l.receita} ({l.qtd})
                    </li>
                  ))
                )}
              </ul>
            </Card>
          )}

          {/* ---------- o que vai sair, sem editar ---------- */}
          <div className="pg-headline">
            <b>CONFERÊNCIA</b>
            <i>O que vai sair</i>
          </div>

          {comandas?.dias.map((d, di) => (
            <Card
              key={d.diaISO}
              title={`🔥 Comandas · DIA ${di + 1} — ${formatDiaMes(d.diaISO)}`}
              actions={<span className="text-xs text-neutral-500">{saidaDoDia(d.diaISO, d.saida)}</span>}
            >
              <div className="space-y-4">
                {SECOES.filter(({ key }) => d.secoes[key].length).map(({ key, label }) => (
                  <div key={key}>
                    <p className="pg-key mb-1.5">{label}</p>
                    <ul className="space-y-0.5 text-sm">
                      {d.secoes[key].map((l, i) => (
                        <li
                          key={i}
                          className={
                            'flex justify-between gap-4 ' +
                            (l.destaque === 'vermelho'
                              ? 'text-red-700'
                              : l.destaque === 'amarelo'
                                ? 'text-amber-800'
                                : l.destaque === 'azul'
                                  ? 'text-blue-800'
                                : '')
                          }
                        >
                          <span>
                            {l.receita}
                            {l.item ? ` · ${l.item}` : ''}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-neutral-500">
                            {l.qtd}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          ))}

          {comandas && comandas.bebidasEstrutura.length > 0 && (
            <Card title="🥤 Expedição — bebidas, estrutura e materiais (todos os dias)">
              <ul className="space-y-0.5 text-sm">
                {comandas.bebidasEstrutura.map((l, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span>
                      {l.receita}
                      {l.item ? ` · ${l.item}` : ''}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-neutral-500">{l.qtd}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {comandas && comandas.fornecedores.length > 0 && (
            <Card title="🟢 Página da Adriana — fornecedores">
              <ul className="space-y-0.5 text-sm">
                {comandas.fornecedores.map((l, i) => (
                  <li key={i} className="flex justify-between gap-4">
                    <span>{l.receita}</span>
                    <span className="shrink-0 font-mono text-xs text-neutral-500">{l.qtd}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={`🏷 Plaquinhas · ${cards.length} cards + par "VISITE NOSSO SITE"`}>
            {!cards.length ? (
              <p className="text-sm text-neutral-400">
                Nenhum item servido identificado na programação.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
                {cards.map((c, i) => (
                  <div key={i} className={c.tipo === 'contem' ? 'text-red-700' : ''}>
                    <span className="font-medium">{c.titulo}</span>
                    {c.sub && <span className="text-neutral-500"> · {c.sub}</span>}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ---------- baixa da equipe ---------- */}
          <div className="pg-headline">
            <b>PRODUÇÃO</b>
            <i>Dar baixa</i>
          </div>

          <ChecklistPronto
            eventId={id!}
            fase="comandas"
            partes={partesComandas}
            titulo="✅ Cozinha e expedição"
            ajuda="Marque a estação quando a comanda dela estiver fechada."
          />

          <ChecklistPronto
            eventId={id!}
            fase="plaquinhas"
            partes={partesPlaquinhas}
            titulo="✅ Impressão das plaquinhas"
            ajuda="Marque conforme imprime, dobra e separa."
          />
        </div>
      )}
    </div>
  )
}
