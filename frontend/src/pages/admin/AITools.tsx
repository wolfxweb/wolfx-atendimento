import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import {
  getAITools,
  createAITool,
  updateAITool,
  deleteAITool,
  toggleAIToolActive,
  setAIToolDefault,
} from '../../api/client';
import { extractErrorMessage } from '../../api/client';

type AITool = {
  id: string;
  name: string;
  description?: string;
  tool_type: string;
  parameters: Record<string, any>;
  code_template?: string;
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;
  customer_id?: string;
  created_at: string;
  updated_at?: string;
};

type ToolForm = {
  name: string;
  description: string;
  tool_type: string;
  parameters: string;
  code_template: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY_FORM: ToolForm = {
  name: '',
  description: '',
  tool_type: 'notification',
  parameters: '{}',
  code_template: '',
  is_active: true,
  is_default: false,
};

const TOOL_TYPES = [
  { value: 'notification', label: 'Notificação' },
  { value: 'ticket_update', label: 'Actualização de Ticket' },
  { value: 'knowledge_base', label: 'Base de Conhecimento' },
  { value: 'external_api', label: 'API Externa' },
  { value: 'classification', label: 'Classificação' },
];

const TYPE_COLORS: Record<string, string> = {
  notification: 'bg-blue-100 text-blue-700',
  ticket_update: 'bg-green-100 text-green-700',
  knowledge_base: 'bg-orange-100 text-orange-700',
  external_api: 'bg-purple-100 text-purple-700',
  classification: 'bg-indigo-100 text-indigo-700',
};

export default function AdminAITools() {
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTool, setEditingTool] = useState<AITool | null>(null);
  const [form, setForm] = useState<ToolForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<AITool | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['ai-tools', typeFilter],
    queryFn: () => getAITools({ tool_type: typeFilter || undefined }).then(r => r.data as AITool[]),
  });

  const postMutation = useMutation({
    mutationFn: (data: ToolForm) => {
      let params = {};
      try { params = JSON.parse(data.parameters); } catch {}
      const payload = {
        ...data,
        parameters: params,
      };
      return editingTool
        ? updateAITool(editingTool.id, payload)
        : createAITool(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tools'] });
      closeForm();
    },
    onError: (err) => setFormError(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAITool(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-tools'] });
      setDeleteConfirm(null);
    },
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => toggleAIToolActive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-tools'] }),
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setAIToolDefault(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-tools'] }),
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingTool(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const openEdit = (t: AITool) => {
    setEditingTool(t);
    setForm({
      name: t.name,
      description: t.description || '',
      tool_type: t.tool_type,
      parameters: JSON.stringify(t.parameters || {}, null, 2),
      code_template: t.code_template || '',
      is_active: t.is_active,
      is_default: t.is_default,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    postMutation.mutate(form);
  };

  const grouped = tools.reduce<Record<string, AITool[]>>((acc, t) => {
    if (!acc[t.tool_type]) acc[t.tool_type] = [];
    acc[t.tool_type].push(t);
    return acc;
  }, {});

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ferramentas AI</h1>
            <p className="text-sm text-gray-500 mt-1">
              Ferramentas que o agente AI pode usar. Cada tipo tem exactamente um default activo.
            </p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nova Tool
          </button>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setTypeFilter('')} className={`px-3 py-1.5 rounded text-sm font-medium ${!typeFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todos</button>
          {TOOL_TYPES.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)} className={`px-3 py-1.5 rounded text-sm font-medium ${typeFilter === t.value ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {TOOL_TYPES.filter(t => !typeFilter || t.value === typeFilter).map(typeItem => {
              const items = grouped[typeItem.value] || [];
              if (items.length === 0) return null;
              return (
                <div key={typeItem.value}>
                  <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_COLORS[typeItem.value] || 'bg-gray-100 text-gray-700'}`}>
                      {typeItem.label}
                    </span>
                    {items.filter(t => t.is_default).map(t => (
                      <span key={t.id} className="ml-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded">Default: {t.name}</span>
                    ))}
                  </h2>
                  <div className="space-y-2">
                    {items.map(t => (
                      <div key={t.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-4 px-4 py-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 font-mono text-sm">{t.name}</span>
                              {t.is_system && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">Sistema</span>}
                              {t.is_default && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Default</span>}
                            </div>
                            {t.description && <div className="text-xs text-gray-500 mt-0.5">{t.description}</div>}
                          </div>
                          <button
                            onClick={() => toggleActiveMutation.mutate(t.id)}
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${t.is_active ? 'bg-green-500' : 'bg-gray-300'}`}
                          >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${t.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                          </button>
                          {!t.is_default && t.is_active && (
                            <button onClick={() => setDefaultMutation.mutate(t.id)} className="text-xs text-gray-400 hover:text-indigo-600 underline">Definir Default</button>
                          )}
                          {!t.is_system && (
                            <>
                              <button onClick={() => openEdit(t)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Editar</button>
                              <button onClick={() => setDeleteConfirm(t)} className="text-red-500 hover:text-red-700 text-xs font-medium">Apagar</button>
                            </>
                          )}
                          <button onClick={() => setExpandedId(expandedId === t.id ? null : t.id)} className="text-gray-400 hover:text-gray-600">
                            <svg className={`w-4 h-4 transition-transform ${expandedId === t.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        </div>
                        {expandedId === t.id && (
                          <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
                            <div>
                              <h4 className="text-xs font-medium text-gray-500 mb-1">Parâmetros</h4>
                              <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono">
                                {JSON.stringify(t.parameters || {}, null, 2)}
                              </pre>
                            </div>
                            {t.code_template && (
                              <div>
                                <h4 className="text-xs font-medium text-gray-500 mb-1">Código</h4>
                                <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                                  {t.code_template}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {Object.keys(grouped).length === 0 && (
              <div className="text-center py-12 text-gray-400">Nenhuma tool encontrada</div>
            )}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <Modal isOpen={true} onClose={closeForm} title={editingTool ? 'Editar Tool' : 'Nova Tool'} size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome (identificador)</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" placeholder="notify_agent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={form.tool_type} onChange={e => setForm(f => ({ ...f, tool_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={!!editingTool}>
                    {TOOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Breve descrição para o LLM" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parâmetros <span className="text-gray-400 font-normal">(JSON)</span></label>
                <textarea value={form.parameters} onChange={e => setForm(f => ({ ...f, parameters: e.target.value }))} rows={4} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" placeholder='{"ticket_id": {"type": "string", "required": true}}' />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código Template</label>
                <textarea value={form.code_template} onChange={e => setForm(f => ({ ...f, code_template: e.target.value }))} rows={6} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" placeholder="def my_tool(ticket_id): ..." />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  Default
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeForm} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancelar</button>
                <button type="submit" disabled={postMutation.isPending} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50">
                  {postMutation.isPending ? 'A guardar...' : editingTool ? 'Actualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Delete Confirm */}
        {deleteConfirm && (
          <Modal isOpen={true} onClose={() => setDeleteConfirm(null)} title="Confirmar Apagar">
            <p className="text-sm text-gray-600 mb-6">
              Tem a certeza que deseja apagar a tool <strong>{deleteConfirm.name}</strong>?
              Esta ação não pode ser revertida.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancelar</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50">
                {deleteMutation.isPending ? 'A apagar...' : 'Apagar'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
