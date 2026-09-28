import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select, Td, Th } from '@/components/ui'

interface Destino {
  id: string
  canal: 'email' | 'whatsapp'
  destino: string
  ativo: boolean
}

interface LogItem {
  id: number
  alerta: string
  canal: string
  destino: string
  enviado_em: string
  events: { nome: string } | null
}

export default function Notificacoes() {
  const qc = useQueryClient()
  const [canal, setCanal] = useState<'email' | 'whatsapp'>('email')
  const [destino, setDestino] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [testando, setTestando] = useState(false)

  const { data: destinos } = useQuery({
    queryKey: ['notif-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_settings')
        .select('*')
        .order('created_at')
      if (error) throw error
      return data as Destino[]
    },
  })

  const { data: log } = useQuery({
    queryKey: ['notif-log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_log')
        .select('*, events(nome)')
        .order('enviado_em', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as LogItem[]
    },
  })

  async function adicionar() {
    setMsg(null)
    if (!destino.trim()) return
    const { error } = await supabase
      .from('notification_settings')
      .insert({ canal, destino: destino.trim() })
    if (error) return setMsg(error.message)
    setDestino('')
    await qc.invalidateQueries({ queryKey: ['notif-settings'] })
  }

  async function alternar(d: Destino) {
    await supabase.from('notification_settings').update({ ativo: !d.ativo }).eq('id', d.id)
    await qc.invalidateQueries({ queryKey: ['notif-settings'] })
  }

  async function remover(d: Destino) {
    await supabase.from('notification_settings').delete().eq('id', d.id)
    await qc.invalidateQueries({ queryKey: ['notif-settings'] })
  }

  async function testar() {
    setTestando(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('alerta-travados', {
        body: { teste: true },
      })
      if (error) throw error
      setMsg(`✅ Função executada: ${JSON.stringify(data)}`)
    } catch (e) {
      setMsg(
        `🛑 ${e instanceof Error ? e.message : 'Erro'} — a Edge Function "alerta-travados" já foi implantada? (ver supabase/README.md)`
      )
    } finally {
      setTestando(false)
    }
  }

  return (
    <div>
      <PageTitle>Notificações de eventos travados</PageTitle>

      <p className="mb-4 text-sm text-neutral-500">
        A Edge Function <code>alerta-travados</code> roda agendada e avisa quando um evento entra
        em 🔴 travado (mesma régua do painel: Proposta ≤7d · Programação ≤4d · Comandas ≤2d ·
        Plaquinhas ≤1d, + pedidos especiais pendentes com evento próximo). Cada alerta sai
        1× por dia por destino.
      </p>

      <Card title="Destinatários" className="mb-6">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select
            label="Canal"
            className="!w-40"
            value={canal}
            onChange={(e) => setCanal(e.target.value as 'email' | 'whatsapp')}
          >
            <option value="email">E-mail (Resend)</option>
            <option value="whatsapp">WhatsApp (Twilio)</option>
          </Select>
          <Input
            label={canal === 'email' ? 'E-mail' : 'Telefone (+5511999999999)'}
            className="!w-72"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder={canal === 'email' ? 'bruno@pieggi.com.br' : '+5511992046070'}
          />
          <Button onClick={adicionar}>Adicionar</Button>
          <Button variant="secondary" onClick={testar} disabled={testando}>
            {testando ? 'Testando…' : '▶ Testar agora (ignora dedupe)'}
          </Button>
        </div>

        {msg && <p className="mb-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs">{msg}</p>}

        {!destinos?.length ? (
          <EmptyState>Nenhum destinatário — os alertas não serão enviados.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {destinos.map((d) => (
              <li key={d.id} className="flex items-center gap-3 text-sm">
                <Badge tone={d.canal === 'email' ? 'blue' : 'green'}>
                  {d.canal === 'email' ? '✉ e-mail' : '💬 whatsapp'}
                </Badge>
                <span className={d.ativo ? 'font-medium' : 'text-neutral-400 line-through'}>
                  {d.destino}
                </span>
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" className="!px-2 !py-0.5 text-xs" onClick={() => alternar(d)}>
                    {d.ativo ? 'Pausar' : 'Ativar'}
                  </Button>
                  <Button variant="ghost" className="!px-1.5 !py-0.5 text-xs" onClick={() => remover(d)}>
                    ✕
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Últimos envios">
        {!log?.length ? (
          <EmptyState>Nenhum alerta enviado ainda.</EmptyState>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Quando</Th>
                <Th>Evento</Th>
                <Th>Alerta</Th>
                <Th>Destino</Th>
              </tr>
            </thead>
            <tbody>
              {log.map((l) => (
                <tr key={l.id}>
                  <Td className="whitespace-nowrap text-xs text-neutral-500">
                    {new Date(l.enviado_em).toLocaleString('pt-BR')}
                  </Td>
                  <Td>{l.events?.nome ?? '—'}</Td>
                  <Td className="text-xs">{l.alerta}</Td>
                  <Td className="text-xs text-neutral-500">
                    {l.canal} · {l.destino}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
