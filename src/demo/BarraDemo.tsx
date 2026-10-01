// Faixa do modo demonstração: avisa que nada vai para o banco e deixa
// trocar de papel para ver cada tela como quem usa de verdade.

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { PAPEL_LABEL } from '@/lib/permissoes'
import { entrarComoPerfil } from './cliente'
import { resetarCenarios } from './banco'
import { sairDaDemo } from './modo'
import type { Profile } from '@/types'

export default function BarraDemo() {
  const { profile } = useAuth()
  const { data: perfis } = useQuery({
    queryKey: ['demo-perfis'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('*').order('role')
      return (data ?? []) as Profile[]
    },
  })

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900 md:px-8">
      <b className="tracking-[0.1em]">🧪 MODO DEMONSTRAÇÃO</b>
      <span className="hidden sm:inline">— cenários de teste, nada vai para o banco.</span>
      <label className="ml-auto flex items-center gap-1.5">
        Ver como
        <select
          className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs"
          value={profile?.id ?? ''}
          onChange={(e) => entrarComoPerfil(e.target.value)}
        >
          {(perfis ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} — {PAPEL_LABEL[p.role]}
            </option>
          ))}
        </select>
      </label>
      <button
        className="rounded-md border border-amber-300 px-2 py-1 hover:bg-amber-100"
        onClick={() => confirm('Voltar todos os cenários ao começo?') && resetarCenarios()}
      >
        Resetar cenários
      </button>
      <button className="rounded-md border border-amber-300 px-2 py-1 hover:bg-amber-100" onClick={sairDaDemo}>
        Sair da demonstração
      </button>
    </div>
  )
}
