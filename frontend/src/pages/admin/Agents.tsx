import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAgents, updateAgentStatus } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminAgents() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const { data: agents, isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: () => getAgents().then(r => r.data),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateAgentStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agents'] }),
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4">
              <a href="/admin" className="text-sm text-gray-600 hover:text-indigo-600">Dashboard</a>
              <a href="/admin/tickets" className="text-sm text-gray-600 hover:text-indigo-600">Tickets</a>
              <a href="/admin/customers" className="text-sm text-gray-600 hover:text-indigo-600">Clientes</a>
              <a href="/admin/agents" className="text-sm text-indigo-600 font-medium">Agentes</a>
              <a href="/admin/products" className="text-sm text-gray-600 hover:text-indigo-600">Produtos</a>
              <a href="/admin/slas" className="text-sm text-gray-600 hover:text-indigo-600">SLAs</a>
            </nav>
            <button onClick={logout} className="text-sm text-red-600">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Agentes</h2>

        {isLoading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : !agents?.length ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-gray-500">Nenhum agente criado.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Equipa</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Max Tickets</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Acções</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {agents.map((a: any) => (
                  <tr key={a.user_id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-800">{a.name}</td>
                    <td className="px-6 py-4 text-gray-600">{a.email}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">{a.team}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        a.status === 'available' ? 'bg-green-100 text-green-700' :
                        a.status === 'away' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{a.max_tickets}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          const newStatus = a.status === 'available' ? 'away' : 'available';
                          statusMutation.mutate({ id: a.user_id, status: newStatus });
                        }}
                        className="text-xs text-indigo-600 hover:underline"
                      >
                        Mudar Status
                      </button>
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
