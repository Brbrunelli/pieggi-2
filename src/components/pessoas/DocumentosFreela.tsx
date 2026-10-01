// ============================================================
// DOCUMENTOS DO FREELA — contrato assinado + ASO
//
// Os dois papéis que liberam alguém para a rua. A Adriana registra pelo
// celular: data, validade e a foto/PDF do documento (bucket privado
// 'pessoas' — tem CPF e exame médico, só a equipe que escala enxerga).
//
//   Contrato: data de assinatura (obrigatória — sem ela não vale),
//             início e fim da vigência (fim vazio = indeterminado).
//   ASO:      data do exame e validade (obrigatória — é ela que trava).
//
// Documento novo não apaga o antigo: o histórico fica, e a regra usa
// o que mais tempo cobre (situacaoFreela).
// ============================================================

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { usePermissoes } from '@/lib/permissoes'
import { Badge, Button, Input } from '@/components/ui'
import { hojeLocal, rotuloSituacao, situacaoFreela } from '@/engine/freelas'
import { DOC_FREELA_LABEL, type FreelancerDocumento, type TipoDocFreela } from '@/tipos/pessoas'
import { invalidarFreelas } from './useFreelas'

const hoje = hojeLocal
const br = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—')

const vazio = { emitido_em: '', validade: '', assinado_em: '', obs: '' }

export default function DocumentosFreela({
  freelancerId,
  docs,
}: {
  freelancerId: string
  docs: FreelancerDocumento[]
}) {
  const qc = useQueryClient()
  const { session } = useAuth()
  const { escalar, ehAdmin } = usePermissoes()
  const [tipo, setTipo] = useState<TipoDocFreela | null>(null)
  const [form, setForm] = useState(vazio)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const situacao = situacaoFreela(docs, hoje())
  const rotulo = rotuloSituacao(situacao)

  const registrar = useMutation({
    mutationFn: async () => {
      if (!tipo) return
      if (tipo === 'contrato' && !form.assinado_em) throw new Error('Informe a data em que o contrato foi ASSINADO.')
      if (tipo === 'aso' && !form.validade) throw new Error('Informe a VALIDADE do ASO — é ela que libera o freela.')
      if (form.validade && form.emitido_em && form.validade < form.emitido_em)
        throw new Error('A validade não pode ser antes da emissão.')
      let arquivo_path: string | null = null
      if (arquivo) {
        const ext = arquivo.name.split('.').pop()?.toLowerCase() || 'pdf'
        arquivo_path = `${freelancerId}/${tipo}-${Date.now()}.${ext}`
        const up = await supabase.storage.from('pessoas').upload(arquivo_path, arquivo, { upsert: false })
        if (up.error) throw up.error
      }
      const { error } = await supabase.from('freelancer_documentos').insert({
        freelancer_id: freelancerId,
        tipo,
        emitido_em: form.emitido_em || (tipo === 'contrato' ? form.assinado_em : null) || null,
        validade: form.validade || null,
        assinado_em: tipo === 'contrato' ? form.assinado_em : null,
        arquivo_path,
        obs: form.obs.trim() || null,
        registrado_por: session?.user.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setTipo(null)
      setForm(vazio)
      setArquivo(null)
      setMsg('Documento registrado.')
      await invalidarFreelas(qc)
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('freelancer_documentos').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidarFreelas(qc),
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  async function abrir(path: string) {
    const { data, error } = await supabase.storage.from('pessoas').createSignedUrl(path, 300)
    if (error || !data) return setMsg(`🛑 ${error?.message ?? 'Arquivo não encontrado.'}`)
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  function abrirForm(t: TipoDocFreela) {
    setTipo(tipo === t ? null : t)
    setForm(t === 'contrato' ? { ...vazio, assinado_em: hoje() } : { ...vazio, emitido_em: hoje() })
    setArquivo(null)
    setMsg(null)
  }

  return (
    <div className="rounded-lg border border-[var(--pg-border)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="pg-key">Liberação para trabalhar</div>
          <div className="mt-1">
            <Badge tone={rotulo.tom}>{rotulo.texto}</Badge>
          </div>
        </div>
        {escalar && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant={tipo === 'contrato' ? 'primary' : 'secondary'} onClick={() => abrirForm('contrato')}>
              + Contrato
            </Button>
            <Button type="button" variant={tipo === 'aso' ? 'primary' : 'secondary'} onClick={() => abrirForm('aso')}>
              + ASO
            </Button>
          </div>
        )}
      </div>

      {tipo && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg bg-neutral-50 p-3 sm:grid-cols-2 dark:bg-white/5">
          {tipo === 'contrato' ? (
            <>
              <Input
                label="Assinado em"
                type="date"
                required
                value={form.assinado_em}
                onChange={(e) => setForm({ ...form, assinado_em: e.target.value })}
              />
              <Input
                label="Vigência a partir de"
                type="date"
                value={form.emitido_em}
                onChange={(e) => setForm({ ...form, emitido_em: e.target.value })}
              />
              <Input
                label="Vigência até (vazio = indeterminado)"
                type="date"
                value={form.validade}
                onChange={(e) => setForm({ ...form, validade: e.target.value })}
              />
            </>
          ) : (
            <>
              <Input
                label="Data do exame"
                type="date"
                value={form.emitido_em}
                onChange={(e) => setForm({ ...form, emitido_em: e.target.value })}
              />
              <Input
                label="Válido até"
                type="date"
                required
                value={form.validade}
                onChange={(e) => setForm({ ...form, validade: e.target.value })}
              />
            </>
          )}
          <div>
            <span className="pg-key mb-1.5 block">Arquivo (foto ou PDF)</span>
            {/* dois caminhos: capture abre a câmera direto no Android e esconde o PDF do DocuSign/da clínica */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-[var(--pg-border)] px-3 text-center text-sm font-medium">
                📷 Tirar foto
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
              </label>
              <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-[var(--pg-border)] px-3 text-center text-sm font-medium">
                📄 Escolher arquivo/PDF
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            {arquivo && <p className="mt-1 truncate text-[11px] text-neutral-500">Selecionado: {arquivo.name}</p>}
          </div>
          <div className="sm:col-span-2">
            <Input label="Observação" value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Button type="button" className="w-full sm:w-auto" disabled={registrar.isPending} onClick={() => registrar.mutate()}>
              {registrar.isPending ? 'Salvando…' : `Registrar ${DOC_FREELA_LABEL[tipo]}`}
            </Button>
          </div>
        </div>
      )}

      {msg && <p className="mb-3 text-sm">{msg}</p>}

      {!docs.length ? (
        <p className="text-sm text-neutral-500">Nenhum documento — não pode ser escalado.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--pg-border)]">
          {[...docs]
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <Badge tone="neutral">{DOC_FREELA_LABEL[d.tipo]}</Badge>
                <span className="flex-1 text-[13px]">
                  {d.tipo === 'contrato' ? (
                    <>
                      {d.assinado_em ? `assinado ${br(d.assinado_em)}` : <b className="text-red-700">não assinado</b>}
                      {' · '}
                      {d.validade ? `vigente até ${br(d.validade)}` : 'prazo indeterminado'}
                    </>
                  ) : (
                    <>
                      exame {br(d.emitido_em)} · válido até <b>{br(d.validade)}</b>
                    </>
                  )}
                  {d.obs && <span className="block text-[11px] text-neutral-500">{d.obs}</span>}
                </span>
                {d.arquivo_path && (
                  <Button type="button" variant="ghost" className="!px-2 !py-1" onClick={() => abrir(d.arquivo_path!)}>
                    Ver arquivo
                  </Button>
                )}
                {(ehAdmin || escalar) && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="!px-2 !py-1"
                    onClick={() => confirm('Remover este documento?') && remover.mutate(d.id)}
                  >
                    Remover
                  </Button>
                )}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
