import { useState } from 'react';
import Layout from '../../components/Layout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTickets, updateTicket, createTicket, getCustomers, getCategories } from '../../api/client';

export default function AdminTickets() {
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal', customer_id: '', category_id: '' });
  const [error, setError] = useState('');

  const { data: ticketsData, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data),
  });

  const { data: customers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers().then(r => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', 'ticket'],
    queryFn: () => getCategories('ticket').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: () => {
      setForm({ title: '', description: '', priority: 'normal', customer_id: '', category_id: '' });
      setShowForm(false);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Erro ao criar ticket'),
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
    <Layout>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Gestão de Tickets</h2>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            {showForm ? 'Cancelar' : '+ Novo Ticket'}
          </button>
        </div>

        {/* Create Ticket Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-indigo-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Criar Novo Ticket</h3>
            {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={e => { e.preventDefault(); setError(''); if (!form.title || !form.description || !form.customer_id) { setError('Preenche título, descrição e cliente.'); return; } createMutation.mutate(form); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cliente *</label>
                <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" required>
                  <option value="">Selecionar cliente</option>
                  {(customers || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Sem categoria</option>
                  {(categories || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Resumo do problema" required />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Descrição detalhada do problema..." required />
              </div>
              <div className="md:col-span-2">
                <button type="submit" disabled={createMutation.isPending}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50">
                  {createMutation.isPending ? 'A criar...' : 'Criar Ticket'}
                </button>
              </div>
            </form>
          </div>
        )}

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
    </Layout>
  );
}
