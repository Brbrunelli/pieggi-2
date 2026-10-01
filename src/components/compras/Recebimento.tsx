// ============================================================
// RECEBIMENTO DO PEDIDO — conferir o que chegou, item por item
//
// Feito na porta da cozinha, no celular: uma coluna, número grande,
// botão "chegou tudo" para o caso comum. Quantidade diferente do pedido
// fica destacada NA HORA, com o valor da diferença pelo preço do pedido
// — o financeiro vê o aviso na conta a pagar antes de pagar o boleto.
//
// Quem recebe: compras, a logística e a PRODUÇÃO (a Bia, na porta da
// cozinha — decisão de 01/10). Com semPreco, nenhum valor aparece. O
// banco só deixa gravar a quantidade recebida, nada mais (compra_receber).
// ============================================================

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Card } from '@/components/ui'
import { formatBRL } from '@/engine'
import { divergencias } from '@/engine/financeiro'
import type { PurchaseOrderItem } from '@/tipos/compras'

export default function Recebimento({
  pedidoId,
  numero,
  itens,
  onPronto,
  semPreco = false,
}: {
  pedidoId: string
  numero: number | null
  itens: PurchaseOrderItem[]
  onPronto: (msg: string) => void
  /** porta da cozinha: confere quantidade, não vê preço */
  semPreco?: boolean
}) {
  const qc = useQueryClient()
  const [qtd, setQtd] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id, i.quantidade_recebida == null ? '' : String(i.quantidade_recebida)]))
  )
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const conferidos = itens.map((i) => ({
    ...i,
    quantidade_recebida: qtd[i.id] === '' || qtd[i.id] == null ? null : Number(qtd[i.id].replace(',', '.')),
  }))
  const difs = divergencias(conferidos)
  const faltaConferir = conferidos.filter((i) => i.quantidade_recebida == null).length
  const valorDif = difs.reduce((t, d) => t + d.valor, 0)

  async function registrar() {
    if (faltaConferir) return setErro(`Falta conferir ${faltaConferir} item(ns). Se não veio, digite 0.`)
    setOcupado(true)
    setErro(null)
    // uma chamada só (compra_receber): grava SÓ a quantidade recebida e o
    // status — quem está na porta (logística, produção) não ganha poder de
    // mexer em item nem preço de pedido confirmado.
    const r = await supabase.rpc('compra_receber', {
      p_pedido: pedidoId,
      p_itens: conferidos.map((i) => ({ id: i.id, quantidade_recebida: i.quantidade_recebida })),
    })
    setOcupado(false)
    if (r.error) return setErro(r.error.message)
    await qc.invalidateQueries({ queryKey: ['pedidos'] })
    await qc.invalidateQueries({ queryKey: ['pedido-itens', pedidoId] })
    await qc.invalidateQueries({ queryKey: ['pagar'] })
    await qc.invalidateQueries({ queryKey: ['a-receber-porta'] })
    onPronto(
      difs.length
        ? `Pedido ${numero ?? ''} recebido com ${difs.length} divergência(s) — o financeiro vê o aviso na conta a pagar.`
        : `Pedido ${numero ?? ''} recebido — chegou tudo.`
    )
  }

  return (
    <Card
      title={`Receber o pedido ${numero ?? ''}`}
      actions={
        <Button
          variant="secondary"
          className="!px-3 !py-1.5"
          onClick={() => setQtd(Object.fromEntries(itens.map((i) => [i.id, String(i.quantidade)])))}
        >
          Chegou tudo
        </Button>
      }
    >
      <div className="space-y-3">
        {conferidos.map((i) => {
          const d = divergencias([i])[0]
          return (
            <div
              key={i.id}
              className={`rounded-lg border p-3 ${d ? 'border-red-300 bg-red-50' : 'border-[var(--pg-border)]'}`}
            >
              <div className="text-sm font-medium">{i.descricao}</div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <span className="text-xs text-neutral-500">
                  Pedido: <b className="text-[var(--pg-text)]">{Number(i.quantidade).toLocaleString('pt-BR')} {i.unidade}</b>
                </span>
                <label className="flex items-center gap-2 text-xs text-neutral-500">
                  Chegou:
                  <input
                    inputMode="decimal"
                    className="w-28 rounded-lg border border-[var(--pg-border)] bg-transparent px-3 py-3 text-lg font-semibold text-[var(--pg-text)]"
                    value={qtd[i.id] ?? ''}
                    onChange={(e) => setQtd({ ...qtd, [i.id]: e.target.value })}
                  />
                  {i.unidade}
                </label>
              </div>
              {d && (
                <p className="mt-2 text-xs font-semibold text-red-700">
                  {d.diferenca > 0 ? `+${d.diferenca}` : d.diferenca} {d.unidade} ·{' '}
                  {semPreco
                    ? 'diferente do pedido'
                    : d.valor !== 0
                      ? `${d.valor > 0 ? '+' : ''}${formatBRL(d.valor)} pelo preço do pedido`
                      : 'sem preço'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {difs.length > 0 && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {difs.length} divergência(s){semPreco ? '' : ` · diferença de ${formatBRL(valorDif)}`} contra o pedido. Avise o fornecedor:
          o boleto precisa vir corrigido (ou o que faltou, entregue).
        </p>
      )}
      {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
      <Button className="mt-4 w-full !py-4 text-sm md:w-auto" onClick={registrar} disabled={ocupado}>
        {ocupado ? 'Registrando…' : 'Registrar recebimento'}
      </Button>
    </Card>
  )
}
