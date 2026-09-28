import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate } from 'react-router-dom'
import { supabase } from './supabase'
import { PAPEL_LABEL, permissoesDe, type Permissoes } from './permissoes'
import type { Profile } from '@/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // undefined = ainda buscando. A diferença importa: o papel decide o que a
  // tela deixa editar, e tratar "não carregou" como "não é admin" faria o
  // admin ver a tela travada por um instante a cada refresh.
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined)
  const [carregandoSessao, setCarregandoSessao] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCarregandoSessao(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) {
      setProfile(null)
      return
    }
    setProfile(undefined)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => setProfile((data as Profile | null) ?? null))
  }, [session?.user?.id])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const loading = carregandoSessao || (Boolean(session) && profile === undefined)

  return (
    <AuthContext.Provider value={{ session, profile: profile ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-neutral-500">
        Carregando…
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

/**
 * Rota condicionada ao papel. Trava a URL digitada na mão, não só o item
 * do menu — o `pode` recebe as permissões do usuário logado.
 *
 *   <RequirePermissao pode={(p) => p.verValores} area="preços">…
 */
export function RequirePermissao({
  pode,
  area,
  children,
}: {
  pode: (p: Permissoes) => boolean
  area: string
  children: ReactNode
}) {
  const { profile, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-neutral-500">Carregando…</div>
    )
  }
  const permissoes = permissoesDe(profile?.role)
  if (!pode(permissoes)) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--pg-border)] p-12 text-center text-sm text-neutral-500">
        🔒 Você não tem acesso a {area}. Seu papel é{' '}
        <b>{permissoes.papel ? PAPEL_LABEL[permissoes.papel] : 'indefinido'}</b>.
      </div>
    )
  }
  return <>{children}</>
}
