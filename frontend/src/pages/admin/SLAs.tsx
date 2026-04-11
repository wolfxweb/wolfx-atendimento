import { useQuery } from '@tanstack/react-query';
import { getGlobalSLAs } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminSLAs() {
  const { logout } = useAuth();

  const { data: slas, isLoading } = useQuery({
    queryKey: ['global-slas'],
    queryFn: () => getGlobalSLAs().then(r => r.data),
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
              <a href="/admin/agents" className="text-sm text-gray-600 hover:text-indigo-600">Agentes</a>
              <a href="/admin/products" className="text-sm text-gray-600 hover:text-indigo-600">Produtos</a>
              <a href="/admin/slas" className="text-sm text-indigo-600 font-medium">SLAs</a>
            </nav>
            <button onClick={logout} className="text-sm text-red-600">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">SLAs Globais</h2>

        {isLoading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">1ª Resposta</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Resolução</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {slas?.map((sla: any) => (
                  <tr key={sla.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded text-sm font-medium ${
                        sla.priority === 'urgent' ? 'bg-red-100 text-red-700' :
                        sla.priority === 'high' ? 'bg-orange-100 text-orange-700' :
                        sla.priority === 'normal' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {sla.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-700">{sla.first_response_hours}h</td>
                    <td className="px-6 py-4 text-gray-700">{sla.resolution_hours}h</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${sla.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {sla.is_active ? 'Activo' : 'Inactivo'}
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
