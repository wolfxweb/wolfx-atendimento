import { useAuth } from '../../context/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTickets, updateTicket } from '../../api/client';

export default function AdminTickets() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data),
  });

  const tickets = ticketsData || [];

  const assignMutation = useMutation({
    mutationFn: ({ id, agentId }: { id: string; agentId: string }) => updateTicket(id, { agent_id: agentId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateTicket(id, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets'] }),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4">
              <a href="/admin" className="text-sm text-gray-600 hover:text-indigo-600">Dashboard</a>
              <a href="/admin/tickets" className="text-sm text-indigo-600 font-medium">Tickets</a>
              <a href="/admin/customers" className="text-sm text-gray-600 hover:text-indigo-600">Clientes</a>
              <a href="/admin/agents" className="text-sm text-gray-600 hover:text-indigo-600">Agentes</a>
              <a href="/admin/products" className="text-sm text-gray-600 hover:text-indigo-600">Produtos</a>
              <a href="/admin/slas" className="text-sm text-gray-600 hover:text-indigo-600">SLAs</a>
            </nav>
            <button onClick={logout} className="text-sm text-red-600">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Gestão de Tickets</h2>
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
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tickets.map((ticket: any) => (
                  <tr key={ticket.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">{ticket.title}</p>
                      <p className="text-sm text-gray-500">{ticket.customer_id?.slice(0, 8)}...</p>
                    </td>
                    <td className="px-6 py-4">
                      <select
                        value={ticket.status}
                        onChange={(e) => statusMutation.mutate({ id: ticket.id, status: e.target.value })}
                        className="text-xs border rounded px-2 py-1"
                      >
                        <option value="open">Aberto</option>
                        <option value="in_progress">Em Progresso</option>
                        <option value="pending">Pendente</option>
                        <option value="solved">Resolvido</option>
                        <option value="closed">Fechado</option>
                      </select>
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
                    <td className="px-6 py-4">
                      {ticket.agent_id ? (
                        <span className="text-xs text-gray-500">Atribuído</span>
                      ) : (
                        <button
                          onClick={() => {
                            const agentId = prompt('ID do agente:');
                            if (agentId) assignMutation.mutate({ id: ticket.id, agentId });
                          }}
                          className="text-xs text-indigo-600 hover:underline"
                        >
                          Atribuir
                        </button>
                      )}
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
