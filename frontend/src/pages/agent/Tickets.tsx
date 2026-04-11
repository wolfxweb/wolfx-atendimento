import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getTickets } from '../../api/client';

export default function AgentTickets() {
  const { logout } = useAuth();

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data),
  });

  const tickets = ticketsData || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4">
              <a href="/agent" className="text-sm text-gray-600 hover:text-indigo-600">Dashboard</a>
              <a href="/agent/tickets" className="text-sm text-indigo-600 font-medium">Tickets</a>
            </nav>
            <button onClick={logout} className="text-sm text-red-600">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Todos os Tickets</h2>
        {isLoading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ticket</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">SLA</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket: any) => (
                  <tr key={ticket.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">{ticket.title}</p>
                      <p className="text-sm text-gray-500">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.status === 'open' ? 'bg-blue-100 text-blue-700' :
                        ticket.status === 'solved' ? 'bg-green-100 text-green-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        ticket.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ticket.sla_status === 'within' ? 'bg-green-100 text-green-700' :
                        ticket.sla_status === 'at_risk' ? 'bg-yellow-100 text-yellow-700' :
                        ticket.sla_status === 'breached' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {ticket.sla_status || 'N/A'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
