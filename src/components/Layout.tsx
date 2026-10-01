import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { PAPEL_LABEL, usePermissoes, type Permissoes } from '@/lib/permissoes'
import { MODO_DEMO } from '@/demo/modo'
import BarraDemo from '@/demo/BarraDemo'
import CartaoCenario from '@/demo/CartaoCenario'

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
  // o motorista só vê as próprias viagens — o resto do menu some
  { titulo: null, mostrar: (p) => !p.ehMotorista, itens: [{ to: '/', label: 'Painel', end: true }] },
  {
    titulo: null,
    mostrar: (p) => p.ehMotorista,
    itens: [{ to: '/motorista', label: 'Minha rota' }],
  },
  {
    titulo: 'Comercial',
    mostrar: (p) => p.verComercial,
    itens: [
      { to: '/briefing', label: 'Briefing' },
      { to: '/eventos', label: 'Funil de eventos' },
      { to: '/crm', label: 'CRM' },
      { to: '/cs', label: 'Sucesso do cliente' },
    ],
  },
  {
    titulo: 'Operação',
    // A Operação é uma tela e a fase abre direto dela (o antigo menu por
    // fase era lista-para-chegar-na-lista). As telas de produção são por
    // estação: cada praça abre a sua, na TV da cozinha.
    mostrar: (p) => !p.ehMotorista,
    itens: [
      { to: '/operacao', label: 'Operação', end: true },
      { to: '/producao/confeitaria', label: 'Produção — Confeitaria', mostrar: (p) => p.marcarPronto || p.ehAdmin },
      { to: '/producao/fria', label: 'Produção — Cozinha fria', mostrar: (p) => p.marcarPronto || p.ehAdmin },
      { to: '/producao/quente', label: 'Produção — Cozinha quente', mostrar: (p) => p.marcarPronto || p.ehAdmin },
      { to: '/expedicao', label: 'Expedição', mostrar: (p) => p.conferirCampo },
    ],
  },
  {
    titulo: 'Compras',
    // fornecedor é cadastro de COMPRA; o pedido vira conta a pagar
    mostrar: (p) => p.verCompras || p.marcarPronto,
    itens: [
      { to: '/compras', label: 'Lista de compras', end: true },
      { to: '/compras/pedidos', label: 'Pedidos de compra', mostrar: (p) => p.verCompras },
      { to: '/compras/receber', label: 'Receber mercadoria', mostrar: (p) => p.receberCompra },
      { to: '/compras/fornecedores', label: 'Fornecedores', mostrar: (p) => p.verCompras },
    ],
  },
  {
    titulo: 'Logística',
    // a rua: expedição confere a saída, Adriana e coordenadores o resto
    mostrar: (p) => p.conferirCampo || p.verEquipe,
    itens: [
      { to: '/rua', label: 'Rua', end: true, mostrar: (p) => p.conferirCampo },
      { to: '/rua/transporte', label: 'Rotas do dia' },
      { to: '/rua/escala', label: 'Escala', mostrar: (p) => p.verEquipe },
      { to: '/rua/freelancers', label: 'Freelancers', mostrar: (p) => p.verEquipe },
    ],
  },
  {
    titulo: 'Financeiro',
    mostrar: (p) => p.verFinanceiro,
    itens: [
      { to: '/financeiro/caixa', label: 'Fluxo de caixa' },
      { to: '/financeiro/receber', label: 'Contas a receber' },
      { to: '/financeiro/pagar', label: 'Contas a pagar' },
      { to: '/financeiro/notas', label: 'Notas fiscais' },
    ],
  },
]

/**
 * FERRAMENTAS — cadastros e parâmetros. Não é trabalho do dia a dia, então
 * sai da barra lateral e vira um botão pequeno no canto (pedido do Bruno).
 * O comercial vê só as tabelas de preço; o financeiro, o cadastro fiscal.
 */
const FERRAMENTAS: ItemNav[] = [
  { to: '/admin/clientes', label: 'Clientes', mostrar: (p) => p.administrar },
  { to: '/admin/catalogo', label: 'Catálogo', mostrar: (p) => p.administrar },
  { to: '/admin/precos', label: 'Tabelas de preço', mostrar: (p) => p.verValores },
  { to: '/admin/fiscal', label: 'Fiscal e impostos', mostrar: (p) => p.verFinanceiro },
  { to: '/admin/regras', label: 'Parâmetros de regra', mostrar: (p) => p.administrar },
  { to: '/admin/materiais', label: 'Materiais', mostrar: (p) => p.administrar },
  { to: '/admin/checklist', label: 'Checklist da rua', mostrar: (p) => p.administrar },
  { to: '/admin/notificacoes', label: 'Notificações', mostrar: (p) => p.administrar },
]

function MenuFerramentas({ permissoes }: { permissoes: Permissoes }) {
  const [aberto, setAberto] = useState(false)
  const itens = FERRAMENTAS.filter((i) => !i.mostrar || i.mostrar(permissoes))
  if (!itens.length) return null
  return (
    <div className="relative">
      <button
        onClick={() => setAberto(!aberto)}
        className="rounded-full border border-[var(--pg-border)] px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-neutral-500 transition-all duration-300 hover:text-[var(--pg-text)]"
        title="Cadastros e parâmetros"
      >
        ⚙ FERRAMENTAS
      </button>
      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 z-40 mt-2 w-56 rounded-lg border border-[var(--pg-border)] bg-[var(--pg-surface)] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,.12)]">
            {itens.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                onClick={() => setAberto(false)}
                className="block rounded-md px-3 py-2 text-[13px] text-neutral-600 hover:bg-[var(--pg-border)]/40 hover:text-[var(--pg-text)]"
              >
                {i.label}
              </NavLink>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

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
  // celular: a barra lateral vira gaveta. A rua usa o sistema no salão,
  // e 230 px fixos comiam metade da tela do telefone.
  const [menuAberto, setMenuAberto] = useState(false)
  const modulos = MODULOS.filter((m) => !m.mostrar || m.mostrar(permissoes)).map((m) => ({
    ...m,
    itens: m.itens.filter((i) => !i.mostrar || i.mostrar(permissoes)),
  }))

  return (
    <div className="flex min-h-screen">
      {menuAberto && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenuAberto(false)} />
      )}
      {/* ---------- barra lateral: sempre ink, em qualquer tema ---------- */}
      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-[230px] shrink-0 flex-col gap-7 bg-[#0A0A0A] px-[18px] py-[26px] text-neutral-50 ' +
          'transition-transform duration-300 md:static md:translate-x-0 ' +
          (menuAberto ? 'translate-x-0' : '-translate-x-full')
        }
      >
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
                    onClick={() => setMenuAberto(false)}
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
        <header className="flex items-center justify-end gap-3 border-b border-[var(--pg-border)] px-4 py-4 md:px-8">
          <button
            onClick={() => setMenuAberto(true)}
            className="mr-auto rounded-full border border-[var(--pg-border)] px-4 py-2 text-[11px] font-semibold tracking-[0.1em] md:hidden"
          >
            MENU
          </button>
          <MenuFerramentas permissoes={permissoes} />
          <button
            onClick={alternar}
            title={tema === 'dark' ? 'Mudar para claro' : 'Mudar para escuro'}
            className="rounded-full border border-[var(--pg-border)] px-4 py-2 text-[11px] font-semibold tracking-[0.1em] transition-all duration-300 hover:bg-[var(--pg-text)] hover:text-[var(--pg-bg)]"
          >
            {tema === 'dark' ? 'CLARO' : 'ESCURO'}
          </button>
        </header>
        {MODO_DEMO && <BarraDemo />}

        <main className="flex-1 overflow-y-auto px-4 py-7 pb-16 md:px-8">
          <div className="pg-rise mx-auto max-w-[1440px]">
            {MODO_DEMO && <CartaoCenario />}
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
