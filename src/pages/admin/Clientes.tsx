import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import type { Client, ClientKind } from '@/types'

const KIND_LABEL: Record<ClientKind, string> = {
  startse: 'StartSe',
  inteli: 'Inteli',
  wtc: 'WTC',
  externo: 'Externo',
}

const vazio = {
  nome: '',
  tipo: 'externo' as ClientKind,
  endereco: '',
  endereco_fixo: false,
  marca_agua: 'qualquer',
  marca_refri: 'Coca-Cola',
  marca_cerveja: 'Heineken',
  isento_logistica: false,
  isento_taxa_servico: false,
}

export default function Clientes() {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-clientes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('clients').select('*').order('nome')
      if (error) throw error
      return data as Client[]
    },
  })

  function editar(c: Client) {
    setEditId(c.id)
    setForm({
      nome: c.nome,
      tipo: c.tipo,
      endereco: c.endereco ?? '',
      endereco_fixo: c.endereco_fixo,
      marca_agua: c.marca_agua,
      marca_refri: c.marca_refri,
      marca_cerveja: c.marca_cerveja,
      isento_logistica: c.isento_logistica,
      isento_taxa_servico: c.isento_taxa_servico,
    })
    setAberto(true)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const payload = { ...form, endereco: form.endereco || null }
    const r = editId
      ? await supabase.from('clients').update(payload).eq('id', editId)
      : await supabase.from('clients').insert(payload)
    if (r.error) return setErro(r.error.message)
    setAberto(false)
    setEditId(null)
    setForm(vazio)
    await qc.invalidateQueries({ queryKey: ['admin-clientes'] })
  }

  return (
    <div>
      <PageTitle
        actions={
          <Button
            onClick={() => {
              setEditId(null)
              setForm(vazio)
              setAberto(!aberto)
            }}
          >
            + Novo cliente
          </Button>
        }
      >
        Clientes
      </PageTitle>

      {aberto && (
        <Card title={editId ? 'Editar cliente' : 'Novo cliente'} className="mb-6">
          <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            <Select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ClientKind })}>
              {Object.entries(KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" checked={form.endereco_fixo} onChange={(e) => setForm({ ...form, endereco_fixo: e.target.checked })} className="h-4 w-4" />
              Endereço fixo (aplicar direto)
            </label>
            <div className="md:col-span-3">
              <Input label="Endereço" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
            </div>
            <Input label="Água" value={form.marca_agua} onChange={(e) => setForm({ ...form, marca_agua: e.target.value })} />
            <Input label="Refrigerante (sempre LATA)" value={form.marca_refri} onChange={(e) => setForm({ ...form, marca_refri: e.target.value })} />
            <Input label="Cerveja (lata ou long neck)" value={form.marca_cerveja} onChange={(e) => setForm({ ...form, marca_cerveja: e.target.value })} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isento_logistica} onChange={(e) => setForm({ ...form, isento_logistica: e.target.checked })} className="h-4 w-4" />
              Isento de logística
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isento_taxa_servico} onChange={(e) => setForm({ ...form, isento_taxa_servico: e.target.checked })} className="h-4 w-4" />
              Isento de taxa de serviço
            </label>
            {erro && <p className="text-sm text-red-600 md:col-span-3">{erro}</p>}
            <div className="md:col-span-3">
              <Button type="submit">{editId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {isLoading ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !data?.length ? (
          <EmptyState>Nenhum cliente. As migrations criam StartSe, Inteli e WTC.</EmptyState>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Tipo</Th>
                <Th>Bebidas</Th>
                <Th>Isenções</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <Td>
                    <span className="font-medium">{c.nome}</span>
                    {c.endereco_fixo && <Badge tone="blue">end. fixo</Badge>}
                  </Td>
                  <Td>{KIND_LABEL[c.tipo]}</Td>
                  <Td className="text-xs text-neutral-500">
                    {c.marca_agua} · {c.marca_refri} · {c.marca_cerveja}
                  </Td>
                  <Td className="text-xs">
                    {c.isento_logistica && <Badge tone="green">logística</Badge>}{' '}
                    {c.isento_taxa_servico && <Badge tone="green">taxa</Badge>}
                  </Td>
                  <Td className="text-right">
                    <Button variant="ghost" onClick={() => editar(c)}>Editar</Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
