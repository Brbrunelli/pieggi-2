// ============================================================
// FISCAL — emitente, grupos fiscais e o grupo de cada item
//
// Três blocos na mesma tela porque são usados juntos:
//
//   1. EMITENTE — CNPJ, inscrição, regime, ISS. Linha única no banco:
//      é a Pieggi, não um cadastro com várias linhas.
//   2. GRUPOS FISCAIS — poucos grupos com NCM/CFOP/alíquotas. Cadastrar
//      isso em 140 itens não se mantém, e alíquota que muda obrigaria a
//      reeditar tudo. Aqui muda num lugar só.
//   3. ITEM → GRUPO — cada item do cardápio aponta para um grupo. É o
//      `classificacao_fiscal` do GRUPO que decide o split produto × serviço.
//
// O ambiente do PlugNotas começa em HOMOLOGAÇÃO. Virar para produção é o
// que dá validade fiscal às notas — por isso o aviso é gritante.
// ============================================================

import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'
import type { FiscalConfig, TaxGroup } from '@/types'

interface ItemFiscal {
  id: string
  nome: string
  categoria: string
  tax_group_id: string | null
}

export default function Fiscal() {
  const qc = useQueryClient()
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [busca, setBusca] = useState('')
  const [soSemCadastro, setSoSemCadastro] = useState(false)
  const [config, setConfig] = useState<Partial<FiscalConfig> | null>(null)

  const { data: fiscal } = useQuery({
    queryKey: ['fiscal-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fiscal_config')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (error) throw error
      return data as FiscalConfig | null
    },
  })

  const { data: grupos } = useQuery({
    queryKey: ['tax-groups'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tax_groups').select('*').order('ordem')
      if (error) throw error
      return data as TaxGroup[]
    },
  })

  const { data: itens } = useQuery({
    queryKey: ['catalogo-fiscal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('id, nome, categoria, tax_group_id')
        .eq('ativo', true)
        .order('categoria')
        .order('nome')
      if (error) throw error
      return data as ItemFiscal[]
    },
  })

  const atual = config ?? fiscal ?? null

  const filtrados = useMemo(() => {
    let l = itens ?? []
    if (busca) {
      const b = busca.toLowerCase()
      l = l.filter((i) => i.nome.toLowerCase().includes(b) || i.categoria.includes(b))
    }
    if (soSemCadastro) l = l.filter((i) => !i.tax_group_id)
    return l
  }, [itens, busca, soSemCadastro])

  const pendentes = (itens ?? []).filter((i) => !i.tax_group_id).length

  async function salvarGrupoDoItem(id: string, grupoId: string) {
    const { error } = await supabase
      .from('catalog_items')
      .update({ tax_group_id: grupoId || null })
      .eq('id', id)
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      await qc.invalidateQueries({ queryKey: ['catalogo-fiscal'] })
      await qc.invalidateQueries({ queryKey: ['tax-groups-uso'] })
    }
  }

  /** Aplica o grupo de uma linha em toda a categoria dela. */
  async function aplicarGrupoNaCategoria(categoria: string, grupoId: string | null) {
    setOcupado(true)
    const { error } = await supabase
      .from('catalog_items')
      .update({ tax_group_id: grupoId })
      .eq('categoria', categoria)
      .eq('ativo', true)
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setMsg(`✅ Grupo aplicado em toda a categoria "${categoria}".`)
      await qc.invalidateQueries({ queryKey: ['catalogo-fiscal'] })
      await qc.invalidateQueries({ queryKey: ['tax-groups-uso'] })
    }
    setOcupado(false)
  }

  async function salvarConfig() {
    if (!config) return
    setOcupado(true)
    setMsg(null)
    const { error } = await supabase
      .from('fiscal_config')
      .update({ ...config, atualizado_em: new Date().toISOString() })
      .eq('id', 1)
    if (error) setMsg(`🛑 ${error.message}`)
    else {
      setConfig(null)
      setMsg('✅ Dados fiscais salvos.')
      await qc.invalidateQueries({ queryKey: ['fiscal-config'] })
    }
    setOcupado(false)
  }

  return (
    <div>
      <PageTitle lead="ADMINISTRAÇÃO">Fiscal</PageTitle>

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {atual?.plugnotas_ambiente === 'homologacao' && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          ⚠️ PlugNotas em <b>homologação</b>: as notas transmitidas são de teste e{' '}
          <b>não têm validade fiscal</b>. É o certo para testar. Vire para produção só quando o
          certificado A1 estiver cadastrado e uma nota de teste tiver saído correta.
        </div>
      )}

      {/* ---------- 1. emitente ---------- */}
      <Card
        title="1 · Dados da empresa (emitente)"
        className="mb-6"
        actions={
          config ? (
            <div className="flex gap-2">
              <Button onClick={salvarConfig} disabled={ocupado}>
                {ocupado ? 'Salvando…' : 'Salvar'}
              </Button>
              <Button variant="ghost" onClick={() => setConfig(null)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfig(fiscal ?? {})}>
              Editar
            </Button>
          )
        }
      >
        {!atual ? (
          <EmptyState>
            A linha de configuração fiscal não existe. Rode a migration{' '}
            <code>0022_financeiro_nf.sql</code>.
          </EmptyState>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Campo
              rotulo="Razão social"
              valor={atual.razao_social}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, razao_social: v })}
            />
            <Campo
              rotulo="CNPJ"
              valor={atual.cnpj}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, cnpj: v })}
            />
            <Campo
              rotulo="Inscrição municipal"
              valor={atual.inscricao_municipal}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, inscricao_municipal: v })}
            />
            {config ? (
              <Select
                label="Regime tributário"
                value={config.regime_tributario ?? atual.regime_tributario}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    regime_tributario: e.target.value as FiscalConfig['regime_tributario'],
                  })
                }
              >
                <option value="simples_nacional">Simples Nacional</option>
                <option value="lucro_presumido">Lucro Presumido</option>
                <option value="lucro_real">Lucro Real</option>
              </Select>
            ) : (
              <Campo rotulo="Regime tributário" valor={atual.regime_tributario} editando={false} />
            )}
            <Campo
              rotulo="Item da lista de serviço (padrão)"
              valor={atual.item_lista_servico}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, item_lista_servico: v })}
            />
            <Campo
              rotulo="CNAE"
              valor={atual.cnae}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, cnae: v })}
            />
            <Campo
              rotulo="ISS (%)"
              valor={atual.iss_pct != null ? String(atual.iss_pct) : null}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, iss_pct: v === '' ? null : Number(v) })}
            />
            <Campo
              rotulo="CFOP padrão (produto)"
              valor={atual.cfop_padrao}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, cfop_padrao: v })}
            />
            <Campo
              rotulo="NCM padrão"
              valor={atual.ncm_padrao}
              editando={Boolean(config)}
              onChange={(v) => setConfig({ ...config, ncm_padrao: v })}
            />
            <div className="md:col-span-2">
              <Campo
                rotulo="Endereço"
                valor={atual.endereco}
                editando={Boolean(config)}
                onChange={(v) => setConfig({ ...config, endereco: v })}
              />
            </div>
            {config ? (
              <Select
                label="Ambiente PlugNotas"
                value={config.plugnotas_ambiente ?? atual.plugnotas_ambiente}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    plugnotas_ambiente: e.target.value as 'homologacao' | 'producao',
                  })
                }
              >
                <option value="homologacao">Homologação (teste, sem validade fiscal)</option>
                <option value="producao">Produção (nota válida)</option>
              </Select>
            ) : (
              <Campo
                rotulo="Ambiente PlugNotas"
                valor={atual.plugnotas_ambiente}
                editando={false}
              />
            )}
          </div>
        )}
      </Card>

      {/* ---------- 2. grupos fiscais ---------- */}
      <GruposFiscais />

      {/* ---------- 3. item → grupo ---------- */}
      <Card
        title={`3 · Qual grupo cada item usa (${filtrados.length})`}
        className="mt-6"
        actions={pendentes > 0 && <Badge tone="amber">{pendentes} sem grupo</Badge>}
      >
        <p className="mb-4 text-xs text-neutral-500">
          Todo item nasce em <b>Serviço de buffet e eventos</b>, que é o que a casa faz na
          esmagadora maioria dos casos. Aqui você só move a exceção — e o botão{' '}
          <b>aplicar na categoria</b> muda uma categoria inteira de uma vez.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            className="!w-72"
            placeholder="Buscar item ou categoria…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={soSemCadastro}
              onChange={(e) => setSoSemCadastro(e.target.checked)}
            />
            Só os sem grupo
          </label>
        </div>

        {!filtrados.length ? (
          <EmptyState>Nenhum item neste filtro.</EmptyState>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <Th>Item</Th>
                <Th>Categoria</Th>
                <Th>Grupo fiscal</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i) => (
                <tr key={i.id} className={!i.tax_group_id ? 'bg-amber-50/60' : ''}>
                  <Td className="font-medium">{i.nome}</Td>
                  <Td className="text-xs text-neutral-500">{i.categoria}</Td>
                  <Td>
                    <select
                      className="w-56 rounded border border-[var(--pg-border)] bg-transparent px-1.5 py-1 text-xs"
                      value={i.tax_group_id ?? ''}
                      onChange={(e) => salvarGrupoDoItem(i.id, e.target.value)}
                    >
                      <option value="">— sem grupo —</option>
                      {(grupos ?? []).map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.nome}
                        </option>
                      ))}
                    </select>
                  </Td>
                  <Td className="text-right">
                    <button
                      title={`Aplicar este grupo em toda a categoria "${i.categoria}"`}
                      className="text-xs text-neutral-400 underline decoration-dotted hover:text-green-700"
                      onClick={() => aplicarGrupoNaCategoria(i.categoria, i.tax_group_id)}
                    >
                      aplicar na categoria
                    </button>
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

// ------------------------------------------------------------
// Grupos fiscais — o cadastro que realmente se mantém
// ------------------------------------------------------------
function GruposFiscais() {
  const qc = useQueryClient()
  const [editando, setEditando] = useState<TaxGroup | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)

  const { data: grupos } = useQuery({
    queryKey: ['tax-groups'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tax_groups').select('*').order('ordem')
      if (error) throw error
      return data as TaxGroup[]
    },
  })

  const { data: usos } = useQuery({
    queryKey: ['tax-groups-uso'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('catalog_items')
        .select('tax_group_id')
        .eq('ativo', true)
      if (error) throw error
      const mapa = new Map<string, number>()
      for (const r of (data ?? []) as { tax_group_id: string | null }[]) {
        if (!r.tax_group_id) continue
        mapa.set(r.tax_group_id, (mapa.get(r.tax_group_id) ?? 0) + 1)
      }
      return mapa
    },
  })

  async function salvar() {
    if (!editando) return
    const { id, ...campos } = editando
    const r = criando
      ? await supabase.from('tax_groups').insert(campos)
      : await supabase.from('tax_groups').update(campos).eq('id', id)
    if (r.error) setMsg(`🛑 ${r.error.message}`)
    else {
      setEditando(null)
      setCriando(false)
      setMsg('✅ Grupo salvo.')
      await qc.invalidateQueries({ queryKey: ['tax-groups'] })
    }
  }

  function novo() {
    setCriando(true)
    setEditando({
      id: 'novo',
      nome: '',
      descricao: null,
      classificacao_fiscal: 'produto',
      ncm: null,
      cest: null,
      cfop: null,
      origem_mercadoria: '0',
      unidade_fiscal: 'UN',
      icms_pct: null,
      ipi_pct: null,
      pis_pct: null,
      cofins_pct: null,
      iss_pct: null,
      item_lista_servico: null,
      ativo: true,
      ordem: (grupos?.length ?? 0) + 1,
    })
  }

  /** O que impediria a nota de sair com este grupo. */
  function falta(g: TaxGroup): string | null {
    if (g.classificacao_fiscal === 'produto' && !g.ncm) return 'falta NCM'
    if (g.classificacao_fiscal === 'servico' && !g.item_lista_servico)
      return 'falta item da lista de serviço'
    return null
  }

  return (
    <Card
      title={`2 · Grupos fiscais (${grupos?.length ?? 0})`}
      actions={
        <Button variant="secondary" onClick={novo}>
          + Novo grupo
        </Button>
      }
    >
      {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      <p className="mb-4 text-xs text-neutral-500">
        <b>Produto</b> vira NF-e e precisa de NCM. <b>Serviço</b> vira NFS-e e precisa do item da
        lista. As alíquotas vêm <b>vazias de propósito</b> — número chutado sai na nota e ninguém
        desconfia. Peça os valores ao seu contador uma vez e cadastre aqui.
      </p>

      {criando && editando && (
        <div className="mb-5 rounded-lg border border-[var(--pg-border)] p-4">
          <FormGrupo g={editando} onChange={setEditando} />
          <div className="mt-3 flex gap-2">
            <Button onClick={salvar}>Criar grupo</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setCriando(false)
                setEditando(null)
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {!grupos?.length ? (
        <EmptyState>
          Nenhum grupo. Rode a migration <code>0024_grupos_fiscais.sql</code> ou crie o primeiro.
        </EmptyState>
      ) : (
        <div className="divide-y divide-[var(--pg-border)]">
          {grupos.map((g) => {
            const pend = falta(g)
            const emUso = usos?.get(g.id) ?? 0
            return (
              <div key={g.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={g.classificacao_fiscal === 'produto' ? 'blue' : 'neutral'}>
                    {g.classificacao_fiscal === 'produto' ? 'PRODUTO' : 'SERVIÇO'}
                  </Badge>
                  <span className="text-sm font-semibold">{g.nome}</span>
                  <span className="text-xs text-neutral-500">
                    {emUso} item(ns)
                    {g.classificacao_fiscal === 'produto'
                      ? g.ncm
                        ? ` · NCM ${g.ncm}`
                        : ''
                      : g.item_lista_servico
                        ? ` · lista ${g.item_lista_servico}`
                        : ''}
                  </span>
                  {pend && <Badge tone="amber">{pend}</Badge>}
                  {!g.ativo && <Badge tone="neutral">inativo</Badge>}
                  <Button
                    variant="ghost"
                    className="!px-2 !py-1 text-xs"
                    onClick={() => {
                      setCriando(false)
                      setEditando(editando?.id === g.id ? null : g)
                    }}
                  >
                    {editando?.id === g.id ? 'fechar' : 'editar'}
                  </Button>
                </div>
                {g.descricao && !(editando?.id === g.id) && (
                  <p className="mt-0.5 text-xs text-neutral-400">{g.descricao}</p>
                )}
                {editando?.id === g.id && !criando && (
                  <div className="mt-3">
                    <FormGrupo g={editando} onChange={setEditando} />
                    <div className="mt-3 flex gap-2">
                      <Button onClick={salvar}>Salvar</Button>
                      <Button variant="ghost" onClick={() => setEditando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function FormGrupo({ g, onChange }: { g: TaxGroup; onChange: (g: TaxGroup) => void }) {
  const num = (v: string) => (v === '' ? null : Number(v))
  const produto = g.classificacao_fiscal === 'produto'
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          label="Nome do grupo"
          value={g.nome}
          onChange={(e) => onChange({ ...g, nome: e.target.value })}
        />
        <Select
          label="Classificação"
          value={g.classificacao_fiscal}
          onChange={(e) =>
            onChange({ ...g, classificacao_fiscal: e.target.value as TaxGroup['classificacao_fiscal'] })
          }
        >
          <option value="servico">Serviço (NFS-e)</option>
          <option value="produto">Produto (NF-e)</option>
        </Select>
        <Input
          label="Descrição"
          value={g.descricao ?? ''}
          onChange={(e) => onChange({ ...g, descricao: e.target.value })}
        />
      </div>

      {produto ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <Input label="NCM" value={g.ncm ?? ''} onChange={(e) => onChange({ ...g, ncm: e.target.value })} />
          <Input label="CEST" value={g.cest ?? ''} onChange={(e) => onChange({ ...g, cest: e.target.value })} />
          <Input label="CFOP" value={g.cfop ?? ''} onChange={(e) => onChange({ ...g, cfop: e.target.value })} />
          <Input
            label="Unidade"
            value={g.unidade_fiscal ?? ''}
            onChange={(e) => onChange({ ...g, unidade_fiscal: e.target.value })}
          />
          <Input
            label="ICMS %"
            type="number"
            step="0.001"
            value={g.icms_pct ?? ''}
            onChange={(e) => onChange({ ...g, icms_pct: num(e.target.value) })}
          />
          <Input
            label="IPI %"
            type="number"
            step="0.001"
            value={g.ipi_pct ?? ''}
            onChange={(e) => onChange({ ...g, ipi_pct: num(e.target.value) })}
          />
          <Input
            label="PIS %"
            type="number"
            step="0.001"
            value={g.pis_pct ?? ''}
            onChange={(e) => onChange({ ...g, pis_pct: num(e.target.value) })}
          />
          <Input
            label="COFINS %"
            type="number"
            step="0.001"
            value={g.cofins_pct ?? ''}
            onChange={(e) => onChange({ ...g, cofins_pct: num(e.target.value) })}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Input
            label="Item da lista de serviço"
            value={g.item_lista_servico ?? ''}
            onChange={(e) => onChange({ ...g, item_lista_servico: e.target.value })}
          />
          <Input
            label="ISS %"
            type="number"
            step="0.001"
            value={g.iss_pct ?? ''}
            onChange={(e) => onChange({ ...g, iss_pct: num(e.target.value) })}
          />
          <Input
            label="PIS %"
            type="number"
            step="0.001"
            value={g.pis_pct ?? ''}
            onChange={(e) => onChange({ ...g, pis_pct: num(e.target.value) })}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={g.ativo}
          onChange={(e) => onChange({ ...g, ativo: e.target.checked })}
        />
        Grupo ativo
      </label>
    </div>
  )
}

function Campo({
  rotulo,
  valor,
  editando,
  onChange,
}: {
  rotulo: string
  valor: string | null | undefined
  editando: boolean
  onChange?: (v: string) => void
}) {
  if (editando && onChange) {
    return <Input label={rotulo} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} />
  }
  return (
    <div>
      <span className="pg-key mb-1.5 block">{rotulo}</span>
      <span className="text-sm">{valor || <span className="text-neutral-400">—</span>}</span>
    </div>
  )
}
