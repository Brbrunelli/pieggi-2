import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, RequireAuth, RequirePermissao } from '@/lib/auth'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import NaoEncontrado from '@/pages/NaoEncontrado'
import NovaSenha from '@/pages/NovaSenha'
import Dashboard from '@/pages/Dashboard'
import EventosList from '@/pages/eventos/EventosList'
import EventoForm from '@/pages/eventos/EventoForm'
import EventoDetail from '@/pages/eventos/EventoDetail'
import Proposta from '@/pages/eventos/Proposta'
import Contrato from '@/pages/eventos/Contrato'
import Programacao from '@/pages/eventos/Programacao'
import Producao from '@/pages/eventos/Producao'
import Estudio from '@/pages/eventos/Estudio'
import Briefing from '@/pages/eventos/Briefing'
import CS from '@/pages/comercial/CS'
import FaseGuard from '@/components/FaseGuard'
import Quadro from '@/pages/operacao/Quadro'
import Compras from '@/pages/Compras'
import Notas from '@/pages/financeiro/Notas'
import Receber from '@/pages/financeiro/Receber'
import Fiscal from '@/pages/admin/Fiscal'
import Clientes from '@/pages/admin/Clientes'
import Catalogo from '@/pages/admin/Catalogo'
import Precos from '@/pages/admin/Precos'
import Regras from '@/pages/admin/Regras'
import Notificacoes from '@/pages/admin/Notificacoes'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* fora do RequireAuth: a pessoa chega aqui pelo link do
                e-mail, e a sessão de recuperação é criada pela própria
                página — exigir login antes seria círculo fechado */}
            <Route path="/nova-senha" element={<NovaSenha />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/eventos/:id" element={<EventoDetail />} />

              {/* Comercial — funil, proposta e estúdio mostram valores;
                  a cozinha entra direto na fase pela fila de operação */}
              <Route
                element={
                  <RequirePermissao pode={(p) => p.verComercial} area="a área comercial">
                    <Outlet />
                  </RequirePermissao>
                }
              >
                <Route path="/eventos" element={<EventosList />} />
                <Route path="/eventos/novo" element={<EventoForm />} />
                <Route path="/briefing" element={<Briefing />} />
                <Route path="/cs" element={<CS />} />
                <Route path="/eventos/:id/editar" element={<EventoForm />} />
                <Route path="/eventos/:id/proposta" element={<Proposta />} />
                <Route path="/eventos/:id/contrato" element={<Contrato />} />
                <Route path="/eventos/:id/estudio" element={<Estudio />} />
              </Route>
              <Route
                path="/eventos/:id/programacao"
                element={
                  <FaseGuard>
                    <Programacao />
                  </FaseGuard>
                }
              />
              <Route
                path="/eventos/:id/producao"
                element={
                  <FaseGuard>
                    <Producao />
                  </FaseGuard>
                }
              />
              {/* Comanda e plaquinha viraram a fase Produção. Os endereços
                  antigos continuam valendo — há link salvo e gente com a
                  URL no favorito. */}
              <Route
                path="/eventos/:id/comandas"
                element={<Navigate to="../producao" replace relative="path" />}
              />
              <Route
                path="/eventos/:id/plaquinhas"
                element={<Navigate to="../producao" replace relative="path" />}
              />
              {/* Operação — uma tela só. As filas por fase (Fila.tsx) eram
                  listas de eventos para escolher um: dois cliques até a
                  fase e um estado vazio que mandava para o funil. Todos os
                  endereços antigos caem no quadro. */}
              <Route path="/operacao" element={<Quadro />} />
              <Route path="/operacao/programacao" element={<Navigate to="/operacao" replace />} />
              <Route path="/operacao/producao" element={<Navigate to="/operacao" replace />} />
              <Route path="/operacao/comandas" element={<Navigate to="/operacao" replace />} />
              <Route path="/operacao/plaquinhas" element={<Navigate to="/operacao" replace />} />
              <Route path="/compras" element={<Compras />} />

              {/* Financeiro — NF e contas a receber: caixa da empresa,
                  separado do preço de venda que o comercial vê */}
              <Route
                element={
                  <RequirePermissao pode={(p) => p.verFinanceiro} area="o financeiro">
                    <Outlet />
                  </RequirePermissao>
                }
              >
                <Route path="/financeiro/notas" element={<Notas />} />
                <Route path="/financeiro/receber" element={<Receber />} />
              </Route>
              {/* cadastro fiscal: admin cadastra, financeiro consulta */}
              <Route
                path="/admin/fiscal"
                element={
                  <RequirePermissao pode={(p) => p.verFinanceiro} area="o cadastro fiscal">
                    <Fiscal />
                  </RequirePermissao>
                }
              />
              {/* tabelas de preço: o comercial VÊ (leitura); só admin edita */}
              <Route
                path="/admin/precos"
                element={
                  <RequirePermissao pode={(p) => p.verValores} area="as tabelas de preço">
                    <Precos />
                  </RequirePermissao>
                }
              />
              {/* cadastros e parâmetros: só admin, inclusive por URL */}
              <Route
                element={
                  <RequirePermissao pode={(p) => p.administrar} area="a administração">
                    <Outlet />
                  </RequirePermissao>
                }
              >
                <Route path="/admin/clientes" element={<Clientes />} />
                <Route path="/admin/catalogo" element={<Catalogo />} />
                <Route path="/admin/regras" element={<Regras />} />
                <Route path="/admin/notificacoes" element={<Notificacoes />} />
              </Route>

              {/* qualquer outro endereço: sem isto a tela ficava BRANCA e
                  parecia que o sistema tinha caído */}
              <Route path="*" element={<NaoEncontrado />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
