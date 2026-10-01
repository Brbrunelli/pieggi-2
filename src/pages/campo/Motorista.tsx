// ============================================================
// MOTORISTA — minhas viagens
//
// O motorista abre no celular e vê só o que precisa: que horas sai,
// para onde vai (com Waze/Maps num toque), com quem falar no local e o
// que está levando. O endereço mostrado é SEMPRE o do evento agora —
// nunca uma cópia impressa — e, se ele mudou depois da programação,
// a tela avisa para confirmar com a Adriana antes de sair.
//
// Errou o endereço mesmo assim? "Problema" registra a ocorrência com
// foto, e o evento fica marcado — é assim que se descobre de onde o
// erro está vindo.
// ============================================================

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Badge, Button, Card, EmptyState, PageTitle, Select, Textarea } from '@/components/ui'
import { FotoBotao, FotoMiniatura } from '@/components/campo/Foto'
import { ListaAlertas } from '@/components/campo/Viagens'
import { formatDiaMes } from '@/engine'
import { horaCurta } from '@/lib/campo'
import {
  horaBR,
  OCORRENCIA_LABEL,
  SETOR_LABEL,
  VIAGEM_STATUS_LABEL,
  VIAGEM_TIPO_LABEL,
  type EventMaterial,
  type OcorrenciaTipo,
  type Viagem,
} from '@/types'
import { isoLocal } from '@/engine/datas'

function isoDia(offset: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return isoLocal(d)
}

/** Localização para o "cheguei" — se o celular negar, a chegada vale sem ela. */
function posicao(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok(null)
    navigator.geolocation.getCurrentPosition(
      (p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => ok(null),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}

export default function Motorista() {
  const { session } = useAuth()

  const { data: viagens, isLoading } = useQuery({
    queryKey: ['minhas-viagens', session?.user.id],
    enabled: Boolean(session),
    refetchInterval: 60_000, // a Adriana pode mudar algo com ele na rua
    queryFn: async () => {
      const { data, error } = await supabase
        .from('viagens_conferencia')
        .select('*')
        .eq('motorista_id', session!.user.id)
        .gte('dia', isoDia(-1))
        .lte('dia', isoDia(7))
        .neq('status', 'cancelada')
        .order('dia')
        .order('saida_prevista')
      if (error) throw error
      return data as Viagem[]
    },
  })

  const hoje = isoDia(0)
  // concluída de ontem some; pendente de ontem fica (não fechou)
  const lista = (viagens ?? []).filter((v) => v.dia >= hoje || v.status !== 'concluida')
  const rotuloDia = (d: string) =>
    d === hoje ? 'HOJE' : d === isoDia(1) ? 'AMANHÃ' : d < hoje ? 'ONTEM — não concluída' : formatDiaMes(d)

  const dias = Array.from(new Set(lista.map((v) => v.dia)))

  // origem da rota no mapa: a cozinha (Parâmetros de regra → endereco_pieggi)
  const { data: origem } = useQuery({
    queryKey: ['endereco-pieggi'],
    queryFn: async () => {
      const { data } = await supabase.from('rule_params').select('valor').eq('chave', 'endereco_pieggi').maybeSingle()
      return typeof data?.valor === 'string' ? data.valor : ''
    },
  })

  /** A rota inteira do dia no Google Maps: paradas que faltam, na ordem. */
  function linkRota(paradas: Viagem[]): string | null {
    const enderecos = paradas
      .filter((v) => v.status !== 'concluida')
      .map((v) => v.endereco_atual ?? v.endereco)
      .filter((e): e is string => Boolean(e))
    if (!enderecos.length) return null
    const destino = enderecos[enderecos.length - 1]
    const meio = enderecos.slice(0, -1)
    const p = new URLSearchParams({ api: '1', destination: destino, travelmode: 'driving' })
    if (origem) p.set('origin', origem)
    if (meio.length) p.set('waypoints', meio.join('|'))
    return `https://www.google.com/maps/dir/?${p.toString()}`
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageTitle lead="MOTORISTA">Minha rota</PageTitle>
      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !lista.length ? (
        <EmptyState>Nenhuma viagem programada para você nos próximos dias.</EmptyState>
      ) : (
        <div className="flex flex-col gap-6">
          {dias.map((d) => {
            const paradas = lista.filter((v) => v.dia === d)
            const rota = linkRota(paradas)
            return (
              <section key={d}>
                <div className="mb-2 flex items-center gap-3">
                  <div className="pg-key">
                    {rotuloDia(d)} · {paradas.length} parada(s)
                  </div>
                  {rota && paradas.length > 1 && (
                    <a href={rota} target="_blank" rel="noreferrer" className="ml-auto text-xs font-semibold underline">
                      Abrir a rota inteira no mapa
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-4">
                  {paradas.map((v, n) => (
                    <CartaoViagem key={v.id} v={v} numero={n + 1} />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function CartaoViagem({ v, numero }: { v: Viagem; numero: number }) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const [carga, setCarga] = useState(false)
  const [problema, setProblema] = useState(false)

  // o endereço do EVENTO agora — a fonte da verdade, não o retrato
  const endereco = v.endereco_atual ?? v.endereco ?? ''
  const local = v.local_atual ?? v.local_detalhe
  const destino = encodeURIComponent(endereco)

  const marcar = useMutation({
    mutationFn: async (passo: 'saiu' | 'chegou' | 'concluiu') => {
      const pos = passo === 'chegou' ? await posicao() : null
      const { error } = await supabase.rpc('viagem_marcar', {
        p_viagem: v.id,
        p_passo: passo,
        p_lat: pos?.lat ?? null,
        p_lng: pos?.lng ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['minhas-viagens'] }),
  })

  const proximo: { passo: 'saiu' | 'chegou' | 'concluiu'; label: string } | null =
    v.status === 'programada'
      ? { passo: 'saiu', label: 'Saí da Pieggi' }
      : v.status === 'a_caminho'
        ? { passo: 'chegou', label: 'Cheguei no local' }
        : v.status === 'no_local'
          ? { passo: 'concluiu', label: v.tipo === 'entrega' ? 'Descarreguei — concluir' : 'Carreguei — concluir' }
          : null

  return (
    <Card
      title={
        <span>
          {numero}. {VIAGEM_TIPO_LABEL[v.tipo]} · {v.tipo === 'retirada' ? v.fornecedor_nome : (v.cliente ?? v.evento_nome)}
        </span>
      }
      actions={
        <Badge tone={v.status === 'concluida' ? 'green' : v.status === 'programada' ? 'neutral' : 'amber'}>
          {VIAGEM_STATUS_LABEL[v.status]}
        </Badge>
      }
    >
      <div className="flex items-end gap-6">
        <div>
          <div className="pg-key">Sair às</div>
          <div className="pg-metric text-[40px] leading-none">{horaBR(v.saida_prevista)}</div>
        </div>
        {v.chegada_prevista && (
          <div>
            <div className="pg-key">Chegar às</div>
            <div className="pg-metric text-[28px] leading-none">{horaBR(v.chegada_prevista)}</div>
          </div>
        )}
        <div className="ml-auto text-right text-xs text-neutral-500">
          serviço {horaBR(v.hora_servico_atual)}
          {v.veiculo && <div>{v.veiculo}</div>}
        </div>
      </div>

      <div className="mt-4 text-[15px] font-semibold leading-snug">{endereco || 'SEM ENDEREÇO — ligue para a Adriana'}</div>
      {local && <div className="text-sm text-neutral-600">{local}</div>}
      <div className="mt-1 text-xs text-neutral-500">
        {v.evento_nome}
        {v.pax ? ` · ${v.pax} pax` : ''}
      </div>
      {/* como entrar: doca/portaria do evento, ou observação do fornecedor */}
      {v.acesso_atual && (
        <div className="mt-2 rounded-lg border border-[var(--pg-text)] px-3 py-2 text-sm">
          <div className="pg-key mb-0.5">Como entrar</div>
          {v.acesso_atual}
        </div>
      )}
      {v.tipo === 'retirada' && (
        <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm">
          <div className="pg-key mb-1">Buscar</div>
          {v.itens?.length ? (
            <ul>
              {v.itens.map((i, n) => (
                <li key={n}>
                  • <b>{i.qtd}</b> {i.descricao}
                  {i.evento && <span className="text-[11px] text-neutral-500"> ({i.evento})</span>}
                </li>
              ))}
            </ul>
          ) : (
            <i>itens não listados — confirmar com a Adriana</i>
          )}
          {v.fornecedor_horario && <div className="mt-1 text-xs text-neutral-600">Retirada: {v.fornecedor_horario}</div>}
        </div>
      )}
      {v.obs && <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm">📌 {v.obs}</p>}

      {(v.endereco_mudou || v.horario_mudou || !v.endereco_confirmado) && v.status === 'programada' && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          Ligue para a Adriana antes de sair — o evento mudou depois que a viagem foi programada.
        </p>
      )}
      <ListaAlertas v={v} />

      {/* navegação e contato — botões grandes, um toque */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <a href={`https://waze.com/ul?q=${destino}&navigate=yes`} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="w-full !py-3">Waze</Button>
        </a>
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${destino}`} target="_blank" rel="noreferrer">
          <Button variant="secondary" className="w-full !py-3">Google Maps</Button>
        </a>
        {v.contato_telefone && (
          <a href={`tel:${v.contato_telefone.replace(/[^\d+]/g, '')}`} className="col-span-2">
            <Button variant="secondary" className="w-full !py-3">
              Ligar para {v.contato_nome ?? 'o contato'} · {v.contato_telefone}
            </Button>
          </a>
        )}
      </div>

      {marcar.isError && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">🛑 {(marcar.error as Error).message}</p>
      )}
      {proximo && (
        <Button className="mt-3 w-full !py-3.5 text-sm" disabled={marcar.isPending} onClick={() => marcar.mutate(proximo.passo)}>
          {marcar.isPending ? 'Salvando…' : proximo.label}
        </Button>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-neutral-400">
        {v.saiu_em && <span>saiu {horaCurta(v.saiu_em)}</span>}
        {v.chegou_em && <span>chegou {horaCurta(v.chegou_em)}</span>}
        {v.concluida_em && <span>concluiu {horaCurta(v.concluida_em)}</span>}
      </div>

      <div className="mt-3 flex gap-2 border-t border-[var(--pg-border)] pt-3">
        {v.event_id && (
          <Button variant="ghost" className="!px-0" onClick={() => setCarga(!carga)}>
            {carga ? 'Esconder carga' : 'O que estou levando'}
          </Button>
        )}
        {/* ocorrência é do evento; problema na retirada é ligação para a Adriana */}
        {v.event_id ? (
          <Button variant="ghost" className="ml-auto !px-0 !text-red-700" onClick={() => setProblema(!problema)}>
            Problema
          </Button>
        ) : (
          v.contato_telefone && (
            <a href={`tel:${v.contato_telefone.replace(/[^\d+]/g, '')}`} className="ml-auto text-xs underline">
              Ligar para o fornecedor
            </a>
          )
        )}
      </div>
      {carga && v.event_id && <Carga eventId={v.event_id} />}
      {problema && v.event_id && (
        <Problema eventId={v.event_id} userId={session?.user.id} onFeito={() => setProblema(false)} />
      )}
    </Card>
  )
}

/** Material conferido na saída (ou o previsto, se ainda não conferiram). */
function Carga({ eventId }: { eventId: string }) {
  const { data } = useQuery({
    queryKey: ['carga', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_materials')
        .select('descricao, setor, unidade, qtd_prevista, qtd_saida')
        .eq('event_id', eventId)
        .order('ordem')
      if (error) throw error
      return data as Pick<EventMaterial, 'descricao' | 'setor' | 'unidade' | 'qtd_prevista' | 'qtd_saida'>[]
    },
  })
  if (!data?.length)
    return <p className="mt-2 text-sm text-neutral-500">A expedição ainda não carregou a lista de material.</p>
  return (
    <ul className="mt-2 text-sm">
      {data.map((m) => (
        <li key={m.descricao} className="flex justify-between border-b border-[var(--pg-border)] py-1">
          <span>
            {m.descricao} <span className="text-[11px] text-neutral-400">{SETOR_LABEL[m.setor]}</span>
          </span>
          <span className="font-mono">
            {m.qtd_saida ?? m.qtd_prevista ?? '—'} {m.unidade}
            {m.qtd_saida == null && <span className="text-[11px] text-amber-700"> (previsto)</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Problema({ eventId, userId, onFeito }: { eventId: string; userId?: string; onFeito: () => void }) {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<OcorrenciaTipo>('endereco')
  const [descricao, setDescricao] = useState('')
  const [foto, setFoto] = useState<string | null>(null)

  const enviar = useMutation({
    mutationFn: async () => {
      if (!descricao.trim()) throw new Error('Conte o que aconteceu.')
      const { error } = await supabase.from('event_ocorrencias').insert({
        event_id: eventId,
        tipo,
        descricao: descricao.trim(),
        foto_path: foto,
        registrado_por: userId,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['campo-ocorrencias', eventId] })
      onFeito()
    },
  })

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-red-200 p-3">
      <Select label="O que houve" value={tipo} onChange={(e) => setTipo(e.target.value as OcorrenciaTipo)}>
        {(['endereco', 'horario', 'atraso', 'acidente', 'outro'] as OcorrenciaTipo[]).map((t) => (
          <option key={t} value={t}>
            {OCORRENCIA_LABEL[t]}
          </option>
        ))}
      </Select>
      <Textarea
        rows={2}
        placeholder="Ex.: o endereço é a portaria B, não a A · trânsito parado na Marginal"
        value={descricao}
        onChange={(e) => setDescricao(e.target.value)}
      />
      <div className="flex items-center gap-3">
        <FotoBotao eventId={eventId} pasta="ocorrencia" rotulo="Foto da fachada" onFoto={setFoto} />
        {foto && <FotoMiniatura path={foto} />}
      </div>
      {enviar.isError && <p className="text-sm text-red-700">🛑 {(enviar.error as Error).message}</p>}
      <Button variant="danger" disabled={enviar.isPending} onClick={() => enviar.mutate()}>
        Registrar problema
      </Button>
    </div>
  )
}
