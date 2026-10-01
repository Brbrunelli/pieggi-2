// ============================================================
// ENDEREÇOS A CONFIRMAR — a fila do pós-venda
//
// Eventos vendidos (ou quase) que vêm aí e ainda não têm endereço, andar
// e acesso de carga confirmados com o cliente. Quanto mais perto do
// evento, mais vermelho. A confirmação em si é feita na tela do evento.
// ============================================================

import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Card } from '@/components/ui'
import { formatDiaMes } from '@/engine'
import { hojeLocal } from '@/engine/datas'

interface Pendente {
  id: string
  nome: string
  pipeline: string
  endereco_confirmado: boolean
  acesso_carga: string | null
  primeiraData: string
}

export default function EnderecosAConfirmar({ link = (id: string) => `/eventos/${id}` }: { link?: (id: string) => string }) {
  const hoje = hojeLocal()

  const { data } = useQuery({
    queryKey: ['enderecos-a-confirmar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, nome, pipeline, endereco_confirmado, acesso_carga, event_services(dia)')
        .in('pipeline', ['quente', 'contrato_enviado', 'aprovado'])
      if (error) throw error
      return ((data ?? []) as unknown as (Omit<Pendente, 'primeiraData'> & { event_services: { dia: string }[] })[])
        .map((e) => ({ ...e, primeiraData: e.event_services.map((s) => s.dia).sort()[0] }))
        .filter((e) => e.primeiraData && e.primeiraData >= hoje)
        .filter((e) => !e.endereco_confirmado || !e.acesso_carga?.trim())
        .sort((a, b) => a.primeiraData.localeCompare(b.primeiraData)) as Pendente[]
    },
  })

  if (!data?.length) return null

  const dias = (d: string) => Math.round((new Date(d).getTime() - new Date(hoje).getTime()) / 86400000)

  return (
    <Card
      title="📍 Endereços a confirmar com o cliente"
      actions={<Badge tone="red">{data.length}</Badge>}
      className="mb-6"
    >
      <p className="mb-3 text-xs text-neutral-500">
        Endereço, andar/sala, como a carga entra (doca/portaria) e com quem foi confirmado. Sem isso
        a comanda não sai e o motorista não é programado.
      </p>
      <div className="flex flex-col divide-y divide-[var(--pg-border)]">
        {data.map((e) => {
          const faltam = dias(e.primeiraData)
          return (
            <Link key={e.id} to={link(e.id)} className="flex items-center gap-3 py-2.5 text-sm hover:underline">
              <span className="w-14 font-mono text-xs">{formatDiaMes(e.primeiraData)}</span>
              <span className="flex-1">{e.nome}</span>
              {e.endereco_confirmado && <Badge tone="amber">falta acesso</Badge>}
              <Badge tone={faltam <= 2 ? 'red' : faltam <= 7 ? 'amber' : 'neutral'}>
                {faltam === 0 ? 'hoje' : faltam === 1 ? 'amanhã' : `em ${faltam} dias`}
              </Badge>
            </Link>
          )
        })}
      </div>
    </Card>
  )
}
