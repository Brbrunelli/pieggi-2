// Protege as fases operacionais: só abrem com o evento APROVADO.
// (Trava também a rota direta, não só os botões do evento.)
//
// O funil comercial vive no Pipedrive; aqui o que importa é se o cliente
// aceitou — ninguém deve produzir para evento que não foi vendido.

import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button, Card, EmptyState } from '@/components/ui'
import { operacaoLiberada, PIPELINE, type PipelineStage } from '@/types'

export default function FaseGuard({ children }: { children: ReactNode }) {
  const { id } = useParams()

  const { data, isLoading } = useQuery({
    queryKey: ['evento-pipeline', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await supabase.from('events').select('pipeline, nome').eq('id', id!).single()
      return data as { pipeline: PipelineStage; nome: string } | null
    },
  })

  if (isLoading) return <p className="text-sm text-neutral-500">Carregando…</p>
  if (data && !operacaoLiberada(data.pipeline)) {
    const etapa = PIPELINE.find((p) => p.key === data.pipeline)?.label ?? 'Perdido'
    return (
      <div className="max-w-2xl">
        <Card title="🔒 Fase bloqueada">
          <EmptyState>
            <p className="mb-3">
              <b>{data.nome}</b> está em <b>{etapa}</b>. Programação, Produção e Compras só abrem
              com o <b>contrato assinado</b> — assim ninguém produz para um evento que ainda não
              foi vendido.
            </p>
            {/* O botão principal leva ao EVENTO, onde o bloqueio se resolve.
                Antes ele mandava para o funil, e quem clicava numa fase
                caía numa lista de eventos sem entender por quê. */}
            <div className="flex flex-wrap justify-center gap-2">
              <Link to={`/eventos/${id}/contrato`}>
                <Button>Abrir o contrato</Button>
              </Link>
              <Link to={`/eventos/${id}`}>
                <Button variant="secondary">Voltar ao evento</Button>
              </Link>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              O card vai para a operação sozinho quando a assinatura volta do DocuSign.
            </p>
          </EmptyState>
        </Card>
      </div>
    )
  }
  return <>{children}</>
}
