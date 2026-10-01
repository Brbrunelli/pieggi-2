// ============================================================
// PRODUÇÃO — a TV de cada praça (confeitaria, cozinha fria, quente)
//
// Inspirada na tela de cozinha do McDonald's citada na reunião: a praça
// não lê a comanda inteira, lê SÓ o que é dela, por evento, com o
// horário em que o carro sai em letra grande e quanto tempo falta.
//
//   - a lista vem da comanda APROVADA mais nova (contrato assinado);
//     nada é digitado aqui — mudou a programação, regera a comanda;
//   - cada item é tocado para avançar: a fazer → produzindo → pronto,
//     e o andamento fica em producao_itens (migration 0035), amarrado
//     por uma chave tirada do texto da linha (engine/expedicao.ts).
//     Regerar a comanda mudando uma linha perde a baixa SÓ dela;
//   - linha de instrução ("FINALIZAR…", "⚠…") não é item: aparece em
//     vermelho grudada no item de cima, como na comanda impressa;
//   - ATRASADO = menos de 1 h para a saída e ainda há item não pronto;
//   - modo TV: tela cheia, letra grande, atualiza sozinho a cada 30 s;
//   - três pessoas tocam a mesma TV: o cartão muda de cor NA HORA
//     (atualização otimista, desfeita se o banco recusar) e só o cartão
//     que está salvando fica travado — os outros seguem tocáveis;
//   - pedido de compra do evento ainda não recebido aparece numa linha
//     âmbar (insumo que a praça vai precisar) — informa, não trava.
//
// Quem mexe: a cozinha (marcarPronto) e o admin. Os outros só olham.
// ============================================================

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, PageTitle } from '@/components/ui'
import {
  eventoAtrasado,
  itensDaSecao,
  minutosAte,
  progresso,
  proximoStatus,
  statusAnterior,
  textoContagem,
  type ItemPraca as Item,
} from '@/engine/expedicao'
import { horaBR } from '@/types'
import {
  BarraProgresso,
  FaixaCompras,
  horaMarcada,
  isoDia,
  rotuloDia,
  SeletorDia,
  useEventosDoDia,
  usePedidosPendentes,
  type EventoDoDia,
} from '@/components/producao/comum'
import ItemPraca from '@/components/producao/ItemPraca'
import {
  ESTACAO_INFO,
  ESTACOES,
  ehEstacao,
  type EstacaoProducao,
  type ProducaoItem,
  type ProducaoStatus,
} from '@/tipos/operacao'

export default function Estacao() {
  const { estacao } = useParams()
  if (!ehEstacao(estacao)) {
    return (
      <div>
        <PageTitle lead="PRODUÇÃO">Praça não encontrada</PageTitle>
        <Card>
          <p className="mb-4 text-sm">
            "{estacao}" não é uma praça da cozinha. A produção tem três telas — escolha a sua:
          </p>
          <div className="flex flex-wrap gap-2">
            {ESTACOES.map((e) => (
              <Link
                key={e}
                to={`/producao/${e}`}
                className="rounded-full px-5 py-2.5 text-xs font-semibold text-white"
                style={{ background: ESTACAO_INFO[e].cor }}
              >
                {ESTACAO_INFO[e].nome}
              </Link>
            ))}
          </div>
        </Card>
      </div>
    )
  }
  // key: trocar de praça zera o estado (dia, modo TV)
  return <TelaPraca key={estacao} estacao={estacao} />
}

function TelaPraca({ estacao }: { estacao: EstacaoProducao }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { marcarPronto, ehAdmin } = usePermissoes()
  const pode = marcarPronto || ehAdmin
  const info = ESTACAO_INFO[estacao]

  const [dia, setDia] = useState(isoDia(0))
  const [tv, setTv] = useState(false)
  const [agora, setAgora] = useState(() => new Date())

  // o relógio da contagem regressiva
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  // sair da tela cheia pelo Esc do navegador também sai do modo TV
  useEffect(() => {
    const sair = () => {
      if (!document.fullscreenElement) setTv(false)
    }
    document.addEventListener('fullscreenchange', sair)
    return () => document.removeEventListener('fullscreenchange', sair)
  }, [])

  async function alternarTv() {
    if (tv) {
      setTv(false)
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
      return
    }
    setTv(true)
    // tela cheia é bônus: navegador que nega continua no modo TV em janela
    await document.documentElement.requestFullscreen?.().catch(() => {})
  }

  const atualizar = tv ? 30_000 : 60_000
  const { data: eventos, isLoading, error } = useEventosDoDia(dia, atualizar)
  const compras = usePedidosPendentes(
    dia,
    (eventos ?? []).map((e) => e.eventId),
    atualizar
  )

  const chaveBaixas = ['producao-itens', dia, estacao]
  const { data: baixas } = useQuery({
    queryKey: chaveBaixas,
    refetchInterval: atualizar,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producao_itens')
        .select('*, profiles:atualizado_por (nome)')
        .eq('dia', dia)
        .eq('estacao', estacao)
      if (error) throw error
      return (data ?? []) as ProducaoItem[]
    },
  })
  const porChave = useMemo(() => new Map((baixas ?? []).map((b) => [`${b.event_id}|${b.chave}`, b])), [baixas])

  // cartões salvando agora — só eles ficam travados
  const [salvando, setSalvando] = useState<Set<string>>(() => new Set())
  const marcarSalvando = (k: string, on: boolean) =>
    setSalvando((s) => {
      const n = new Set(s)
      if (on) n.add(k)
      else n.delete(k)
      return n
    })

  const mudar = useMutation({
    mutationFn: async ({ ev, item, para }: { ev: EventoDoDia; item: Item; para: ProducaoStatus }) => {
      if (para === 'a_fazer') {
        const { error } = await supabase
          .from('producao_itens')
          .delete()
          .eq('event_id', ev.eventId)
          .eq('dia', dia)
          .eq('estacao', estacao)
          .eq('chave', item.chave)
        if (error) throw error
        return
      }
      const { error } = await supabase.from('producao_itens').upsert(
        {
          event_id: ev.eventId,
          dia,
          estacao,
          chave: item.chave,
          rotulo: `${item.qtd} ${item.texto}`.trim(),
          status: para,
          atualizado_por: session?.user.id,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'event_id,dia,estacao,chave' }
      )
      if (error) throw error
    },
    // otimista: o cartão muda de cor no toque, sem esperar o refetch
    onMutate: async ({ ev, item, para }) => {
      marcarSalvando(`${ev.eventId}|${item.chave}`, true)
      await qc.cancelQueries({ queryKey: chaveBaixas })
      const antes = qc.getQueryData<ProducaoItem[]>(chaveBaixas)
      qc.setQueryData<ProducaoItem[]>(chaveBaixas, (velho = []) => {
        const resto = velho.filter((b) => !(b.event_id === ev.eventId && b.chave === item.chave))
        if (para === 'a_fazer') return resto
        const atual = velho.find((b) => b.event_id === ev.eventId && b.chave === item.chave)
        return [
          ...resto,
          {
            id: atual?.id ?? `otimista-${item.chave}`,
            event_id: ev.eventId,
            dia,
            estacao,
            chave: item.chave,
            rotulo: `${item.qtd} ${item.texto}`.trim(),
            status: para,
            atualizado_por: session?.user.id ?? null,
            atualizado_em: new Date().toISOString(),
            profiles: atual?.profiles ?? null,
          },
        ]
      })
      return { antes }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.antes) qc.setQueryData(chaveBaixas, ctx.antes)
    },
    onSettled: async (_d, _e, { ev, item }) => {
      marcarSalvando(`${ev.eventId}|${item.chave}`, false)
      await qc.invalidateQueries({ queryKey: chaveBaixas })
      await qc.invalidateQueries({ queryKey: ['expedicao-producao', dia] })
    },
  })

  // monta, por evento, os itens da praça e o andamento
  const blocos = (eventos ?? []).map((ev) => {
    const { itens, avisosGerais } = itensDaSecao(ev.dia.secoes[estacao] ?? [])
    const status = (it: Item): ProducaoStatus => porChave.get(`${ev.eventId}|${it.chave}`)?.status ?? 'a_fazer'
    const prontos = itens.filter((it) => status(it) === 'pronto').length
    const produzindo = itens.filter((it) => status(it) === 'produzindo').length
    const min = minutosAte(dia, ev.saida, agora)
    return { ev, itens, avisosGerais, prontos, produzindo, min, pendentes: itens.length - prontos }
  })
  const comItens = blocos.filter((b) => b.itens.length)
  const semItens = blocos.filter((b) => !b.itens.length)
  const total = progresso(
    comItens.reduce((a, b) => a + b.prontos, 0),
    comItens.reduce((a, b) => a + b.itens.length, 0)
  )
  const produzindoTotal = comItens.reduce((a, b) => a + b.produzindo, 0)
  const tudoSaiu = blocos.length > 0 && blocos.every((b) => b.ev.saiuEm)

  const conteudo = (
    <div className={tv ? 'mx-auto max-w-[1800px]' : ''}>
      {/* faixa da praça — a cor é a da comanda impressa */}
      <div className="mb-5 rounded-lg p-4 text-white sm:p-5" style={{ background: info.cor }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">Produção · {rotuloDia(dia)}</div>
            <div className={`font-bold ${tv ? 'text-5xl' : 'text-2xl sm:text-3xl'}`}>{info.nome}</div>
          </div>
          <div className="text-right">
            <div className={`font-bold tabular-nums ${tv ? 'text-5xl' : 'text-3xl'}`}>
              {String(agora.getHours()).padStart(2, '0')}:{String(agora.getMinutes()).padStart(2, '0')}
            </div>
            <div className="text-xs opacity-80">
              {total.feitos}/{total.total} pronto{produzindoTotal ? ` · ${produzindoTotal} produzindo` : ''}
            </div>
          </div>
        </div>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-all duration-500" style={{ width: `${total.pct}%` }} />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SeletorDia valor={dia} onChange={setDia} grande={tv} />
        <div className="flex flex-wrap items-center gap-2">
          {!tv &&
            ESTACOES.filter((e) => e !== estacao).map((e) => (
              <Link key={e} to={`/producao/${e}`} className="text-xs font-semibold underline" style={{ color: ESTACAO_INFO[e].cor }}>
                {ESTACAO_INFO[e].curto}
              </Link>
            ))}
          <Button variant={tv ? 'primary' : 'secondary'} onClick={alternarTv}>
            {tv ? 'Sair do modo TV' : '📺 Modo TV'}
          </Button>
        </div>
      </div>

      {!pode && (
        <p className="mb-4 rounded-lg border border-[var(--pg-border)] px-3 py-2 text-xs text-neutral-500">
          Você está vendo a tela da praça. Só a cozinha e o admin mudam o status dos itens.
        </p>
      )}
      {mudar.isError && (
        <p className="mb-4 rounded-lg bg-red-700/10 px-3 py-2 text-sm text-red-700">🛑 {(mudar.error as Error).message}</p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-700/10 px-3 py-2 text-sm text-red-700">🛑 {(error as Error).message}</p>}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !blocos.length ? (
        <EmptyState>
          Nenhum evento com comanda aprovada para {rotuloDia(dia).toLowerCase()}. A tela só mostra evento com contrato
          assinado e produção aprovada.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {tudoSaiu && (
            <p className="rounded-lg border border-[var(--pg-border)] px-3 py-2 text-sm">
              Tudo de {rotuloDia(dia).toLowerCase()} já saiu da Pieggi.{' '}
              {dia === isoDia(0) && (
                <button type="button" className="font-semibold underline" onClick={() => setDia(isoDia(1))}>
                  Ver o que produzir para amanhã →
                </button>
              )}
            </p>
          )}

          {comItens.map(({ ev, itens, avisosGerais, prontos, produzindo, min, pendentes }) => {
            const p = progresso(prontos, itens.length)
            const atrasado = !ev.saiuEm && eventoAtrasado(min, pendentes)
            return (
              <section
                key={ev.eventId}
                className={`rounded-lg border-2 p-4 ${atrasado ? 'border-red-700' : 'border-[var(--pg-border)]'}`}
              >
                <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className={`font-bold ${tv ? 'text-3xl' : 'text-lg'}`}>{ev.nome}</div>
                    <div className="text-xs text-neutral-500">
                      {ev.cliente}
                      {ev.pax ? ` · ${ev.pax} pax` : ''} · comanda v{ev.versao}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold tabular-nums ${tv ? 'text-4xl' : 'text-2xl'}`}>
                      SAÍDA {ev.saida ? horaBR(ev.saida) : '—'}
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
                      {ev.saiuEm ? (
                        <Badge tone={pendentes ? 'amber' : 'green'}>SAIU ÀS {horaMarcada(ev.saiuEm)}</Badge>
                      ) : atrasado ? (
                        <Badge tone="red">ATRASADO · {textoContagem(min)}</Badge>
                      ) : (
                        <span className="font-semibold">{textoContagem(min)}</span>
                      )}
                      <span className="text-neutral-500">
                        {ev.saidaFonte === 'viagem' ? '· rota programada' : ev.saidaFonte === 'comanda' ? '· da comanda (sem rota)' : ''}
                      </span>
                    </div>
                  </div>
                </header>

                <div className="mb-3 flex items-center gap-3">
                  <BarraProgresso pct={p.pct} cor={info.cor} alta />
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {prontos}/{itens.length}
                    {produzindo ? ` · ${produzindo} produzindo` : ''}
                  </span>
                </div>

                {ev.saiuEm && pendentes > 0 && (
                  <p className="mb-3 rounded-md bg-amber-500/15 px-3 py-2 text-xs font-semibold">
                    O carro já saiu e {pendentes} item(ns) desta praça ficaram sem baixa — confira se foram mesmo e dê baixa.
                  </p>
                )}
                {!ev.saiuEm && <FaixaCompras pedidos={compras.pendentes(ev.eventId)} compacta />}
                {avisosGerais.map((a) => (
                  <p key={a} className="mb-3 rounded-md border border-red-700 bg-red-700/10 px-3 py-2 text-sm font-semibold text-red-700">
                    ⚠ {a}
                  </p>
                ))}

                <div className={`grid gap-3 ${tv ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                  {itens.map((it) => {
                    const baixa = porChave.get(`${ev.eventId}|${it.chave}`)
                    const st = baixa?.status ?? 'a_fazer'
                    return (
                      <ItemPraca
                        key={it.chave}
                        item={it}
                        baixa={baixa}
                        pode={pode}
                        tv={tv}
                        ocupado={salvando.has(`${ev.eventId}|${it.chave}`)}
                        onAvancar={() => mudar.mutate({ ev, item: it, para: proximoStatus(st) })}
                        onVoltar={() => mudar.mutate({ ev, item: it, para: statusAnterior(st) })}
                      />
                    )
                  })}
                </div>
              </section>
            )
          })}

          {semItens.length > 0 && (
            <div className="rounded-lg border border-dashed border-[var(--pg-border)] px-4 py-3 text-sm text-neutral-500">
              Sem nada para a {info.curto.toLowerCase()} em {rotuloDia(dia).toLowerCase()}:{' '}
              {semItens.map((b) => b.ev.nome).join(', ')}.
            </div>
          )}
        </div>
      )}
      {tv && <p className="mt-6 text-center text-[11px] text-neutral-500">Atualiza sozinho a cada 30 s.</p>}
    </div>
  )

  if (tv) {
    return <div className="fixed inset-0 z-50 overflow-auto bg-[var(--pg-bg)] p-4 text-[var(--pg-text)] sm:p-8">{conteudo}</div>
  }
  return (
    <div>
      <PageTitle lead="PRODUÇÃO">{info.curto}</PageTitle>
      {conteudo}
    </div>
  )
}
