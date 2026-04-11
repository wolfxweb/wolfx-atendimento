import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCustomers, createCustomer } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminCustomers() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['customers'] }),
  });

  const handleCreate = () => {
    const name = prompt('Nome da empresa:');
    const email = prompt('Email:');
    const phone = prompt('Telefone (opcional):');
    const password = prompt('Password inicial:');
    if (name && email && password) {
      createMutation.mutate({ name, email, phone: phone || undefined, password });
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4">
              <a href="/admin" className="text-sm text-gray-600 hover:text-indigo-600">Dashboard</a>
              <a href="/admin/tickets" className="text-sm text-gray-600 hover:text-indigo-600">Tickets</a>
              <a href="/admin/customers" className="text-sm text-indigo-600 font-medium">Clientes</a>
              <a href="/admin/agents" className="text-sm text-gray-600 hover:text-indigo-600">Agentes</a>
              <a href="/admin/products" className="text-sm text-gray-600 hover:text-indigo-600">Produtos</a>
              <a href="/admin/slas" className="text-sm text-gray-600 hover:text-indigo-600">SLAs</a>
            </nav>
            <button onClick={logout} className="text-sm text-red-600">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Clientes</h2>
          <button onClick={handleCreate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium">
            + Novo Cliente
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : !customers?.length ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-gray-500">Nenhum cliente criado.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Telefone</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Criado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {customers.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-800">{c.name}</td>
                    <td className="px-6 py-4 text-gray-600">{c.email}</td>
                    <td className="px-6 py-4 text-gray-600">{c.phone || '-'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${c.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {c.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
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
