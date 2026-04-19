import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { getAIModels, createAIModel, updateAIModel, deleteAIModel } from '../../api/client';
import { extractErrorMessage } from '../../api/client';

type AIModel = {
  id: string;
  name: string;
  type: 'llm' | 'embedding';
  provider: string;
  model_id: string;
  api_key_ref?: string;
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;
  model_metadata?: Record<string, any>;
  created_at: string;
  updated_at?: string;
};

type ModelForm = {
  name: string;
  type: 'llm' | 'embedding';
  provider: string;
  model_id: string;
  api_key_ref: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY_FORM: ModelForm = {
  name: '',
  type: 'llm',
  provider: '',
  model_id: '',
  api_key_ref: '',
  is_active: true,
  is_default: false,
};

const MODEL_TYPES = [
  { value: 'llm', label: 'LLM (Chat)' },
  { value: 'embedding', label: 'Embedding (RAG)' },
];

const PROVIDERS = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'custom', label: 'Custom' },
];

export default function AdminAIModels() {
  const queryClient = useQueryClient();

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingModel, setEditingModel] = useState<AIModel | null>(null);
  const [form, setForm] = useState<ModelForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<AIModel | null>(null);

  // Fetch models
  const { data: models = [], isLoading } = useQuery({
    queryKey: ['ai-models', typeFilter],
    queryFn: () => getAIModels({ type: typeFilter || undefined }).then(r => r.data as AIModel[]),
  });

  // Mutations
  const postMutation = useMutation({
    mutationFn: (data: ModelForm) =>
      editingModel
        ? updateAIModel(editingModel.id, {
            ...data,
            api_key_ref: data.api_key_ref || undefined,
          })
        : createAIModel({
            ...data,
            api_key_ref: data.api_key_ref || undefined,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-models'] });
      closeForm();
    },
    onError: (err) => setFormError(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAIModel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-models'] });
      setDeleteConfirm(null);
    },
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateAIModel(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-models'] }),
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const setDefaultMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      updateAIModel(id, { is_default: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-models'] });
    },
    onError: (err) => alert(extractErrorMessage(err)),
  });

  // Helpers
  const closeForm = () => {
    setShowForm(false);
    setEditingModel(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const openEdit = (model: AIModel) => {
    setEditingModel(model);
    setForm({
      name: model.name,
      type: model.type,
      provider: model.provider,
      model_id: model.model_id,
      api_key_ref: model.api_key_ref || '',
      is_active: model.is_active,
      is_default: model.is_default,
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    postMutation.mutate(form);
  };

  const handleDelete = () => {
    if (!deleteConfirm) return;
    deleteMutation.mutate(deleteConfirm.id);
  };

  const llmModels = models.filter(m => m.type === 'llm');
  const embeddingModels = models.filter(m => m.type === 'embedding');

  return (
    <Layout>
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Modelos AI</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure os modelos LLM e Embedding activos no sistema.
              O modelo default é usado automaticamente pelos agentes AI.
            </p>
          </div>
          <button
            onClick={() => { setForm(EMPTY_FORM); setShowForm(true); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Novo Modelo
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTypeFilter('')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${
              !typeFilter ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Todos
          </button>
          <button
            onClick={() => setTypeFilter('llm')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${
              typeFilter === 'llm' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            LLM
          </button>
          <button
            onClick={() => setTypeFilter('embedding')}
            className={`px-3 py-1.5 rounded text-sm font-medium ${
              typeFilter === 'embedding' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Embedding
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {/* LLM Section */}
            {(!typeFilter || typeFilter === 'llm') && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  Modelos LLM
                  {llmModels.filter(m => m.is_default).map(m => (
                    <span key={m.id} className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded font-normal">
                      Default: {m.name}
                    </span>
                  ))}
                </h2>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Provider</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Model ID</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Default</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Activo</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Sistema</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">Acções</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {llmModels.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center px-4 py-8 text-gray-400">
                            Nenhum modelo LLM configurado
                          </td>
                        </tr>
                      ) : llmModels.map(model => (
                        <tr key={model.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{model.name}</td>
                          <td className="px-4 py-3 text-gray-600">{model.provider}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{model.model_id}</td>
                          <td className="px-4 py-3 text-center">
                            {model.is_default ? (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">Default</span>
                            ) : (
                              <button
                                onClick={() => setDefaultMutation.mutate({ id: model.id, type: model.type })}
                                className="text-xs text-gray-400 hover:text-blue-600 underline"
                              >
                                Definir
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => toggleActiveMutation.mutate({ id: model.id, is_active: !model.is_active })}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                model.is_active ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                            >
                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                  model.is_active ? 'translate-x-5' : 'translate-x-1'
                                }`} />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {model.is_system && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">Sistema</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => openEdit(model)}
                              className="text-indigo-600 hover:text-indigo-800 mr-3 text-xs font-medium"
                            >
                              Editar
                            </button>
                            {!model.is_system && (
                              <button
                                onClick={() => setDeleteConfirm(model)}
                                className="text-red-500 hover:text-red-700 text-xs font-medium"
                              >
                                Apagar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Embedding Section */}
            {(!typeFilter || typeFilter === 'embedding') && (
              <div>
                <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  Modelos Embedding (RAG)
                  {embeddingModels.filter(m => m.is_default).map(m => (
                    <span key={m.id} className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-normal">
                      Default: {m.name}
                    </span>
                  ))}
                </h2>
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Provider</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-600">Model ID</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Default</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Activo</th>
                        <th className="text-center px-4 py-3 font-medium text-gray-600">Sistema</th>
                        <th className="text-right px-4 py-3 font-medium text-gray-600">Acções</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {embeddingModels.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center px-4 py-8 text-gray-400">
                            Nenhum modelo embedding configurado
                          </td>
                        </tr>
                      ) : embeddingModels.map(model => (
                        <tr key={model.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{model.name}</td>
                          <td className="px-4 py-3 text-gray-600">{model.provider}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{model.model_id}</td>
                          <td className="px-4 py-3 text-center">
                            {model.is_default ? (
                              <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Default</span>
                            ) : (
                              <button
                                onClick={() => setDefaultMutation.mutate({ id: model.id, type: model.type })}
                                className="text-xs text-gray-400 hover:text-green-600 underline"
                              >
                                Definir
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => toggleActiveMutation.mutate({ id: model.id, is_active: !model.is_active })}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                                model.is_active ? 'bg-green-500' : 'bg-gray-300'
                              }`}
                            >
                                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                                  model.is_active ? 'translate-x-5' : 'translate-x-1'
                                }`} />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {model.is_system && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded">Sistema</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => openEdit(model)}
                              className="text-indigo-600 hover:text-indigo-800 mr-3 text-xs font-medium"
                            >
                              Editar
                            </button>
                            {!model.is_system && (
                              <button
                                onClick={() => setDeleteConfirm(model)}
                                className="text-red-500 hover:text-red-700 text-xs font-medium"
                              >
                                Apagar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <Modal isOpen={true} onClose={closeForm} title={editingModel ? 'Editar Modelo' : 'Novo Modelo'}>
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Gemini 2.0 Flash"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value as 'llm' | 'embedding' }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    disabled={!!editingModel}
                  >
                    {MODEL_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                  <select
                    value={form.provider}
                    onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Selecionar...</option>
                    {PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model ID</label>
                <input
                  type="text"
                  required
                  value={form.model_id}
                  onChange={e => setForm(f => ({ ...f, model_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  placeholder="google/gemini-2.0-flash-exp"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  API Key Ref <span className="text-gray-400 font-normal">(variável de ambiente)</span>
                </label>
                <input
                  type="text"
                  value={form.api_key_ref}
                  onChange={e => setForm(f => ({ ...f, api_key_ref: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  placeholder="OPENAI_API_KEY"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Activo
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.is_default}
                    onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Default
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={postMutation.isPending}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                >
                  {postMutation.isPending ? 'A guardar...' : editingModel ? 'Actualizar' : 'Criar'}
                </button>
              </div>
            </form>
          </Modal>
        )}

        {/* Delete Confirm Modal */}
        {deleteConfirm && (
          <Modal isOpen={true} onClose={() => setDeleteConfirm(null)} title="Confirmar Apagar">
            <p className="text-sm text-gray-600 mb-6">
              Tem a certeza que deseja apagar o modelo <strong>{deleteConfirm.name}</strong>?
              Esta ação não pode ser revertida.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'A apagar...' : 'Apagar'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    </Layout>
  );
}
