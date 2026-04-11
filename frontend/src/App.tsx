import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
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
import AdminAgents from './pages/admin/Agents';
import AdminProducts from './pages/admin/Products';
import AdminSLAs from './pages/admin/SLAs';

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
      <Route path="/admin/customers" element={
        <ProtectedRoute roles={['admin']}><AdminCustomers /></ProtectedRoute>
      } />
      <Route path="/admin/agents" element={
        <ProtectedRoute roles={['admin']}><AdminAgents /></ProtectedRoute>
      } />
      <Route path="/admin/products" element={
        <ProtectedRoute roles={['admin']}><AdminProducts /></ProtectedRoute>
      } />
      <Route path="/admin/slas" element={
        <ProtectedRoute roles={['admin']}><AdminSLAs /></ProtectedRoute>
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
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
