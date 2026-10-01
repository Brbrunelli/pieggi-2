// ============================================================
// LINHA DO TEMPO DO CLIENTE — tudo que aconteceu, em ordem
//
// O que antes estava espalhado em cinco telas (funil, contrato, CS,
// rua): cada evento com a etapa do funil, contrato enviado/assinado,
// NPS e o que o cliente respondeu, ocorrências da rua. É o que o
// comercial lê antes de ligar para o cliente.
// ============================================================

import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui'
import { formatBRL } from '@/engine'
import { dataDoEvento } from '@/lib/crm'
import { hojeLocal } from '@/engine/freelas'
import { OCORRENCIA_LABEL, PIPELINE, classeNps, type OcorrenciaTipo } from '@/types'
import type { EventoCRM } from '@/tipos/pessoas'

export interface ContratoCRM {
  id: string
  event_id: string
  status: string
  enviado_em: string | null
  assinado_em: string | null
  valor: number | null
}
export interface EnvioCRM {
  id: string
  event_id: string
  titulo: string | null
  canal: string
  status: string
  enviado_em: string
  respondido_em: string | null
  nps: number | null
  resposta: string | null
}
export interface OcorrenciaCRM {
  id: string
  event_id: string
  tipo: string
  descricao: string
  registrado_em: string
  resolvida: boolean
  resolucao: string | null
}

interface Item {
  quando: string
  icone: string
  titulo: string
  detalhe?: string | null
  eventoId?: string
  selo?: { texto: string; tom: 'neutral' | 'green' | 'amber' | 'red' | 'blue' }
}

const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

export default function LinhaDoTempo({
  eventos,
  contratos,
  envios,
  ocorrencias,
  verValores,
}: {
  eventos: EventoCRM[]
  contratos: ContratoCRM[]
  envios: EnvioCRM[]
  ocorrencias: OcorrenciaCRM[]
  verValores: boolean
}) {
  const nomeEvento = new Map(eventos.map((e) => [e.id, e.nome]))
  const itens: Item[] = []

  for (const e of eventos) {
    const etapa = PIPELINE.find((p) => p.key === e.pipeline)
    itens.push({
      quando: dataDoEvento(e),
      icone: '📅',
      titulo: e.nome,
      detalhe: [
        e.contato && `contato ${e.contato}`,
        verValores && e.orcamento_valor ? formatBRL(Number(e.orcamento_valor)) : null,
        e.campo_etapa === 'encerrado' ? 'evento encerrado' : null,
      ]
        .filter(Boolean)
        .join(' · '),
      eventoId: e.id,
      selo: {
        texto: etapa?.label ?? e.pipeline,
        tom: e.pipeline === 'aprovado' ? 'green' : e.pipeline === 'perdido' ? 'red' : e.pipeline === 'quente' ? 'amber' : 'neutral',
      },
    })
  }
  for (const c of contratos) {
    if (c.enviado_em)
      itens.push({ quando: c.enviado_em, icone: '✉️', titulo: `Contrato enviado — ${nomeEvento.get(c.event_id) ?? ''}`, eventoId: c.event_id })
    if (c.assinado_em)
      itens.push({
        quando: c.assinado_em,
        icone: '✍️',
        titulo: `Contrato assinado — ${nomeEvento.get(c.event_id) ?? ''}`,
        detalhe: verValores && c.valor ? formatBRL(Number(c.valor)) : null,
        eventoId: c.event_id,
        selo: { texto: 'assinado', tom: 'green' },
      })
  }
  for (const s of envios) {
    if (s.status === 'dispensado') continue
    itens.push({
      quando: s.enviado_em,
      icone: '💬',
      titulo: `${s.titulo ?? 'Contato de CS'} (${s.canal}) — ${nomeEvento.get(s.event_id) ?? ''}`,
      eventoId: s.event_id,
    })
    if (s.nps != null) {
      const classe = classeNps(s.nps)
      itens.push({
        quando: s.respondido_em ?? s.enviado_em,
        icone: '⭐',
        titulo: `NPS ${s.nps} — ${nomeEvento.get(s.event_id) ?? ''}`,
        detalhe: s.resposta ? `“${s.resposta}”` : null,
        eventoId: s.event_id,
        selo: { texto: classe, tom: classe === 'promotor' ? 'green' : classe === 'neutro' ? 'amber' : 'red' },
      })
    }
  }
  for (const o of ocorrencias) {
    itens.push({
      quando: o.registrado_em,
      icone: '⚠️',
      titulo: `${OCORRENCIA_LABEL[o.tipo as OcorrenciaTipo] ?? o.tipo} na rua — ${nomeEvento.get(o.event_id) ?? ''}`,
      detalhe: o.descricao + (o.resolucao ? ` → ${o.resolucao}` : ''),
      eventoId: o.event_id,
      selo: o.resolvida ? { texto: 'resolvida', tom: 'neutral' } : { texto: 'aberta', tom: 'red' },
    })
  }

  itens.sort((a, b) => b.quando.localeCompare(a.quando))
  if (!itens.length) return <p className="text-sm text-neutral-500">Nada registrado ainda.</p>

  const hoje = hojeLocal()
  return (
    <ol className="relative ml-2 border-l border-[var(--pg-border)]">
      {itens.map((i, n) => (
        <li key={n} className="mb-4 ml-4">
          <span className="absolute -left-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--pg-surface)] text-[11px]">
            {i.icone}
          </span>
          <div className="text-[11px] text-neutral-500">
            {br(i.quando)}
            {i.quando.slice(0, 10) > hoje && ' · por vir'}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {i.eventoId ? (
              <Link to={`/eventos/${i.eventoId}`} className="font-medium hover:text-green-700">
                {i.titulo}
              </Link>
            ) : (
              <span className="font-medium">{i.titulo}</span>
            )}
            {i.selo && <Badge tone={i.selo.tom}>{i.selo.texto}</Badge>}
          </div>
          {i.detalhe && <div className="text-[13px] text-neutral-600">{i.detalhe}</div>}
        </li>
      ))}
    </ol>
  )
}
