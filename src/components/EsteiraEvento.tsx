// ============================================================
// ESTEIRA DO EVENTO — onde estou e qual é o próximo passo
//
// Aparece no topo de toda tela de trabalho do evento. Resolve a queixa
// de "fluxo com interrupção": ao terminar uma fase, o próximo passo está
// ali, no mesmo lugar — não é preciso voltar a lista nenhuma para
// descobrir para onde ir.
//
// Cada fase mostra se já está feita (✓), e o botão da direita leva
// sempre à PRIMEIRA fase que falta. Quem clica não precisa saber a ordem
// da esteira de cabeça.
// ============================================================

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePermissoes } from '@/lib/permissoes'
import { Button } from '@/components/ui'

export type FaseEsteira = 'proposta' | 'contrato' | 'programacao' | 'producao' | 'compras' | 'campo'

const ORDEM: { key: FaseEsteira; label: string; rota: (id: string) => string }[] = [
  { key: 'proposta', label: 'Proposta', rota: (id) => `/eventos/${id}/proposta` },
  { key: 'contrato', label: 'Contrato', rota: (id) => `/eventos/${id}/contrato` },
  { key: 'programacao', label: 'Programação', rota: (id) => `/eventos/${id}/programacao` },
  { key: 'producao', label: 'Produção', rota: (id) => `/eventos/${id}/producao` },
  { key: 'compras', label: 'Compras', rota: () => `/compras` },
  // a rua: saída, montagem, desmontagem — feito = evento encerrado
  { key: 'campo', label: 'Rua', rota: (id) => `/eventos/${id}/campo` },
]

export default function EsteiraEvento({
  eventId,
  fase,
}: {
  eventId: string
  fase: FaseEsteira
}) {
  const { verComercial } = usePermissoes()

  const { data } = useQuery({
    queryKey: ['esteira', eventId],
    queryFn: async () => {
      const [prop, contrato, sched, prod, compras, campo] = await Promise.all([
        supabase.from('proposals').select('aprovado_em').eq('event_id', eventId).limit(5),
        supabase.from('contracts').select('status').eq('event_id', eventId).limit(1),
        supabase.from('schedules').select('aprovado_em').eq('event_id', eventId).limit(1),
        supabase.from('production_orders').select('aprovado_em').eq('event_id', eventId).limit(1),
        supabase.from('purchase_lists').select('event_ids').contains('event_ids', [eventId]),
        supabase.from('events').select('campo_etapa').eq('id', eventId).maybeSingle(),
      ])
      const um = (r: { data: { aprovado_em: string | null }[] | null }) =>
        Boolean((r.data ?? []).some((x) => x.aprovado_em))
      return {
        proposta: um(prop as never),
        // a tabela `contracts` pode não existir se a 0021 não foi aplicada:
        // nesse caso `error` vem preenchido e `data` nulo — tratamos como
        // "não feito" em vez de quebrar a tela inteira
        contrato: ((contrato.data ?? []) as { status: string }[]).some(
          (c) => c.status === 'assinado'
        ),
        programacao: um(sched as never),
        producao: um(prod as never),
        compras: ((compras.data ?? []) as unknown[]).length > 0,
        campo: (campo.data as { campo_etapa: string | null } | null)?.campo_etapa === 'encerrado',
      }
    },
  })

  const feito: Record<FaseEsteira, boolean> = {
    proposta: data?.proposta ?? false,
    contrato: data?.contrato ?? false,
    programacao: data?.programacao ?? false,
    producao: data?.producao ?? false,
    compras: data?.compras ?? false,
    campo: data?.campo ?? false,
  }

  const visiveis = ORDEM.filter(
    // cozinha não abre proposta nem contrato: mostrar fase que ela não
    // pode abrir só geraria clique em porta trancada
    (f) => verComercial || !['proposta', 'contrato'].includes(f.key)
  )
  const proxima = visiveis.find((f) => !feito[f.key] && f.key !== fase)

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--pg-border)] bg-[var(--pg-surface)] px-3 py-2.5">
      {visiveis.map((f, i) => {
        const atual = f.key === fase
        return (
          <div key={f.key} className="flex items-center gap-2">
            {i > 0 && <span className="text-neutral-300">→</span>}
            <Link
              to={f.rota(eventId)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.06em] transition-colors ${
                atual
                  ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                  : feito[f.key]
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'text-neutral-400 hover:text-[var(--pg-text)]'
              }`}
            >
              {feito[f.key] && !atual ? '✓ ' : ''}
              {f.label.toUpperCase()}
            </Link>
          </div>
        )
      })}

      {proxima && (
        <Link to={proxima.rota(eventId)} className="ml-auto">
          <Button variant="secondary" className="!px-3 !py-1.5 text-[11px]">
            Próximo passo: {proxima.label} →
          </Button>
        </Link>
      )}
    </div>
  )
}
