import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUsers, deleteUser } from '../../api/client';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';

interface Colaborador {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  // Personal
  birth_date?: string;
  cpf?: string;
  rg?: string;
  gender?: string;
  marital_status?: string;
  // Address
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_zip?: string;
  // Emergency contact
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  // Employment
  position?: string;
  department?: string;
  hire_date?: string;
  salary?: number;
  work_shift?: string;
  notes?: string;
}

export default function AdminColaboradores() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [filterRole, setFilterRole] = useState<string>('all');
  const [searchName, setSearchName] = useState('');
  const [colabToDelete, setColabToDelete] = useState<Colaborador | null>(null);

  const { data: colaboradores = [], isLoading } = useQuery({
    queryKey: ['users', filterRole],
    queryFn: () => getUsers().then(r => (r.data as Colaborador[]).filter((u: Colaborador) =>
      filterRole === 'all' ? u.role !== 'customer' : u.role === filterRole
    )),
  });

  const filtered = colaboradores.filter(c =>
    !searchName || c.name.toLowerCase().includes(searchName.toLowerCase()) || c.email.toLowerCase().includes(searchName.toLowerCase())
  );

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setColabToDelete(null);
    },
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Colaboradores</h2>
        <button
          onClick={() => navigate('/admin/colaboradores/new')}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium"
        >
          + Novo Colaborador
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {['all', 'admin', 'agent'].map(role => (
          <button
            key={role}
            onClick={() => setFilterRole(role)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              filterRole === role
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            {role === 'all' ? '👥 Todos' : role === 'admin' ? '🛡️ Admin' : '👤 Colaborador'}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            placeholder="Pesquisar por nome ou email..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64"
          />
          {searchName && (
            <button
              onClick={() => setSearchName('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500">Nenhum colaborador encontrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cargo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(colab => (
                <tr key={colab.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{colab.name}</td>
                  <td className="px-4 py-3 text-gray-600">{colab.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      colab.role === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {colab.role === 'admin' ? 'Admin' : 'Colaborador'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{colab.position || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      colab.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {colab.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => navigate(`/admin/colaboradores/${colab.id}/edit`)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <div className="w-px h-5 bg-gray-200" />
                        <button
                          onClick={() => setColabToDelete(colab)}
                          className="p-2 text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {colabToDelete && (
        <Modal isOpen={true} onClose={() => setColabToDelete(null)} title="Confirmar Eliminação" size="sm">
          <div className="text-center">
            <p className="text-gray-600 mb-6">
              Tem a certeza que deseja eliminar o colaborador <strong>{colabToDelete.name}</strong>? Esta ação desativará o usuário.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setColabToDelete(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(colabToDelete.id)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'A eliminar...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
