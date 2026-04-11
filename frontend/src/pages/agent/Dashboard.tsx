import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getTickets, getSLADashboard } from '../../api/client';

export default function AgentDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: ticketsData } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data),
  });

  const { data: slaData } = useQuery({
    queryKey: ['sla-dashboard'],
    queryFn: () => getSLADashboard().then(r => r.data),
  });

  const tickets = ticketsData || [];
  const openTickets = tickets.filter((t: any) => ['open', 'in_progress', 'pending'].includes(t.status));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4">
              <a href="/agent" className="text-sm text-indigo-600 font-medium">Dashboard</a>
              <a href="/agent/tickets" className="text-sm text-gray-600 hover:text-indigo-600">Tickets</a>
            </nav>
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard do Agente</h2>

        {/* SLA Dashboard */}
        {slaData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-sm text-gray-500">Total Tickets</p>
              <p className="text-2xl font-bold text-gray-800">{slaData.total}</p>
            </div>
            <div className="bg-green-50 rounded-xl p-4">
              <p className="text-sm text-green-600">Within SLA</p>
              <p className="text-2xl font-bold text-green-700">{slaData.within_sla}</p>
            </div>
            <div className="bg-yellow-50 rounded-xl p-4">
              <p className="text-sm text-yellow-600">At Risk</p>
              <p className="text-2xl font-bold text-yellow-700">{slaData.at_risk}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4">
              <p className="text-sm text-red-600">Breached</p>
              <p className="text-2xl font-bold text-red-700">{slaData.breached}</p>
            </div>
          </div>
        )}

        {/* Tickets Table */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">Tickets em Aberto ({openTickets.length})</h3>
            <button onClick={() => navigate('/agent/tickets')} className="text-sm text-indigo-600 hover:underline">Ver todos</button>
          </div>
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Ticket</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 uppercase">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {openTickets.slice(0, 10).map((ticket: any) => (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800">{ticket.title}</p>
                    <p className="text-xs text-gray-500">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      ticket.status === 'open' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      ticket.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                      ticket.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {ticket.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      ticket.sla_status === 'within' ? 'bg-green-100 text-green-700' :
                      ticket.sla_status === 'at_risk' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {ticket.sla_status || 'N/A'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
