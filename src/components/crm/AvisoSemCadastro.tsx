// ============================================================
// EVENTOS SEM CLIENTE CADASTRADO — o que ficou para trás
//
// Eventos criados antes do cadastro automático guardam só o nome
// digitado (events.cliente_nome). Eles não entram no histórico, na
// receita nem no NPS de ninguém. O aviso lista esses eventos e o botão
// passa todos pelo garantirClienteNoCRM — mesmo nome normalizado vira
// um cliente só ("Lumen" e "lumen " não duplicam).
// ============================================================

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'
import { garantirClienteNoCRM, normalizarNome } from '@/lib/crm'
import type { EventoCRM } from '@/tipos/pessoas'

export default function AvisoSemCadastro({
  eventos,
  podeCadastrar,
  onFeito,
}: {
  eventos: EventoCRM[]
  podeCadastrar: boolean
  onFeito: () => Promise<void> | void
}) {
  const [msg, setMsg] = useState<string | null>(null)

  const cadastrar = useMutation({
    mutationFn: async () => {
      const ids = new Map<string, string>() // nome normalizado → client_id
      let criados = 0
      for (const e of eventos) {
        const chave = normalizarNome(e.cliente_nome ?? '')
        if (!chave) continue
        let id = ids.get(chave)
        if (!id) {
          id = await garantirClienteNoCRM({
            nome: e.cliente_nome!,
            contato: e.contato,
            telefone: e.contato_telefone ?? null,
            email: e.contato_email ?? null,
            origem: 'evento',
          })
          ids.set(chave, id)
          criados++
        }
        const { error } = await supabase.from('events').update({ client_id: id, cliente_nome: null }).eq('id', e.id)
        if (error) throw error
      }
      return { clientes: criados, eventos: eventos.length }
    },
    onSuccess: async (r) => {
      setMsg(`${r.eventos} evento(s) ligados a ${r.clientes} cliente(s) no CRM.`)
      await onFeito()
    },
    onError: (e) => setMsg(`🛑 ${(e as Error).message}`),
  })

  if (!eventos.length) return msg ? <p className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-900/20 dark:text-green-200">✓ {msg}</p> : null

  return (
    <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <b>
            {eventos.length} evento(s) com cliente digitado e SEM cadastro no CRM
          </b>{' '}
          — não contam em histórico, receita nem NPS.
          <ul className="mt-1 list-disc pl-5">
            {eventos.map((e) => (
              <li key={e.id}>
                <b>{e.cliente_nome}</b> —{' '}
                <Link to={`/eventos/${e.id}`} className="underline">
                  {e.nome}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        {podeCadastrar && (
          <Button disabled={cadastrar.isPending} onClick={() => cadastrar.mutate()}>
            {cadastrar.isPending ? 'Cadastrando…' : 'Cadastrar todos no CRM'}
          </Button>
        )}
      </div>
      {msg && <p className="mt-2">{msg}</p>}
    </div>
  )
}
