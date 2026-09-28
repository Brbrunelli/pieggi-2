import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { PAPEL_LABEL, usePermissoes, type Permissoes } from '@/lib/permissoes'

interface ItemNav {
  to: string
  label: string
  end?: boolean
  mostrar?: (p: Permissoes) => boolean
}

// Sem emoji no menu: a marca é monocromática e tipográfica.
// `mostrar` decide o que cada papel enxerga — a cozinha não precisa do funil
// nem dos cadastros; some do menu em vez de virar erro de permissão depois.
const MODULOS: {
  titulo: string | null
  itens: ItemNav[]
  mostrar?: (p: Permissoes) => boolean
}[] = [
  { titulo: null, itens: [{ to: '/', label: 'Painel', end: true }] },
  {
    titulo: 'Comercial',
    mostrar: (p) => p.verComercial,
    itens: [
      { to: '/briefing', label: 'Briefing' },
      { to: '/eventos', label: 'Funil de eventos' },
      { to: '/cs', label: 'Sucesso do cliente' },
    ],
  },
  {
    titulo: 'Operação',
    // Um item só para a operação inteira.
    //
    // Antes havia "Programação" e "Produção" no menu, mas eram LISTAS de
    // eventos por fase: clicar em "Programação" levava a uma lista para
    // escolher o evento — com um link para o funil no estado vazio. Era
    // lista-para-chegar-na-lista, e a fase de verdade ficava a dois
    // cliques. Agora a Operação é uma tela e a fase abre direto dela.
    itens: [
      { to: '/operacao', label: 'Operação', end: true },
      { to: '/compras', label: 'Compras' },
    ],
  },
  {
    titulo: 'Financeiro',
    mostrar: (p) => p.verFinanceiro,
    itens: [
      { to: '/financeiro/notas', label: 'Notas fiscais' },
      { to: '/financeiro/receber', label: 'Contas a receber' },
    ],
  },
  {
    titulo: 'Administração',
    // o comercial entra aqui só pelas tabelas de preço (leitura), e o
    // financeiro só pelo cadastro fiscal
    mostrar: (p) => p.administrar || p.verValores || p.verFinanceiro,
    itens: [
      { to: '/admin/clientes', label: 'Clientes', mostrar: (p) => p.administrar },
      { to: '/admin/catalogo', label: 'Catálogo', mostrar: (p) => p.administrar },
      { to: '/admin/precos', label: 'Tabelas de preço', mostrar: (p) => p.verValores },
      { to: '/admin/fiscal', label: 'Fiscal e impostos', mostrar: (p) => p.verFinanceiro },
      { to: '/admin/regras', label: 'Parâmetros de regra', mostrar: (p) => p.administrar },
      { to: '/admin/notificacoes', label: 'Notificações', mostrar: (p) => p.administrar },
    ],
  },
]

/** Claro × escuro. Fica no <html data-t> e é lembrado entre sessões. */
function useTema() {
  const [tema, setTema] = useState<'light' | 'dark'>(
    () => (document.documentElement.dataset.t as 'light' | 'dark') ?? 'light'
  )
  useEffect(() => {
    document.documentElement.dataset.t = tema
    try {
      localStorage.setItem('pg-tema', tema)
    } catch {
      /* navegador sem storage — o tema só não persiste */
    }
  }, [tema])
  return { tema, alternar: () => setTema((t) => (t === 'dark' ? 'light' : 'dark')) }
}

export default function Layout() {
  const { profile, signOut } = useAuth()
  const permissoes = usePermissoes()
  const { tema, alternar } = useTema()
  const modulos = MODULOS.filter((m) => !m.mostrar || m.mostrar(permissoes)).map((m) => ({
    ...m,
    itens: m.itens.filter((i) => !i.mostrar || i.mostrar(permissoes)),
  }))

  return (
    <div className="flex min-h-screen">
      {/* ---------- barra lateral: sempre ink, em qualquer tema ---------- */}
      <aside className="flex w-[230px] shrink-0 flex-col gap-7 bg-[#0A0A0A] px-[18px] py-[26px] text-neutral-50">
        <div>
          <div className="pg-wordmark text-xl">
            Pieggi<sup className="ml-0.5 align-super text-[0.28em]">®</sup>
          </div>
          <div className="mt-1.5 text-[9px] tracking-[0.22em] text-neutral-500">
            CATERING · EVENTOS &amp; CAFETERIA
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto">
          {modulos.map((mod, i) => (
            <div key={mod.titulo ?? i}>
              {mod.titulo && (
                <div className="mb-1.5 px-3 text-[9px] font-medium tracking-[0.2em] text-neutral-700">
                  {mod.titulo.toUpperCase()}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                {mod.itens.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    className={({ isActive }) =>
                      'rounded-lg px-3 py-2.5 text-[13px] transition-all duration-300 ' +
                      '[transition-timing-function:cubic-bezier(.16,1,.3,1)] ' +
                      (isActive
                        ? 'bg-white font-semibold text-black'
                        : 'text-neutral-400 hover:translate-x-1 hover:bg-white/10 hover:text-white')
                    }
                  >
                    {n.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/10 pt-4">
          <div className="truncate text-[13px] text-neutral-300">
            {profile?.nome || profile?.email || 'Usuário'}
          </div>
          <div className="pg-key mt-0.5 !text-neutral-700">
            {profile?.role ? PAPEL_LABEL[profile.role] : ''}
          </div>
          <div className="mt-3 flex flex-col gap-1.5">
            {/* cada um troca a própria senha: antes só o admin conseguia,
                pelo painel do Supabase */}
            <NavLink
              to="/nova-senha"
              className="text-[11px] tracking-[0.14em] text-neutral-500 transition-colors duration-300 hover:text-white"
            >
              TROCAR SENHA
            </NavLink>
            <button
              onClick={signOut}
              className="text-left text-[11px] tracking-[0.14em] text-neutral-500 transition-colors duration-300 hover:text-white"
            >
              SAIR
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- área de conteúdo ---------- */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-end gap-3 border-b border-[var(--pg-border)] px-8 py-4">
          <button
            onClick={alternar}
            title={tema === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
            className="rounded-full border border-[var(--pg-border)] px-4 py-2 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 hover:bg-[var(--pg-text)] hover:text-[var(--pg-bg)]"
          >
            {tema === 'dark' ? 'CLARO' : 'ESCURO'}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto px-8 py-7 pb-16">
          <div className="pg-rise mx-auto max-w-[1440px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
