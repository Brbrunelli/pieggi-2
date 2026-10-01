// ============================================================
// FUNÇÕES DO BANCO NA DEMONSTRAÇÃO
//
// Versão JS das funções SQL que as telas chamam por rpc() — mesma regra
// (0030 campo, 0032/0033 viagens e endereço), para a demonstração travar
// e liberar nos mesmos pontos que o sistema real.
// ============================================================

import type { Linha, Tabelas } from './banco'
import { RPCS_AREAS } from './cenarios'
import { getSessaoDemoId } from './sessao'

type Args = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const ORDEM = ['expedido', 'montado', 'desmontado', 'encerrado']
const proxima = (atual: string | null) => (atual ? ORDEM[ORDEM.indexOf(atual) + 1] ?? null : 'expedido')
const ddmm = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

function papel(b: Tabelas): string | null {
  return (b.profiles ?? []).find((p) => p.id === getSessaoDemoId())?.role ?? null
}

function pendencias(b: Tabelas, eventId: string, para: string): string[] {
  const out: string[] = []
  const e = (b.events ?? []).find((x) => x.id === eventId)
  if (!e) return ['Evento não encontrado.']
  if (e.pipeline !== 'aprovado') out.push('Contrato não assinado — o evento não pode sair.')
  const servicos = (b.event_services ?? []).filter((s) => s.event_id === eventId)
  const dias = [...new Set(servicos.map((s) => s.dia))].sort()
  const mats = (b.event_materials ?? []).filter((m) => m.event_id === eventId)

  if (para === 'expedido') {
    if (!(b.production_orders ?? []).some((p) => p.event_id === eventId && p.aprovado_em))
      out.push('Produção (comanda) ainda não foi gerada/aprovada.')
    if (!mats.length) out.push('Lista de material não carregada — carregue o previsto da comanda.')
    const n = mats.filter((m) => m.qtd_saida == null).length
    if (n) out.push(`${n} material(is) sem conferência de SAÍDA.`)
  } else if (para === 'desmontado') {
    const n = mats.filter((m) => m.qtd_retorno == null).length
    if (n) out.push(`${n} material(is) sem conferência de RETORNO.`)
    for (const d of dias)
      if (!(b.event_sobras ?? []).some((s) => s.event_id === eventId && s.dia === d))
        out.push(`Termo de sobras de ${ddmm(d)} não registrado (ou marque "não sobrou").`)
  } else if (para === 'encerrado') {
    const n = (b.event_staff ?? []).filter(
      (s) => s.event_id === eventId && ['escalado', 'confirmado'].includes(s.status)
    ).length
    if (n) out.push(`${n} freelancer(s) sem presença registrada (presente/faltou).`)
  }

  const momentos =
    para === 'expedido'
      ? ['saida']
      : para === 'montado'
        ? ['montagem']
        : para === 'desmontado'
          ? ['saida', 'montagem', 'reposicao', 'desmontagem']
          : []
  const diasChecar = ['expedido', 'montado'].includes(para) ? dias.slice(0, 1) : dias
  for (const d of diasChecar) {
    const tipos = servicos.filter((s) => s.dia === d).map((s) => s.service_type)
    for (const t of (b.checklist_templates ?? []).filter(
      (x) => x.ativo && x.obrigatorio && momentos.includes(x.momento)
    )) {
      if (t.service_types?.length && !t.service_types.some((s: string) => tipos.includes(s))) continue
      const c = (b.event_checks ?? []).find((x) => x.event_id === eventId && x.template_id === t.id && x.dia === d)
      if (!c) out.push(`Checklist ${ddmm(d)} — ${t.texto}`)
      else if (t.exige_foto && !c.foto_path) out.push(`Checklist ${ddmm(d)} — ${t.texto} (falta a foto)`)
    }
  }
  return out
}

function evento(b: Tabelas, id: string): Linha {
  const e = (b.events ?? []).find((x) => x.id === id)
  if (!e) throw new Error('Evento não encontrado.')
  return e
}

export const RPCS: Record<string, (a: Args, b: Tabelas) => unknown> = {
  campo_pendencias: (a, b) => pendencias(b, a.p_event, a.p_para),

  campo_avancar: (a, b) => {
    const e = evento(b, a.p_event)
    const para = proxima(e.campo_etapa)
    if (!para) throw new Error('O evento já está encerrado.')
    const falta = pendencias(b, a.p_event, para)
    if (falta.length) throw new Error(`Falta para marcar como ${para}:\n${falta.join('\n')}`)
    e.campo_etapa = para
    e.campo_em = new Date().toISOString()
    return para
  },

  campo_voltar: (a, b) => {
    if (papel(b) !== 'admin') throw new Error('Só o admin volta a fase de campo.')
    const e = evento(b, a.p_event)
    const i = ORDEM.indexOf(e.campo_etapa)
    e.campo_etapa = i > 0 ? ORDEM[i - 1] : null
    return e.campo_etapa
  },

  confirmar_endereco: (a, b) => {
    for (const [campo, nome] of [
      [a.p_endereco, 'endereço'],
      [a.p_local, 'andar/sala'],
      [a.p_acesso, 'como a carga entra'],
      [a.p_com, 'com quem'],
    ])
      if (!String(campo ?? '').trim())
        throw new Error(`Para confirmar o endereço falta: ${nome}.`)
    const e = evento(b, a.p_event)
    Object.assign(e, {
      endereco: a.p_endereco,
      local_detalhe: a.p_local,
      acesso_carga: a.p_acesso,
      endereco_confirmado: true,
      endereco_confirmado_com: a.p_com,
      endereco_confirmado_em: new Date().toISOString(),
      endereco_confirmado_por: getSessaoDemoId(),
    })
    return null
  },

  viagem_marcar: (a, b) => {
    const v = (b.viagens ?? []).find((x) => x.id === a.p_viagem)
    if (!v) throw new Error('Viagem não encontrada.')
    const agora = new Date().toISOString()
    if (a.p_passo === 'saiu') Object.assign(v, { status: 'a_caminho', saiu_em: agora })
    if (a.p_passo === 'chegou')
      Object.assign(v, { status: 'no_local', chegou_em: agora, saiu_em: v.saiu_em ?? agora, chegada_lat: a.p_lat, chegada_lng: a.p_lng })
    if (a.p_passo === 'concluiu') Object.assign(v, { status: 'concluida', concluida_em: agora })
    return v.status
  },

  viagem_reconfirmar: (a, b) => {
    const v = (b.viagens ?? []).find((x) => x.id === a.p_viagem)
    if (!v) throw new Error('Viagem não encontrada.')
    if (v.tipo === 'retirada') {
      const f = (b.fornecedores ?? []).find((x) => x.id === v.fornecedor_id)
      Object.assign(v, { endereco: f?.endereco, local_detalhe: f?.complemento })
      return null
    }
    const e = evento(b, v.event_id)
    const horas = (b.event_services ?? [])
      .filter((s) => s.event_id === v.event_id && s.dia === v.dia)
      .map((s) => (v.tipo === 'entrega' ? s.hora_inicio : s.hora_fim))
      .filter(Boolean)
      .sort()
    Object.assign(v, {
      endereco: e.endereco,
      local_detalhe: e.local_detalhe,
      hora_servico: v.tipo === 'entrega' ? horas[0] : horas[horas.length - 1],
    })
    return null
  },

  ...RPCS_AREAS,
}
