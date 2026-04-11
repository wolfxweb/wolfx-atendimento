import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { getTickets } from '../../api/client';

export default function CustomerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const { data: ticketsData } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data),
  });

  const tickets = ticketsData || [];
  const openTickets = tickets.filter((t: any) => ['open', 'in_progress', 'pending'].includes(t.status));
  const solvedTickets = tickets.filter((t: any) => t.status === 'solved');
  const myTickets = tickets.slice(0, 5);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button
              onClick={logout}
              className="text-sm text-red-600 hover:text-red-700 font-medium"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Bem-vindo, {user?.name}!</h2>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-blue-500">
            <p className="text-sm text-gray-500">Tickets Abertos</p>
            <p className="text-3xl font-bold text-gray-800">{openTickets.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-green-500">
            <p className="text-sm text-gray-500">Aguardando Aprovação</p>
            <p className="text-3xl font-bold text-gray-800">{solvedTickets.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6 border-l-4 border-indigo-500">
            <p className="text-sm text-gray-500">Total de Tickets</p>
            <p className="text-3xl font-bold text-gray-800">{tickets.length}</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <button
            onClick={() => navigate('/customer/tickets/new')}
            className="bg-indigo-600 text-white rounded-xl p-6 hover:bg-indigo-700 transition text-left"
          >
            <h3 className="text-lg font-semibold">+ Abrir Novo Ticket</h3>
            <p className="text-indigo-200 text-sm mt-1">Reportar um problema</p>
          </button>
          <button
            onClick={() => navigate('/customer/tickets')}
            className="bg-white rounded-xl p-6 hover:shadow-md transition text-left border border-gray-200"
          >
            <h3 className="text-lg font-semibold text-gray-800">Ver Meus Tickets</h3>
            <p className="text-gray-500 text-sm mt-1">Acompanhar tickets criados</p>
          </button>
        </div>

        {/* Recent Tickets */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800">Tickets Recentes</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {myTickets.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                Ainda não tens tickets. <button onClick={() => navigate('/customer/tickets/new')} className="text-indigo-600 hover:underline">Criar primeiro ticket</button>
              </div>
            ) : (
              myTickets.map((ticket: any) => (
                <div
                  key={ticket.id}
                  onClick={() => navigate(`/customer/tickets/${ticket.id}`)}
                  className="p-4 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-800">{ticket.title}</p>
                    <p className="text-sm text-gray-500">{new Date(ticket.created_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    ticket.status === 'open' ? 'bg-blue-100 text-blue-700' :
                    ticket.status === 'in_progress' ? 'bg-yellow-100 text-yellow-700' :
                    ticket.status === 'solved' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {ticket.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
