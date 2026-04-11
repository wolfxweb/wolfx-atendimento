import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getTickets, getSLADashboard, getCustomers } from '../../api/client';

export default function AdminDashboard() {
  const { user, logout } = useAuth();

  const { data: ticketsData } = useQuery({ queryKey: ['tickets'], queryFn: () => getTickets().then(r => r.data) });
  const { data: slaData } = useQuery({ queryKey: ['sla-dashboard'], queryFn: () => getSLADashboard().then(r => r.data) });
  const { data: customersData } = useQuery({ queryKey: ['customers'], queryFn: () => getCustomers().then(r => r.data) });

  const tickets = ticketsData || [];
  const openTickets = tickets.filter((t: any) => ['open', 'in_progress', 'pending'].includes(t.status));
  const solvedTickets = tickets.filter((t: any) => t.status === 'solved');

  const navItems = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Tickets', href: '/admin/tickets' },
    { label: 'Clientes', href: '/admin/customers' },
    { label: 'Agentes', href: '/admin/agents' },
    { label: 'Produtos', href: '/admin/products' },
    { label: 'SLAs', href: '/admin/slas' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4">
              {navItems.map(item => (
                <a key={item.href} href={item.href}
                  className={`text-sm ${item.href === '/admin' ? 'text-indigo-600 font-medium' : 'text-gray-600 hover:text-indigo-600'}`}>
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{user?.name}</span>
              <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Sair</button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Admin</h2>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-sm text-gray-500">Total Tickets</p>
            <p className="text-2xl font-bold text-gray-800">{tickets.length}</p>
          </div>
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-sm text-blue-600">Abertos</p>
            <p className="text-2xl font-bold text-blue-700">{openTickets.length}</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-sm text-green-600">Resolvidos</p>
            <p className="text-2xl font-bold text-green-700">{solvedTickets.length}</p>
          </div>
          <div className="bg-indigo-50 rounded-xl p-4">
            <p className="text-sm text-indigo-600">Clientes</p>
            <p className="text-2xl font-bold text-indigo-700">{customersData?.length || 0}</p>
          </div>
        </div>

        {/* SLA */}
        {slaData && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
            <h3 className="font-semibold text-gray-800 mb-4">Compliance SLA</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-700">{slaData.within_sla}</p>
                <p className="text-sm text-green-600">Within SLA</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-3xl font-bold text-yellow-700">{slaData.at_risk}</p>
                <p className="text-sm text-yellow-600">At Risk</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-3xl font-bold text-red-700">{slaData.breached}</p>
                <p className="text-sm text-red-600">Breached</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {navItems.slice(1).map(item => (
            <a key={item.href} href={item.href}
              className="bg-white rounded-xl p-4 hover:shadow-md transition text-center border border-gray-200">
              <p className="font-medium text-indigo-600">{item.label}</p>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
