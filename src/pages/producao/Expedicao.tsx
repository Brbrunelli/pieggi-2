// ============================================================
// EXPEDIÇÃO — o checklist do que sai no carro
//
// Validado na reunião: a expedição confere em TRÊS setores, cada um
// com o seu responsável olhando a sua parte —
//
//   COMIDAS    o que as três praças produziram para o dia (com o status
//              que a praça deu na TV) + congelado + insumos + comprado
//              pronto;
//   BEBIDAS    café, leite, suco, chá, água, refrigerante, cerveja e
//              pedido do cliente mandado para a expedição;
//   ESTRUTURA  louça, copos, sachês, caixas, uniforme, kit de limpeza…
//              (o que gerarEstrutura calcula).
//
// A comanda junta bebidas e estrutura num bloco só; a divisão é feita
// por separarBebidasEstrutura (engine/expedicao.ts). A estrutura vem
// SOMADA para o evento inteiro, então em evento de vários dias ela
// aparece no primeiro dia — a tela diz isso.
//
// Contagem de retornável (copo de vidro, prato…) NÃO é repetida aqui:
// ela já existe na aba Material do evento na rua, com previsto × saiu ×
// voltou. O setor Estrutura leva para lá.
//
// Os três setores 100% → "PRONTO PARA SAIR", com o atalho para a tela
// do evento na rua, onde se marca "Expedido". Se o carro SAIU (o
// motorista marcou a saída) com linha sem conferência, a tela não finge
// que ainda dá tempo: mostra "SAIU ÀS hh:mm com N linhas sem conferência"
// e quais são — para alguém confirmar com o motorista.
//
// Compras: os pedidos do evento ainda não recebidos (Compras amarra cada
// item ao evento) aparecem numa faixa âmbar. Informa, não trava.
//
// Conferir é assinar, e duas pessoas podem ticar a mesma linha ao mesmo
// tempo: o insert ignora o repetido (fica a assinatura de quem chegou
// primeiro) e a lista se reacerta mesmo depois de erro.
// ============================================================

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, EmptyState, PageTitle } from '@/components/ui'
import { formatDiaMes } from '@/engine'
import { conferenciaDoDia, minutosAte, progresso, textoContagem, type LinhaConferencia } from '@/engine/expedicao'
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
} from '@/components/producao/comum'
import SetorExpedicao from '@/components/producao/SetorExpedicao'
import {
  SETORES_CONFERENCIA,
  type ExpedicaoCheck,
  type ProducaoStatus,
  type SetorConferencia,
} from '@/tipos/operacao'

const ETAPA_LABEL: Record<string, string> = {
  expedido: 'Expedido',
  montado: 'Montado',
  desmontado: 'Desmontado',
  encerrado: 'Encerrado',
}

export default function Expedicao() {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { conferirCampo } = usePermissoes()
  const [dia, setDia] = useState(isoDia(0))
  const agora = new Date()

  const { data: eventos, isLoading, error } = useEventosDoDia(dia, 60_000)
  const compras = usePedidosPendentes(
    dia,
    (eventos ?? []).map((e) => e.eventId),
    60_000
  )
  // linhas salvando agora — só elas ficam travadas, não a tela inteira
  const [salvando, setSalvando] = useState<Set<string>>(() => new Set())
  const marcarSalvando = (k: string, on: boolean) =>
    setSalvando((s) => {
      const n = new Set(s)
      if (on) n.add(k)
      else n.delete(k)
      return n
    })

  const chaveChecks = ['expedicao-checks', dia]
  const { data: checks } = useQuery({
    queryKey: chaveChecks,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expedicao_checks')
        .select('*, profiles:conferido_por (nome)')
        .eq('dia', dia)
      if (error) throw error
      return (data ?? []) as ExpedicaoCheck[]
    },
  })

  // o que as praças já deram como pronto na TV
  const { data: producao } = useQuery({
    queryKey: ['expedicao-producao', dia],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producao_itens')
        .select('event_id, estacao, chave, status')
        .eq('dia', dia)
      if (error) throw error
      return (data ?? []) as { event_id: string; estacao: string; chave: string; status: ProducaoStatus }[]
    },
  })

  const statusProducao = useMemo(
    () => new Map((producao ?? []).map((p) => [`${p.event_id}|${p.estacao}|${p.chave}`, p.status])),
    [producao]
  )
  const checksPorEvento = useMemo(() => {
    const m = new Map<string, Map<string, ExpedicaoCheck>>()
    for (const c of checks ?? []) {
      if (!m.has(c.event_id)) m.set(c.event_id, new Map())
      m.get(c.event_id)!.set(c.chave, c)
    }
    return m
  }, [checks])

  const alternar = useMutation({
    mutationFn: async ({ eventId, linha, atual }: { eventId: string; linha: LinhaConferencia; atual?: ExpedicaoCheck }) => {
      if (atual) {
        const { error } = await supabase.from('expedicao_checks').delete().eq('id', atual.id)
        if (error) throw error
        return
      }
      // outra pessoa já conferiu esta linha? fica a assinatura dela
      const { error } = await supabase.from('expedicao_checks').upsert(
        {
          event_id: eventId,
          dia,
          setor: linha.setor,
          chave: linha.chave,
          conferido_por: session?.user.id,
          conferido_em: new Date().toISOString(),
        },
        { onConflict: 'event_id,dia,setor,chave', ignoreDuplicates: true }
      )
      if (error && error.code !== '23505') throw error
    },
    onMutate: ({ eventId, linha }) => marcarSalvando(`${eventId}|${linha.chave}`, true),
    onSettled: (_d, _e, { eventId, linha }) => {
      marcarSalvando(`${eventId}|${linha.chave}`, false)
      return qc.invalidateQueries({ queryKey: chaveChecks })
    },
  })

  return (
    <div>
      <PageTitle lead="OPERAÇÃO">Expedição</PageTitle>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <SeletorDia valor={dia} onChange={setDia} atalhos={[0, 1]} />
        <span className="text-xs text-neutral-500">Comidas · Bebidas · Estrutura — um ✓ por linha, com nome e hora.</span>
      </div>

      {!conferirCampo && (
        <p className="mb-4 rounded-lg border border-[var(--pg-border)] px-3 py-2 text-xs text-neutral-500">
          Você está só olhando. Conferem a expedição (cozinha), a rua e o admin.
        </p>
      )}
      {alternar.isError && (
        <p className="mb-4 rounded-lg bg-red-700/10 px-3 py-2 text-sm text-red-700">🛑 {(alternar.error as Error).message}</p>
      )}
      {error && <p className="mb-4 rounded-lg bg-red-700/10 px-3 py-2 text-sm text-red-700">🛑 {(error as Error).message}</p>}
      {compras.erro && (
        <p className="mb-4 text-xs text-neutral-500">Não deu para ler os pedidos de compra: {compras.erro.message}</p>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !eventos?.length ? (
        <EmptyState>
          Nenhum evento com comanda aprovada para {rotuloDia(dia).toLowerCase()}. Só entra aqui evento com contrato assinado e
          produção aprovada.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {eventos.map((ev) => {
            const conf = conferenciaDoDia(ev.snapshot, dia)
            if (!conf) return null
            const feitos = checksPorEvento.get(ev.eventId) ?? new Map<string, ExpedicaoCheck>()
            const porSetor: Record<SetorConferencia, LinhaConferencia[]> = {
              comidas: conf.comidas,
              bebidas: conf.bebidas,
              estrutura: conf.estrutura,
            }
            const conta = (s: SetorConferencia) => porSetor[s].filter((l) => feitos.has(l.chave)).length
            const tot = progresso(
              SETORES_CONFERENCIA.reduce((a, s) => a + conta(s), 0),
              SETORES_CONFERENCIA.reduce((a, s) => a + porSetor[s].length, 0)
            )
            const pronto = SETORES_CONFERENCIA.every((s) => conta(s) === porSetor[s].length)
            const faltando = SETORES_CONFERENCIA.flatMap((s) =>
              porSetor[s].filter((l) => !feitos.has(l.chave)).map((l) => ({ s, l }))
            )
            const pedidos = compras.pendentes(ev.eventId)
            const min = minutosAte(dia, ev.saida, agora)
            const primeiroDia = [...ev.snapshot.dias].map((d) => d.diaISO).sort()[0]
            const campo = `/eventos/${ev.eventId}/campo`

            return (
              <section key={ev.eventId}>
                <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-lg font-bold">{ev.nome}</div>
                    <div className="text-xs text-neutral-500">
                      {ev.cliente}
                      {ev.pax ? ` · ${ev.pax} pax` : ''}
                      {ev.campoEtapa ? ` · na rua: ${ETAPA_LABEL[ev.campoEtapa] ?? ev.campoEtapa}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-bold tabular-nums">SAÍDA {ev.saida ? horaBR(ev.saida) : '—'}</div>
                    <div className="text-xs">
                      {ev.saiuEm ? `saiu às ${horaMarcada(ev.saiuEm)}` : textoContagem(min)}
                      <span className="text-neutral-500">
                        {ev.saidaFonte === 'viagem' ? ' · rota programada' : ev.saidaFonte === 'comanda' ? ' · da comanda (sem rota)' : ''}
                      </span>
                    </div>
                  </div>
                </header>

                <div className="mb-3 flex items-center gap-3">
                  <BarraProgresso pct={tot.pct} alta />
                  <span className="shrink-0 text-xs font-semibold tabular-nums">
                    {tot.feitos}/{tot.total} conferido
                  </span>
                </div>

                {ev.saiuEm && !pronto ? (
                  <div className="mb-3 rounded-lg border-2 border-amber-500 bg-amber-500/15 px-4 py-3">
                    <div className="text-sm font-bold tracking-[0.08em]">
                      ⚠ SAIU ÀS {horaMarcada(ev.saiuEm)} COM {faltando.length} {faltando.length === 1 ? 'LINHA' : 'LINHAS'} SEM
                      CONFERÊNCIA
                    </div>
                    <ul className="mt-1 text-xs">
                      {SETORES_CONFERENCIA.filter((s) => faltando.some((f) => f.s === s)).map((s) => (
                        <li key={s}>
                          <b>{s.toUpperCase()}:</b>{' '}
                          {faltando
                            .filter((f) => f.s === s)
                            .map((f) => `${f.l.qtd} ${f.l.texto}`.trim())
                            .join(' · ')}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs">
                      Confirme com o motorista se foi no carro e tique aqui — ou avise a equipe na rua.{' '}
                      <Link to={campo} className="font-semibold underline">
                        Abrir o evento na rua →
                      </Link>
                    </p>
                  </div>
                ) : pronto ? (
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-green-700 px-4 py-3 text-white">
                    <span className="text-sm font-bold tracking-[0.12em]">
                      {ev.saiuEm ? `✅ SAIU ÀS ${horaMarcada(ev.saiuEm)} COM TUDO CONFERIDO` : '✅ PRONTO PARA SAIR'}
                    </span>
                    <Link to={campo} className="text-xs font-semibold underline">
                      {ev.campoEtapa ? 'Abrir o evento na rua →' : 'Marcar "Expedido" no evento →'}
                    </Link>
                  </div>
                ) : (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {SETORES_CONFERENCIA.map((s) => {
                      const falta = porSetor[s].length - conta(s)
                      return (
                        <Badge key={s} tone={falta ? 'amber' : 'green'}>
                          {s.toUpperCase()} {falta ? `· faltam ${falta}` : '· OK'}
                        </Badge>
                      )
                    })}
                  </div>
                )}

                <FaixaCompras pedidos={pedidos} />

                {conf.avisosGerais.map((a) => (
                  <p key={a} className="mb-3 rounded-md border border-red-700 bg-red-700/10 px-3 py-2 text-sm font-semibold text-red-700">
                    ⚠ {a}
                  </p>
                ))}

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {SETORES_CONFERENCIA.map((s) => (
                    <SetorExpedicao
                      key={s}
                      setor={s}
                      linhas={porSetor[s]}
                      checks={feitos}
                      pode={conferirCampo}
                      ocupado={(l) => salvando.has(`${ev.eventId}|${l.chave}`)}
                      statusPraca={(l) =>
                        l.estacao && l.chaveProducao
                          ? (statusProducao.get(`${ev.eventId}|${l.estacao}|${l.chaveProducao}`) ?? 'a_fazer')
                          : null
                      }
                      onAlternar={(linha, atual) => alternar.mutate({ eventId: ev.eventId, linha, atual })}
                      aviso={
                        s === 'estrutura' && conf.variosDias ? (
                          <p className="mb-3 rounded-md bg-[var(--pg-border)]/40 px-3 py-2 text-xs">
                            {conf.primeiroDia
                              ? `Evento de ${ev.snapshot.dias.length} dias: a comanda soma a estrutura do evento inteiro — ela sai toda HOJE, no primeiro dia.`
                              : `A estrutura deste evento saiu no primeiro dia (${formatDiaMes(primeiroDia)}). Aqui só o que é do dia.`}
                          </p>
                        ) : s === 'bebidas' && conf.variosDias ? (
                          <p className="mb-3 text-[11px] text-neutral-500">Só as bebidas deste dia (pela data do serviço na comanda).</p>
                        ) : undefined
                      }
                      rodape={
                        s === 'estrutura' ? (
                          <Link
                            to={`${campo}?aba=material`}
                            className="mt-3 block border-t border-[var(--pg-border)] pt-3 text-xs font-semibold underline"
                          >
                            Conferir quantidades dos retornáveis (copos, pratos, réchaud…) →
                          </Link>
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
