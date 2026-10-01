// ============================================================
// CRM — todo cliente novo entra no cadastro sozinho
//
// Bruno: "quando um novo cliente entra ele automaticamente é cadastrado
// no CRM". Antes, evento de cliente novo guardava só o nome digitado
// (events.cliente_nome) e o cliente nunca virava cadastro — sumia do
// histórico, do NPS e da receita.
//
// garantirClienteNoCRM() é a porta única: acha o cliente pelo nome
// NORMALIZADO (sem acento, sem caixa, espaços colapsados — "Lúmen
// arquitetura " = "Lumen Arquitetura") ou cria, marcado
// criado_automaticamente. Quem chama: novo evento (EventoForm), evento
// criado do briefing e o botão "cadastrar todos" do CRM. O banco tem a
// mesma rede de segurança (trigger em events, 0037).
//
// Por que via rpc: clients só aceita escrita do admin (0001) — a função
// garantir_cliente_crm (security definer) deixa o comercial cadastrar
// SÓ por este caminho. Sem a 0037 aplicada, cai para o insert direto.
//
// As contas do CRM (status, receita, ticket, NPS) também moram aqui,
// puras, para serem testáveis sem tela.
// ============================================================

import { supabase } from './supabase'
import type { ClienteCRM, EventoCRM, OrigemCliente, StatusCRM } from '@/tipos/pessoas'
import { isoLocal } from '@/engine/datas'

/** "  Lúmen   ARQUITETURA " → "lumen arquitetura" */
export function normalizarNome(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export interface NovoClienteCRM {
  nome: string
  contato?: string | null
  telefone?: string | null
  email?: string | null
  origem: OrigemCliente
}

/** Acha o cliente pelo nome ou cria — devolve o id. */
export async function garantirClienteNoCRM(c: NovoClienteCRM): Promise<string> {
  const nome = c.nome.replace(/\s+/g, ' ').trim()
  if (!nome) throw new Error('Cliente sem nome — não dá para cadastrar no CRM.')

  // 1. caminho oficial: função do banco (0037)
  const r = await supabase.rpc('garantir_cliente_crm', {
    p_nome: nome,
    p_contato: c.contato || null,
    p_telefone: c.telefone || null,
    p_email: c.email || null,
    p_origem: c.origem,
  })
  if (!r.error && typeof r.data === 'string' && r.data) return r.data

  // 2. sem a 0037: procura e insere direto (só o admin passa na RLS)
  const { data: lista, error } = await supabase.from('clients').select('id, nome')
  if (error) throw error
  const alvo = normalizarNome(nome)
  const achado = (lista as { id: string; nome: string }[]).find((x) => normalizarNome(x.nome) === alvo)
  if (achado) return achado.id

  const base = { nome, tipo: 'externo', ativo: true, telefone: c.telefone || null, email: c.email || null }
  const completo = { ...base, contato: c.contato || null, origem: c.origem, criado_automaticamente: true }
  let ins = await supabase.from('clients').insert(completo).select('id').single()
  // colunas da 0037 ainda não existem: grava o básico
  if (ins.error && /column|coluna|schema cache/i.test(ins.error.message))
    ins = await supabase.from('clients').insert(base).select('id').single()
  if (ins.error) throw ins.error
  return (ins.data as { id: string }).id
}

// ---------- contas do CRM (puras) ----------

/** janela que separa ativo de inativo */
export const DIAS_ATIVO = 180

/** data do evento: o 1º dia de serviço (sem serviço → quando foi criado) */
export function dataDoEvento(e: Pick<EventoCRM, 'event_services' | 'created_at'>): string {
  const dias = (e.event_services ?? []).map((s) => s.dia).filter(Boolean).sort()
  return dias[0] ?? e.created_at.slice(0, 10)
}

export function ultimoDiaDoEvento(e: Pick<EventoCRM, 'event_services' | 'created_at'>): string {
  const dias = (e.event_services ?? []).map((s) => s.dia).filter(Boolean).sort()
  return dias[dias.length - 1] ?? e.created_at.slice(0, 10)
}

function somarDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return isoLocal(d)
}

/**
 *   lead    → nunca fechou (só proposta: nenhum evento com contrato assinado)
 *   ativo   → fechou evento nos últimos 180 dias, ou tem evento fechado por vir
 *   inativo → fechou, mas o último foi há mais de 180 dias
 */
export function statusCliente(eventos: EventoCRM[], hoje: string): StatusCRM {
  const fechados = eventos.filter((e) => e.pipeline === 'aprovado')
  if (!fechados.length) return 'lead'
  const limite = somarDias(hoje, -DIAS_ATIVO)
  return fechados.some((e) => ultimoDiaDoEvento(e) >= limite) ? 'ativo' : 'inativo'
}

export interface ResumoCliente {
  status: StatusCRM
  realizados: number
  proximo: EventoCRM | null
  receita: number
  recebido: number
  ticket: number | null
  ultimoContato: string | null
  nps: number | null
  respostasNps: number
}

export function resumoCliente(
  eventos: EventoCRM[],
  receitas: { event_id: string | null; valor: number; valor_pago: number | null; status: string }[],
  envios: { enviado_em: string; nps: number | null; status?: string }[],
  hoje: string
): ResumoCliente {
  const fechados = eventos.filter((e) => e.pipeline === 'aprovado')
  const realizados = fechados.filter((e) => ultimoDiaDoEvento(e) < hoje || e.campo_etapa === 'encerrado').length
  const proximo =
    eventos
      .filter((e) => e.pipeline !== 'perdido' && dataDoEvento(e) >= hoje)
      .sort((a, b) => dataDoEvento(a).localeCompare(dataDoEvento(b)))[0] ?? null
  const validas = receitas.filter((r) => r.status !== 'cancelado')
  const receita = validas.reduce((t, r) => t + Number(r.valor ?? 0), 0)
  const recebido = validas.reduce((t, r) => t + Number(r.status === 'recebido' ? (r.valor_pago ?? r.valor) : 0), 0)
  const comReceita = new Set(validas.map((r) => r.event_id).filter(Boolean)).size
  const enviados = envios.filter((x) => x.status !== 'dispensado')
  const notas = enviados.map((x) => x.nps).filter((n): n is number => n != null)
  return {
    status: statusCliente(eventos, hoje),
    realizados,
    proximo,
    receita,
    recebido,
    ticket: comReceita ? receita / comReceita : null,
    ultimoContato: enviados.map((x) => x.enviado_em).sort().pop() ?? null,
    nps: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : null,
    respostasNps: notas.length,
  }
}

/** Cliente criado sozinho? Antes da 0037 a coluna não existe: falso. */
export function ehAutomatico(c: Pick<ClienteCRM, 'criado_automaticamente'>): boolean {
  return c.criado_automaticamente === true
}
