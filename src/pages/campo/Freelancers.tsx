// ============================================================
// FREELANCERS — o cadastro da Adriana
//
// Nome, contato, PIX, função e diária combinada. O histórico (quantos
// eventos, faltas, nota média) não é digitado: sai da escala dos
// eventos, para a próxima escala começar por quem aparece e trabalha bem.
//
// Contrato assinado + ASO (0037): "todo freela tem que ter contrato
// assinado + ASO (liberação pra trabalhar com comida)". A coluna
// Situação é calculada para HOJE; a escala recalcula para o dia do
// evento. Os filtros "não aptos" e "vencendo em 30 dias" são a lista de
// cobrança da Adriana. No celular a tabela vira cartões.
// ============================================================

import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import { formatBRL } from '@/engine'
import { ALERTA_VENCIMENTO_DIAS, funcaoCanonica, hojeLocal, rotuloSituacao, situacaoFreela } from '@/engine/freelas'
import SeletorFuncao from '@/components/pessoas/SeletorFuncao'
import DocumentosFreela from '@/components/pessoas/DocumentosFreela'
import { useDocumentosFreelas } from '@/components/pessoas/useFreelas'
import type { EventStaff, Freelancer } from '@/types'
import type { FreelancerDocumento, SituacaoFreela } from '@/tipos/pessoas'

const vazio = {
  nome: '',
  telefone: '',
  documento: '',
  pix: '',
  funcao_padrao: '',
  valor_padrao: '',
  obs: '',
  ativo: true,
}

type Filtro = 'todos' | 'nao_aptos' | 'vencendo'
const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'todos', label: 'Todos' },
  { key: 'nao_aptos', label: 'Não aptos' },
  { key: 'vencendo', label: `Vencendo em ${ALERTA_VENCIMENTO_DIAS} dias` },
]

function SeloSituacao({ s }: { s: SituacaoFreela }) {
  const r = rotuloSituacao(s)
  return <Badge tone={r.tom}>{r.texto}</Badge>
}

export default function Freelancers() {
  const qc = useQueryClient()
  const { escalar } = usePermissoes()
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const hoje = hojeLocal()

  const { data, isLoading } = useQuery({
    queryKey: ['freelancers-todos'],
    queryFn: async () => {
      const { data, error } = await supabase.from('freelancers').select('*').order('nome')
      if (error) throw error
      return data as Freelancer[]
    },
  })

  const { data: historico } = useQuery({
    queryKey: ['freelancers-historico'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_staff')
        .select('freelancer_id, status, avaliacao')
        .not('freelancer_id', 'is', null)
      if (error) throw error
      return data as Pick<EventStaff, 'freelancer_id' | 'status' | 'avaliacao'>[]
    },
  })

  const { data: docs } = useDocumentosFreelas()
  const docsDe = useMemo(() => {
    const m = new Map<string, FreelancerDocumento[]>()
    for (const d of docs ?? []) m.set(d.freelancer_id, [...(m.get(d.freelancer_id) ?? []), d])
    return m
  }, [docs])
  const situacoes = useMemo(() => {
    const m = new Map<string, SituacaoFreela>()
    for (const f of data ?? []) m.set(f.id, situacaoFreela(docsDe.get(f.id) ?? [], hoje))
    return m
  }, [data, docsDe, hoje])

  const stats = useMemo(() => {
    const m = new Map<string, { eventos: number; faltas: number; notas: number[] }>()
    for (const h of historico ?? []) {
      const s = m.get(h.freelancer_id!) ?? { eventos: 0, faltas: 0, notas: [] }
      if (h.status === 'presente') s.eventos++
      if (h.status === 'faltou') s.faltas++
      if (h.avaliacao) s.notas.push(h.avaliacao)
      m.set(h.freelancer_id!, s)
    }
    return m
  }, [historico])

  function editar(f: Freelancer) {
    setEditId(f.id)
    setErro(null)
    setForm({
      nome: f.nome,
      telefone: f.telefone ?? '',
      documento: f.documento ?? '',
      pix: f.pix ?? '',
      funcao_padrao: f.funcao_padrao ?? '',
      valor_padrao: f.valor_padrao != null ? String(f.valor_padrao) : '',
      obs: f.obs ?? '',
      ativo: f.ativo,
    })
    setAberto(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const payload = {
      nome: form.nome.trim(),
      telefone: form.telefone || null,
      documento: form.documento || null,
      pix: form.pix || null,
      funcao_padrao: funcaoCanonica(form.funcao_padrao) ?? (form.funcao_padrao || null),
      valor_padrao: form.valor_padrao ? Number(form.valor_padrao.replace(',', '.')) : null,
      obs: form.obs || null,
      ativo: form.ativo,
    }
    if (editId) {
      const r = await supabase.from('freelancers').update(payload).eq('id', editId)
      if (r.error) return setErro(r.error.message)
      setAberto(false)
      setEditId(null)
      setForm(vazio)
    } else {
      // novo: o cartão fica aberto para registrar contrato e ASO em seguida
      const r = await supabase.from('freelancers').insert(payload).select('id').single()
      if (r.error) return setErro(r.error.message)
      setEditId((r.data as { id: string }).id)
    }
    await qc.invalidateQueries({ queryKey: ['freelancers-todos'] })
    await qc.invalidateQueries({ queryKey: ['freelancers'] })
  }

  const ativos = (data ?? []).filter((f) => f.ativo)
  const contagem: Record<Exclude<Filtro, 'todos'>, number> = {
    nao_aptos: ativos.filter((f) => !situacoes.get(f.id)?.apto).length,
    vencendo: ativos.filter((f) => situacoes.get(f.id)?.apto && situacoes.get(f.id)!.vencendo.length).length,
  }

  const lista = (data ?? []).filter((f) => {
    if (!`${f.nome} ${f.funcao_padrao ?? ''}`.toLowerCase().includes(busca.toLowerCase())) return false
    const s = situacoes.get(f.id)
    if (filtro === 'nao_aptos') return f.ativo && !s?.apto
    if (filtro === 'vencendo') return f.ativo && Boolean(s?.apto && s.vencendo.length)
    return true
  })

  return (
    <div>
      <PageTitle
        lead="LOGÍSTICA"
        actions={
          escalar && (
            <Button
              onClick={() => {
                setEditId(null)
                setForm(vazio)
                setErro(null)
                setAberto(!aberto)
              }}
            >
              + Novo freelancer
            </Button>
          )
        }
      >
        Freelancers
      </PageTitle>

      {aberto && (
        <Card
          title={editId ? 'Editar freelancer' : 'Novo freelancer'}
          className="mb-6"
          actions={
            <Button
              variant="ghost"
              onClick={() => {
                setAberto(false)
                setEditId(null)
              }}
            >
              Fechar
            </Button>
          }
        >
          <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Nome" required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            <Input
              label="Telefone"
              inputMode="tel"
              value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: e.target.value })}
            />
            <Input label="CPF" value={form.documento} onChange={(e) => setForm({ ...form, documento: e.target.value })} />
            <Input label="Chave PIX" value={form.pix} onChange={(e) => setForm({ ...form, pix: e.target.value })} />
            <SeletorFuncao value={form.funcao_padrao} onChange={(funcao_padrao) => setForm({ ...form, funcao_padrao })} />
            <Input
              label="Diária (R$)"
              inputMode="decimal"
              value={form.valor_padrao}
              onChange={(e) => setForm({ ...form, valor_padrao: e.target.value })}
            />
            <div className="md:col-span-2">
              <Input label="Observações" value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              />
              Ativo (aparece para escalar)
            </label>
            {erro && <p className="text-sm text-red-600 md:col-span-3">{erro}</p>}
            <div className="md:col-span-3">
              <Button type="submit" className="w-full sm:w-auto">
                {editId ? 'Salvar' : 'Cadastrar'}
              </Button>
            </div>
          </form>
          <div className="mt-5">
            {editId ? (
              <DocumentosFreela freelancerId={editId} docs={docsDe.get(editId) ?? []} />
            ) : (
              <p className="text-sm text-neutral-500">
                Depois de cadastrar, registre o <b>contrato assinado</b> e o <b>ASO</b> — sem os dois ele não pode ser
                escalado.
              </p>
            )}
          </div>
        </Card>
      )}

      {(contagem.nao_aptos > 0 || contagem.vencendo > 0) && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
          {contagem.nao_aptos > 0 && (
            <>🛑 {contagem.nao_aptos} freela(s) ativo(s) sem liberação hoje — aparecem bloqueados na escala. </>
          )}
          {contagem.vencendo > 0 && (
            <>⚠️ {contagem.vencendo} com contrato/ASO vencendo em até {ALERTA_VENCIMENTO_DIAS} dias.</>
          )}
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="w-full sm:max-w-sm">
          <Input placeholder="Buscar por nome ou função" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {FILTROS.map((x) => (
          <Button key={x.key} variant={filtro === x.key ? 'primary' : 'secondary'} onClick={() => setFiltro(x.key)}>
            {x.label}
            {x.key !== 'todos' && contagem[x.key] > 0 && ` (${contagem[x.key]})`}
          </Button>
        ))}
      </div>

      <Card>
        {isLoading ? (
          <p className="text-sm text-neutral-500">Carregando…</p>
        ) : !lista.length ? (
          <EmptyState>{filtro === 'todos' ? 'Nenhum freelancer cadastrado.' : 'Ninguém neste filtro.'}</EmptyState>
        ) : (
          <>
            {/* celular: cartões grandes, o toque abre a edição */}
            <div className="flex flex-col divide-y divide-[var(--pg-border)] md:hidden">
              {lista.map((f) => {
                const s = situacoes.get(f.id)
                return (
                  <button
                    key={f.id}
                    type="button"
                    disabled={!escalar}
                    onClick={() => editar(f)}
                    className={`flex flex-col items-start gap-1.5 py-3 text-left ${f.ativo ? '' : 'opacity-50'}`}
                  >
                    <span className="text-base font-medium">
                      {f.nome}
                      {!f.ativo && <span className="ml-1 text-[11px] text-neutral-400">inativo</span>}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {f.funcao_padrao ?? 'sem função'}
                      {f.valor_padrao != null && ` · ${formatBRL(Number(f.valor_padrao))}`}
                      {f.telefone && ` · ${f.telefone}`}
                    </span>
                    {s && <SeloSituacao s={s} />}
                  </button>
                )
              })}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Nome</Th>
                    <Th>Função</Th>
                    <Th>Situação</Th>
                    <Th>Contato</Th>
                    <Th>Diária</Th>
                    <Th>Histórico</Th>
                    <Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((f) => {
                    const s = stats.get(f.id)
                    const sit = situacoes.get(f.id)
                    const media = s?.notas.length ? s.notas.reduce((a, b) => a + b, 0) / s.notas.length : null
                    return (
                      <tr key={f.id} className={f.ativo ? '' : 'opacity-50'}>
                        <Td>
                          <span className="font-medium">{f.nome}</span>
                          {!f.ativo && <span className="ml-1 text-[11px] text-neutral-400">inativo</span>}
                        </Td>
                        <Td>{f.funcao_padrao ?? '—'}</Td>
                        <Td>{sit && <SeloSituacao s={sit} />}</Td>
                        <Td className="text-xs text-neutral-500">
                          {f.telefone ?? '—'}
                          {f.pix && <div>PIX {f.pix}</div>}
                        </Td>
                        <Td>{f.valor_padrao != null ? formatBRL(Number(f.valor_padrao)) : '—'}</Td>
                        <Td className="text-xs">
                          {s ? (
                            <span className="flex flex-wrap gap-1">
                              <Badge tone="neutral">{s.eventos} evento(s)</Badge>
                              {s.faltas > 0 && <Badge tone="red">{s.faltas} falta(s)</Badge>}
                              {media != null && <Badge tone="green">★ {media.toFixed(1)}</Badge>}
                            </span>
                          ) : (
                            <span className="text-neutral-400">sem eventos</span>
                          )}
                        </Td>
                        <Td className="text-right">
                          {escalar && (
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
          </>
        )}
      </Card>
    </div>
  )
}
