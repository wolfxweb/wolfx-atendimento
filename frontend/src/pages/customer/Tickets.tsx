import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTickets } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function CustomerTickets() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data),
  });

  const tickets = ticketsData || [];

  const statusLabels: Record<string, { label: string; className: string }> = {
    open: { label: 'Aberto', className: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'Em Progresso', className: 'bg-yellow-100 text-yellow-700' },
    pending: { label: 'Pendente', className: 'bg-orange-100 text-orange-700' },
    solved: { label: 'Resolvido', className: 'bg-green-100 text-green-700' },
    closed: { label: 'Fechado', className: 'bg-gray-100 text-gray-700' },
  };

  const priorityLabels: Record<string, { label: string; className: string }> = {
    low: { label: 'Baixa', className: 'bg-gray-100 text-gray-600' },
    normal: { label: 'Normal', className: 'bg-blue-100 text-blue-600' },
    high: { label: 'Alta', className: 'bg-orange-100 text-orange-600' },
    urgent: { label: 'Urgente', className: 'bg-red-100 text-red-600' },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
            <nav className="flex gap-4 ml-8">
              <a href="/customer" className="text-sm text-gray-600 hover:text-indigo-600">Home</a>
              <a href="/customer/tickets" className="text-sm text-indigo-600 font-medium">Meus Tickets</a>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Meus Tickets</h2>
          <button
            onClick={() => navigate('/customer/tickets/new')}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition font-medium"
          >
            + Novo Ticket
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : tickets.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-gray-500 mb-4">Ainda não tens tickets criados.</p>
            <button
              onClick={() => navigate('/customer/tickets/new')}
              className="text-indigo-600 hover:underline font-medium"
            >
              Criar primeiro ticket
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ticket</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tickets.map((ticket: any) => (
                  <tr
                    key={ticket.id}
                    onClick={() => navigate(`/customer/tickets/${ticket.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-6 py-4">
                      <p className="font-medium text-gray-800">{ticket.title}</p>
                      <p className="text-sm text-gray-500 truncate max-w-md">{ticket.description}</p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityLabels[ticket.priority]?.className}`}>
                        {priorityLabels[ticket.priority]?.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusLabels[ticket.status]?.className}`}>
                        {statusLabels[ticket.status]?.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(ticket.created_at).toLocaleDateString('pt-BR')}
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
