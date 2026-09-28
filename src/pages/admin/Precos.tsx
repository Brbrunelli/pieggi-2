import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import {
  SERVICE_LINE_LABEL,
  SERVICE_TYPE_LABEL,
  type PriceItem,
  type PriceTable,
  type ServiceLine,
  type ServiceType,
} from '@/types'
import { formatBRL } from '@/engine'
import { usePermissoes } from '@/lib/permissoes'

export default function Precos() {
  const qc = useQueryClient()
  // o comercial precisa CONSULTAR preço para montar proposta; mexer na
  // tabela continua sendo do admin (a RLS recusaria de qualquer forma)
  const { administrar } = usePermissoes()
  const [tabelaId, setTabelaId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState({
    service_type: 'coffee_break' as ServiceType,
    service_line: 'executive' as ServiceLine,
    variante: '',
    preco_pax: '',
  })

  const { data: tabelas } = useQuery({
    queryKey: ['admin-tabelas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('price_tables').select('*').order('nome')
      if (error) throw error
      return data as PriceTable[]
    },
  })

  const selecionada = tabelaId || tabelas?.[0]?.id || ''

  const { data: itens } = useQuery({
    queryKey: ['admin-precos', selecionada],
    enabled: Boolean(selecionada),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('price_items')
        .select('*')
        .eq('price_table_id', selecionada)
        .order('service_type')
        .order('service_line')
      if (error) throw error
      return data as PriceItem[]
    },
  })

  async function adicionar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (!form.preco_pax) return setErro('Informe o preço por pax.')
    const { error } = await supabase.from('price_items').insert({
      price_table_id: selecionada,
      service_type: form.service_type,
      service_line: form.service_line,
      variante: form.variante.trim(),
      preco_pax: Number(form.preco_pax),
    })
    if (error) return setErro(error.message)
    setForm({ ...form, variante: '', preco_pax: '' })
    await qc.invalidateQueries({ queryKey: ['admin-precos', selecionada] })
  }

  async function atualizarPreco(item: PriceItem, novo: string) {
    const v = Number(novo)
    if (!v || v === item.preco_pax) return
    await supabase.from('price_items').update({ preco_pax: v }).eq('id', item.id)
    await qc.invalidateQueries({ queryKey: ['admin-precos', selecionada] })
  }

  async function remover(itemId: string) {
    await supabase.from('price_items').delete().eq('id', itemId)
    await qc.invalidateQueries({ queryKey: ['admin-precos', selecionada] })
  }

  const tabela = tabelas?.find((t) => t.id === selecionada)

  return (
    <div>
      <PageTitle>Tabelas de preço</PageTitle>

      <p className="mb-4 text-sm text-neutral-500">
        Preço por pax já inclui imposto — nunca somar por cima. WTC tem 12% de repasse embutido.
        Nunca misturar tabelas nem assumir pelo nome do cliente.
      </p>

      <div className="mb-4">
        <Select className="!w-80" value={selecionada} onChange={(e) => setTabelaId(e.target.value)}>
          {tabelas?.map((t) => (
            <option key={t.id} value={t.id}>{t.nome}</option>
          ))}
        </Select>
        {tabela?.obs && <p className="mt-1 text-xs text-neutral-400">{tabela.obs}</p>}
      </div>

      {administrar && (
      <Card title="Adicionar preço" className="mb-6">
        <form onSubmit={adicionar} className="flex flex-wrap items-end gap-3">
          <Select
            label="Serviço"
            className="!w-52"
            value={form.service_type}
            onChange={(e) => setForm({ ...form, service_type: e.target.value as ServiceType })}
          >
            {Object.entries(SERVICE_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Select
            label="Linha"
            className="!w-40"
            value={form.service_line}
            onChange={(e) => setForm({ ...form, service_line: e.target.value as ServiceLine })}
          >
            {Object.entries(SERVICE_LINE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
          <Input
            label="Variante"
            className="!w-40"
            placeholder="4h, lata, long_neck…"
            value={form.variante}
            onChange={(e) => setForm({ ...form, variante: e.target.value })}
          />
          <Input
            label="Preço / pax (R$)"
            className="!w-32"
            type="number"
            step="0.01"
            min="0"
            value={form.preco_pax}
            onChange={(e) => setForm({ ...form, preco_pax: e.target.value })}
          />
          <Button type="submit">Adicionar</Button>
          {erro && <p className="text-sm text-red-600">{erro}</p>}
        </form>
      </Card>
      )}

      <Card>
        {!itens?.length ? (
          <EmptyState>Nenhum preço cadastrado nesta tabela.</EmptyState>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Serviço</Th>
                <Th>Linha</Th>
                <Th>Variante</Th>
                <Th>Preço / pax</Th>
                {administrar && <Th></Th>}
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <Td>{SERVICE_TYPE_LABEL[i.service_type]}</Td>
                  <Td>{i.service_line ? SERVICE_LINE_LABEL[i.service_line] : '—'}</Td>
                  <Td className="text-xs text-neutral-500">{i.variante || '—'}</Td>
                  <Td>
                    {administrar ? (
                      <input
                        className="w-24 rounded border border-transparent px-1 py-0.5 text-sm hover:border-neutral-300 focus:border-neutral-900 focus:outline-none"
                        defaultValue={i.preco_pax}
                        type="number"
                        step="0.01"
                        onBlur={(e) => atualizarPreco(i, e.target.value)}
                        title={formatBRL(Number(i.preco_pax))}
                      />
                    ) : (
                      <span className="font-mono text-sm">{formatBRL(Number(i.preco_pax))}</span>
                    )}
                  </Td>
                  {administrar && (
                    <Td className="text-right">
                      <Button variant="ghost" onClick={() => remover(i.id)}>✕</Button>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
