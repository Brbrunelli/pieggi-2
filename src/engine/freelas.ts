// ============================================================
// FREELAS — quem pode ir para a rua (regra pura, sem React nem banco)
//
// Bruno: "todo freela tem que ter contrato assinado + ASO (liberação pra
// trabalhar com comida)". A regra é por DIA, não por hoje: o ASO pode
// estar válido agora e vencer antes do evento de daqui a 3 semanas — a
// escala daquele dia já precisa travar.
//
//   APTO no dia D  ⇔  contrato ASSINADO, vigente em D (validade nula =
//                     indeterminado)  E  ASO com validade ≥ D.
//
// Alerta "vence em ≤ 30 dias" para a Adriana renovar antes de travar.
// A mesma regra está no banco (freelancer_motivo_inapto, 0037), que é
// quem de fato bloqueia o insert em event_staff.
//
// situacaoFreela e rotuloSituacao são API ESTÁVEL: a expedição usa as
// duas para marcar em vermelho a copeira sem ASO no checklist.
//
// Aqui também: conflito de escala (o mesmo freela em dois eventos no
// mesmo dia) e a mensagem de convite pelo WhatsApp.
// ============================================================

import type { DocVencendo, FreelancerDocumento, SituacaoFreela } from '@/tipos/pessoas'
import { horarioSaida } from './roteamento'

/** alerta de vencimento: dias de antecedência */
export const ALERTA_VENCIMENTO_DIAS = 30

/** só a parte da data (aceita timestamp) */
const soData = (s: string) => s.slice(0, 10)

/** dias de `de` até `ate` (datas ISO) — positivo se `ate` é depois */
export function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10))
  return Math.round((b - a) / 86400000)
}

const ddmm = (iso: string) => soData(iso).split('-').reverse().slice(0, 2).join('/')

/** o documento que mais tempo cobre — validade nula (indeterminado) ganha */
function melhor(docs: FreelancerDocumento[]): FreelancerDocumento | null {
  return (
    [...docs].sort((a, b) => {
      if (a.validade == null) return -1
      if (b.validade == null) return 1
      return b.validade.localeCompare(a.validade)
    })[0] ?? null
  )
}

export function situacaoFreela(docs: FreelancerDocumento[], dia: string): SituacaoFreela {
  const d = soData(dia)
  const motivos: string[] = []
  const vencendo: DocVencendo[] = []

  // ---------- contrato ----------
  const contratos = docs.filter((x) => x.tipo === 'contrato')
  const assinados = contratos.filter((x) => x.assinado_em && soData(x.assinado_em) <= d)
  const vigentes = assinados.filter(
    (x) => (!x.emitido_em || soData(x.emitido_em) <= d) && (x.validade == null || soData(x.validade) >= d)
  )
  if (!contratos.length) motivos.push('sem contrato')
  else if (!assinados.length) {
    const futuro = contratos.find((x) => x.assinado_em && soData(x.assinado_em) > d)
    motivos.push(futuro ? `contrato assinado só em ${ddmm(futuro.assinado_em!)}` : 'contrato não assinado')
  } else if (!vigentes.length) {
    const ultimo = melhor(assinados)!
    motivos.push(
      ultimo.validade && soData(ultimo.validade) < d
        ? `contrato vencido em ${ddmm(ultimo.validade)}`
        : `contrato só vale a partir de ${ddmm(ultimo.emitido_em!)}`
    )
  } else {
    const c = melhor(vigentes)!
    if (c.validade) {
      const n = diasEntre(d, c.validade)
      if (n <= ALERTA_VENCIMENTO_DIAS) vencendo.push({ tipo: 'contrato', dias: n })
    }
  }

  // ---------- ASO ----------
  const asos = docs.filter((x) => x.tipo === 'aso')
  const comValidade = asos.filter((x) => x.validade)
  const validos = comValidade.filter(
    (x) => soData(x.validade!) >= d && (!x.emitido_em || soData(x.emitido_em) <= d)
  )
  if (!asos.length) motivos.push('sem ASO')
  else if (!comValidade.length) motivos.push('ASO sem validade informada')
  else if (!validos.length) {
    const ultimo = melhor(comValidade)!
    motivos.push(
      soData(ultimo.validade!) < d
        ? `ASO vencido em ${ddmm(ultimo.validade!)}`
        : `ASO só vale a partir de ${ddmm(ultimo.emitido_em!)}`
    )
  } else {
    const a = melhor(validos)!
    const n = diasEntre(d, a.validade!)
    if (n <= ALERTA_VENCIMENTO_DIAS) vencendo.push({ tipo: 'aso', dias: n })
  }

  return { apto: motivos.length === 0, motivos, vencendo }
}

/** Rótulo curto para a coluna/selo: "Apto", "ASO vencido…", "ASO vence em 12 dias". */
export function rotuloSituacao(s: SituacaoFreela): { texto: string; tom: 'green' | 'amber' | 'red' } {
  if (!s.apto) return { texto: s.motivos.join(' · '), tom: 'red' }
  if (s.vencendo.length) {
    const v = [...s.vencendo].sort((a, b) => a.dias - b.dias)[0]
    const nome = v.tipo === 'aso' ? 'ASO' : 'contrato'
    return {
      texto: v.dias === 0 ? `${nome} vence hoje` : `${nome} vence em ${v.dias} dia${v.dias === 1 ? '' : 's'}`,
      tom: 'amber',
    }
  }
  return { texto: 'Apto', tom: 'green' }
}

// ---------- conflito de escala ----------

/** status que ocupam o freela no dia (cancelado e faltou liberam) */
export const STATUS_OCUPA = ['escalado', 'confirmado', 'presente']

export interface EscaladoDia {
  id?: string
  event_id: string
  freelancer_id: string | null
  dia: string
  status: string
  evento_nome?: string | null
}

/**
 * Onde o freela já está naquele dia — null se está livre.
 * `ignorarId`: a própria linha, quando é edição.
 */
export function conflitoEscala(
  escalados: EscaladoDia[],
  freelancerId: string,
  dia: string,
  ignorarId?: string
): EscaladoDia | null {
  return (
    escalados.find(
      (s) =>
        s.freelancer_id === freelancerId &&
        soData(s.dia) === soData(dia) &&
        STATUS_OCUPA.includes(s.status) &&
        s.id !== ignorarId
    ) ?? null
  )
}

// ---------- convite pelo WhatsApp ----------

export function mensagemConvite(p: {
  nome: string
  evento: string
  dia: string
  funcao: string | null
  horarioSaida: string | null
  endereco: string | null
  localDetalhe?: string | null
}): string {
  const semana = new Date(soData(p.dia) + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long' })
  const linhas = [
    `Oi ${p.nome.split(' ')[0]}! Aqui é da Pieggi.`,
    `Temos trabalho para você${p.funcao ? ` como ${p.funcao}` : ''}:`,
    `• Evento: ${p.evento}`,
    `• Dia: ${semana}, ${ddmm(p.dia)}`,
    p.horarioSaida ? `• Saída da Pieggi: ${p.horarioSaida.slice(0, 5)}` : null,
    p.endereco ? `• Local: ${p.endereco}${p.localDetalhe ? ` — ${p.localDetalhe}` : ''}` : null,
    'Uniforme, touca e luvas. Pode confirmar?',
  ]
  return linhas.filter(Boolean).join('\n')
}

/** link wa.me — telefone brasileiro sem DDI ganha o 55 */
export function linkWhatsApp(telefone: string | null, mensagem: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return null
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

// ---------- funções (lista fixa) ----------
//
// Vaga e escalado se casam pela FUNÇÃO. Texto livre não fecha: "garçons"
// virava "garcon" e nunca casava com "garcom" — a vaga ficava vermelha
// para sempre. As telas (Escala, Equipe, Freelancers) escolhem de uma
// lista fixa e gravam a chave canônica; o normalizador abaixo continua
// valendo para o que já foi digitado à mão (dados antigos).

export const FUNCOES = ['copeira', 'garçom', 'maître', 'ajudante de carga', 'motorista', 'cozinheiro', 'bartender'] as const
export type Funcao = (typeof FUNCOES)[number]

/** sem acento, minúsculo, cada palavra no singular ("garçons" → "garcom") */
export function normalizarFuncao(s: string | null): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      if (w.length <= 3) return w // "de", "da"
      if (w.endsWith('oes') || w.endsWith('aes')) return w.slice(0, -3) + 'ao'
      if (w.endsWith('ns')) return w.slice(0, -2) + 'm'
      if (w.endsWith('eis')) return w.slice(0, -3) + 'el'
      if (w.endsWith('s')) return w.slice(0, -1)
      return w
    })
    .join(' ')
}

/** apelidos que viram a mesma função */
const APELIDOS: Record<string, Funcao> = {
  copeiro: 'copeira',
  garconete: 'garçom',
  ajudante: 'ajudante de carga',
  carregador: 'ajudante de carga',
  cozinheira: 'cozinheiro',
  barman: 'bartender',
}

/** a chave da lista, ou null se não é nenhuma conhecida */
export function funcaoCanonica(s: string | null): Funcao | null {
  const n = normalizarFuncao(s)
  if (!n) return null
  return FUNCOES.find((f) => normalizarFuncao(f) === n) ?? APELIDOS[n] ?? null
}

/** "Garçons" ≈ "garçom" ≈ "garçonete"; "ajudantes de carga" ≈ "ajudante de carga" */
export function mesmaFuncao(a: string | null, b: string | null): boolean {
  const ca = funcaoCanonica(a)
  const cb = funcaoCanonica(b)
  if (ca && cb) return ca === cb
  const na = normalizarFuncao(a)
  return na !== '' && na === normalizarFuncao(b)
}

// ---------- vaga: preenchida, com pendência ou aberta ----------
//
// Escalado sem liberação NÃO preenche vaga: a Rafaela sem contrato no IA
// de amanhã ocupa o lugar, mas não pode ir. Ela conta como PENDÊNCIA
// (âmbar — trocar), e a vaga só fica verde com gente apta. Nome livre
// (sem cadastro) também é pendência: ninguém verificou contrato nem ASO.

export interface ContagemVaga {
  preenchidas: number
  pendentes: number
  abertas: number
  tom: 'green' | 'amber' | 'red'
}

export function contarVaga(
  quantidade: number,
  ocupantes: { status: string; freelancer_id: string | null; dia: string }[],
  apto: (freelancerId: string, dia: string) => boolean
): ContagemVaga {
  const ativos = ocupantes.filter((s) => STATUS_OCUPA.includes(s.status))
  const ok = ativos.filter((s) => s.freelancer_id && apto(s.freelancer_id, s.dia)).length
  const preenchidas = Math.min(ok, quantidade)
  const pendentes = Math.max(Math.min(ativos.length - ok, quantidade - preenchidas), 0)
  const abertas = Math.max(quantidade - preenchidas - pendentes, 0)
  return { preenchidas, pendentes, abertas, tom: abertas ? 'red' : pendentes ? 'amber' : 'green' }
}

// ---------- horário de saída: o mesmo da expedição ----------
//
// A saída oficial é a da comanda aprovada (production_orders.snapshot,
// dias[].saida) — é a que a expedição usa e pode ter sido ajustada
// (trânsito, montagem longa). Convite e vaga leem dali; "servir − 3h" é
// só o recuo, e vem da MESMA função da comanda (horarioSaida).

/** "05h00 (servir −3h…)" / "05:00" / "5h" → "05:00"; null se não há hora */
export function horaDeTexto(s: string | null | undefined): string | null {
  const m = (s ?? '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?/i)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2] ?? '0')
  if (h > 23 || min > 59) return null
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

export interface SaidaOficial {
  hora: string | null
  fonte: 'comanda' | 'calculada' | null
}

/** saída do dia na comanda aprovada; recuo: servir − 3h (horarioSaida da comanda) */
export function saidaOficial(
  snapshot: { dias?: { diaISO: string; saida: string }[] } | null | undefined,
  dia: string,
  horaServico: string | null
): SaidaOficial {
  const daComanda = horaDeTexto(snapshot?.dias?.find((d) => d.diaISO === soData(dia))?.saida)
  if (daComanda) return { hora: daComanda, fonte: 'comanda' }
  const calc = horaServico ? horaDeTexto(horarioSaida(horaServico)) : null
  return calc ? { hora: calc, fonte: 'calculada' } : { hora: null, fonte: null }
}

// ---------- hoje, no fuso de São Paulo ----------
//
// toISOString() é UTC: depois das 21h em SP o "hoje" já seria amanhã —
// e a escala é feita justamente à noite.
export function hojeLocal(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}
