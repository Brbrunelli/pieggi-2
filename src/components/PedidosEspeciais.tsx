// ============================================================
// TRAVA TÁTICA — Pedidos especiais do cliente
// Todo pedido fora do padrão (copeira a mais, marca de suco, troca
// de bebida…) precisa ser VERIFICADO em cada fase antes de aprovar.
// ============================================================

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, Input, Select } from '@/components/ui'
import type { FaseKey } from '@/types'
import { formatBRL } from '@/engine'
import { usePermissoes } from '@/lib/permissoes'

export type DestinoPedido = 'comercial' | 'cozinha' | 'expedicao' | 'adriana' | 'copeiras'

export const DESTINO_LABEL: Record<DestinoPedido, string> = {
  comercial: '💼 Comercial (só proposta)',
  cozinha: '🔥 Cozinha (comanda de produção)',
  expedicao: '📦 Expedição (estrutura/materiais)',
  adriana: '🟢 Adriana (fornecedor/locação)',
  copeiras: '🧹 Copeiras (programação)',
}

export interface SpecialRequest {
  id: string
  event_id: string
  descricao: string
  critico: boolean
  fases: string[]
  verificacoes: Record<string, { user_id: string; em: string }>
  resolvido: boolean
  destino: DestinoPedido
  impacto_valor: number | null
}

export function usePedidos(eventId: string | undefined) {
  return useQuery({
    queryKey: ['pedidos', eventId],
    enabled: Boolean(eventId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('special_requests')
        .select('*')
        .eq('event_id', eventId!)
        .order('created_at')
      if (error) throw error
      return data as SpecialRequest[]
    },
  })
}

export function pendentesDaFase(pedidos: SpecialRequest[] | undefined, fase: FaseKey): SpecialRequest[] {
  return (pedidos ?? []).filter(
    (p) => !p.resolvido && p.fases.includes(fase) && !p.verificacoes[fase]
  )
}

/** Consulta direta (para os gates de aprovação). */
export async function contarPendentes(eventId: string, fase: FaseKey): Promise<number> {
  const { data } = await supabase
    .from('special_requests')
    .select('id, fases, verificacoes, resolvido')
    .eq('event_id', eventId)
    .eq('resolvido', false)
  return ((data as Pick<SpecialRequest, 'id' | 'fases' | 'verificacoes' | 'resolvido'>[]) ?? []).filter(
    (p) => p.fases.includes(fase) && !p.verificacoes[fase]
  ).length
}

/**
 * Banner de verificação por fase — aparece no topo de Proposta/Programação/
 * Comandas/Plaquinhas. A fase só aprova com tudo verificado.
 */
export function PedidosFaseBanner({ eventId, fase }: { eventId: string; fase: FaseKey }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  // verificar é parte de aprovar a fase — a cozinha lê o pedido, não o dá por
  // conferido (mas precisa ver: o pedido do cliente cai na comanda dela)
  const { editarOperacao } = usePermissoes()
  const { data: pedidos } = usePedidos(eventId)

  const daFase = (pedidos ?? []).filter((p) => !p.resolvido && p.fases.includes(fase))
  if (!daFase.length) return null

  const pendentes = daFase.filter((p) => !p.verificacoes[fase])

  async function marcar(p: SpecialRequest, verificado: boolean) {
    const verificacoes = { ...p.verificacoes }
    if (verificado) {
      verificacoes[fase] = { user_id: session?.user.id ?? '', em: new Date().toISOString() }
    } else {
      delete verificacoes[fase]
    }
    await supabase.from('special_requests').update({ verificacoes }).eq('id', p.id)
    await qc.invalidateQueries({ queryKey: ['pedidos', eventId] })
  }

  return (
    <div
      className={`mb-4 rounded-xl border p-4 ${
        pendentes.length
          ? 'border-red-300 bg-red-50'
          : 'border-green-200 bg-green-50'
      }`}
    >
      <p className={`mb-2 text-sm font-bold ${pendentes.length ? 'text-red-800' : 'text-green-800'}`}>
        {pendentes.length
          ? `🛑 ${pendentes.length} PEDIDO(S) ESPECIAL(IS) DO CLIENTE AINDA NÃO VERIFICADO(S) NESTA FASE — a aprovação fica bloqueada`
          : '✅ Todos os pedidos especiais foram verificados nesta fase'}
      </p>
      <ul className="space-y-1.5">
        {daFase.map((p) => {
          const ok = Boolean(p.verificacoes[fase])
          return (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 disabled:opacity-40"
                checked={ok}
                disabled={!editarOperacao}
                onChange={(e) => marcar(p, e.target.checked)}
              />
              <span className={ok ? 'text-neutral-500 line-through' : 'font-medium'}>
                {p.descricao}
              </span>
              {p.critico && !ok && <Badge tone="red">crítico</Badge>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Card de gestão dos pedidos (no detalhe do evento). */
export function PedidosEspeciaisCard({ eventId }: { eventId: string }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { editarComercial, verValores } = usePermissoes()
  const { data: pedidos } = usePedidos(eventId)
  const [novo, setNovo] = useState('')
  const [destinoNovo, setDestinoNovo] = useState<DestinoPedido>('comercial')
  const [impacto, setImpacto] = useState('')

  async function adicionar() {
    if (!novo.trim()) return
    await supabase.from('special_requests').insert({
      event_id: eventId,
      descricao: novo.trim(),
      destino: destinoNovo,
      impacto_valor: impacto ? Number(impacto) : null,
      created_by: session?.user.id,
    })
    setNovo('')
    setImpacto('')
    await qc.invalidateQueries({ queryKey: ['pedidos', eventId] })
  }

  async function resolver(p: SpecialRequest) {
    await supabase.from('special_requests').update({ resolvido: !p.resolvido }).eq('id', p.id)
    await qc.invalidateQueries({ queryKey: ['pedidos', eventId] })
  }

  async function remover(p: SpecialRequest) {
    await supabase.from('special_requests').delete().eq('id', p.id)
    await qc.invalidateQueries({ queryKey: ['pedidos', eventId] })
  }

  const ativos = (pedidos ?? []).filter((p) => !p.resolvido)

  return (
    <Card
      title={
        <span>
          ⚠️ Pedidos especiais do cliente{' '}
          {ativos.length > 0 && <Badge tone="amber">{ativos.length} ativo(s)</Badge>}
        </span>
      }
    >
      <p className="mb-3 text-xs text-neutral-500">
        Tudo que foge do padrão: &quot;1 copeira a mais&quot;, &quot;trocar Pepsi por Coca&quot;,
        &quot;suco de marca X&quot;… Cada pedido <b>bloqueia a aprovação</b> de cada fase até ser
        verificado nela, aparece na <b>comanda do destino</b> escolhido e o impacto em R$ entra
        como linha extra no orçamento da proposta.
      </p>

      {editarComercial && (
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input
          label="Pedido"
          className="!w-80"
          placeholder="Ex.: +1 copeira · trocar Pepsi por Coca · suco marca X"
          value={novo}
          onChange={(e) => setNovo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        />
        <Select
          label="Aparece em"
          className="!w-56"
          value={destinoNovo}
          onChange={(e) => setDestinoNovo(e.target.value as DestinoPedido)}
        >
          {(Object.keys(DESTINO_LABEL) as DestinoPedido[]).map((d) => (
            <option key={d} value={d}>
              {DESTINO_LABEL[d]}
            </option>
          ))}
        </Select>
        <Input
          label="Impacto R$"
          className="!w-28"
          type="number"
          step="0.01"
          min="0"
          placeholder="0,00"
          value={impacto}
          onChange={(e) => setImpacto(e.target.value)}
        />
        <Button onClick={adicionar} disabled={!novo.trim()}>
          Adicionar
        </Button>
      </div>
      )}

      {!pedidos?.length ? (
        <p className="text-xs text-neutral-400">Nenhum pedido especial registrado.</p>
      ) : (
        <ul className="space-y-2">
          {pedidos.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <span className={p.resolvido ? 'text-neutral-400 line-through' : 'font-medium'}>
                {p.descricao}
              </span>
              <Badge tone="neutral">{DESTINO_LABEL[p.destino]?.split(' ')[1] ?? p.destino}</Badge>
              {verValores && p.impacto_valor != null && p.impacto_valor > 0 && (
                <Badge tone="green">+{formatBRL(Number(p.impacto_valor))}</Badge>
              )}
              <span className="ml-auto flex items-center gap-1 text-xs text-neutral-400">
                {p.fases.map((f) => (
                  <span
                    key={f}
                    title={f}
                    className={`rounded px-1 ${
                      p.verificacoes[f] ? 'bg-green-100 text-green-700' : 'bg-neutral-100'
                    }`}
                  >
                    {f.slice(0, 4)}
                  </span>
                ))}
              </span>
              {editarComercial && (
                <>
                  <Button
                    variant="ghost"
                    className="!px-2 !py-0.5 text-xs"
                    onClick={() => resolver(p)}
                  >
                    {p.resolvido ? 'Reabrir' : 'Resolver'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="!px-1.5 !py-0.5 text-xs"
                    onClick={() => remover(p)}
                  >
                    ✕
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
