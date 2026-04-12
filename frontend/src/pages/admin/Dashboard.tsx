import Layout from '../../components/Layout';
import { useQuery } from '@tanstack/react-query';
import { getTickets, getSLADashboard, getCustomers } from '../../api/client';

export default function AdminDashboard() {
  const { data: ticketsData } = useQuery({ queryKey: ['tickets'], queryFn: () => getTickets().then(r => r.data) });
  const { data: slaData } = useQuery({ queryKey: ['sla-dashboard'], queryFn: () => getSLADashboard().then(r => r.data) });
  const { data: customersData } = useQuery({ queryKey: ['customers'], queryFn: () => getCustomers().then(r => r.data) });

  const tickets = ticketsData || [];
  const openTickets = tickets.filter((t: any) => ['open', 'in_progress', 'pending'].includes(t.status));
  const solvedTickets = tickets.filter((t: any) => t.status === 'solved');

  return (
    <Layout>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Dashboard Admin</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Total Tickets</p>
          <p className="text-2xl font-bold text-gray-800">{tickets.length}</p>
        </div>
        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-sm text-blue-600">Abertos</p>
          <p className="text-2xl font-bold text-blue-700">{openTickets.length}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-green-600">Resolvidos</p>
          <p className="text-2xl font-bold text-green-700">{solvedTickets.length}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-sm text-indigo-600">Clientes</p>
          <p className="text-2xl font-bold text-indigo-700">{customersData?.length || 0}</p>
        </div>
      </div>

      {/* SLA */}
      {slaData && (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-8">
          <h3 className="font-semibold text-gray-800 mb-4">Compliance SLA</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-3xl font-bold text-green-700">{slaData.within_sla}</p>
              <p className="text-sm text-green-600">Within SLA</p>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <p className="text-3xl font-bold text-yellow-700">{slaData.at_risk}</p>
              <p className="text-sm text-yellow-600">At Risk</p>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <p className="text-3xl font-bold text-red-700">{slaData.breached}</p>
              <p className="text-sm text-red-600">Breached</p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
