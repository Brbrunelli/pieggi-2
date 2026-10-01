// ============================================================
// RUA — o evento depois que sai da cozinha
//
// Feita para o celular do coordenador no salão: uma coluna, botões
// grandes, foto direto da câmera. Em cima, a fase de campo e o que falta
// para avançar (vem do banco); embaixo, as seções em abas.
//
// Evento de vários dias: checklist, equipe e sobras são por dia; o
// material é do evento inteiro (sai uma vez, volta uma vez).
// ============================================================

import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PageTitle } from '@/components/ui'
import EsteiraEvento from '@/components/EsteiraEvento'
import ConfirmacaoEndereco from '@/components/ConfirmacaoEndereco'
import EtapasCampo from '@/components/campo/EtapasCampo'
import Materiais from '@/components/campo/Materiais'
import Checklist from '@/components/campo/Checklist'
import Equipe from '@/components/campo/Equipe'
import Sobras from '@/components/campo/Sobras'
import Ocorrencias from '@/components/campo/Ocorrencias'
import Viagens from '@/components/campo/Viagens'
import { formatDiaMes } from '@/engine'
import { nomeCliente, type Client, type EventService, type PieggiEvent, type ServiceType } from '@/types'
import { hojeLocal } from '@/engine/datas'

type Aba = 'material' | 'checklist' | 'equipe' | 'transporte' | 'sobras' | 'ocorrencias'

const ABAS: { key: Aba; label: string; porDia: boolean }[] = [
  { key: 'checklist', label: 'Checklist', porDia: true },
  { key: 'material', label: 'Material', porDia: false },
  { key: 'equipe', label: 'Equipe', porDia: true },
  { key: 'transporte', label: 'Transporte', porDia: false },
  { key: 'sobras', label: 'Sobras', porDia: true },
  { key: 'ocorrencias', label: 'Ocorrências', porDia: false },
]

/** servir −3h (rule_params.saida_horas_antes), em HH:MM para o campo de hora */
function saidaDe(horaServir: string | null): string | null {
  if (!horaServir) return null
  const [h, m] = horaServir.split(':').map(Number)
  const t = (((h * 60 + m - 180) % 1440) + 1440) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export default function Campo() {
  const { id } = useParams()
  // ?aba=transporte — o quadro do Transporte abre o evento direto na aba
  const [busca] = useSearchParams()
  const [aba, setAba] = useState<Aba>(() =>
    ABAS.some((a) => a.key === busca.get('aba')) ? (busca.get('aba') as Aba) : 'checklist'
  )
  const [diaEscolhido, setDiaEscolhido] = useState<string | null>(null)

  const { data: evento } = useQuery({
    queryKey: ['campo-evento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, nome, cliente_nome, pax, endereco, local_detalhe, acesso_carga, endereco_confirmado, endereco_confirmado_com, endereco_confirmado_em, campo_etapa, campo_em, pipeline, clients(nome)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as unknown as Pick<
        PieggiEvent,
        | 'id' | 'nome' | 'cliente_nome' | 'pax' | 'endereco' | 'local_detalhe' | 'acesso_carga'
        | 'endereco_confirmado' | 'endereco_confirmado_com' | 'endereco_confirmado_em' | 'campo_etapa' | 'campo_em'
      > & { clients: Pick<Client, 'nome'> | null }
    },
  })

  const { data: servicos } = useQuery({
    queryKey: ['campo-servicos', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_services')
        .select('id, dia, service_type, hora_inicio, hora_fim')
        .eq('event_id', id!)
        .order('dia')
      if (error) throw error
      return data as Pick<EventService, 'id' | 'dia' | 'service_type' | 'hora_inicio' | 'hora_fim'>[]
    },
  })

  const dias = useMemo(() => Array.from(new Set((servicos ?? []).map((s) => s.dia))).sort(), [servicos])
  // abre no dia de hoje se o evento for hoje; senão no primeiro dia
  const hoje = hojeLocal()
  const dia = diaEscolhido ?? (dias.includes(hoje) ? hoje : dias[0]) ?? null

  const doDia = (servicos ?? []).filter((s) => s.dia === dia)
  const tiposDoDia = Array.from(new Set(doDia.map((s) => s.service_type))) as ServiceType[]
  const primeiraHora = doDia.reduce<string | null>(
    (min, s) => (s.hora_inicio && (!min || s.hora_inicio < min) ? s.hora_inicio : min),
    null
  )
  const abaInfo = ABAS.find((a) => a.key === aba)!

  if (!evento || !servicos) return <p className="text-sm text-neutral-500">Carregando…</p>

  return (
    <div className="mx-auto max-w-3xl">
      <EsteiraEvento eventId={evento.id} fase="campo" />
      <PageTitle lead="RUA">{evento.nome}</PageTitle>

      <div className="mb-4 text-sm text-neutral-600">
        <div>
          <b>{nomeCliente(evento)}</b> · {evento.pax ?? '—'} pax
        </div>
        <Link to={`/eventos/${evento.id}/producao`} className="mt-1 inline-block text-xs underline">
          Abrir comanda e programação
        </Link>
      </div>

      {/* a rua vê e pode confirmar/corrigir o endereço — a Adriana também liga para o cliente */}
      <div className="mb-5">
        <ConfirmacaoEndereco evento={evento} compacto />
      </div>

      <div className="mb-5">
        <EtapasCampo eventId={evento.id} etapa={evento.campo_etapa} />
      </div>

      {/* abas — rolam de lado no celular */}
      <div className="sticky top-0 z-10 -mx-1 mb-4 flex gap-1 overflow-x-auto bg-[var(--pg-bg)] px-1 py-2">
        {ABAS.map((a) => (
          <button
            key={a.key}
            onClick={() => setAba(a.key)}
            className={`shrink-0 rounded-full px-4 py-2 text-[11px] font-semibold tracking-[0.1em] ${
              aba === a.key
                ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                : 'border border-[var(--pg-border)] text-neutral-500'
            }`}
          >
            {a.label.toUpperCase()}
          </button>
        ))}
      </div>

      {abaInfo.porDia && dias.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {dias.map((d, i) => (
            <button
              key={d}
              onClick={() => setDiaEscolhido(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                d === dia ? 'bg-green-700 text-white' : 'border border-[var(--pg-border)]'
              }`}
            >
              DIA {i + 1} · {formatDiaMes(d)}
            </button>
          ))}
        </div>
      )}

      {!dia ? (
        <p className="text-sm text-neutral-500">O evento não tem serviços cadastrados.</p>
      ) : aba === 'checklist' ? (
        <Checklist eventId={evento.id} dia={dia} tiposDoDia={tiposDoDia} />
      ) : aba === 'material' ? (
        <Materiais key={evento.campo_etapa ?? 'casa'} eventId={evento.id} etapa={evento.campo_etapa} />
      ) : aba === 'equipe' ? (
        <Equipe key={dia} eventId={evento.id} dia={dia} saidaSugerida={saidaDe(primeiraHora)} />
      ) : aba === 'transporte' ? (
        <Viagens eventId={evento.id} servicos={servicos} />
      ) : aba === 'sobras' ? (
        <Sobras key={dia} eventId={evento.id} dia={dia} cliente={nomeCliente(evento)} evento={evento.nome} />
      ) : (
        <Ocorrencias eventId={evento.id} />
      )}
    </div>
  )
}
