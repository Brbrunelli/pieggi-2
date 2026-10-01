// ============================================================
// VIEWS DA DEMONSTRAÇÃO — o que o banco calcula, calculado aqui
//
// Mesmas regras das views SQL (0022, 0030, 0032/0033): perda de
// material, custo da equipe, título atrasado, conferência da viagem.
// Cada área pode somar as suas (cenarios/<area>.ts → views).
// ============================================================

import type { Linha, Tabelas } from './banco'
import { VIEWS_AREAS } from './cenarios'
import { hojeLocal } from '@/engine/datas'

const hoje = () => hojeLocal()

function regra(b: Tabelas, chave: string, padrao: number): number {
  const r = (b.rule_params ?? []).find((x) => x.chave === chave)
  const v = Number(r?.valor)
  return Number.isFinite(v) ? v : padrao
}

function horaServico(b: Tabelas, eventId: string | null, dia: string, tipo: string): string | null {
  if (!eventId) return null
  const s = (b.event_services ?? []).filter((x) => x.event_id === eventId && x.dia === dia)
  const horas = s.map((x) => (tipo === 'entrega' ? x.hora_inicio : x.hora_fim)).filter(Boolean).sort()
  return (tipo === 'entrega' ? horas[0] : horas[horas.length - 1]) ?? null
}

function minutos(t: string | null): number | null {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export const VIEWS: Record<string, (b: Tabelas) => Linha[]> = {
  event_materials_conferencia: (b) =>
    (b.event_materials ?? []).map((em) => {
      const m = (b.materials ?? []).find((x) => x.id === em.material_id)
      const perda =
        em.qtd_retorno == null
          ? null
          : Math.max(Number(em.qtd_saida ?? 0) - Number(em.qtd_retorno) - Number(em.qtd_quebra ?? 0), 0)
      const custo = m?.custo_reposicao ?? null
      return {
        ...em,
        custo_reposicao: custo,
        qtd_perda: perda,
        prejuizo: perda == null || custo == null ? null : (perda + Number(em.qtd_quebra ?? 0)) * Number(custo),
      }
    }),

  event_staff_custo: (b) => {
    const porEvento = new Map<string, Linha[]>()
    for (const s of b.event_staff ?? []) porEvento.set(s.event_id, [...(porEvento.get(s.event_id) ?? []), s])
    return [...porEvento.entries()].map(([event_id, lista]) => {
      const ativos = lista.filter((s) => ['escalado', 'confirmado', 'presente'].includes(s.status))
      const e = (b.events ?? []).find((x) => x.id === event_id)
      return {
        event_id,
        custo: ativos.reduce((t, s) => t + Number(s.valor ?? 0), 0),
        pessoas: ativos.length,
        verba: e?.orcamento_valor ? Math.round(e.orcamento_valor * regra(b, 'verba_pct', 8)) / 100 : null,
      }
    })
  },

  receivables_abertos: (b) =>
    (b.receivables ?? [])
      .filter((r) => r.status !== 'cancelado')
      .map((r) => {
        const dias = Math.round((new Date(r.vencimento).getTime() - new Date(hoje()).getTime()) / 86400000)
        return { ...r, atrasado: r.status === 'a_receber' && r.vencimento < hoje(), dias_ate_vencer: dias }
      }),

  viagens_conferencia: (b) =>
    (b.viagens ?? []).map((v) => {
      const e = (b.events ?? []).find((x) => x.id === v.event_id)
      const c = e ? (b.clients ?? []).find((x) => x.id === e.client_id) : null
      const f = (b.fornecedores ?? []).find((x) => x.id === v.fornecedor_id)
      const p = (b.profiles ?? []).find((x) => x.id === v.motorista_id)
      const hora = horaServico(b, v.event_id, v.dia, v.tipo)
      const ret = v.tipo === 'retirada'
      const minAntes = regra(b, 'chegada_min_antes', 60)
      return {
        ...v,
        evento_nome: ret ? `Retirada — ${f?.nome ?? ''}` : e?.nome,
        cliente: ret ? f?.nome : (c?.nome ?? e?.cliente_nome),
        pax: e?.pax ?? null,
        endereco_atual: ret ? f?.endereco : e?.endereco,
        local_atual: ret ? f?.complemento : e?.local_detalhe,
        acesso_atual: ret ? f?.obs : e?.acesso_carga,
        endereco_confirmado: ret ? Boolean(f?.endereco) : Boolean(e?.endereco_confirmado),
        fornecedor_nome: f?.nome ?? null,
        fornecedor_horario: f?.horario ?? null,
        hora_servico_atual: hora,
        motorista_nome: p?.nome ?? null,
        endereco_mudou: ret
          ? v.endereco !== f?.endereco
          : v.endereco !== e?.endereco || (v.local_detalhe ?? null) !== (e?.local_detalhe ?? null),
        horario_mudou: !ret && (v.hora_servico ?? null) !== hora,
        chegada_apertada:
          v.tipo === 'entrega' && hora != null && v.chegada_prevista != null
            ? minutos(v.chegada_prevista)! > minutos(hora)! - minAntes
            : false,
        saida_depois_do_servico: v.tipo === 'entrega' && hora != null ? v.saida_prevista >= hora : false,
        itens: v.itens ?? [],
      }
    }),

  ...VIEWS_AREAS,
}
