// ============================================================
// CONFERÊNCIA DE MATERIAL — saída e retorno
//
// O caso da call: 50 copos de vidro saem, ninguém conta na volta, e a
// quebra só aparece quando falta copo no evento seguinte. Aqui cada
// material retornável tem três números — previsto (da comanda), saiu
// (expedição conta ao carregar) e voltou (rua conta ao descarregar) —
// e a perda é a diferença, calculada pela view, nunca digitada.
// ============================================================

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, Select } from '@/components/ui'
import { formatBRL } from '@/engine'
import { divergenciaSaida, perdaDe, previstoDaComanda, type LinhaEstruturaComanda } from '@/engine/campo'
import {
  SETOR_LABEL,
  type CampoEtapa,
  type EventMaterial,
  type Material,
  type SetorExpedicao,
} from '@/types'
import { invalidarCampo } from './EtapasCampo'

type Modo = 'saida' | 'retorno'

const SETORES: SetorExpedicao[] = ['alimentacao', 'bebidas', 'estrutura']

/** "" vira null (campo apagado = ainda não conferido), número vira número */
function numOuNull(v: string): number | null {
  const t = v.trim().replace(',', '.')
  return t === '' ? null : Number(t)
}

export default function Materiais({ eventId, etapa }: { eventId: string; etapa: CampoEtapa | null }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { conferirCampo, ehAdmin } = usePermissoes()
  // antes de sair, o trabalho é a saída; depois, o retorno
  const [modo, setModo] = useState<Modo>(etapa ? 'retorno' : 'saida')
  const [msg, setMsg] = useState<string | null>(null)
  const [novo, setNovo] = useState({ material_id: '', descricao: '', qtd: '' })

  const { data: linhas, isLoading } = useQuery({
    queryKey: ['campo-materiais', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_materials_conferencia')
        .select('*')
        .eq('event_id', eventId)
        .order('ordem')
      if (error) throw error
      return data as EventMaterial[]
    },
  })

  const { data: cadastro } = useQuery({
    queryKey: ['materiais-cadastro'],
    queryFn: async () => {
      const { data, error } = await supabase.from('materials').select('*').order('ordem')
      if (error) throw error
      return data as Material[]
    },
  })

  async function atualizar() {
    await qc.invalidateQueries({ queryKey: ['campo-materiais', eventId] })
    await invalidarCampo(qc, eventId)
  }

  // ---------- previsto da comanda aprovada ----------
  const carregar = useMutation({
    mutationFn: async () => {
      const { data: po, error } = await supabase
        .from('production_orders')
        .select('snapshot, aprovado_em')
        .eq('event_id', eventId)
        .not('aprovado_em', 'is', null)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!po) throw new Error('A Produção ainda não foi gerada — sem comanda não há previsto.')

      const estrutura = ((po.snapshot as { bebidasEstrutura?: LinhaEstruturaComanda[] })
        ?.bebidasEstrutura ?? []) as LinhaEstruturaComanda[]
      const previstos = previstoDaComanda(estrutura, cadastro ?? [])
      if (!previstos.length) throw new Error('Nenhuma linha da comanda casou com o cadastro de materiais.')

      // re-carregar não duplica: atualiza o previsto de quem já existe
      const existentes = new Map((linhas ?? []).map((l) => [l.material_id, l]))
      for (const p of previstos) {
        const atual = existentes.get(p.material.id)
        const r = atual
          ? await supabase.from('event_materials').update({ qtd_prevista: p.qtd }).eq('id', atual.id)
          : await supabase.from('event_materials').insert({
              event_id: eventId,
              material_id: p.material.id,
              descricao: p.material.nome,
              setor: p.material.setor,
              unidade: p.material.unidade,
              qtd_prevista: p.qtd,
              ordem: p.material.ordem,
            })
        if (r.error) throw r.error
      }
      return previstos.length
    },
    onSuccess: async (n) => {
      setMsg(`✅ Previsto carregado da comanda: ${n} material(is).`)
      await atualizar()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  // ---------- item fora da comanda (ex.: pedido especial do cliente) ----------
  const adicionar = useMutation({
    mutationFn: async () => {
      const mat = cadastro?.find((m) => m.id === novo.material_id)
      const descricao = mat?.nome ?? novo.descricao.trim()
      if (!descricao) throw new Error('Escolha um material ou escreva o nome.')
      const { error } = await supabase.from('event_materials').insert({
        event_id: eventId,
        material_id: mat?.id ?? null,
        descricao,
        setor: mat?.setor ?? 'estrutura',
        unidade: mat?.unidade ?? 'un',
        qtd_prevista: numOuNull(novo.qtd),
        ordem: 999,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setNovo({ material_id: '', descricao: '', qtd: '' })
      setMsg(null)
      await atualizar()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const salvar = useMutation({
    mutationFn: async ({ id, campos }: { id: string; campos: Partial<EventMaterial> }) => {
      const carimbo =
        modo === 'saida'
          ? { saida_por: session?.user.id, saida_em: new Date().toISOString() }
          : { retorno_por: session?.user.id, retorno_em: new Date().toISOString() }
      const { error } = await supabase
        .from('event_materials')
        .update({ ...campos, ...carimbo })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: atualizar,
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const porSetor = useMemo(() => {
    const m = new Map<SetorExpedicao, EventMaterial[]>()
    for (const l of linhas ?? []) m.set(l.setor, [...(m.get(l.setor) ?? []), l])
    return m
  }, [linhas])

  const total = linhas?.length ?? 0
  const conferidos = (linhas ?? []).filter((l) =>
    modo === 'saida' ? l.qtd_saida != null : l.qtd_retorno != null
  ).length
  const prejuizo = (linhas ?? []).reduce((s, l) => s + Number(l.prejuizo ?? 0), 0)
  const semCusto = (linhas ?? []).some(
    (l) => (perdaDe(l) ?? 0) + Number(l.qtd_quebra) > 0 && l.custo_reposicao == null
  )

  // saída trava quando o carro saiu; retorno só abre depois que saiu
  const editaSaida = conferirCampo && (!etapa || ehAdmin)
  const editaRetorno = conferirCampo && Boolean(etapa) && etapa !== 'encerrado'

  return (
    <Card
      title="Material"
      actions={
        <Badge tone={total && conferidos === total ? 'green' : conferidos ? 'amber' : 'neutral'}>
          {conferidos}/{total} conferido
        </Badge>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-full border border-[var(--pg-border)] p-0.5">
          {(['saida', 'retorno'] as Modo[]).map((m) => (
            <button
              key={m}
              onClick={() => setModo(m)}
              className={`rounded-full px-4 py-1.5 text-[11px] font-semibold tracking-[0.1em] ${
                modo === m ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]' : 'text-neutral-500'
              }`}
            >
              {m === 'saida' ? 'SAÍDA' : 'RETORNO'}
            </button>
          ))}
        </div>
        {conferirCampo && (
          <Button
            variant="secondary"
            className="!px-3 !py-1.5"
            disabled={carregar.isPending || !cadastro}
            onClick={() => carregar.mutate()}
          >
            {carregar.isPending ? 'Carregando…' : total ? '↻ Atualizar previsto' : 'Carregar previsto da comanda'}
          </Button>
        )}
      </div>

      {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {modo === 'retorno' && !etapa && (
        <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          O retorno abre depois que o evento for marcado como expedido.
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !total ? (
        <EmptyState>
          Nenhum material ainda. Carregue o previsto da comanda — copos, pratos, réchauds e caixas
          saem com a quantidade que a comanda calculou.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-5">
          {SETORES.filter((s) => porSetor.has(s)).map((setor) => (
            <div key={setor}>
              <div className="pg-key mb-2">{SETOR_LABEL[setor]}</div>
              <div className="flex flex-col divide-y divide-[var(--pg-border)]">
                {porSetor.get(setor)!.map((l) => (
                  <LinhaMaterial
                    key={l.id}
                    l={l}
                    modo={modo}
                    edita={modo === 'saida' ? editaSaida : editaRetorno}
                    onSalvar={(campos) => salvar.mutate({ id: l.id, campos })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modo === 'retorno' && total > 0 && (
        <div className="mt-4 rounded-lg border border-[var(--pg-border)] px-3 py-2 text-sm">
          Prejuízo de material neste evento:{' '}
          <b className={prejuizo > 0 ? 'text-red-700' : ''}>{formatBRL(prejuizo)}</b>
          {semCusto && (
            <span className="ml-1 text-xs text-amber-700">
              (há perda em material sem custo de reposição — preencha em Administração → Materiais)
            </span>
          )}
        </div>
      )}

      {conferirCampo && (
        <div className="mt-5 grid grid-cols-1 gap-2 border-t border-[var(--pg-border)] pt-4 sm:grid-cols-[1fr_1fr_100px_auto] sm:items-end">
          <Select
            label="Adicionar material"
            value={novo.material_id}
            onChange={(e) => setNovo({ ...novo, material_id: e.target.value })}
          >
            <option value="">— fora do cadastro —</option>
            {(cadastro ?? [])
              .filter((m) => m.ativo)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
          </Select>
          <Input
            label="ou nome livre"
            value={novo.descricao}
            disabled={Boolean(novo.material_id)}
            onChange={(e) => setNovo({ ...novo, descricao: e.target.value })}
          />
          <Input
            label="Previsto"
            inputMode="decimal"
            value={novo.qtd}
            onChange={(e) => setNovo({ ...novo, qtd: e.target.value })}
          />
          <Button variant="secondary" disabled={adicionar.isPending} onClick={() => adicionar.mutate()}>
            Adicionar
          </Button>
        </div>
      )}
    </Card>
  )
}

function LinhaMaterial({
  l,
  modo,
  edita,
  onSalvar,
}: {
  l: EventMaterial
  modo: Modo
  edita: boolean
  onSalvar: (campos: Partial<EventMaterial>) => void
}) {
  const div = divergenciaSaida(l)
  const perda = perdaDe(l)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
      <div className="min-w-[160px] flex-1">
        <div className="text-sm font-medium">{l.descricao}</div>
        <div className="text-[11px] text-neutral-500">
          previsto {l.qtd_prevista ?? '—'} {l.unidade}
          {l.qtd_saida != null && modo === 'retorno' && ` · saiu ${l.qtd_saida}`}
        </div>
      </div>

      {modo === 'saida' ? (
        <div className="flex items-center gap-2">
          <CampoNumero
            rotulo="saiu"
            valor={l.qtd_saida}
            edita={edita}
            onSalvar={(v) => onSalvar({ qtd_saida: v })}
          />
          {edita && l.qtd_saida == null && l.qtd_prevista != null && (
            <Button
              variant="ghost"
              className="!px-2 !py-1"
              title="Contou e bateu com o previsto"
              onClick={() => onSalvar({ qtd_saida: l.qtd_prevista })}
            >
              ✓ bateu
            </Button>
          )}
          {div != null && div !== 0 && (
            <Badge tone="amber">
              {div > 0 ? '+' : ''}
              {div} vs previsto
            </Badge>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <CampoNumero
            rotulo="voltou"
            valor={l.qtd_retorno}
            edita={edita}
            onSalvar={(v) => onSalvar({ qtd_retorno: v })}
          />
          <CampoNumero
            rotulo="quebrou"
            valor={l.qtd_quebra}
            edita={edita}
            onSalvar={(v) => onSalvar({ qtd_quebra: v ?? 0 })}
          />
          {edita && l.qtd_retorno == null && l.qtd_saida != null && (
            <Button
              variant="ghost"
              className="!px-2 !py-1"
              title="Voltou tudo que saiu"
              onClick={() => onSalvar({ qtd_retorno: l.qtd_saida, qtd_quebra: 0 })}
            >
              ✓ voltou tudo
            </Button>
          )}
          {perda != null &&
            (perda + Number(l.qtd_quebra) > 0 ? (
              <Badge tone="red">
                {perda > 0 ? `${perda} sumiu` : ''}
                {perda > 0 && Number(l.qtd_quebra) > 0 ? ' · ' : ''}
                {Number(l.qtd_quebra) > 0 ? `${l.qtd_quebra} quebrou` : ''}
              </Badge>
            ) : (
              <Badge tone="green">ok</Badge>
            ))}
        </div>
      )}
    </div>
  )
}

/** Número que salva ao sair do campo — conferir no celular é digitar e seguir. */
function CampoNumero({
  rotulo,
  valor,
  edita,
  onSalvar,
}: {
  rotulo: string
  valor: number | null
  edita: boolean
  onSalvar: (v: number | null) => void
}) {
  const [texto, setTexto] = useState(valor == null ? '' : String(valor))
  const [ultimo, setUltimo] = useState(valor)
  // o valor mudou no servidor (botão "bateu", outro aparelho): acompanha
  if (valor !== ultimo) {
    setUltimo(valor)
    setTexto(valor == null ? '' : String(valor))
  }
  return (
    <label className="flex items-center gap-1.5 text-[11px] text-neutral-500">
      {rotulo}
      <input
        className="w-20 rounded-lg border border-[var(--pg-border)] bg-transparent px-2 py-1.5 text-right text-sm text-[var(--pg-text)] disabled:opacity-60"
        inputMode="decimal"
        disabled={!edita}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          const v = numOuNull(texto)
          if (v !== valor && !(v != null && Number.isNaN(v))) onSalvar(v)
        }}
      />
    </label>
  )
}
