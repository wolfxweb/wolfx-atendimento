import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import {
  getAIModels,
  updateAIModel,
  getAIPromptTemplates,
  updateAIPromptTemplate,
  getAIConfig,
  updateAIConfig,
} from '../../api/client';
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
};

type AIConfig = {
  dry_run: boolean;
  workflow_enabled: boolean;
  auto_reply_enabled: boolean;
  agent_system_prompt_template_id?: string;
};

type SystemPromptForm = {
  prompt_template: string;
  variables: string;
};

export default function AIAgent() {
  const qc = useQueryClient();
  const [configSaved, setConfigSaved] = useState(false);

  // Fetch models
  const { data: llmModels = [], isLoading: llmLoading } = useQuery({
    queryKey: ['ai-models', 'llm'],
    queryFn: () => getAIModels({ type: 'llm', is_active: true }).then(r => r.data as AIModel[]),
  });

  const { data: embeddingModels = [], isLoading: embLoading } = useQuery({
    queryKey: ['ai-models', 'embedding'],
    queryFn: () => getAIModels({ type: 'embedding', is_active: true }).then(r => r.data as AIModel[]),
  });

  // Fetch system prompt template
  const { data: systemPromptTemplates = [], isLoading: templateLoading } = useQuery({
    queryKey: ['ai-prompt-templates', 'agent_system'],
    queryFn: () => getAIPromptTemplates({ type: 'agent_system' }).then(r => r.data as any[]),
  });

  // Fetch AI config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => getAIConfig().then(r => r.data as AIConfig),
  });

  // Set default LLM mutation
  const setDefaultLLMMut = useMutation({
    mutationFn: ({ id, type }: { id: string; type: 'llm' | 'embedding' }) => {
      const models = type === 'llm' ? llmModels : embeddingModels;
      const promises = models
        .filter((m: AIModel) => m.is_default)
        .map((m: AIModel) => updateAIModel(m.id, { is_default: false }));
      promises.push(updateAIModel(id, { is_default: true }));
      return Promise.all(promises);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-models'] });
      showSaved();
    },
  });

  // Update system prompt mutation
  const updatePromptMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SystemPromptForm }) =>
      updateAIPromptTemplate(id, {
        prompt_template: data.prompt_template,
        variables: data.variables.split(',').map(v => v.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-prompt-templates'] });
      showSaved();
    },
    onError: (e: any) => alert(extractErrorMessage(e)),
  });

  // Update config mutation
  const updateConfigMut = useMutation({
    mutationFn: (data: Partial<AIConfig>) => updateAIConfig(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-config'] });
      showSaved();
    },
    onError: (e: any) => alert(extractErrorMessage(e)),
  });

  const showSaved = () => {
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 3000);
  };

  const defaultLLM = (llmModels as AIModel[]).find((m: AIModel) => m.is_default);
  const defaultEmbedding = (embeddingModels as AIModel[]).find((m: AIModel) => m.is_default);
  const systemPromptTemplate = (systemPromptTemplates as any[]).find((t: any) => t.is_default) || (systemPromptTemplates as any[])[0];

  const isLoading = llmLoading || embLoading || templateLoading || configLoading;

  if (isLoading) {
    return (
      <Layout>
        <p className="text-gray-500">A carregar...</p>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Configuração do Agente de IA</h1>
        <p className="text-sm text-gray-500 mt-1">Configure o modelo, os prompts e o comportamento do agente de atendimento.</p>
      </div>

      {configSaved && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">
          ✓ Configurações salvas com sucesso
        </div>
      )}

      <div className="space-y-6 max-w-3xl">

        {/* ── LLM Model ─────────────────────────────────────────────── */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Modelo LLM (Chat)</h2>
          <p className="text-sm text-gray-500 mb-4">Modelo utilizado para classificação, sugestão de respostas e decisão de escalonamento.</p>
          <div className="space-y-2">
            {(llmModels as AIModel[]).length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum modelo LLM disponível.</p>
            ) : (
              (llmModels as AIModel[]).map((m: AIModel) => (
                <div key={m.id} className={`flex items-center justify-between p-3 border rounded ${m.is_default ? 'border-blue-400 bg-blue-50' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{m.name}</span>
                      {m.is_default && <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded">Padrão</span>}
                      <span className="text-xs text-gray-500">{m.provider} · {m.model_id}</span>
                    </div>
                  </div>
                  {!m.is_system && (
                    <button
                      onClick={() => setDefaultLLMMut.mutate({ id: m.id, type: 'llm' })}
                      className={`text-xs px-3 py-1 border rounded ${m.is_default ? 'text-gray-400 cursor-default' : 'text-blue-600 hover:bg-blue-50'}`}
                      disabled={m.is_default}
                    >
                      {m.is_default ? 'Padrão' : 'Definir como padrão'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            Para adicionar ou editar modelos, acesse a API ou insira diretamente no banco de dados.
          </p>
        </section>

        {/* ── Embedding Model ────────────────────────────────────────── */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Modelo de Embedding (RAG)</h2>
          <p className="text-sm text-gray-500 mb-4">Modelo utilizado para busca vetorial na base de conhecimento.</p>
          <div className="space-y-2">
            {(embeddingModels as AIModel[]).length === 0 ? (
              <p className="text-sm text-gray-400">Nenhum modelo de embedding disponível.</p>
            ) : (
              (embeddingModels as AIModel[]).map((m: AIModel) => (
                <div key={m.id} className={`flex items-center justify-between p-3 border rounded ${m.is_default ? 'border-purple-400 bg-purple-50' : ''}`}>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{m.name}</span>
                      {m.is_default && <span className="bg-purple-600 text-white text-xs px-2 py-0.5 rounded">Padrão</span>}
                      <span className="text-xs text-gray-500">{m.provider} · {m.model_id}</span>
                    </div>
                  </div>
                  {!m.is_system && (
                    <button
                      onClick={() => setDefaultLLMMut.mutate({ id: m.id, type: 'embedding' })}
                      className={`text-xs px-3 py-1 border rounded ${m.is_default ? 'text-gray-400 cursor-default' : 'text-purple-600 hover:bg-purple-50'}`}
                      disabled={m.is_default}
                    >
                      {m.is_default ? 'Padrão' : 'Definir como padrão'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* ── System Prompt ───────────────────────────────────────────── */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Prompt de Sistema do Agente</h2>
          <p className="text-sm text-gray-500 mb-4">
            Instruções que definem a personalidade e o comportamento do agente de IA.
            Variáveis disponíveis: <code className="bg-gray-100 px-1 rounded">{'{{language}}'}</code>
          </p>
          {systemPromptTemplate ? (
            <SystemPromptEditor
              template={systemPromptTemplate}
              onSave={(data) => updatePromptMut.mutate({ id: systemPromptTemplate.id, data })}
              isSaving={updatePromptMut.isPending}
            />
          ) : (
            <p className="text-sm text-gray-400">Nenhum template de prompt de sistema encontrado. Crie um com tipo "Prompt Sistema Agente".</p>
          )}
        </section>

        {/* ── Comportamento ──────────────────────────────────────────── */}
        <section className="bg-white border rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Comportamento do Agente</h2>
          <div className="space-y-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config?.dry_run ?? true}
                onChange={(e) => updateConfigMut.mutate({ dry_run: e.target.checked })}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Modo Dry Run (recomendado)</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Quando ativado, o agente de IA executa todas as análises e sugere respostas, mas não as aplica automaticamente.
                  Todas as decisões são registradas em log para revisão.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config?.workflow_enabled ?? false}
                onChange={(e) => updateConfigMut.mutate({ workflow_enabled: e.target.checked })}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Workflow de IA ativo</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Quando ativado, novos tickets passam automaticamente pelo pipeline de classificação,
                  busca na base de conhecimento e sugestão de resposta.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={config?.auto_reply_enabled ?? false}
                onChange={(e) => updateConfigMut.mutate({ auto_reply_enabled: e.target.checked })}
                className="mt-0.5"
              />
              <div>
                <span className="text-sm font-medium">Auto-resposta de IA ativa</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Após aprovação, envia automaticamente a resposta sugerida ao cliente via e-mail ou Telegram
                  (apenas quando o modo dry run estiver desativado).
                </p>
              </div>
            </label>
          </div>
        </section>

      </div>
    </Layout>
  );
}

// ─── System Prompt Editor (inline) ──────────────────────────────────────────────

function SystemPromptEditor({ template, onSave, isSaving }: {
  template: any;
  onSave: (data: SystemPromptForm) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<SystemPromptForm>({
    prompt_template: template.prompt_template || '',
    variables: template.variables?.join(', ') || 'language',
  });
  const [editing, setEditing] = useState(false);

  return (
    <div>
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Prompt de Sistema</label>
            <textarea
              rows={10}
              value={form.prompt_template}
              onChange={(e) => setForm(f => ({ ...f, prompt_template: e.target.value }))}
              className="w-full border rounded px-3 py-2 text-sm font-mono"
              placeholder="Você é um assistente de suporte com IA..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onSave(form)}
              disabled={isSaving}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={() => { setEditing(false); setForm({ prompt_template: template.prompt_template, variables: template.variables?.join(', ') || 'language' }); }}
              className="border px-4 py-2 rounded text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="bg-gray-50 border rounded p-3">
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">{template.prompt_template}</pre>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="mt-3 text-sm text-blue-600 hover:underline"
          >
            Editar prompt de sistema
          </button>
        </div>
      )}
    </div>
  );
}
