// ============================================================
// MATERIAIS RETORNÁVEIS — o que sai e tem que voltar
//
// O custo de reposição é o que transforma "sumiram 6 copos" em
// "R$ 48 de prejuízo neste evento". A chave liga o material à linha da
// comanda: é com ela que o previsto é carregado sozinho.
// ============================================================

import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import { SETOR_LABEL, type Material, type SetorExpedicao } from '@/types'

const vazio = {
  nome: '',
  setor: 'estrutura' as SetorExpedicao,
  unidade: 'un',
  custo_reposicao: '',
  chave: '',
  ordem: '0',
  ativo: true,
}

export default function Materiais() {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['materiais-cadastro'],
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('*').order('ordem')
      if (error) throw error
      return data as Material[]
    },
  })

  function editar(m: Material) {
    setEditId(m.id)
    setForm({
      nome: m.nome,
      setor: m.setor,
      unidade: m.unidade,
      custo_reposicao: m.custo_reposicao != null ? String(m.custo_reposicao) : '',
      chave: m.chave ?? '',
      ordem: String(m.ordem),
      ativo: m.ativo,
    })
    setAberto(true)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const payload = {
      nome: form.nome.trim(),
      setor: form.setor,
      unidade: form.unidade || 'un',
      custo_reposicao: form.custo_reposicao ? Number(form.custo_reposicao.replace(',', '.')) : null,
      chave: form.chave.trim() || null,
      ordem: Number(form.ordem) || 0,
      ativo: form.ativo,
    }
    const r = editId
      ? await supabase.from('materials').update(payload).eq('id', editId)
      : await supabase.from('materials').insert(payload)
    if (r.error) return setErro(r.error.message)
    setAberto(false)
    setEditId(null)
    setForm(vazio)
    await qc.invalidateQueries({ queryKey: ['materiais-cadastro'] })
  }

  const semCusto = (data ?? []).filter((m) => m.ativo && m.custo_reposicao == null).length

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
            + Novo material
          </Button>
        }
      >
        Materiais
      </PageTitle>

      {semCusto > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ {semCusto} material(is) sem custo de reposição — sem ele a perda aparece em quantidade, mas
          não em reais.
        </p>
      )}

      {aberto && (
        <Card title={editId ? 'Editar material' : 'Novo material'} className="mb-6">
          <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Select
              label="Setor da expedição"
              value={form.setor}
              onChange={(e) => setForm({ ...form, setor: e.target.value as SetorExpedicao })}
            >
              {Object.entries(SETOR_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            <Input label="Unidade" value={form.unidade} onChange={(e) => setForm({ ...form, unidade: e.target.value })} />
            <Input
              label="Custo de reposição (R$ por unidade)"
              inputMode="decimal"
              value={form.custo_reposicao}
              onChange={(e) => setForm({ ...form, custo_reposicao: e.target.value })}
            />
            <Input
              label="Chave na comanda"
              placeholder="ex.: réchaud|rechaud"
              value={form.chave}
              onChange={(e) => setForm({ ...form, chave: e.target.value })}
            />
            <Input label="Ordem" inputMode="numeric" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
            <p className="text-xs text-neutral-500 md:col-span-3">
              A chave é comparada com o nome do item na estrutura da comanda (sem diferenciar
              maiúsculas). Separe variações com <code>|</code>. Em branco = o material só entra à mão.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Ativo
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
          <EmptyState>Nenhum material. A migration 0030 cria os retornáveis da comanda.</EmptyState>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Material</Th>
                <Th>Setor</Th>
                <Th>Custo</Th>
                <Th>Chave na comanda</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id} className={m.ativo ? '' : 'opacity-50'}>
                  <Td>
                    <span className="font-medium">{m.nome}</span>
                    <span className="ml-1 text-[11px] text-neutral-400">{m.unidade}</span>
                  </Td>
                  <Td>{SETOR_LABEL[m.setor]}</Td>
                  <Td>
                    {m.custo_reposicao != null ? formatBRL(Number(m.custo_reposicao)) : <Badge tone="amber">sem custo</Badge>}
                  </Td>
                  <Td className="font-mono text-xs text-neutral-500">{m.chave ?? '— manual —'}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" onClick={() => editar(m)}>
                      Editar
                    </Button>
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
