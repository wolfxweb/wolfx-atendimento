import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSLAs, createSLA, updateSLA, deleteSLA, getGlobalSLAs } from '../../api/client';
import { extractErrorMessage } from '../../api/client';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';

const PRIORITIES = [
  { value: 'low', label: 'Baixa', color: 'bg-gray-100 text-gray-700', hours: [480, 2880] },
  { value: 'normal', label: 'Normal', color: 'bg-blue-100 text-blue-700', hours: [240, 1440] },
  { value: 'high', label: 'Alta', color: 'bg-orange-100 text-orange-700', hours: [60, 480] },
  { value: 'urgent', label: 'Urgente', color: 'bg-red-100 text-red-700', hours: [15, 240] },
];

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const dh = h % 24;
  return dh > 0 ? `${d}d ${dh}h` : `${d}d`;
}

type SLA = {
  id: string;
  customer_id: string | null;
  category_id: string | null;
  name: string;
  priority: string;
  first_response_minutes: number;
  resolution_minutes: number;
  business_hours_only: boolean;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
};

type SLAForm = {
  name: string;
  priority: string;
  category_id: string;
  first_response_minutes: number;
  resolution_minutes: number;
  business_hours_only: boolean;
  is_active: boolean;
};

const EMPTY_FORM: SLAForm = {
  name: '',
  priority: 'normal',
  category_id: '',
  first_response_minutes: 240,
  resolution_minutes: 1440,
  business_hours_only: true,
  is_active: true,
};

export default function AdminSLAs() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingSLA, setEditingSLA] = useState<SLA | null>(null);
  const [form, setForm] = useState<SLAForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<SLA | null>(null);
  const [filter, setFilter] = useState<'all' | 'global' | 'custom'>('all');

  const { data: allSLAs = [], isLoading } = useQuery({
    queryKey: ['slas'],
    queryFn: () => getSLAs().then(r => r.data as SLA[]),
  });

  const filteredSLAs = allSLAs.filter(sla => {
    if (filter === 'global') return sla.customer_id === null;
    if (filter === 'custom') return sla.customer_id !== null;
    return true;
  });

  const postMutation = useMutation({
    mutationFn: (data: SLAForm) =>
      editingSLA
        ? updateSLA(editingSLA.id, { ...data, category_id: data.category_id || undefined })
        : createSLA({ ...data, category_id: data.category_id || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slas'] });
      setShowModal(false);
      setEditingSLA(null);
      setForm(EMPTY_FORM);
      setFormError('');
    },
    onError: (err) => setFormError(extractErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateSLA(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['slas'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSLA(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['slas'] });
      setDeleteConfirm(null);
    },
    onError: (err) => alert(extractErrorMessage(err)),
  });

  function openCreate() {
    setEditingSLA(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowModal(true);
  }

  function openEdit(sla: SLA) {
    setEditingSLA(sla);
    setForm({
      name: sla.name,
      priority: sla.priority,
      category_id: sla.category_id || '',
      first_response_minutes: sla.first_response_minutes,
      resolution_minutes: sla.resolution_minutes,
      business_hours_only: sla.business_hours_only,
      is_active: sla.is_active,
    });
    setFormError('');
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Nome é obrigatório'); return; }
    if (form.first_response_minutes <= 0 || form.resolution_minutes <= 0) {
      setFormError('Os tempos devem ser maiores que zero');
      return;
    }
    postMutation.mutate(form);
  }

  const priorityInfo = PRIORITIES.find(p => p.value === form.priority) || PRIORITIES[1];

  return (
    <Layout>
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">SLA — Service Level Agreement</h2>
            <p className="text-sm text-gray-500 mt-1">Defina os tempos de resposta e resolução por prioridade.</p>
          </div>
          <button
            onClick={openCreate}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo SLA
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {(['all', 'global', 'custom'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filter === f
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {f === 'all' ? 'Todos' : f === 'global' ? 'Globais' : 'Personalizados'}
            </button>
          ))}
        </div>

        {/* SLA Table */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Carregando...</div>
        ) : filteredSLAs.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Nenhum SLA encontrado.</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">1ª Resposta</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Resolução</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSLAs.map(sla => {
                  const prio = PRIORITIES.find(p => p.value === sla.priority);
                  return (
                    <tr key={sla.id} className="hover:bg-gray-50">
                      <td className="px-5 py-4">
                        <span className="font-medium text-gray-800">{sla.name}</span>
                        {sla.is_default && (
                          <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Padrão</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded text-xs font-semibold ${prio?.color || 'bg-gray-100 text-gray-600'}`}>
                          {prio?.label || sla.priority}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-700 text-sm">
                        {formatMinutes(sla.first_response_minutes)}
                      </td>
                      <td className="px-5 py-4 text-gray-700 text-sm">
                        {formatMinutes(sla.resolution_minutes)}
                      </td>
                      <td className="px-5 py-4">
                        {sla.customer_id ? (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">Personalizado</span>
                        ) : (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Global</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: sla.id, is_active: !sla.is_active })}
                          className={`px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                            sla.is_active
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-red-100 text-red-600 hover:bg-red-200'
                          }`}
                        >
                          {sla.is_active ? 'Activo' : 'Inactivo'}
                        </button>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          onClick={() => openEdit(sla)}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mr-3"
                        >
                          Editar
                        </button>
                        {!sla.is_default && (
                          <button
                            onClick={() => setDeleteConfirm(sla)}
                            className="text-red-500 hover:text-red-700 text-xs font-medium"
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Legend */}
        <div className="mt-6 bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3"> SLA por Prioridade</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRIORITIES.map(p => (
              <div key={p.value} className="bg-gray-50 rounded-lg p-3">
                <div className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mb-1 ${p.color}`}>
                  {p.label}
                </div>
                <p className="text-xs text-gray-600">1ª Resposta: <strong>{formatMinutes(p.hours[0])}</strong></p>
                <p className="text-xs text-gray-600">Resolução: <strong>{formatMinutes(p.hours[1])}</strong></p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal
          isOpen={true}
          onClose={() => { setShowModal(false); setEditingSLA(null); }}
          title={editingSLA ? `Editar SLA: ${editingSLA.name}` : 'Criar Novo SLA'}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do SLA *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: SLA Suporte Financeiro"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade *</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Tempo sugerido: 1ª resposta {formatMinutes(priorityInfo.hours[0])}, Resolução {formatMinutes(priorityInfo.hours[1])}
              </p>
            </div>

            {/* Category (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria (opcional)</label>
              <select
                value={form.category_id}
                onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="">Todas as categorias</option>
                {/* Categories will be loaded if needed */}
              </select>
              <p className="text-xs text-gray-500 mt-1">Se definir uma categoria, este SLA aplica-se só a tickets dessa categoria.</p>
            </div>

            {/* Times */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">1ª Resposta (minutos) *</label>
                <input
                  type="number"
                  min={1}
                  value={form.first_response_minutes}
                  onChange={e => setForm(f => ({ ...f, first_response_minutes: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
                <p className="text-xs text-gray-400 mt-0.5">{formatMinutes(form.first_response_minutes)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolução (minutos) *</label>
                <input
                  type="number"
                  min={1}
                  value={form.resolution_minutes}
                  onChange={e => setForm(f => ({ ...f, resolution_minutes: parseInt(e.target.value) || 0 }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  required
                />
                <p className="text-xs text-gray-400 mt-0.5">{formatMinutes(form.resolution_minutes)}</p>
              </div>
            </div>

            {/* Business hours only */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="biz_hours"
                checked={form.business_hours_only}
                onChange={e => setForm(f => ({ ...f, business_hours_only: e.target.checked }))}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <label htmlFor="biz_hours" className="text-sm text-gray-700">Apenas horário comercial (9h–18h, Seg–Sex)</label>
            </div>

            {/* Active */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="w-4 h-4 text-indigo-600 rounded"
              />
              <label htmlFor="is_active" className="text-sm text-gray-700">SLA activo</label>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setShowModal(false); setEditingSLA(null); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={postMutation.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
              >
                {postMutation.isPending ? 'A gravar...' : editingSLA ? 'Guardar' : 'Criar SLA'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          title="Confirmar Eliminação"
          size="sm"
        >
          <div className="text-center">
            <p className="text-gray-600 mb-6">
              Tem a certeza que deseja eliminar o SLA <strong>{deleteConfirm.name}</strong>?
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm.id)}
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
