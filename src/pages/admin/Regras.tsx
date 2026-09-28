import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, PageTitle, Select, Textarea } from '@/components/ui'
import type { RuleParam } from '@/types'

/**
 * Parâmetros de regra do negócio (fatores, gramaturas, %, conversões).
 * Toda alteração fica registrada em rule_params_history.
 */
export default function Regras() {
  const qc = useQueryClient()
  const [filtro, setFiltro] = useState('')
  const [editando, setEditando] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin-regras'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rule_params')
        .select('*')
        .order('categoria')
        .order('chave')
      if (error) throw error
      return data as RuleParam[]
    },
  })

  const categorias = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.categoria))).sort(),
    [data]
  )

  const filtradas = (data ?? []).filter((r) => !filtro || r.categoria === filtro)

  function abrirEdicao(r: RuleParam) {
    setEditando(r.chave)
    setTexto(JSON.stringify(r.valor, null, 2))
    setErro(null)
  }

  async function salvar(chave: string) {
    setErro(null)
    let valor: unknown
    try {
      valor = JSON.parse(texto)
    } catch {
      return setErro('JSON inválido — corrija antes de salvar.')
    }
    const { error } = await supabase.from('rule_params').update({ valor }).eq('chave', chave)
    if (error) return setErro(error.message)
    setEditando(null)
    await qc.invalidateQueries({ queryKey: ['admin-regras'] })
  }

  return (
    <div>
      <PageTitle>Parâmetros de regra</PageTitle>

      <p className="mb-4 text-sm text-neutral-500">
        Fatores, gramaturas e percentuais usados pelo motor de cálculo (rev. 27/07/2026).
        Quando uma regra do negócio mudar, edite aqui — toda alteração fica no histórico.
      </p>

      <div className="mb-4">
        <Select className="!w-64" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : (
        <div className="space-y-4">
          {filtradas.map((r) => (
            <Card
              key={r.chave}
              title={
                <span>
                  <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs">{r.chave}</code>{' '}
                  <Badge tone="blue">{r.categoria}</Badge>
                </span>
              }
              actions={
                editando === r.chave ? (
                  <div className="flex gap-2">
                    <Button onClick={() => salvar(r.chave)}>Salvar</Button>
                    <Button variant="secondary" onClick={() => setEditando(null)}>Cancelar</Button>
                  </div>
                ) : (
                  <Button variant="secondary" onClick={() => abrirEdicao(r)}>Editar</Button>
                )
              }
            >
              {r.descricao && <p className="mb-3 text-sm text-neutral-600">{r.descricao}</p>}
              {editando === r.chave ? (
                <>
                  <Textarea
                    rows={Math.min(16, texto.split('\n').length + 1)}
                    className="font-mono !text-xs"
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                  />
                  {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
                </>
              ) : (
                <pre className="overflow-x-auto rounded-lg bg-neutral-50 p-3 text-xs text-neutral-700">
                  {JSON.stringify(r.valor, null, 2)}
                </pre>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
