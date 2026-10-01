// O "card teste" de cada página na demonstração: a situação hipotética
// e o que experimentar. Fecha e lembra fechado por página.

import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PAPEL_LABEL } from '@/lib/permissoes'
import { roteiroDa } from './roteiro'
import type { UserRole } from '@/types'

const CHAVE = 'pg-demo-cartao-fechado'

function fechados(): string[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? '[]')
  } catch {
    return []
  }
}

export default function CartaoCenario() {
  const { pathname } = useLocation()
  const r = roteiroDa(pathname)
  const [, recarregar] = useState(0)
  if (!r) return null
  const fechado = fechados().includes(r.rota)

  function alternar() {
    const lista = fechados()
    const nova = fechado ? lista.filter((x) => x !== r!.rota) : [...lista, r!.rota]
    try {
      localStorage.setItem(CHAVE, JSON.stringify(nova))
    } catch {
      /* ignore */
    }
    recarregar((n) => n + 1)
  }

  if (fechado)
    return (
      <button onClick={alternar} className="mb-4 text-[11px] font-semibold tracking-[0.1em] text-amber-700 underline">
        🧪 VER CENÁRIO DE TESTE DESTA PÁGINA
      </button>
    )

  return (
    <div className="mb-6 rounded-lg border border-dashed border-amber-400 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
      <div className="mb-1 flex items-center gap-2">
        <b className="text-[11px] tracking-[0.12em]">🧪 CENÁRIO DE TESTE — {r.titulo.toUpperCase()}</b>
        {r.papel && (
          <span className="rounded-full border border-amber-400 px-2 py-0.5 text-[10px]">
            melhor visto como: {PAPEL_LABEL[r.papel as UserRole] ?? r.papel}
          </span>
        )}
        <button onClick={alternar} className="ml-auto text-[11px] underline">
          fechar
        </button>
      </div>
      <p className="mb-1.5">{r.cenario}</p>
      <ul className="list-inside list-disc text-xs text-amber-900">
        {r.testar.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  )
}
