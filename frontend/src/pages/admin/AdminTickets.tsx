import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import {
  getTickets, getCustomers, bulkDeleteTickets, deleteTicket,
} from '../../api/client';

interface Ticket {
  id: string;
  title: string;
  status: string;
  priority: string;
  customer_id: string;
  agent_id?: string;
  parent_ticket_id?: string;
  opened_at?: string;
  attended_at?: string;
  closed_at?: string;
  sla_status?: string;
  created_at: string;
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  pending: 'Pendente',
  in_progress: 'Em Atendimento',
  solved: 'Resolvido',
  closed: 'Fechado',
  reopened: 'Reaberto',
};

const SLA_LABELS: Record<string, string> = {
  within: 'No Prazo',
  at_risk: 'Em Risco',
  breached: 'Estourado',
};

export default function AdminTickets() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ticketToDelete, setTicketToDelete] = useState<Ticket | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: () => getTickets().then(r => r.data as Ticket[]),
  });

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers().then(r => r.data as any[]),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTicket,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setTicketToDelete(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: bulkDeleteTickets,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      setSelected(new Set());
    },
  });

  const filtered = tickets.filter(t => {
    if (searchName && !t.title.toLowerCase().includes(searchName.toLowerCase())) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  const getCustomerName = (id: string) => {
    const c = (customers as any[]).find((cu: any) => cu.id === id);
    return c?.name || id.slice(0, 8);
  };

  const formatDate = (d?: string) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatDateTime = (d?: string) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(t => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleBulkDelete = () => {
    setShowBulkDeleteModal(true);
  };

  const confirmBulkDelete = () => {
    setShowBulkDeleteModal(false);
    bulkDeleteMutation.mutate(Array.from(selected));
  };

  const priorityColor = (p: string) => {
    if (p === 'urgent') return 'bg-red-100 text-red-700';
    if (p === 'high') return 'bg-orange-100 text-orange-700';
    return 'bg-gray-100 text-gray-600';
  };

  const statusColor = (s: string) => {
    if (s === 'open') return 'bg-blue-100 text-blue-700';
    if (s === 'pending') return 'bg-yellow-100 text-yellow-700';
    if (s === 'in_progress') return 'bg-indigo-100 text-indigo-700';
    if (s === 'solved') return 'bg-green-100 text-green-700';
    if (s === 'closed') return 'bg-gray-100 text-gray-500';
    if (s === 'reopened') return 'bg-purple-100 text-purple-700';
    return 'bg-gray-100 text-gray-600';
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Tickets</h2>
        <button
          onClick={() => navigate('/admin/tickets/new')}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium"
        >
          + Novo Ticket
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={searchName} onChange={e => setSearchName(e.target.value)}
            placeholder="Pesquisar ticket..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos os status</option>
          <option value="open">Aberto</option>
          <option value="pending">Pendente</option>
          <option value="in_progress">Em Atendimento</option>
          <option value="solved">Resolvido</option>
          <option value="closed">Fechado</option>
          <option value="reopened">Reaberto</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
          <span className="text-sm text-red-700 font-medium">{selected.size} selecionado(s)</span>
          <button onClick={handleBulkDelete} disabled={bulkDeleteMutation.isPending}
            className="bg-red-600 text-white px-4 py-1.5 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
            {bulkDeleteMutation.isPending ? 'A eliminar...' : 'Eliminar Selecionados'}
          </button>
          <button onClick={() => setSelected(new Set())} className="text-gray-500 text-sm hover:underline">
            Cancelar
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500">Nenhum ticket encontrado.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-3">
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ticket</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">SLA</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Abertura</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Atendimento</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Fechamento</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ticket Pai</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(t => (
                <tr key={t.id} className={`hover:bg-gray-50 ${selected.has(t.id) ? 'bg-indigo-50' : ''}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} className="rounded" />
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 text-sm">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.id.slice(0, 8)}...</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{getCustomerName(t.customer_id)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(t.status)}`}>
                      {STATUS_LABELS[t.status] || t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${priorityColor(t.priority)}`}>
                      {PRIORITY_LABELS[t.priority] || t.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      t.sla_status === 'within' ? 'bg-green-100 text-green-700' :
                      t.sla_status === 'at_risk' ? 'bg-yellow-100 text-yellow-700' :
                      t.sla_status === 'breached' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {SLA_LABELS[t.sla_status || ''] || (t.sla_status ? t.sla_status : '—')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{formatDate(t.opened_at || t.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{formatDateTime(t.attended_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{formatDateTime(t.closed_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.parent_ticket_id ? t.parent_ticket_id.slice(0, 8) + '...' : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => navigate(`/admin/tickets/${t.id}/edit`)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <div className="w-px h-5 bg-gray-200" />
                        <button
                          onClick={() => setTicketToDelete(t)}
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
      {ticketToDelete && (
        <Modal isOpen={true} onClose={() => setTicketToDelete(null)} title="Confirmar Eliminação" size="sm">
          <div className="text-center">
            <p className="text-gray-600 mb-6">
              Tem a certeza que deseja eliminar o ticket <strong>{ticketToDelete.title}</strong>?
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setTicketToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(ticketToDelete.id)}
                disabled={deleteMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'A eliminar...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Bulk Delete Confirm Modal */}
      {showBulkDeleteModal && (
        <Modal isOpen={true} onClose={() => setShowBulkDeleteModal(false)} title="Confirmar Eliminação em Massa" size="sm">
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>
            <p className="text-gray-600 mb-6">
              Tem a certeza que deseja eliminar <strong>{selected.size}</strong> ticket(s) selecionado(s)? Esta ação não pode ser undone.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={confirmBulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'A eliminar...' : `Eliminar ${selected.size} Ticket(s)`}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
