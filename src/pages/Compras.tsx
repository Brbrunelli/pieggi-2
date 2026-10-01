import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import type { EventService, PieggiEvent } from '@/types'
import { EVENT_STATUS_LABEL } from '@/types'
import { consolidarCompras, type LinhaFonte, type SecaoCompra } from '@/engine/compras'
import { baixarBlob } from '@/lib/documentos'
import { useNavigate } from 'react-router-dom'
import { usePermissoes } from '@/lib/permissoes'
import { useFornecedores } from '@/pages/compras/Fornecedores'
import { lerQuantidade, sugerirFornecedor } from '@/engine/financeiro'
import type { NovoPedidoDaLista } from '@/tipos/compras'

interface BlocoProg {
  serviceId: string
  titulo: string
  linhas: { qtd: string; receita: string; item: string }[]
}

/**
 * Fase 6 — Lista de compras consolidada (multi-evento, filtro de datas).
 * Lê as programações salvas/aprovadas, soma tudo numa compra só e aplica
 * as regras de conversão. Sem regra → "A classificar" (nunca omitir).
 */
export default function Compras() {
  const { session } = useAuth()
  const qc = useQueryClient()
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [secoes, setSecoes] = useState<SecaoCompra[] | null>(null)
  /** eventos usados no último "consolidar" — é deles que os itens da lista vêm */
  const [eventosConsolidados, setEventosConsolidados] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [ocultarComprados, setOcultarComprados] = useState(false)
  const navigate = useNavigate()
  const { pedirCompra } = usePermissoes()
  const { data: fornecedores } = useFornecedores()

  /**
   * Leva os itens da seção para um pedido de compra novo. Só transporta —
   * o cálculo da lista não muda. Linha de TOTAL fica de fora; quantidade
   * que não começa com número vai junto na descrição para alguém ajustar.
   */
  function gerarPedido(s: SecaoCompra) {
    // os eventos DA LISTA NA TELA — se a pessoa mexeu na seleção depois de
    // consolidar, a seleção nova não vale para estes itens
    const evento = eventosConsolidados.length === 1 ? eventosConsolidados[0] : null
    const novoPedido: NovoPedidoDaLista = {
      origem: s.titulo,
      eventosDaLista: eventosConsolidados,
      fornecedorChave: sugerirFornecedor(s.titulo, fornecedores ?? [])?.chave ?? null,
      itens: s.linhas
        .filter((l) => !l.item.startsWith('TOTAL'))
        .map((l) => {
          const q = lerQuantidade(l.quantidade)
          return q
            ? { descricao: l.item, quantidade: q.quantidade, unidade: q.unidade, event_id: evento }
            : { descricao: `${l.item} — ${l.quantidade}`, quantidade: 0, unidade: 'un', event_id: evento }
        }),
    }
    navigate('/compras/pedidos', { state: { novoPedido } })
  }

  const { data: eventos } = useQuery({
    queryKey: ['eventos-com-programacao'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, clients(nome), schedules(id, snapshot, versao)')
        .neq('status', 'cancelado')
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data as (PieggiEvent & {
        clients: { nome: string } | null
        schedules: { id: string; snapshot: { blocos?: BlocoProg[] }; versao: number }[]
      })[]).filter((e) => e.schedules?.some((s) => s.snapshot?.blocos?.length))
    },
  })

  /**
   * Quais eventos JÁ entraram em alguma lista de compras.
   *
   * Sem isso a pessoa não tem como saber se já comprou para um evento —
   * e comprar duas vezes o mesmo evento é prejuízo direto.
   */
  const { data: jaComprados } = useQuery({
    queryKey: ['compras-feitas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_lists')
        .select('nome, event_ids, created_at')
        .order('created_at', { ascending: false })
      if (error) throw error
      const mapa = new Map<string, { nome: string; created_at: string }>()
      for (const l of (data ?? []) as {
        nome: string
        event_ids: string[] | null
        created_at: string
      }[]) {
        for (const id of l.event_ids ?? []) {
          // a lista mais recente é a que vale como "última compra"
          if (!mapa.has(id)) mapa.set(id, { nome: l.nome, created_at: l.created_at })
        }
      }
      return mapa
    },
  })

  const { data: servicosTodos } = useQuery({
    queryKey: ['servicos-multi', selecionados],
    enabled: selecionados.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_services')
        .select('*')
        .in('event_id', selecionados)
      if (error) throw error
      return data as EventService[]
    },
  })

  const linhasFonte = useMemo((): LinhaFonte[] => {
    if (!eventos || !servicosTodos) return []
    const porServico = new Map(servicosTodos.map((s) => [s.id, s]))
    const out: LinhaFonte[] = []
    for (const ev of eventos) {
      if (!selecionados.includes(ev.id)) continue
      const snap = ev.schedules.sort((a, b) => b.versao - a.versao)[0]?.snapshot
      for (const bloco of snap?.blocos ?? []) {
        const serv = porServico.get(bloco.serviceId)
        if (!serv) continue
        for (const l of bloco.linhas) {
          out.push({ dia: serv.dia, qtd: l.qtd, receita: l.receita, item: l.item })
        }
      }
    }
    return out
  }, [eventos, servicosTodos, selecionados])

  function consolidar() {
    setMsg(null)
    if (!linhasFonte.length) {
      setMsg('Selecione ao menos um evento com programação salva.')
      return
    }
    const r = consolidarCompras(linhasFonte, dataInicio || undefined, dataFim || undefined)
    setSecoes(r)
    setEventosConsolidados([...selecionados])
  }

  async function exportarXlsx() {
    if (!secoes) return
    const XLSX = await import('xlsx')
    const linhas: (string | undefined)[][] = [['CONSOLIDADO DE COMPRAS PIEGGI'], []]
    for (const s of secoes) {
      linhas.push([s.titulo])
      linhas.push(['Item', 'Quantidade', 'Obs'])
      for (const l of s.linhas) linhas.push([l.item, l.quantidade, l.obs])
      linhas.push([])
    }
    const ws = XLSX.utils.aoa_to_sheet(linhas)
    ws['!cols'] = [{ wch: 50 }, { wch: 20 }, { wch: 40 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Compras')
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const nome = `Pieggi Compras - Consolidado - ${dataInicio || 'inicio'} a ${dataFim || 'fim'}.xlsx`
    baixarBlob(blob, nome)

    // registra a lista — é esse registro que faz o evento aparecer como
    // "já comprado" aqui e no quadro da operação
    await supabase.from('purchase_lists').insert({
      nome,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
      event_ids: selecionados,
      snapshot: { secoes },
      created_by: session?.user.id,
    })
    await qc.invalidateQueries({ queryKey: ['compras-feitas'] })
    setMsg(`✅ Exportado: ${nome} — os eventos já aparecem como comprados.`)
  }

  return (
    <div>
      <PageTitle>Lista de compras (consolidado multi-evento)</PageTitle>

      <Card title="1 · Selecionar eventos (com programação salva) e intervalo de datas" className="mb-6">
        {!eventos?.length ? (
          <EmptyState>Nenhum evento com programação salva ainda.</EmptyState>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={ocultarComprados}
                  onChange={(e) => setOcultarComprados(e.target.checked)}
                />
                Ocultar eventos que já têm lista
              </label>
              <span className="text-xs text-neutral-400">
                {[...eventos].filter((e) => jaComprados?.has(e.id)).length} de {eventos.length} já
                comprado(s)
              </span>
            </div>

            <div className="mb-4 space-y-1">
              {eventos
                .filter((e) => !ocultarComprados || !jaComprados?.has(e.id))
                .map((e) => {
                  const compra = jaComprados?.get(e.id)
                  return (
                    <label
                      key={e.id}
                      className={`flex flex-wrap items-center gap-2 rounded px-1 py-0.5 text-sm ${
                        compra ? 'opacity-70' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={selecionados.includes(e.id)}
                        onChange={(ev) =>
                          setSelecionados(
                            ev.target.checked
                              ? [...selecionados, e.id]
                              : selecionados.filter((x) => x !== e.id)
                          )
                        }
                      />
                      <span className="font-medium">{e.nome}</span>
                      <span className="text-neutral-400">
                        {e.clients?.nome ?? ''} · {e.pax ?? '?'} pax
                      </span>
                      <Badge tone="blue">{EVENT_STATUS_LABEL[e.status]}</Badge>
                      {compra ? (
                        <Badge tone="green">
                          ✓ já comprado {new Date(compra.created_at).toLocaleDateString('pt-BR')}
                        </Badge>
                      ) : (
                        <Badge tone="amber">sem compra</Badge>
                      )}
                    </label>
                  )
                })}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Input
                label="De (opcional)"
                type="date"
                className="!w-44"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
              <Input
                label="Até (opcional)"
                type="date"
                className="!w-44"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
              <Button onClick={consolidar} disabled={!selecionados.length}>
                Consolidar compras
              </Button>
              {secoes && (
                <Button variant="secondary" onClick={exportarXlsx}>
                  ⬇ Exportar .xlsx
                </Button>
              )}
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Regras: soma tudo numa compra só · nunca estima · brioche = 15 g principal + 10 g
              muçarela + 10 g ricota · café → garrafas 1,8 L → filtros → pó → pacotes · salada de
              frutas na receita padrão · refri SÓ lata · sem regra → "A classificar" (nunca omite).
            </p>
          </>
        )}
        {msg && <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}
      </Card>

      {secoes && (
        <div className="space-y-4">
          {secoes.map((s) => (
            <Card
              key={s.titulo}
              title={s.titulo}
              actions={
                pedirCompra &&
                s.linhas.length > 0 && (
                  <Button variant="ghost" className="!px-2 !py-1 text-[11px]" onClick={() => gerarPedido(s)}>
                    Gerar pedido ao fornecedor →
                  </Button>
                )
              }
            >
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Item</Th>
                    <Th>Quantidade</Th>
                    <Th>Obs</Th>
                  </tr>
                </thead>
                <tbody>
                  {s.linhas.map((l, i) => (
                    <tr key={i}>
                      <Td className={l.item.startsWith('TOTAL') ? 'font-bold' : ''}>{l.item}</Td>
                      <Td className="whitespace-nowrap font-medium">{l.quantidade}</Td>
                      <Td className="text-xs text-neutral-500">{l.obs ?? ''}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
