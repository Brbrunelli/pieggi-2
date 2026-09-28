import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import type { CatalogItem, DietSeal } from '@/types'

const SELOS: { value: DietSeal | ''; label: string }[] = [
  { value: '', label: 'Sem selo (carne/peixe)' },
  { value: 'vegetariano', label: '🥬 Vegetariano' },
  { value: 'vegano', label: '🌱 Vegano' },
  { value: 'sem_gluten', label: 'Sem glúten' },
  { value: 'sem_lactose', label: 'Sem lactose' },
  { value: 'sem_acucar', label: 'Sem açúcar' },
]

export default function Catalogo() {
  const qc = useQueryClient()
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [form, setForm] = useState({ categoria: '', nome: '', base_sabor: '', selo: '' as DietSeal | '', nome_en: '', nome_es: '', obs: '' })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-catalogo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('*')
        .order('categoria')
        .order('nome')
      if (error) throw error
      return data as CatalogItem[]
    },
  })

  const categorias = useMemo(
    () => Array.from(new Set((data ?? []).map((i) => i.categoria))).sort(),
    [data]
  )

  const filtrados = (data ?? []).filter(
    (i) =>
      (!filtroCategoria || i.categoria === filtroCategoria) &&
      (!busca || i.nome.toLowerCase().includes(busca.toLowerCase()))
  )

  function editar(i: CatalogItem) {
    setEditId(i.id)
    setForm({
      categoria: i.categoria,
      nome: i.nome,
      base_sabor: i.base_sabor ?? '',
      selo: i.selo ?? '',
      nome_en: i.nome_en ?? '',
      nome_es: i.nome_es ?? '',
      obs: i.obs ?? '',
    })
    setAberto(true)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const payload = {
      categoria: form.categoria.trim(),
      nome: form.nome.trim(),
      base_sabor: form.base_sabor.trim() || null,
      selo: form.selo || null,
      nome_en: form.nome_en.trim() || null,
      nome_es: form.nome_es.trim() || null,
      obs: form.obs.trim() || null,
    }
    const r = editId
      ? await supabase.from('catalog_items').update(payload).eq('id', editId)
      : await supabase.from('catalog_items').insert(payload)
    if (r.error) return setErro(r.error.message)
    setAberto(false)
    setEditId(null)
    await qc.invalidateQueries({ queryKey: ['admin-catalogo'] })
  }

  async function alternarAtivo(i: CatalogItem) {
    await supabase.from('catalog_items').update({ ativo: !i.ativo }).eq('id', i.id)
    await qc.invalidateQueries({ queryKey: ['admin-catalogo'] })
  }

  return (
    <div>
      <PageTitle
        actions={
          <Button
            onClick={() => {
              setEditId(null)
              setForm({ categoria: filtroCategoria, nome: '', base_sabor: '', selo: '', nome_en: '', nome_es: '', obs: '' })
              setAberto(!aberto)
            }}
          >
            + Novo item
          </Button>
        }
      >
        Catálogo (cardápio MAIO2026)
      </PageTitle>

      <p className="mb-4 text-sm text-neutral-500">
        Fonte única de verdade dos itens e sabores. O seed traz o extraído das regras — conferir e
        completar com o cardápio oficial. Itens <b>proibidos</b> nunca entram em proposta/programação.
      </p>

      {aberto && (
        <Card title={editId ? 'Editar item' : 'Novo item'} className="mb-6">
          <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Categoria" list="categorias" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} required />
            <datalist id="categorias">
              {categorias.map((c) => <option key={c} value={c} />)}
            </datalist>
            <Input label="Nome (grafia oficial)" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            <Input label="Base do sabor (p/ regra de repetição)" value={form.base_sabor} onChange={(e) => setForm({ ...form, base_sabor: e.target.value })} placeholder="chocolate, frango, limão…" />
            <Select label="Selo" value={form.selo} onChange={(e) => setForm({ ...form, selo: e.target.value as DietSeal | '' })}>
              {SELOS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <Input label="Nome EN (plaquinha)" value={form.nome_en} onChange={(e) => setForm({ ...form, nome_en: e.target.value })} />
            <Input label="Nome ES (plaquinha)" value={form.nome_es} onChange={(e) => setForm({ ...form, nome_es: e.target.value })} />
            <div className="md:col-span-3">
              <Input label="Observações" value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
            </div>
            {erro && <p className="text-sm text-red-600 md:col-span-3">{erro}</p>}
            <div className="md:col-span-3">
              <Button type="submit">{editId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="mb-4 flex gap-3">
          <Select className="!w-64" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input className="!w-64" placeholder="Buscar item…" value={busca} onChange={(e) => setBusca(e.target.value)} />
          <span className="self-center text-xs text-neutral-400">{filtrados.length} itens</span>
        </div>

        {isLoading ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !filtrados.length ? (
          <EmptyState>Nenhum item encontrado.</EmptyState>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Categoria</Th>
                <Th>Item</Th>
                <Th>Base</Th>
                <Th>Selo</Th>
                <Th>Estação</Th>
                <Th>Status</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i) => (
                <tr key={i.id} className={!i.ativo || i.proibido ? 'opacity-50' : ''}>
                  <Td className="text-xs text-neutral-500">{i.categoria}</Td>
                  <Td>
                    <span className="font-medium">{i.nome}</span>
                    {i.obs && <div className="text-xs text-neutral-400">{i.obs}</div>}
                  </Td>
                  <Td className="text-xs">{i.base_sabor ?? '—'}</Td>
                  <Td className="text-xs">
                    {i.selo === 'vegetariano' ? '🥬' : i.selo === 'vegano' ? '🌱' : (i.selo ?? '—')}
                  </Td>
                  <Td className="text-xs">{i.estacao ?? i.fornecedor ?? '—'}</Td>
                  <Td>
                    {i.proibido ? (
                      <Badge tone="red">PROIBIDO</Badge>
                    ) : i.ativo ? (
                      <Badge tone="green">ativo</Badge>
                    ) : (
                      <Badge tone="neutral">inativo</Badge>
                    )}
                  </Td>
                  <Td className="text-right whitespace-nowrap">
                    <Button variant="ghost" onClick={() => editar(i)}>Editar</Button>
                    {!i.proibido && (
                      <Button variant="ghost" onClick={() => alternarAtivo(i)}>
                        {i.ativo ? 'Desativar' : 'Ativar'}
                      </Button>
                    )}
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
