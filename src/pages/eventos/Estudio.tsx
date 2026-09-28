// ============================================================
// 🎨 ESTÚDIO — modo criativo de propostas (SÓ ADMIN/DIREÇÃO)
// Para propostas fora do escopo padrão: itens livres, custo estimado,
// CMV ao vivo, precificação por CMV-alvo. Nada aqui trava — mostra os
// números e deixa a decisão com quem tem alçada. O módulo Propostas
// oficial permanece intocado (esse é o que os externos usam).
// ============================================================

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Td, Th } from '@/components/ui'
import type { Client, EventService, PieggiEvent } from '@/types'
import { formatBRL, formatDiaMes, round2 } from '@/engine'
import { baixarBlob, salvarDocumento } from '@/lib/documentos'

interface LinhaLivre {
  descricao: string
  qtd: number
  custoUnit: number // estimativa de custo (CMV)
  precoUnit: number // preço de venda
}

export default function Estudio() {
  const { id } = useParams()
  const { profile, session } = useAuth()

  const { data: evento } = useQuery({
    queryKey: ['evento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, clients(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PieggiEvent & { clients: Client | null }
    },
  })

  const { data: servicos } = useQuery({
    queryKey: ['servicos', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_services')
        .select('*')
        .eq('event_id', id!)
        .order('dia')
      if (error) throw error
      return data as EventService[]
    },
  })

  const [linhas, setLinhas] = useState<LinhaLivre[]>([
    { descricao: '', qtd: 1, custoUnit: 0, precoUnit: 0 },
  ])
  const [cmvAlvo, setCmvAlvo] = useState(25)
  const [msg, setMsg] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  // carrega rascunho salvo do estúdio
  useEffect(() => {
    if (!id) return
    supabase
      .from('proposals')
      .select('dados')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => {
        const livre = (data ?? []).find(
          (p) => (p.dados as { modo?: string })?.modo === 'estudio'
        )
        const salvas = (livre?.dados as { linhas_livres?: LinhaLivre[] })?.linhas_livres
        if (salvas?.length) setLinhas(salvas)
      })
  }, [id])

  // ---------- guarda de acesso ----------
  if (profile && profile.role !== 'admin') {
    return (
      <div>
        <PageTitle>🎨 Estúdio</PageTitle>
        <Card>
          <EmptyState>
            Acesso restrito à direção (perfil admin). O Estúdio trabalha com CMV e precificação
            aberta — fale com o Bruno para liberar o seu perfil.
          </EmptyState>
        </Card>
      </div>
    )
  }
  if (!evento) return <p className="text-sm text-neutral-500">Carregando…</p>

  // ---------- números ----------
  const custoTotal = round2(linhas.reduce((a, l) => a + l.qtd * l.custoUnit, 0))
  const receitaTotal = round2(linhas.reduce((a, l) => a + l.qtd * l.precoUnit, 0))
  const cmvPct = receitaTotal > 0 ? round2((custoTotal / receitaTotal) * 100) : 0
  const margem = round2(receitaTotal - custoTotal)
  const precoSugeridoTotal = cmvAlvo > 0 ? round2(custoTotal / (cmvAlvo / 100)) : 0

  const corCmv =
    cmvPct === 0
      ? 'text-neutral-400'
      : cmvPct <= 25
        ? 'text-green-700'
        : cmvPct <= 30
          ? 'text-amber-600'
          : 'text-red-600'

  function editar(i: number, campo: keyof LinhaLivre, valor: string) {
    setLinhas((prev) => {
      const novo = [...prev]
      novo[i] = {
        ...novo[i],
        [campo]: campo === 'descricao' ? valor : Number(valor) || 0,
      }
      return novo
    })
  }

  function aplicarCmvAlvo() {
    // reprecifica cada linha para o CMV-alvo mantendo a proporção de custo
    setLinhas((prev) =>
      prev.map((l) => ({
        ...l,
        precoUnit: l.custoUnit > 0 ? round2(l.custoUnit / (cmvAlvo / 100)) : l.precoUnit,
      }))
    )
  }

  async function salvar(): Promise<boolean> {
    setMsg(null)
    const { data: existente } = await supabase
      .from('proposals')
      .select('id, dados')
      .eq('event_id', id!)
      .order('created_at', { ascending: false })
      .limit(5)
    const livre = (existente ?? []).find(
      (p) => (p.dados as { modo?: string })?.modo === 'estudio'
    )
    const payload = {
      event_id: id!,
      preco_total: receitaTotal,
      cmv_status: cmvPct <= 30 ? 'ok' : 'alerta',
      dados: { modo: 'estudio', linhas_livres: linhas, cmv_pct: cmvPct, custo_total: custoTotal },
    }
    const r = livre
      ? await supabase.from('proposals').update(payload).eq('id', livre.id)
      : await supabase.from('proposals').insert({ ...payload, versao: 999 })
    if (r.error) {
      setMsg(`Erro: ${r.error.message}`)
      return false
    }
    await supabase.from('approvals').insert({
      event_id: id!,
      fase: 'estudio',
      user_id: session?.user.id,
      obs: `CMV ${cmvPct}% · receita ${formatBRL(receitaTotal)}`,
    })
    setMsg('✅ Estúdio salvo (registro interno com CMV).')
    return true
  }

  async function gerarPptx() {
    if (!evento) return
    if (!servicos?.length && !linhas.some((l) => l.descricao)) return
    setGerando(true)
    setMsg(null)
    try {
      const dias = Array.from(new Set((servicos ?? []).map((s) => s.dia))).sort()
      const { gerarPropostaPptx } = await import('@/lib/pptx')
      const linhasValidas = linhas.filter((l) => l.descricao && l.precoUnit > 0)
      const blob = await gerarPropostaPptx({
        cliente: evento.clients?.nome ?? evento.nome,
        evento: evento.nome,
        contato: evento.contato ?? '',
        pax: String(evento.pax ?? ''),
        data: dias.length ? formatDiaMes(dias[0]) : '',
        horario: '',
        linhas: linhasValidas.slice(0, 4).map((l) => ({
          descritivo: l.descricao,
          pax: String(l.qtd),
          valor: formatBRL(round2(l.qtd * l.precoUnit)),
        })),
        total: formatBRL(receitaTotal),
        slidesCardapio: [], // proposta enxuta — capas + dados + orçamento
      })
      const nome = `Pieggi Proposta - ${evento.clients?.nome ?? 'Cliente'} - ${evento.nome} - ESTUDIO.pptx`
      baixarBlob(blob, nome)
      await salvarDocumento(evento.id, blob, nome, 'proposta_pptx')
      await salvar()
      setMsg(`✅ Gerado: ${nome} (custo/CMV NUNCA vão no slide — só aqui)`)
    } catch (e) {
      setMsg(`🛑 ${e instanceof Error ? e.message : 'Erro ao gerar.'}`)
    } finally {
      setGerando(false)
    }
  }

  return (
    <div>
      <PageTitle
        actions={
          <Link to={`/eventos/${id}`}>
            <Button variant="secondary">← Voltar ao evento</Button>
          </Link>
        }
      >
        🎨 Estúdio — {evento.nome}
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Badge tone="blue">Modo criativo · acesso direção</Badge>
        <span className="text-xs text-neutral-500">
          Itens livres, fora de catálogo. Nada trava — os números orientam a decisão.
          O módulo Propostas oficial continua rígido para externos.
        </span>
      </div>

      {/* Painel de CMV — o coração do Estúdio */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        <Card>
          <div className="text-2xl font-bold">{formatBRL(custoTotal)}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">Custo (CMV R$)</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold">{formatBRL(receitaTotal)}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">Receita</div>
        </Card>
        <Card>
          <div className={`text-2xl font-bold ${corCmv}`}>{cmvPct}%</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
            CMV (teto casa 30%)
          </div>
        </Card>
        <Card>
          <div className="text-2xl font-bold">{formatBRL(margem)}</div>
          <div className="mt-1 text-xs uppercase tracking-wide text-neutral-500">Margem bruta</div>
        </Card>
        <Card>
          <div className="flex items-end gap-2">
            <Input
              label="CMV alvo %"
              type="number"
              min="1"
              max="99"
              className="!w-20"
              value={cmvAlvo}
              onChange={(e) => setCmvAlvo(Number(e.target.value) || 0)}
            />
            <Button variant="secondary" className="!px-2 !py-1.5 text-xs" onClick={aplicarCmvAlvo}>
              Precificar
            </Button>
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            → receita p/ alvo: <b>{formatBRL(precoSugeridoTotal)}</b>
          </div>
        </Card>
      </div>

      <Card
        title="Composição livre (item · qtd · custo estimado · preço)"
        actions={
          <Button
            variant="secondary"
            onClick={() => setLinhas([...linhas, { descricao: '', qtd: 1, custoUnit: 0, precoUnit: 0 }])}
          >
            + Linha
          </Button>
        }
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Descrição (livre — pode fugir do catálogo)</Th>
              <Th>Qtd</Th>
              <Th>Custo unit (R$)</Th>
              <Th>Preço unit (R$)</Th>
              <Th>CMV linha</Th>
              <Th>Total</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => {
              const cmvLinha = l.precoUnit > 0 ? round2((l.custoUnit / l.precoUnit) * 100) : 0
              return (
                <tr key={i}>
                  <Td>
                    <input
                      className="w-full rounded border border-transparent px-1.5 py-1 text-sm hover:border-neutral-300 focus:border-neutral-900 focus:outline-none"
                      value={l.descricao}
                      placeholder="Ex.: Estação de risotos ao vivo com chef"
                      onChange={(e) => editar(i, 'descricao', e.target.value)}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      className="w-16 rounded border border-neutral-200 px-1.5 py-1 text-sm"
                      value={l.qtd || ''}
                      onChange={(e) => editar(i, 'qtd', e.target.value)}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 rounded border border-neutral-200 px-1.5 py-1 text-sm"
                      value={l.custoUnit || ''}
                      onChange={(e) => editar(i, 'custoUnit', e.target.value)}
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      step="0.01"
                      className="w-24 rounded border border-neutral-200 px-1.5 py-1 text-sm"
                      value={l.precoUnit || ''}
                      onChange={(e) => editar(i, 'precoUnit', e.target.value)}
                    />
                  </Td>
                  <Td>
                    <span
                      className={
                        cmvLinha === 0
                          ? 'text-neutral-300'
                          : cmvLinha <= 30
                            ? 'text-green-700'
                            : 'text-red-600 font-semibold'
                      }
                    >
                      {cmvLinha}%
                    </span>
                  </Td>
                  <Td className="font-medium">{formatBRL(round2(l.qtd * l.precoUnit))}</Td>
                  <Td>
                    <button
                      className="text-neutral-300 hover:text-red-600"
                      onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {msg && <p className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

        <div className="mt-4 flex gap-3">
          <Button variant="secondary" onClick={salvar}>Salvar estudo</Button>
          <Button onClick={gerarPptx} disabled={gerando}>
            {gerando ? 'Gerando…' : 'Gerar .pptx (sem custo/CMV no slide)'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
