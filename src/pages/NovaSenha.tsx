// ============================================================
// TROCAR SENHA
//
// Serve para dois casos, porque são o mesmo formulário:
//
//   1. RECUPERAÇÃO — a pessoa clicou no link do e-mail. O Supabase já
//      criou uma sessão de recuperação quando a página abriu, então
//      basta definir a senha nova.
//   2. TROCA VOLUNTÁRIA — quem está logado e quer mudar a própria senha.
//
// Antes disso não existia NADA: a senha era definida pelo admin no
// painel do Supabase e ninguém conseguia trocar sozinho.
// ============================================================

import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Button, Input } from '@/components/ui'

export default function NovaSenha() {
  const nav = useNavigate()
  const { session } = useAuth()
  const [senha, setSenha] = useState('')
  const [repete, setRepete] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [recuperacao, setRecuperacao] = useState(false)

  // O link do e-mail traz `type=recovery` no fragmento da URL. Saber
  // disso muda a mensagem: quem chegou por recuperação não tem senha
  // antiga para comparar, e não deve ver "voltar ao sistema".
  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) setRecuperacao(true)
    const { data: sub } = supabase.auth.onAuthStateChange((evento) => {
      if (evento === 'PASSWORD_RECOVERY') setRecuperacao(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function salvar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (senha !== repete) return setErro('As duas senhas não são iguais.')

    setSalvando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setSalvando(false)

    if (error) {
      setErro(
        /session|jwt|expired/i.test(error.message)
          ? 'O link de recuperação expirou. Peça um novo na tela de entrada.'
          : error.message
      )
      return
    }
    setOk(true)
    setSenha('')
    setRepete('')
  }

  // Sem sessão e sem link de recuperação não há o que trocar.
  if (!session && !recuperacao) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F4F3F0] p-8">
        <div className="w-full max-w-[380px]">
          <div className="pg-headline mb-6">
            <b>SENHA</b>
            <i>Link inválido</i>
          </div>
          <p className="mb-6 text-sm text-neutral-600">
            Este endereço só funciona a partir do link que chega no seu e-mail, ou se você já
            estiver dentro do sistema.
          </p>
          <Link to="/login">
            <Button className="w-full !py-3">IR PARA A ENTRADA</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F3F0] p-8">
      <form onSubmit={salvar} className="w-full max-w-[380px]">
        <div className="pg-headline mb-8">
          <b>SENHA</b>
          <i>{recuperacao ? 'Criar nova' : 'Trocar'}</i>
        </div>

        {ok ? (
          <div className="space-y-5">
            <p className="border-l-[3px] border-green-700 bg-white py-3 pl-4 pr-3 text-[13px] text-green-800">
              Senha alterada. Use a nova a partir de agora.
            </p>
            <Button className="w-full !py-3" onClick={() => nav('/')}>
              ENTRAR NO SISTEMA
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <Input
              label="NOVA SENHA"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="pelo menos 8 caracteres"
            />
            <Input
              label="REPITA A NOVA SENHA"
              type="password"
              value={repete}
              onChange={(e) => setRepete(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="••••••••"
            />

            {erro && (
              <p className="border-l-[3px] border-red-700 bg-white py-3 pl-4 pr-3 text-[13px] text-red-700">
                {erro}
              </p>
            )}

            <Button type="submit" className="w-full !py-3" disabled={salvando}>
              {salvando ? 'SALVANDO…' : 'SALVAR SENHA'}
            </Button>

            {!recuperacao && (
              <Link to="/" className="block text-center text-[11px] text-neutral-500 underline">
                voltar ao sistema
              </Link>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
