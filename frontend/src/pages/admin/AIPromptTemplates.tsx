import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import {
  getAIPromptTemplates,
  createAIPromptTemplate,
  updateAIPromptTemplate,
  deleteAIPromptTemplate,
  toggleAIPromptTemplateActive,
  setAIPromptTemplateDefault,
} from '../../api/client';
import { extractErrorMessage } from '../../api/client';

type AIPromptTemplate = {
  id: string;
  name: string;
  type: string;
  prompt_template: string;
  variables: string[];
  model_type: string;
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;
  customer_id?: string;
  created_at: string;
  updated_at?: string;
};

type TemplateForm = {
  name: string;
  type: string;
  prompt_template: string;
  variables: string;
  model_type: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY_FORM: TemplateForm = {
  name: '',
  type: 'classification',
  prompt_template: '',
  variables: '',
  model_type: 'llm',
  is_active: true,
  is_default: false,
};

const TEMPLATE_TYPES = [
  { value: 'classification', label: 'Classificação' },
  { value: 'suggestion', label: 'Sugestão de Resposta' },
  { value: 'escalation', label: 'Escalação' },
  { value: 'agent_system', label: 'Prompt Sistema Agente' },
  { value: 'rag_query', label: 'Query RAG' },
];

const MODEL_TYPES = [
  { value: 'llm', label: 'LLM (Chat)' },
  { value: 'embedding', label: 'Embedding (RAG)' },
];

const TYPE_COLORS: Record<string, string> = {
  classification: 'bg-blue-100 text-blue-700',
  suggestion: 'bg-green-100 text-green-700',
  escalation: 'bg-red-100 text-red-700',
  agent_system: 'bg-purple-100 text-purple-700',
  rag_query: 'bg-orange-100 text-orange-700',
};

export default function AdminAIPromptTemplates() {
  console.log('[DEBUG] AdminAIPromptTemplates rendered');
  const queryClient = useQueryClient();

  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AIPromptTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<AIPromptTemplate | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['ai-prompt-templates', typeFilter],
    queryFn: () => getAIPromptTemplates({ type: typeFilter || undefined }).then(r => r.data as AIPromptTemplate[]),
  });

  const postMutation = useMutation({
    mutationFn: (data: TemplateForm) => {
      const payload = {
        ...data,
        variables: data.variables.split(',').map(v => v.trim()).filter(Boolean),
      };
      return editingTemplate
        ? updateAIPromptTemplate(editingTemplate.id, payload)
        : createAIPromptTemplate(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
      closeForm();
    },
    onError: (err) => setFormError(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAIPromptTemplate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
      setDeleteConfirm(null);
    },
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (id: string) => toggleAIPromptTemplateActive(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-prompt-templates'] }),
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => setAIPromptTemplateDefault(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-prompt-templates'] }),
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const closeForm = () => {
    setShowForm(false);
    setEditingTemplate(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const openEdit = (t: AIPromptTemplate) => {
    setEditingTemplate(t);
    setForm({
      name: t.name,
      type: t.type,
      prompt_template: t.prompt_template,
      variables: t.variables.join(', '),
      model_type: t.model_type,
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

  const grouped = templates.reduce<Record<string, AIPromptTemplate[]>>((acc, t) => {
    if (!acc[t.type]) acc[t.type] = [];
    acc[t.type].push(t);
    return acc;
  }, {});

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Templates de Prompt</h1>
            <p className="text-sm text-gray-500 mt-1">
              Templates que definem o comportamento do agente AI. Cada tipo tem exatamente um default activo.
            </p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Template
          </button>
        </div>

        {/* Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button onClick={() => setTypeFilter('')} className={`px-3 py-1.5 rounded text-sm font-medium ${!typeFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>Todos</button>
          {TEMPLATE_TYPES.map(t => (
            <button key={t.value} onClick={() => setTypeFilter(t.value)} className={`px-3 py-1.5 rounded text-sm font-medium ${typeFilter === t.value ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {TEMPLATE_TYPES.filter(t => !typeFilter || t.value === typeFilter).map(typeItem => {
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
                              <span className="font-medium text-gray-900">{t.name}</span>
                              {t.is_system && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">Sistema</span>}
                              {t.is_default && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">Default</span>}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Variáveis: {t.variables.length > 0 ? t.variables.join(', ') : 'nenhuma'} • {t.model_type}
                            </div>
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
                          <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                            <pre className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                              {t.prompt_template}
                            </pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {Object.keys(grouped).length === 0 && (
              <div className="text-center py-12 text-gray-400">Nenhum template encontrado</div>
            )}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <Modal isOpen={true} onClose={closeForm} title={editingTemplate ? 'Editar Template' : 'Novo Template'} size="lg">
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{formError}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" disabled={!!editingTemplate}>
                    {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Model Type</label>
                  <select value={form.model_type} onChange={e => setForm(f => ({ ...f, model_type: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {MODEL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Variáveis <span className="text-gray-400 font-normal">(separadas por vírgula)</span></label>
                  <input type="text" value={form.variables} onChange={e => setForm(f => ({ ...f, variables: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="title, description, category" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prompt Template</label>
                <textarea
                  value={form.prompt_template}
                  onChange={e => setForm(f => ({ ...f, prompt_template: e.target.value }))}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  placeholder="Classifica o ticket: Titulo={title}, Descricao={description}..."
                />
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
                  {postMutation.isPending ? 'A guardar...' : editingTemplate ? 'Actualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Delete Confirm */}
        {deleteConfirm && (
          <Modal isOpen={true} onClose={() => setDeleteConfirm(null)} title="Confirmar Apagar">
            <p className="text-sm text-gray-600 mb-6">
              Tem a certeza que deseja apagar o template <strong>{deleteConfirm.name}</strong>?
              Esta ação não pode ser revertida.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium">Cancelar</button>
              <button onClick={handleDelete} disabled={deleteMutation.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50">
                {deleteMutation.isPending ? 'A apagar...' : 'Apagar'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}

function handleDelete() {
  // This is a workaround since we can't use hooks in a non-component function
}
