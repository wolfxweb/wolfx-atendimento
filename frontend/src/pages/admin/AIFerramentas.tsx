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
  getAITools,
  createAITool,
  updateAITool,
  deleteAITool,
  toggleAIToolActive,
  setAIToolDefault,
} from '../../api/client';
import { extractErrorMessage } from '../../api/client';

// ─── Shared types ─────────────────────────────────────────────────────────────

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

type AITool = {
  id: string;
  name: string;
  description: string;
  tool_type: string;
  code_template: string;
  is_active: boolean;
  is_default: boolean;
  is_system: boolean;
  customer_id?: string;
  created_at: string;
  updated_at?: string;
};

// ─── Prompt Templates Tab ─────────────────────────────────────────────────────

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

type TemplateForm = {
  name: string;
  type: string;
  prompt_template: string;
  variables: string;
  model_type: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY_TEMPLATE_FORM: TemplateForm = {
  name: '',
  type: 'classification',
  prompt_template: '',
  variables: '',
  model_type: 'llm',
  is_active: true,
  is_default: false,
};

function PromptTemplatesTab() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AIPromptTemplate | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_TEMPLATE_FORM);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'classification' | 'suggestion' | 'escalation' | 'agent_system' | 'rag_query'>('all');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['ai-prompt-templates'],
    queryFn: () => getAIPromptTemplates().then(r => r.data as AIPromptTemplate[]),
  });

  const createMut = useMutation({
    mutationFn: createAIPromptTemplate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] }); closeModal(); },
    onError: (e: any) => setError(extractErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => updateAIPromptTemplate(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] }); closeModal(); },
    onError: (e: any) => setError(extractErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAIPromptTemplate,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] }); },
    onError: (e: any) => setError(extractErrorMessage(e)),
  });

  const toggleActiveMut = useMutation({
    mutationFn: toggleAIPromptTemplateActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: setAIPromptTemplateDefault,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] }),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_TEMPLATE_FORM); setError(''); setModalOpen(true); };
  const openEdit = (t: AIPromptTemplate) => {
    setEditing(t);
    setForm({ name: t.name, type: t.type, prompt_template: t.prompt_template, variables: t.variables?.join(', ') || '', model_type: t.model_type, is_active: t.is_active, is_default: t.is_default });
    setError('');
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setError(''); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...form, variables: form.variables.split(',').map(v => v.trim()).filter(Boolean) };
    if (editing) updateMut.mutate({ id: editing.id, ...payload });
    else createMut.mutate(payload);
  };

  const filtered = activeTab === 'all' ? templates : templates.filter((t: AIPromptTemplate) => t.type === activeTab);

  const tabCounts: Record<string, number> = { all: templates.length };
  templates.forEach((t: AIPromptTemplate) => { tabCounts[t.type] = (tabCounts[t.type] || 0) + 1; });

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {(['all', 'classification', 'suggestion', 'escalation', 'agent_system', 'rag_query'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1 rounded text-sm ${activeTab === tab ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {tab === 'all' ? `Todos (${tabCounts.all || 0})` : TEMPLATE_TYPES.find(t => t.value === tab)?.label} ({tabCounts[tab] || 0})
          </button>
        ))}
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
          + Novo Template
        </button>
      </div>

      {isLoading ? <p className="text-gray-500">A carregar...</p> : filtered.length === 0 ? (
        <p className="text-gray-500">Nenhum template encontrado.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t: AIPromptTemplate) => (
            <div key={t.id} className={`border rounded p-4 ${!t.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm">{t.name}</h3>
                    {t.is_default && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">Default</span>}
                    {t.is_system && <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">Sistema</span>}
                    {!t.is_active && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">Inactivo</span>}
                    <span className="bg-blue-50 text-blue-600 text-xs px-2 py-0.5 rounded">{TEMPLATE_TYPES.find(x => x.value === t.type)?.label || t.type}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Variáveis: {t.variables?.join(', ') || '—'} • {t.model_type === 'llm' ? 'LLM' : 'Embedding'}</p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2 font-mono">{t.prompt_template}</p>
                </div>
                <div className="flex gap-1 ml-3">
                  {!t.is_system && !t.is_default && (
                    <button onClick={() => setDefaultMut.mutate(t.id)} title="Definir como default" className="text-gray-400 hover:text-green-600 text-xs px-2 py-1 border rounded">Default</button>
                  )}
                  {!t.is_system && (
                    <button onClick={() => toggleActiveMut.mutate(t.id)} className={`text-xs px-2 py-1 border rounded ${t.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                      {t.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                  <button onClick={() => openEdit(t)} className="text-blue-600 hover:bg-blue-50 text-xs px-2 py-1 border rounded">Editar</button>
                  {!t.is_system && (
                    <button onClick={() => { if (confirm('Eliminar?')) deleteMut.mutate(t.id); }} className="text-red-600 hover:bg-red-50 text-xs px-2 py-1 border rounded">Eliminar</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Editar Template' : 'Novo Template'}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="Nome do template" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo</label>
                <select required value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                  {TEMPLATE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Modelo</label>
                <select required value={form.model_type} onChange={e => setForm(f => ({ ...f, model_type: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                  {MODEL_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Variáveis (separadas por vírgula)</label>
              <input value={form.variables} onChange={e => setForm(f => ({ ...f, variables: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="title, description, category" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Prompt Template</label>
              <textarea required rows={6} value={form.prompt_template} onChange={e => setForm(f => ({ ...f, prompt_template: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="Use variáveis como {{title}}, {{description}}..." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
              Definir como default para este tipo
            </label>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {createMut.isPending || updateMut.isPending ? 'A gravar...' : 'Gravar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Tools Tab ────────────────────────────────────────────────────────────────

const TOOL_TYPES = [
  { value: 'notification', label: 'Notificação' },
  { value: 'ticket_update', label: 'Actualização de Ticket' },
  { value: 'knowledge_base', label: 'Base de Conhecimento' },
  { value: 'classification', label: 'Classificação' },
  { value: 'escalation', label: 'Escalação' },
];

type ToolForm = {
  name: string;
  description: string;
  tool_type: string;
  code_template: string;
  is_active: boolean;
  is_default: boolean;
};

const EMPTY_TOOL_FORM: ToolForm = {
  name: '',
  description: '',
  tool_type: 'notification',
  code_template: '',
  is_active: true,
  is_default: false,
};

function ToolsTab() {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AITool | null>(null);
  const [form, setForm] = useState<ToolForm>(EMPTY_TOOL_FORM);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');

  const { data: tools = [], isLoading } = useQuery({
    queryKey: ['ai-tools'],
    queryFn: () => getAITools().then(r => r.data as AITool[]),
  });

  const createMut = useMutation({
    mutationFn: createAITool,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-tools'] }); closeModal(); },
    onError: (e: any) => setError(extractErrorMessage(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: { id: string; [k: string]: any }) => updateAITool(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-tools'] }); closeModal(); },
    onError: (e: any) => setError(extractErrorMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: deleteAITool,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-tools'] }); },
    onError: (e: any) => setError(extractErrorMessage(e)),
  });

  const toggleActiveMut = useMutation({
    mutationFn: toggleAIToolActive,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-tools'] }),
  });

  const setDefaultMut = useMutation({
    mutationFn: setAIToolDefault,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-tools'] }),
  });

  const openCreate = () => { setEditing(null); setForm(EMPTY_TOOL_FORM); setError(''); setModalOpen(true); };
  const openEdit = (t: AITool) => {
    setEditing(t);
    setForm({ name: t.name, description: t.description, tool_type: t.tool_type, code_template: t.code_template, is_active: t.is_active, is_default: t.is_default });
    setError('');
    setModalOpen(true);
  };
  const closeModal = () => { setModalOpen(false); setEditing(null); setError(''); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) updateMut.mutate({ id: editing.id, ...form });
    else createMut.mutate(form);
  };

  const filtered = activeTab === 'all' ? tools : tools.filter((t: AITool) => t.tool_type === activeTab);

  const tabCounts: Record<string, number> = { all: tools.length };
  tools.forEach((t: AITool) => { tabCounts[t.tool_type] = (tabCounts[t.tool_type] || 0) + 1; });

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setActiveTab('all')} className={`px-3 py-1 rounded text-sm ${activeTab === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
          Todas ({tabCounts.all || 0})
        </button>
        {TOOL_TYPES.map(t => (
          <button key={t.value} onClick={() => setActiveTab(t.value)} className={`px-3 py-1 rounded text-sm ${activeTab === t.value ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}>
            {t.label} ({tabCounts[t.value] || 0})
          </button>
        ))}
      </div>

      <div className="flex justify-end mb-4">
        <button onClick={openCreate} className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">
          + Nova Tool
        </button>
      </div>

      {isLoading ? <p className="text-gray-500">A carregar...</p> : filtered.length === 0 ? (
        <p className="text-gray-500">Nenhuma tool encontrada.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((t: AITool) => (
            <div key={t.id} className={`border rounded p-4 ${!t.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-sm">{t.name}</h3>
                    {t.is_default && <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded">Default</span>}
                    {t.is_system && <span className="bg-gray-100 text-gray-600 text-xs px-2 py-0.5 rounded">Sistema</span>}
                    {!t.is_active && <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">Inactivo</span>}
                    <span className="bg-purple-50 text-purple-600 text-xs px-2 py-0.5 rounded">{TOOL_TYPES.find(x => x.value === t.tool_type)?.label || t.tool_type}</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">{t.description}</p>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2 font-mono">{t.code_template}</p>
                </div>
                <div className="flex gap-1 ml-3">
                  {!t.is_system && !t.is_default && (
                    <button onClick={() => setDefaultMut.mutate(t.id)} title="Definir como default" className="text-gray-400 hover:text-green-600 text-xs px-2 py-1 border rounded">Default</button>
                  )}
                  {!t.is_system && (
                    <button onClick={() => toggleActiveMut.mutate(t.id)} className={`text-xs px-2 py-1 border rounded ${t.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                      {t.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                  )}
                  <button onClick={() => openEdit(t)} className="text-blue-600 hover:bg-blue-50 text-xs px-2 py-1 border rounded">Editar</button>
                  {!t.is_system && (
                    <button onClick={() => { if (confirm('Eliminar?')) deleteMut.mutate(t.id); }} className="text-red-600 hover:bg-red-50 text-xs px-2 py-1 border rounded">Eliminar</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Editar Tool' : 'Nova Tool'}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="notify_agent" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Descrição</label>
              <input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="O que esta tool faz" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Tipo</label>
                <select required value={form.tool_type} onChange={e => setForm(f => ({ ...f, tool_type: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                  {TOOL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.is_default} onChange={e => setForm(f => ({ ...f, is_default: e.target.checked }))} />
                  Definir como default
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Code Template (Python)</label>
              <textarea required rows={8} value={form.code_template} onChange={e => setForm(f => ({ ...f, code_template: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="def tool_function(context): ..." />
            </div>
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="flex gap-2 justify-end pt-2">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancelar</button>
              <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {createMut.isPending || updateMut.isPending ? 'A gravar...' : 'Gravar'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Unified Page ─────────────────────────────────────────────────────────────

export default function AIFerramentas() {
  const [tab, setTab] = useState<'templates' | 'tools'>('templates');

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Ferramentas AI</h1>
        <p className="text-sm text-gray-500 mt-1">Templates de prompt e funções executáveis pelo agente AI.</p>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1">
          <button onClick={() => setTab('templates')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'templates' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Templates de Prompt
          </button>
          <button onClick={() => setTab('tools')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === 'tools' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            Ferramentas (Tools)
          </button>
        </nav>
      </div>

      {tab === 'templates' ? <PromptTemplatesTab /> : <ToolsTab />}
    </Layout>
  );
}
