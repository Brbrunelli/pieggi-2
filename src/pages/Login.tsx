import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/auth'
import { Button, Input } from '@/components/ui'

/**
 * Split Canvas — o layout assinatura da marca: metade ink, metade bone.
 * O wordmark ocupa a esquerda em escala grande; o formulário fica na
 * direita, sem cartão flutuante e sem sombra dura.
 */
export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setEnviando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    setEnviando(false)
    if (error) {
      setErro(
        error.message === 'Invalid login credentials'
          ? 'E-mail ou senha inválidos.'
          : error.message
      )
    }
  }

  /**
   * Manda o e-mail de recuperação.
   *
   * `redirectTo` usa a origem da página atual, então funciona tanto em
   * localhost quanto em produção sem configuração no código. O endereço
   * precisa estar liberado em Authentication → URL Configuration no
   * Supabase, senão o link volta para o lugar errado.
   *
   * A resposta é a MESMA exista ou não a conta: dizer "esse e-mail não
   * existe" entrega para qualquer curioso quem trabalha aqui.
   */
  async function recuperar() {
    setErro(null)
    setAviso(null)
    if (!email) {
      setErro('Escreva o seu e-mail acima primeiro.')
      return
    }
    setEnviando(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-senha`,
    })
    setEnviando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setAviso(
      `Se existir uma conta com ${email}, o link para criar uma senha nova chegou por e-mail. Confira a caixa de spam.`
    )
  }

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[4fr_6fr]">
      {/* ---------- lado ink ---------- */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-[#0A0A0A] p-10 text-neutral-50 md:p-14">
        {/* monograma gigante cortado pela borda, quase invisível */}
        <div
          aria-hidden
          className="pg-wordmark pointer-events-none absolute -bottom-24 -left-10 select-none text-[22rem] leading-none text-white opacity-[0.04]"
        >
          PG
        </div>

        <div className="relative">
          <div className="pg-wordmark text-3xl">
            Pieggi<sup className="ml-0.5 align-super text-[0.28em]">®</sup>
          </div>
          <div className="mt-2 text-[10px] tracking-[0.22em] text-neutral-500">
            CATERING · EVENTOS &amp; CAFETERIA
          </div>
        </div>

        <div className="pg-headline relative hidden md:block">
          <b className="!text-neutral-500">DESDE 2019</b>
          <i>Seu evento com sabor e excelência</i>
        </div>

        <div className="relative text-[10px] tracking-[0.14em] text-neutral-700">
          PIEGGI.COM.BR · @PIEGGIEVENTOS
        </div>
      </div>

      {/* ---------- lado bone ---------- */}
      <div className="flex items-center justify-center bg-[#F4F3F0] p-8 md:p-14">
        <form onSubmit={entrar} className="w-full max-w-[380px]">
          <div className="pg-headline mb-9">
            <b>ACESSO</b>
            <i>Entrar</i>
          </div>

          <div className="space-y-5">
            <Input
              label="E-MAIL"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="voce@pieggi.com.br"
            />
            <Input
              label="SENHA"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
            />

            {erro && (
              <p className="border-l-[3px] border-red-700 bg-white py-3 pl-4 pr-3 text-[13px] text-red-700">
                {erro}
              </p>
            )}
            {aviso && (
              <p className="border-l-[3px] border-green-700 bg-white py-3 pl-4 pr-3 text-[13px] text-green-800">
                {aviso}
              </p>
            )}

            <Button type="submit" className="w-full !py-3" disabled={enviando}>
              {enviando ? 'ENTRANDO…' : 'ENTRAR'}
            </Button>

            <button
              type="button"
              onClick={recuperar}
              disabled={enviando}
              className="block w-full text-center text-[11px] tracking-[0.08em] text-neutral-500 underline transition-colors hover:text-neutral-900 disabled:opacity-50"
            >
              ESQUECI MINHA SENHA
            </button>
          </div>

          <p className="mt-8 text-[11px] leading-relaxed text-neutral-500">
            O acesso é criado pelo administrador. Se você ainda não tem login, fale com o Bruno.
          </p>
        </form>
      </div>
    </div>
  )
}
