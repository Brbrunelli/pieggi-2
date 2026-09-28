// ============================================================
// 404 — endereço que não existe
//
// Sem esta rota, digitar ou recarregar um endereço errado deixava a tela
// BRANCA: o React Router não achava rota e não renderizava nada. Tela
// branca faz a pessoa achar que o sistema caiu.
// ============================================================

import { Link, useLocation } from 'react-router-dom'
import { usePermissoes } from '@/lib/permissoes'
import { Button, Card, EmptyState, PageTitle } from '@/components/ui'

export default function NaoEncontrado() {
  const { pathname } = useLocation()
  const { verComercial, verFinanceiro } = usePermissoes()

  return (
    <div className="max-w-2xl">
      <PageTitle lead="404">Endereço não encontrado</PageTitle>
      <Card>
        <EmptyState>
          <p className="mb-1">
            Não existe nada em <code>{pathname}</code>.
          </p>
          <p className="mb-4 text-xs">
            Pode ser um link antigo. Os endereços da operação mudaram: comanda e plaquinha viraram{' '}
            <b>Produção</b>, e as filas por fase viraram uma tela só.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/">
              <Button>Ir para o Painel</Button>
            </Link>
            <Link to="/operacao">
              <Button variant="secondary">Operação</Button>
            </Link>
            {verComercial && (
              <Link to="/eventos">
                <Button variant="secondary">Funil de eventos</Button>
              </Link>
            )}
            {verFinanceiro && (
              <Link to="/financeiro/notas">
                <Button variant="secondary">Financeiro</Button>
              </Link>
            )}
          </div>
        </EmptyState>
      </Card>
    </div>
  )
}
