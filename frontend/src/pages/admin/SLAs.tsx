import { useQuery } from '@tanstack/react-query';
import { getGlobalSLAs } from '../../api/client';
import Layout from '../../components/Layout';

export default function AdminSLAs() {
  const { data: slas, isLoading } = useQuery({
    queryKey: ['global-slas'],
    queryFn: () => getGlobalSLAs().then(r => r.data),
  });

  return (
    <Layout>
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
    </Layout>
  );
}
