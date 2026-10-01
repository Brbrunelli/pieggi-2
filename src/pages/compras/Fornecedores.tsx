// ============================================================
// FORNECEDORES — cadastro de COMPRA (e onde o motorista busca)
//
// O Bruno: "se é cadastro pra fazer pedido, precisa estar dentro do
// módulo de compras". É o mesmo cadastro para as duas pontas:
//   • COMPRAS usa CNPJ, categoria, prazo e forma de pagamento — o pedido
//     novo já nasce com a condição do fornecedor, e a condição vira as
//     parcelas no contas a pagar;
//   • a LOGÍSTICA usa endereço e horário de retirada — sem endereço não
//     sai retirada (useFornecedores é lido por /rua/transporte).
//
// Os fornecedores antigos (vindos da logística) ficam com "completar
// cadastro" até alguém preencher os dados de compra.
// ============================================================

import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import { CONDICOES, hojeISO, resumoFornecedor, rotuloCondicao } from '@/engine/financeiro'
import { usePedidosResumo } from '@/components/compras/dados'
import {
  CATEGORIA_FORNECEDOR_LABEL,
  FORMA_PAGAMENTO_LABEL,
  type CategoriaFornecedor,
  type FormaPagamento,
  type FornecedorCompra,
} from '@/tipos/compras'

const vazio = {
  chave: '',
  nome: '',
  cnpj: '',
  categoria: '' as CategoriaFornecedor | '',
  condicao_pagamento: '',
  forma_pagamento: '' as FormaPagamento | '',
  pix: '',
  endereco: '',
  complemento: '',
  contato: '',
  telefone: '',
  horario: '',
  obs: '',
  ativo: true,
}

/** lido também por /rua/transporte (retirada) — não mudar a forma */
export function useFornecedores() {
  return useQuery({
    queryKey: ['fornecedores'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fornecedores').select('*').order('nome')
      if (error) throw error
      return data as FornecedorCompra[]
    },
  })
}

/** falta dado de compra? (o pedido precisa de prazo e forma para virar conta a pagar) */
export function cadastroCompraIncompleto(f: FornecedorCompra): string[] {
  const falta: string[] = []
  if (!f.categoria) falta.push('categoria')
  if (!f.condicao_pagamento) falta.push('prazo')
  if (!f.forma_pagamento) falta.push('forma de pagamento')
  if (f.forma_pagamento === 'pix' && !f.pix) falta.push('chave PIX')
  return falta
}

export default function Fornecedores() {
  const qc = useQueryClient()
  const { escalar, pedirCompra } = usePermissoes()
  const podeEditar = escalar || pedirCompra
  const { data, isLoading } = useFornecedores()
  const { data: pedidos } = usePedidosResumo()
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [categoria, setCategoria] = useState<string>('')

  const mes = hojeISO().slice(0, 7)
  const lista = useMemo(
    () => (data ?? []).filter((f) => !categoria || (categoria === 'sem' ? !f.categoria : f.categoria === categoria)),
    [data, categoria]
  )

  function editar(f: FornecedorCompra) {
    setEditId(f.id)
    setForm({
      chave: f.chave ?? '',
      nome: f.nome,
      cnpj: f.cnpj ?? '',
      categoria: f.categoria ?? '',
      condicao_pagamento: f.condicao_pagamento ?? '',
      forma_pagamento: f.forma_pagamento ?? '',
      pix: f.pix ?? '',
      endereco: f.endereco ?? '',
      complemento: f.complemento ?? '',
      contato: f.contato ?? '',
      telefone: f.telefone ?? '',
      horario: f.horario ?? '',
      obs: f.obs ?? '',
      ativo: f.ativo,
    })
    setAberto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const limpo = (s: string) => s.trim() || null
    const payload = {
      chave: limpo(form.chave)?.toLowerCase() ?? null,
      nome: form.nome.trim(),
      cnpj: limpo(form.cnpj),
      categoria: form.categoria || null,
      condicao_pagamento: form.condicao_pagamento || null,
      forma_pagamento: form.forma_pagamento || null,
      pix: limpo(form.pix),
      endereco: limpo(form.endereco),
      complemento: limpo(form.complemento),
      contato: limpo(form.contato),
      telefone: limpo(form.telefone),
      horario: limpo(form.horario),
      obs: limpo(form.obs),
      ativo: form.ativo,
    }
    const r = editId
      ? await supabase.from('fornecedores').update(payload).eq('id', editId)
      : await supabase.from('fornecedores').insert(payload)
    if (r.error) return setErro(r.error.message)
    setAberto(false)
    setEditId(null)
    setForm(vazio)
    await qc.invalidateQueries({ queryKey: ['fornecedores'] })
    await qc.invalidateQueries({ queryKey: ['pedidos'] })
  }

  const ativos = (data ?? []).filter((f) => f.ativo)
  const semEndereco = ativos.filter((f) => !f.endereco).length
  const incompletos = ativos.filter((f) => cadastroCompraIncompleto(f).length).length

  return (
    <div>
      <PageTitle
        lead="COMPRAS"
        actions={
          <>
            <Link to="/compras/pedidos">
              <Button variant="secondary">Pedidos de compra</Button>
            </Link>
            {podeEditar && (
              <Button
                onClick={() => {
                  setEditId(null)
                  setForm(vazio)
                  setAberto(!aberto)
                }}
              >
                + Novo fornecedor
              </Button>
            )}
          </>
        }
      >
        Fornecedores
      </PageTitle>

      {(incompletos > 0 || semEndereco > 0) && (
        <div className="mb-4 space-y-2">
          {incompletos > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {incompletos} fornecedor(es) sem os dados de compra (categoria, prazo ou forma de pagamento) — o
              pedido deles nasce sem condição e o financeiro não sabe como pagar.
            </p>
          )}
          {semEndereco > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {semEndereco} fornecedor(es) sem endereço — não dá para programar retirada neles (só entrega).
            </p>
          )}
        </div>
      )}

      {aberto && (
        <Card title={editId ? 'Editar fornecedor' : 'Novo fornecedor'} className="mb-6">
          <form onSubmit={salvar} className="space-y-6">
            <div>
              <div className="pg-key mb-3">Compra e pagamento</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input label="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                <Input label="CNPJ" placeholder="00.000.000/0000-00" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} />
                <Select
                  label="Categoria"
                  value={form.categoria}
                  onChange={(e) => setForm({ ...form, categoria: e.target.value as CategoriaFornecedor | '' })}
                >
                  <option value="">—</option>
                  {Object.entries(CATEGORIA_FORNECEDOR_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Prazo de pagamento padrão"
                  value={form.condicao_pagamento}
                  onChange={(e) => setForm({ ...form, condicao_pagamento: e.target.value })}
                >
                  <option value="">—</option>
                  {CONDICOES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.label}
                    </option>
                  ))}
                </Select>
                <Select
                  label="Forma de pagamento padrão"
                  value={form.forma_pagamento}
                  onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value as FormaPagamento | '' })}
                >
                  <option value="">—</option>
                  {Object.entries(FORMA_PAGAMENTO_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
                <Input label="Chave PIX" value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} />
              </div>
            </div>

            <div>
              <div className="pg-key mb-3">Contato e retirada (a logística usa)</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Input label="Contato" value={form.contato} onChange={(e) => setForm({ ...form, contato: e.target.value })} />
                <Input label="Telefone / WhatsApp" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
                <Input
                  label="Horário de retirada"
                  placeholder="seg–sex 7h–17h, sáb até 12h"
                  value={form.horario}
                  onChange={(e) => setForm({ ...form, horario: e.target.value })}
                />
                <div className="md:col-span-2">
                  <Input label="Endereço" value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
                </div>
                <Input
                  label="Complemento / onde retirar"
                  placeholder="fundos, balcão 3…"
                  value={form.complemento}
                  onChange={(e) => setForm({ ...form, complemento: e.target.value })}
                />
                <Input
                  label="Chave no catálogo"
                  placeholder="leticia"
                  value={form.chave}
                  onChange={(e) => setForm({ ...form, chave: e.target.value })}
                />
                <div className="md:col-span-2">
                  <Input label="Observação (motorista / pedido)" value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
                </div>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Ativo
            </label>
            <p className="text-xs text-neutral-500">
              O prazo e a forma de pagamento entram sozinhos no pedido novo (dá para trocar no pedido). A chave é o
              nome do fornecedor no catálogo — é com ela que a comanda sugere as retiradas e a lista de compras
              sugere o fornecedor.
            </p>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <div className="flex gap-3">
              <Button type="submit">{editId ? 'Salvar' : 'Cadastrar'}</Button>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Fechar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select className="!w-56" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas as categorias</option>
          {Object.entries(CATEGORIA_FORNECEDOR_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value="sem">Sem categoria</option>
        </Select>
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !lista.length ? (
          <EmptyState>Nenhum fornecedor.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Fornecedor</Th>
                  <Th>Pagamento</Th>
                  <Th>Em aberto · mês</Th>
                  <Th>Retirada</Th>
                  <Th>Contato</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((f) => {
                  const r = resumoFornecedor(pedidos ?? [], f.id, mes)
                  const falta = cadastroCompraIncompleto(f)
                  return (
                    <tr key={f.id} className={f.ativo ? '' : 'opacity-50'}>
                      <Td>
                        <span className="font-medium">{f.nome}</span>
                        {f.chave && <span className="ml-1 font-mono text-[11px] text-neutral-400">{f.chave}</span>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {f.categoria && <Badge>{CATEGORIA_FORNECEDOR_LABEL[f.categoria] ?? f.categoria}</Badge>}
                          {falta.length > 0 && <Badge tone="amber">completar cadastro</Badge>}
                        </div>
                        {f.cnpj && <div className="mt-1 font-mono text-[11px] text-neutral-500">{f.cnpj}</div>}
                      </Td>
                      <Td className="text-xs">
                        {f.condicao_pagamento || f.forma_pagamento ? (
                          <>
                            {rotuloCondicao(f.condicao_pagamento)}
                            {f.forma_pagamento && <span className="text-neutral-500"> · {FORMA_PAGAMENTO_LABEL[f.forma_pagamento]}</span>}
                            {f.pix && <div className="text-neutral-500">PIX {f.pix}</div>}
                          </>
                        ) : (
                          <span className="text-neutral-400">falta {falta.join(', ')}</span>
                        )}
                      </Td>
                      <Td className="text-xs">
                        {r.abertos > 0 ? (
                          <Link to={`/compras/pedidos?fornecedor=${f.id}`} className="font-semibold hover:underline">
                            {r.abertos} pedido(s)
                          </Link>
                        ) : (
                          <span className="text-neutral-400">nenhum</span>
                        )}
                        <div className="text-neutral-500">{r.compradoMes > 0 ? `${formatBRL(r.compradoMes)} no mês` : '—'}</div>
                      </Td>
                      <Td className="text-xs">
                        {f.endereco ?? <Badge tone="amber">sem endereço</Badge>}
                        {f.complemento && <div className="text-neutral-500">{f.complemento}</div>}
                        {f.horario && <div className="text-neutral-500">{f.horario}</div>}
                      </Td>
                      <Td className="text-xs text-neutral-500">
                        {f.contato ?? '—'}
                        {f.telefone && <div>{f.telefone}</div>}
                      </Td>
                      <Td className="text-right">
                        {podeEditar && (
                          <Button variant="ghost" onClick={() => editar(f)}>
                            Editar
                          </Button>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
