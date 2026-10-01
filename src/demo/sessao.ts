// Quem está "logado" na demonstração — o seletor de papel troca isto.
export const CHAVE_SESSAO = 'pg-demo-sessao'

export function getSessaoDemoId(): string | null {
  try {
    return localStorage.getItem(CHAVE_SESSAO)
  } catch {
    return null
  }
}
