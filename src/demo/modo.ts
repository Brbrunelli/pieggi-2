// ============================================================
// MODO DEMONSTRAÇÃO — liga/desliga
//
// O sistema roda inteiro com CENÁRIOS DE TESTE guardados no navegador,
// sem tocar no Supabase. Serve para ver as telas novas antes de aplicar
// qualquer migration — nada do que se faz aqui chega ao banco real.
//
// Liga:    ?demo=1 na URL (fica lembrado) · botão no login · ou quando o
//          .env não tem Supabase configurado
// Desliga: ?demo=0 na URL · botão "Sair da demonstração"
// ============================================================

const CHAVE = 'pg-demo'

function ler(): boolean {
  try {
    const url = new URL(window.location.href)
    const p = url.searchParams.get('demo')
    if (p === '1') localStorage.setItem(CHAVE, '1')
    if (p === '0') localStorage.removeItem(CHAVE)
    if (p !== null) {
      url.searchParams.delete('demo')
      window.history.replaceState(null, '', url.toString())
    }
    if (localStorage.getItem(CHAVE) === '1') return true
  } catch {
    /* sem storage: segue a configuração */
  }
  return !import.meta.env.VITE_SUPABASE_URL
}

/** Decidido UMA vez, no carregamento — trocar exige recarregar a página. */
export const MODO_DEMO = ler()

export function entrarNaDemo() {
  try {
    localStorage.setItem(CHAVE, '1')
  } catch {
    /* ignore */
  }
  window.location.href = '/'
}

export function sairDaDemo() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    /* ignore */
  }
  window.location.href = '/login'
}
