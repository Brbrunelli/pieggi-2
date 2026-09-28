// ============================================================
// CONTRATO — a ponte entre o comercial e a operação
//
// O contrato é o portão: é a ASSINATURA que move o card para a operação
// (trigger `contrato_assinado_libera_operacao`, migration 0021), não o
// clique de alguém no Kanban. Por isso esta tela existe entre a proposta
// e a programação.
//
// Dois caminhos para assinar:
//   · DocuSign — envia a minuta e a assinatura volta pelo webhook
//   · Manual — contrato assinado no papel/por e-mail: sobe o PDF e
//     registra a data. Mesma consequência, sem depender de integração.
// ============================================================

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Textarea } from '@/components/ui'
import {
  CONTRATO_STATUS_LABEL,
  nomeCliente,
  type Client,
  type Contract,
  type PieggiEvent,
} from '@/types'
import { formatBRL } from '@/engine'
import EsteiraEvento from '@/components/EsteiraEvento'

const TOM: Record<Contract['status'], 'neutral' | 'amber' | 'green' | 'red'> = {
  rascunho: 'neutral',
  enviado: 'amber',
  assinado: 'green',
  recusado: 'red',
  expirado: 'red',
  cancelado: 'neutral',
}

export default function Contrato() {
  const { id } = useParams()
  const qc = useQueryClient()
  const { session } = useAuth()
  const { editarComercial } = usePermissoes()

  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [form, setForm] = useState<{
    valor: string
    signatario_nome: string
    signatario_email: string
    signatario_doc: string
    forma_pagamento: string
    prazo_pagamento: string
    observacoes: string
  } | null>(null)

  const { data: evento } = useQuery({
    queryKey: ['evento', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, clients(*)')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as PieggiEvent & { clients: Client | null }
    },
  })

  const { data: contrato, isLoading } = useQuery({
    queryKey: ['contrato', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contracts')
        .select('*')
        .eq('event_id', id!)
        .order('versao', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data as Contract | null
    },
  })

  /** Abre o formulário com o que já se sabe do evento e da proposta. */
  function editar() {
    const cond = (contrato?.condicoes ?? {}) as Record<string, string>
    setForm({
      valor: String(contrato?.valor ?? evento?.orcamento_valor ?? ''),
      signatario_nome: contrato?.signatario_nome ?? evento?.contato ?? '',
      signatario_email: contrato?.signatario_email ?? evento?.contato_email ?? '',
      signatario_doc: contrato?.signatario_doc ?? '',
      forma_pagamento: cond.forma_pagamento ?? '',
      prazo_pagamento: cond.prazo_pagamento ?? '',
      observacoes: cond.observacoes ?? '',
    })
  }

  async function salvar() {
    if (!form) return
    setOcupado(true)
    setMsg(null)
    const payload = {
      event_id: id!,
      valor: form.valor ? Number(form.valor) : null,
      signatario_nome: form.signatario_nome || null,
      signatario_email: form.signatario_email || null,
      signatario_doc: form.signatario_doc || null,
      condicoes: {
        forma_pagamento: form.forma_pagamento,
        prazo_pagamento: form.prazo_pagamento,
        observacoes: form.observacoes,
      },
    }
    const r = contrato
      ? await supabase.from('contracts').update(payload).eq('id', contrato.id)
      : await supabase
          .from('contracts')
          .insert({ ...payload, versao: 1, created_by: session?.user.id })
    if (r.error) {
      setMsg(`🛑 ${r.error.message}`)
    } else {
      setForm(null)
      setMsg('✅ Contrato salvo.')
      await qc.invalidateQueries({ queryKey: ['contrato', id] })
    }
    setOcupado(false)
  }

  /** Sobe minuta ou via assinada para o bucket `documentos`. */
  async function subirArquivo(arquivo: File, campo: 'minuta_path' | 'assinado_path') {
    if (!contrato) {
      setMsg('🛑 Salve o contrato antes de anexar o arquivo.')
      return
    }
    setOcupado(true)
    setMsg(null)
    const path = `${id}/contrato/${Date.now()}-${arquivo.name}`
    const up = await supabase.storage.from('documentos').upload(path, arquivo, {
      contentType: arquivo.type,
      upsert: false,
    })
    if (up.error) {
      setMsg(`🛑 ${up.error.message}`)
      setOcupado(false)
      return
    }
    const r = await supabase.from('contracts').update({ [campo]: path }).eq('id', contrato.id)
    if (r.error) setMsg(`🛑 ${r.error.message}`)
    else {
      setMsg(campo === 'minuta_path' ? '✅ Minuta anexada.' : '✅ Via assinada anexada.')
      await qc.invalidateQueries({ queryKey: ['contrato', id] })
    }
    setOcupado(false)
  }

  async function baixar(path: string) {
    const { data, error } = await supabase.storage.from('documentos').createSignedUrl(path, 120)
    if (error) return setMsg(`🛑 ${error.message}`)
    window.open(data.signedUrl, '_blank')
  }

  /** Envia para assinatura no DocuSign (Edge Function `contrato-docusign`). */
  async function enviarParaAssinatura() {
    if (!contrato) return
    if (!contrato.signatario_email) {
      setMsg('🛑 Informe o e-mail de quem assina — é para lá que o DocuSign manda o convite.')
      return
    }
    if (!contrato.minuta_path) {
      setMsg('🛑 Anexe a minuta antes: é o arquivo que vai para assinatura.')
      return
    }
    setOcupado(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.functions.invoke('contrato-docusign', {
        body: { contract_id: contrato.id },
      })
      if (error) throw error
      if (data?.erro) throw new Error(data.erro)
      setMsg('✅ Enviado para assinatura. A assinatura volta sozinha e libera a operação.')
      await qc.invalidateQueries({ queryKey: ['contrato', id] })
      await qc.invalidateQueries({ queryKey: ['evento', id] })
    } catch (e) {
      const m = e instanceof Error ? e.message : 'erro'
      setMsg(
        m.includes('Failed to send a request')
          ? '🛑 A Edge Function "contrato-docusign" ainda não foi publicada. Use "Registrar assinatura manual" enquanto a integração não está no ar.'
          : `🛑 ${m}`
      )
    } finally {
      setOcupado(false)
    }
  }

  /**
   * Registra assinatura feita fora do DocuSign. Muda só o status — quem
   * move o evento para a operação é o trigger do banco, para o caminho
   * ser o MESMO do webhook. Dois caminhos, uma consequência.
   */
  async function registrarAssinaturaManual() {
    if (!contrato) return
    setOcupado(true)
    setMsg(null)
    const r = await supabase
      .from('contracts')
      .update({ status: 'assinado', assinado_em: new Date().toISOString() })
      .eq('id', contrato.id)
    if (r.error) setMsg(`🛑 ${r.error.message}`)
    else {
      setMsg('✅ Assinatura registrada — o evento foi liberado para a operação.')
      await qc.invalidateQueries({ queryKey: ['contrato', id] })
      await qc.invalidateQueries({ queryKey: ['evento', id] })
      await qc.invalidateQueries({ queryKey: ['eventos-pipeline'] })
    }
    setOcupado(false)
  }

  if (!evento || isLoading) return <p className="text-sm text-neutral-500">Carregando…</p>

  const cond = (contrato?.condicoes ?? {}) as Record<string, string>
  const editando = form !== null

  return (
    <div className="max-w-3xl">
      <PageTitle
        lead="COMERCIAL"
        actions={
          <Link to={`/eventos/${id}`}>
            <Button variant="secondary">← Voltar ao evento</Button>
          </Link>
        }
      >
        Contrato — {evento.nome}
      </PageTitle>

      <div className="mb-5 flex flex-wrap items-center gap-3 text-sm">
        <span>{nomeCliente(evento)}</span>
        {contrato && (
          <Badge tone={TOM[contrato.status]}>{CONTRATO_STATUS_LABEL[contrato.status]}</Badge>
        )}
        {evento.pipeline === 'aprovado' && <Badge tone="green">operação liberada</Badge>}
      </div>

      <EsteiraEvento eventId={id!} fase="contrato" />

      {msg && <p className="mb-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm">{msg}</p>}

      {!contrato && !editando ? (
        <Card>
          <EmptyState>
            Nenhum contrato ainda.
            {evento.orcamento_valor ? (
              <>
                {' '}
                A proposta fechou em <b>{formatBRL(Number(evento.orcamento_valor))}</b> — o contrato
                já nasce com esse valor.
              </>
            ) : (
              <>
                {' '}
                Este evento ainda não tem valor de proposta; dá para preencher o valor à mão.
              </>
            )}
            {editarComercial && (
              <div className="mt-4">
                <Button onClick={editar}>Criar contrato</Button>
              </div>
            )}
          </EmptyState>
        </Card>
      ) : editando ? (
        <Card title="Dados do contrato">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Valor contratado (R$)"
              type="number"
              step="0.01"
              value={form.valor}
              onChange={(e) => setForm({ ...form, valor: e.target.value })}
            />
            <Input
              label="Quem assina"
              value={form.signatario_nome}
              onChange={(e) => setForm({ ...form, signatario_nome: e.target.value })}
            />
            <Input
              label="E-mail de quem assina"
              type="email"
              placeholder="vai receber o convite do DocuSign"
              value={form.signatario_email}
              onChange={(e) => setForm({ ...form, signatario_email: e.target.value })}
            />
            <Input
              label="CPF/CNPJ de quem assina"
              value={form.signatario_doc}
              onChange={(e) => setForm({ ...form, signatario_doc: e.target.value })}
            />
            <Input
              label="Forma de pagamento"
              placeholder="Ex.: 50% na assinatura, 50% em 7 dias"
              value={form.forma_pagamento}
              onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
            />
            <Input
              label="Prazo de pagamento"
              placeholder="Ex.: 15 dias após o evento"
              value={form.prazo_pagamento}
              onChange={(e) => setForm({ ...form, prazo_pagamento: e.target.value })}
            />
            <div className="md:col-span-2">
              <Textarea
                label="Observações do contrato"
                rows={3}
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button onClick={salvar} disabled={ocupado}>
              {ocupado ? 'Salvando…' : 'Salvar contrato'}
            </Button>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      ) : (
        contrato && (
          <div className="space-y-6">
            <Card
              title="Contrato"
              actions={
                editarComercial &&
                contrato.status !== 'assinado' && (
                  <Button variant="secondary" onClick={editar}>
                    Editar
                  </Button>
                )
              }
            >
              <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                <Linha k="Valor" v={contrato.valor ? formatBRL(Number(contrato.valor)) : '—'} />
                <Linha k="Quem assina" v={contrato.signatario_nome ?? '—'} />
                <Linha k="E-mail" v={contrato.signatario_email ?? '—'} />
                <Linha k="CPF/CNPJ" v={contrato.signatario_doc ?? '—'} />
                <Linha k="Forma de pagamento" v={cond.forma_pagamento || '—'} />
                <Linha k="Prazo" v={cond.prazo_pagamento || '—'} />
                {cond.observacoes && (
                  <div className="md:col-span-2">
                    <Linha k="Observações" v={cond.observacoes} />
                  </div>
                )}
                {contrato.enviado_em && (
                  <Linha
                    k="Enviado para assinatura"
                    v={new Date(contrato.enviado_em).toLocaleString('pt-BR')}
                  />
                )}
                {contrato.assinado_em && (
                  <Linha
                    k="Assinado em"
                    v={new Date(contrato.assinado_em).toLocaleString('pt-BR')}
                  />
                )}
              </dl>
            </Card>

            <Card title="Arquivos">
              <div className="space-y-4 text-sm">
                <Arquivo
                  rotulo="Minuta (vai para assinatura)"
                  path={contrato.minuta_path}
                  podeSubir={editarComercial && contrato.status !== 'assinado'}
                  ocupado={ocupado}
                  onBaixar={baixar}
                  onSubir={(f) => subirArquivo(f, 'minuta_path')}
                />
                <Arquivo
                  rotulo="Via assinada"
                  path={contrato.assinado_path}
                  podeSubir={editarComercial}
                  ocupado={ocupado}
                  onBaixar={baixar}
                  onSubir={(f) => subirArquivo(f, 'assinado_path')}
                />
              </div>
            </Card>

            {editarComercial && contrato.status !== 'assinado' && (
              <Card title="Assinatura">
                <p className="mb-4 text-sm text-neutral-600">
                  A assinatura é o que <b>libera a operação</b> e manda a NF para o financeiro —
                  pelos dois caminhos abaixo, a consequência é a mesma.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button onClick={enviarParaAssinatura} disabled={ocupado}>
                    ✍️ Enviar para assinatura (DocuSign)
                  </Button>
                  <Button variant="secondary" onClick={registrarAssinaturaManual} disabled={ocupado}>
                    Registrar assinatura manual
                  </Button>
                </div>
                <p className="mt-3 text-xs text-neutral-400">
                  Assinatura manual serve para contrato fechado no papel ou por e-mail: registra a
                  data e libera a operação igual ao DocuSign.
                </p>
              </Card>
            )}

            {contrato.status === 'assinado' && (
              <div className="rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900">
                ✅ Contrato assinado. O card já está com a operação —{' '}
                <Link to={`/eventos/${id}/programacao`} className="font-semibold underline">
                  abrir a Programação
                </Link>
                .
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="pg-key">{k}</dt>
      <dd className="mt-0.5">{v}</dd>
    </div>
  )
}

function Arquivo({
  rotulo,
  path,
  podeSubir,
  ocupado,
  onBaixar,
  onSubir,
}: {
  rotulo: string
  path: string | null
  podeSubir: boolean
  ocupado: boolean
  onBaixar: (p: string) => void
  onSubir: (f: File) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="pg-key w-56 shrink-0">{rotulo}</span>
      {path ? (
        <button className="underline hover:text-green-700" onClick={() => onBaixar(path)}>
          {path.split('/').pop()}
        </button>
      ) : (
        <span className="text-neutral-400">nenhum arquivo</span>
      )}
      {podeSubir && (
        <label className="cursor-pointer text-xs text-neutral-500 underline decoration-dotted hover:text-[var(--pg-text)]">
          {path ? 'trocar' : 'anexar'}
          <input
            type="file"
            className="hidden"
            accept=".pdf,.docx,.doc"
            disabled={ocupado}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onSubir(f)
              e.target.value = ''
            }}
          />
        </label>
      )}
    </div>
  )
}
