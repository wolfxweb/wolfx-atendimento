import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { getAIApprovals, approveAIApproval, rejectAIApproval } from '../../api/client';

interface AIApproval {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_by?: string;
  requested_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  comment?: string;
  review_comment?: string;
  metadata?: Record<string, any>;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function AdminAIApprovals() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedApproval, setSelectedApproval] = useState<AIApproval | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');

  const { data: approvals = [], isLoading } = useQuery({
    queryKey: ['ai-approvals', filterStatus],
    queryFn: () => getAIApprovals({ status: filterStatus || undefined }).then(r => r.data as AIApproval[]),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment?: string }) => approveAIApproval(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-approvals'] });
      handleCloseModal();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) => rejectAIApproval(id, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-approvals'] });
      handleCloseModal();
    },
  });

  const handleOpenModal = (approval: AIApproval, action: 'approve' | 'reject') => {
    setSelectedApproval(approval);
    setActionType(action);
    setComment('');
  };

  const handleCloseModal = () => {
    setSelectedApproval(null);
    setActionType(null);
    setComment('');
  };

  const handleSubmit = () => {
    if (!selectedApproval || !actionType) return;

    if (actionType === 'approve') {
      approveMutation.mutate({ id: selectedApproval.id, comment: comment || undefined });
    } else {
      if (!comment.trim()) {
        alert('Por favor, forneça um motivo para a rejeição.');
        return;
      }
      rejectMutation.mutate({ id: selectedApproval.id, comment });
    }
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const pendingCount = approvals.filter(a => a.status === 'pending').length;
  const approvedCount = approvals.filter(a => a.status === 'approved').length;
  const rejectedCount = approvals.filter(a => a.status === 'rejected').length;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Aprovações de IA</h2>
        <div className="flex items-center gap-4">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos os statuses</option>
            <option value="pending">Pendente</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Rejeitado</option>
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
          <p className="text-sm font-medium text-yellow-700">Pendentes</p>
          <p className="text-2xl font-bold text-yellow-800 mt-1">{pendingCount}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-sm font-medium text-green-700">Aprovados</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{approvedCount}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-sm font-medium text-red-700">Rejeitados</p>
          <p className="text-2xl font-bold text-red-800 mt-1">{rejectedCount}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : !approvals.length ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500">Nenhuma aprovação encontrada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Título</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Solicitante</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {approvals.map((approval) => (
                <tr key={approval.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-800">{approval.title}</div>
                    {approval.description && (
                      <div className="text-sm text-gray-500 mt-1 truncate max-w-xs">
                        {approval.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {approval.requested_by || '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm">
                    {formatDate(approval.requested_at)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[approval.status]}`}>
                      {STATUS_LABELS[approval.status]}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {approval.status === 'pending' ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleOpenModal(approval, 'approve')}
                          className="text-xs text-green-600 hover:underline font-medium"
                        >
                          Aprovar
                        </button>
                        <button
                          onClick={() => handleOpenModal(approval, 'reject')}
                          className="text-xs text-red-600 hover:underline font-medium"
                        >
                          Rejeitar
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">
                        {approval.reviewed_by ? `Por ${approval.reviewed_by}` : '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Approve/Reject Modal */}
      <Modal
        isOpen={!!selectedApproval && !!actionType}
        onClose={handleCloseModal}
        title={actionType === 'approve' ? 'Aprovar Solicitação' : 'Rejeitar Solicitação'}
        size="md"
      >
        {selectedApproval && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="font-medium text-gray-800">{selectedApproval.title}</h4>
              {selectedApproval.description && (
                <p className="text-sm text-gray-600 mt-1">{selectedApproval.description}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {actionType === 'approve' ? 'Comentário (opcional)' : 'Motivo da rejeição'}
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionType === 'approve' ? 'Adicione um comentário...' : 'Descreva o motivo da rejeição...'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleCloseModal}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={approveMutation.isPending || rejectMutation.isPending}
                className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${
                  actionType === 'approve'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                } disabled:opacity-50`}
              >
                {approveMutation.isPending || rejectMutation.isPending
                  ? 'Processando...'
                  : actionType === 'approve'
                  ? 'Confirmar Aprovação'
                  : 'Confirmar Rejeição'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
