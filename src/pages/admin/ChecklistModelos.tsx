// ============================================================
// MODELOS DE CHECKLIST DA RUA
//
// O que a equipe precisa provar em cada momento do evento. Mudou o
// padrão (ex.: passou a exigir foto do buffet de bebidas)? Muda aqui —
// vale para todo evento a partir de agora, sem mexer em código.
//
// "Obrigatório" trava o avanço da fase de campo; "exige foto" só deixa
// marcar tirando a foto.
// ============================================================

import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Card, EmptyState, Input, PageTitle, Select } from '@/components/ui'
import {
  MOMENTO_LABEL,
  SERVICE_TYPE_LABEL,
  type ChecklistMomento,
  type ChecklistTemplate,
  type ServiceType,
} from '@/types'

const MOMENTOS = Object.keys(MOMENTO_LABEL) as ChecklistMomento[]

const vazio = {
  momento: 'montagem' as ChecklistMomento,
  texto: '',
  detalhe: '',
  service_types: [] as ServiceType[],
  exige_foto: true,
  obrigatorio: true,
  ordem: '0',
  ativo: true,
}

export default function ChecklistModelos() {
  const qc = useQueryClient()
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazio)
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['checklist-modelos-admin'],
    queryFn: async () => {
      const { data, error } = await supabase.from('checklist_templates').select('*').order('ordem')
      if (error) throw error
      return data as ChecklistTemplate[]
    },
  })

  function editar(t: ChecklistTemplate) {
    setEditId(t.id)
    setForm({
      momento: t.momento,
      texto: t.texto,
      detalhe: t.detalhe ?? '',
      service_types: t.service_types ?? [],
      exige_foto: t.exige_foto,
      obrigatorio: t.obrigatorio,
      ordem: String(t.ordem),
      ativo: t.ativo,
    })
    setAberto(true)
  }

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    const payload = {
      momento: form.momento,
      texto: form.texto.trim(),
      detalhe: form.detalhe.trim() || null,
      service_types: form.service_types.length ? form.service_types : null,
      exige_foto: form.exige_foto,
      obrigatorio: form.obrigatorio,
      ordem: Number(form.ordem) || 0,
      ativo: form.ativo,
    }
    const r = editId
      ? await supabase.from('checklist_templates').update(payload).eq('id', editId)
      : await supabase.from('checklist_templates').insert(payload)
    if (r.error) return setErro(r.error.message)
    setAberto(false)
    setEditId(null)
    setForm(vazio)
    await qc.invalidateQueries({ queryKey: ['checklist-modelos-admin'] })
    await qc.invalidateQueries({ queryKey: ['checklist-modelos'] })
  }

  function alternarTipo(t: ServiceType) {
    setForm({
      ...form,
      service_types: form.service_types.includes(t)
        ? form.service_types.filter((x) => x !== t)
        : [...form.service_types, t],
    })
  }

  return (
    <div>
      <PageTitle
        actions={
          <Button
            onClick={() => {
              setEditId(null)
              setForm(vazio)
              setAberto(!aberto)
            }}
          >
            + Novo item
          </Button>
        }
      >
        Checklist da rua
      </PageTitle>

      {aberto && (
        <Card title={editId ? 'Editar item' : 'Novo item'} className="mb-6">
          <form onSubmit={salvar} className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select
              label="Momento"
              value={form.momento}
              onChange={(e) => setForm({ ...form, momento: e.target.value as ChecklistMomento })}
            >
              {MOMENTOS.map((m) => (
                <option key={m} value={m}>
                  {MOMENTO_LABEL[m]}
                </option>
              ))}
            </Select>
            <div className="md:col-span-2">
              <Input label="O que conferir" required value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <Input
                label="Instrução para a equipe"
                placeholder="ex.: foto de frente, mesa inteira"
                value={form.detalhe}
                onChange={(e) => setForm({ ...form, detalhe: e.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <span className="pg-key mb-1.5 block">Só nos dias com estes serviços (nenhum marcado = todo evento)</span>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SERVICE_TYPE_LABEL) as ServiceType[]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => alternarTipo(t)}
                    className={`rounded-full px-3 py-1 text-[11px] ${
                      form.service_types.includes(t)
                        ? 'bg-[var(--pg-text)] text-[var(--pg-bg)]'
                        : 'border border-[var(--pg-border)] text-neutral-500'
                    }`}
                  >
                    {SERVICE_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.exige_foto} onChange={(e) => setForm({ ...form, exige_foto: e.target.checked })} />
              Exige foto
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.obrigatorio} onChange={(e) => setForm({ ...form, obrigatorio: e.target.checked })} />
              Obrigatório (trava a fase)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
              Ativo
            </label>
            <Input label="Ordem" inputMode="numeric" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: e.target.value })} />
            {erro && <p className="text-sm text-red-600 md:col-span-3">{erro}</p>}
            <div className="md:col-span-3">
              <Button type="submit">{editId ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Carregando…</p>
      ) : !data?.length ? (
        <EmptyState>Nenhum item. A migration 0030 cria o checklist padrão.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {MOMENTOS.map((m) => (
            <Card key={m} title={MOMENTO_LABEL[m]}>
              <div className="flex flex-col divide-y divide-[var(--pg-border)]">
                {data
                  .filter((t) => t.momento === m)
                  .map((t) => (
                    <div key={t.id} className={`flex items-start gap-3 py-2.5 ${t.ativo ? '' : 'opacity-50'}`}>
                      <div className="flex-1">
                        <div className="text-sm">{t.texto}</div>
                        {t.detalhe && <div className="text-[11px] text-neutral-500">{t.detalhe}</div>}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {t.exige_foto && <Badge tone="blue">📷 foto</Badge>}
                          {t.obrigatorio ? <Badge tone="amber">obrigatório</Badge> : <Badge tone="neutral">opcional</Badge>}
                          {t.service_types?.length ? (
                            <Badge tone="neutral">{t.service_types.map((s) => SERVICE_TYPE_LABEL[s]).join(', ')}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <Button variant="ghost" className="!px-2 !py-1" onClick={() => editar(t)}>
                        Editar
                      </Button>
                    </div>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
