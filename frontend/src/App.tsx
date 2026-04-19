import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SidebarProvider } from './context/SidebarContext';
import LoginPage from './pages/LoginPage';
import CustomerDashboard from './pages/customer/Dashboard';
import CustomerTickets from './pages/customer/Tickets';
import CustomerTicketDetail from './pages/customer/TicketDetail';
import CustomerNewTicket from './pages/customer/NewTicket';
import AgentDashboard from './pages/agent/Dashboard';
import AgentTickets from './pages/agent/Tickets';
import AdminDashboard from './pages/admin/Dashboard';
import AdminTickets from './pages/admin/AdminTickets';
import AdminCustomers from './pages/admin/Customers';
import CustomerForm from './pages/admin/CustomerForm';
import TicketForm from './pages/admin/TicketForm';
import NewTicketPage from './pages/admin/NewTicketPage';
import AdminColaboradores from './pages/admin/AdminColaboradores';
import ColaboradorForm from './pages/admin/ColaboradorForm';
import AdminProducts from './pages/admin/Products';
import ProductForm from './pages/admin/ProductForm';
import AdminSLAs from './pages/admin/SLAs';
import KnowledgeBase from './pages/KnowledgeBase';
import KBArticleDetail from './pages/KBArticleDetail';
import AdminKB from './pages/admin/AdminKB';
import AdminCategories from './pages/admin/Categories';
import AIApprovals from './pages/admin/AIApprovals';
import AIActivity from './pages/admin/AIActivity';
import AIMetrics from './pages/admin/AIMetrics';
import AIRules from './pages/admin/AIRules';
import AIFerramentas from './pages/admin/AIFerramentas';
import AIAgent from './pages/admin/AIAgent';
import KBRAG from './pages/admin/KBRAG';
import CustomerProducts from './pages/customer/Products';

const queryClient = new QueryClient();

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return <>{children}</>;
}

function RoleRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="flex items-center justify-center h-screen">Loading...</div>;

  if (!user) return <LoginPage />;

  switch (user.role) {
    case 'admin':
      return <Navigate to="/admin" replace />;
    case 'agent':
      return <Navigate to="/agent" replace />;
    case 'customer':
      return <Navigate to="/customer" replace />;
    default:
      return <LoginPage />;
  }
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RoleRouter />} />

      {/* Customer Routes */}
      <Route path="/customer" element={
        <ProtectedRoute roles={['customer']}><CustomerDashboard /></ProtectedRoute>
      } />
      <Route path="/customer/tickets" element={
        <ProtectedRoute roles={['customer']}><CustomerTickets /></ProtectedRoute>
      } />
      <Route path="/customer/tickets/new" element={
        <ProtectedRoute roles={['customer']}><CustomerNewTicket /></ProtectedRoute>
      } />
      <Route path="/customer/tickets/:id" element={
        <ProtectedRoute roles={['customer']}><CustomerTicketDetail /></ProtectedRoute>
      } />
      <Route path="/customer/products" element={
        <ProtectedRoute roles={['customer']}><CustomerProducts /></ProtectedRoute>
      } />

      {/* Agent Routes */}
      <Route path="/agent" element={
        <ProtectedRoute roles={['agent']}><AgentDashboard /></ProtectedRoute>
      } />
      <Route path="/agent/tickets" element={
        <ProtectedRoute roles={['agent']}><AgentTickets /></ProtectedRoute>
      } />

      {/* Admin Routes */}
      <Route path="/admin" element={
        <ProtectedRoute roles={['admin']}><AdminDashboard /></ProtectedRoute>
      } />
      <Route path="/admin/tickets" element={
        <ProtectedRoute roles={['admin']}><AdminTickets /></ProtectedRoute>
      } />
      <Route path="/admin/tickets/new" element={
        <ProtectedRoute roles={['admin']}><NewTicketPage /></ProtectedRoute>
      } />
      <Route path="/admin/tickets/:id/edit" element={
        <ProtectedRoute roles={['admin']}><TicketForm /></ProtectedRoute>
      } />
      <Route path="/admin/tickets/:id" element={
        <ProtectedRoute roles={['admin']}><TicketForm /></ProtectedRoute>
      } />
      <Route path="/admin/clientes" element={
        <ProtectedRoute roles={['admin']}><AdminCustomers /></ProtectedRoute>
      } />
      <Route path="/admin/clientes/new" element={
        <ProtectedRoute roles={['admin']}><CustomerForm /></ProtectedRoute>
      } />
      <Route path="/admin/clientes/:id/edit" element={
        <ProtectedRoute roles={['admin']}><CustomerForm /></ProtectedRoute>
      } />
      <Route path="/admin/colaboradores" element={
        <ProtectedRoute roles={['admin']}><AdminColaboradores /></ProtectedRoute>
      } />
      <Route path="/admin/colaboradores/new" element={
        <ProtectedRoute roles={['admin']}><ColaboradorForm /></ProtectedRoute>
      } />
      <Route path="/admin/colaboradores/:id/edit" element={
        <ProtectedRoute roles={['admin']}><ColaboradorForm /></ProtectedRoute>
      } />
      <Route path="/admin/products" element={
        <ProtectedRoute roles={['admin']}><AdminProducts /></ProtectedRoute>
      } />
      <Route path="/admin/products/new" element={
        <ProtectedRoute roles={['admin']}><ProductForm /></ProtectedRoute>
      } />
      <Route path="/admin/products/:id/edit" element={
        <ProtectedRoute roles={['admin']}><ProductForm /></ProtectedRoute>
      } />
      <Route path="/admin/slas" element={
        <ProtectedRoute roles={['admin']}><AdminSLAs /></ProtectedRoute>
      } />
      <Route path="/admin/kb" element={
        <ProtectedRoute roles={['admin', 'agent']}><AdminKB /></ProtectedRoute>
      } />
      <Route path="/kb" element={<KnowledgeBase />} />
      <Route path="/kb/:id" element={<KBArticleDetail />} />
      <Route path="/admin/categories" element={
        <ProtectedRoute roles={['admin']}><AdminCategories /></ProtectedRoute>
      } />
      <Route path="/admin/ai/aprovacoes" element={
        <ProtectedRoute roles={['admin']}><AIApprovals /></ProtectedRoute>
      } />
      <Route path="/admin/ai/atividades" element={
        <ProtectedRoute roles={['admin']}><AIActivity /></ProtectedRoute>
      } />
      <Route path="/admin/ai/metricas" element={
        <ProtectedRoute roles={['admin']}><AIMetrics /></ProtectedRoute>
      } />
      <Route path="/admin/ai/regras" element={
        <ProtectedRoute roles={['admin']}><AIRules /></ProtectedRoute>
      } />
      <Route path="/admin/ai/aprovacoes" element={
        <ProtectedRoute roles={['admin']}><AIApprovals /></ProtectedRoute>
      } />
      <Route path="/admin/ai/agente" element={
        <ProtectedRoute roles={['admin']}><AIAgent /></ProtectedRoute>
      } />
      <Route path="/admin/ai/ferramentas" element={
        <ProtectedRoute roles={['admin']}><AIFerramentas /></ProtectedRoute>
      } />
      <Route path="/admin/ai/kb-rag" element={
        <ProtectedRoute roles={['admin', 'agent']}><KBRAG /></ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SidebarProvider>
            <AppRoutes />
          </SidebarProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
