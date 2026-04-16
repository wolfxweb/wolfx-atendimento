import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { getAIRules, createAIRule, updateAIRule, deleteAIRule } from '../../api/client';
import { extractErrorMessage } from '../../api/client';

type AIRule = {
  id: string;
  name: string;
  description?: string;
  priority?: string;
  category_id?: string;
  customer_id?: string;
  action_type: string;
  action_value?: string;
  dry_run: boolean;
  is_active: boolean;
  conditions?: Record<string, any>;
  created_at: string;
  updated_at?: string;
};

type RuleForm = {
  name: string;
  description: string;
  priority: string;
  category_id: string;
  customer_id: string;
  action_type: string;
  action_value: string;
  dry_run: boolean;
  is_active: boolean;
};

const EMPTY_FORM: RuleForm = {
  name: '',
  description: '',
  priority: '',
  category_id: '',
  customer_id: '',
  action_type: 'auto_reply',
  action_value: '',
  dry_run: true,
  is_active: true,
};

const ACTION_TYPES = [
  { value: 'auto_reply', label: 'Resposta Automática' },
  { value: 'auto_assign', label: 'Atribuição Automática' },
  { value: 'auto_priority', label: 'Alterar Prioridade' },
  { value: 'auto_tag', label: 'Adicionar Tag' },
  { value: 'auto_close', label: 'Fechar Ticket' },
  { value: 'auto_escalate', label: 'Escalar' },
];

const PRIORITIES = [
  { value: '', label: 'Todas as prioridades' },
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

export default function AdminAIRules() {
  const queryClient = useQueryClient();

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AIRule | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<AIRule | null>(null);
  const [dryRunWarning, setDryRunWarning] = useState(false);
  const [pendingDryRunValue, setPendingDryRunValue] = useState<boolean>(false);

  // Fetch rules
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['ai-rules'],
    queryFn: () => getAIRules().then(r => r.data as AIRule[]),
  });

  // Mutations
  const postMutation = useMutation({
    mutationFn: (data: RuleForm) =>
      editingRule
        ? updateAIRule(editingRule.id, { ...data, category_id: data.category_id || undefined, customer_id: data.customer_id || undefined })
        : createAIRule({ ...data, category_id: data.category_id || undefined, customer_id: data.customer_id || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-rules'] });
      closeForm();
    },
    onError: (err) => setFormError(extractErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAIRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-rules'] });
      setDeleteConfirm(null);
    },
    onError: (err) => alert(extractErrorMessage(err)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      updateAIRule(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-rules'] }),
  });

  // Handlers
  function openCreate() {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setShowForm(true);
  }

  function openEdit(rule: AIRule) {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      description: rule.description || '',
      priority: rule.priority || '',
      category_id: rule.category_id || '',
      customer_id: rule.customer_id || '',
      action_type: rule.action_type,
      action_value: rule.action_value || '',
      dry_run: rule.dry_run,
      is_active: rule.is_active,
    });
    setFormError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDryRunWarning(false);
    setPendingDryRunValue(false);
  }

  function handleDryRunToggle(targetValue: boolean) {
    if (!targetValue) {
      // User is trying to set dry_run = FALSE — show warning
      setPendingDryRunValue(false);
      setDryRunWarning(true);
    } else {
      setForm(f => ({ ...f, dry_run: true }));
    }
  }

  function confirmDryRunDisabled() {
    setDryRunWarning(false);
    setForm(f => ({ ...f, dry_run: false }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Nome é obrigatório'); return; }
    if (!form.action_type) { setFormError('Tipo de ação é obrigatório'); return; }
    postMutation.mutate(form);
  }

  const activeCount = rules.filter(r => r.is_active).length;
  const dryRunCount = rules.filter(r => r.dry_run).length;
  const autoApproveCount = rules.filter(r => !r.dry_run).length;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Regras de IA — Aprovação Automática</h2>
          <p className="text-sm text-gray-500 mt-1">
            Defina regras para auto-aprovação ou auto-rejeição de tickets pela IA. Modo actual: <span className="font-semibold text-indigo-600">MONITORING (dry_run=TRUE)</span>
          </p>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nova Regra
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-sm font-medium text-green-700">Dry Run (Monit.)</p>
          <p className="text-2xl font-bold text-green-800 mt-1">{dryRunCount}</p>
          <p className="text-xs text-green-600 mt-1">Aprovação humana necessária</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-200">
          <p className="text-sm font-medium text-red-700">Auto-Aprovação</p>
          <p className="text-2xl font-bold text-red-800 mt-1">{autoApproveCount}</p>
          <p className="text-xs text-red-600 mt-1">Ação automática sem aprovação</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
          <p className="text-sm font-medium text-indigo-700">Activas</p>
          <p className="text-2xl font-bold text-indigo-800 mt-1">{activeCount}</p>
          <p className="text-xs text-indigo-600 mt-1">de {rules.length} regras total</p>
        </div>
      </div>

      {/* Rules Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Carregando...</div>
      ) : rules.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm">
          <p className="text-gray-400">Nenhuma regra configurada.</p>
          <button onClick={openCreate} className="mt-3 text-indigo-600 hover:text-indigo-700 font-medium text-sm">
            + Criar primeira regra
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Acção</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Prioridade</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Modo</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map(rule => {
                const actionInfo = ACTION_TYPES.find(a => a.value === rule.action_type);
                const prioInfo = PRIORITIES.find(p => p.value === rule.priority);
                return (
                  <tr key={rule.id} className="hover:bg-gray-50">
                    <td className="px-5 py-4">
                      <div className="font-medium text-gray-800">{rule.name}</div>
                      {rule.description && (
                        <div className="text-sm text-gray-500 mt-0.5 truncate max-w-xs">{rule.description}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded text-xs font-semibold">
                        {actionInfo?.label || rule.action_type}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {prioInfo?.label || rule.priority || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                        rule.dry_run
                          ? 'bg-green-100 text-green-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {rule.dry_run ? 'DRY RUN' : 'AUTO-APROVE'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => toggleActiveMutation.mutate({ id: rule.id, is_active: !rule.is_active })}
                        className={`px-2 py-1 rounded text-xs font-semibold transition-colors cursor-pointer ${
                          rule.is_active
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-red-100 text-red-600 hover:bg-red-200'
                        }`}
                      >
                        {rule.is_active ? 'Activa' : 'Inactiva'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => openEdit(rule)}
                        className="text-indigo-600 hover:text-indigo-800 text-xs font-medium mr-3"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(rule)}
                        className="text-red-500 hover:text-red-700 text-xs font-medium"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {showForm && (
        <Modal
          isOpen={true}
          onClose={closeForm}
          title={editingRule ? `Editar Regra: ${editingRule.name}` : 'Nova Regra de IA'}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Regra *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Auto-aprovar tickets Low priority"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Descreva o comportamento desta regra..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                rows={2}
              />
            </div>

            {/* Action Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Acção *</label>
              <select
                value={form.action_type}
                onChange={e => setForm(f => ({ ...f, action_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {ACTION_TYPES.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            {/* Action Value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor da Acção</label>
              <input
                type="text"
                value={form.action_value}
                onChange={e => setForm(f => ({ ...f, action_value: e.target.value }))}
                placeholder="Ex: tag name, team name, priority value..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade (filtro)</label>
              <select
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {PRIORITIES.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Se vazio, a regra aplica-se a todas as prioridades.</p>
            </div>

            {/* Dry Run Toggle */}
            <div className={`flex items-start gap-3 p-4 rounded-lg border ${!form.dry_run ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}`}>
              <div className="flex items-center h-5">
                <input
                  id="dry_run"
                  type="checkbox"
                  checked={form.dry_run}
                  onChange={e => handleDryRunToggle(!form.dry_run)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
              </div>
              <div className="ml-2">
                <label htmlFor="dry_run" className="text-sm font-medium text-gray-700">
                  Modo Dry Run (Recomendado)
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Quando activo, a regra é executada mas apenas reporta/aconselha — não toma acção automática.
                  <br />
                  Quando desactivado, a IA aprova/rejeita automaticamente sem intervenção humana.
                </p>
                {!form.dry_run && (
                  <p className="text-xs font-semibold text-red-600 mt-1">⚠️ AUTO-APROVAÇÃO ACTIVADA — Sem aprovação humana</p>
                )}
              </div>
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
              <label htmlFor="is_active" className="text-sm text-gray-700">Regra activa</label>
            </div>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={closeForm}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={postMutation.isPending}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm disabled:opacity-50"
              >
                {postMutation.isPending ? 'A gravar...' : editingRule ? 'Guardar' : 'Criar Regra'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Dry Run Warning Modal ── */}
      <Modal
        isOpen={dryRunWarning}
        onClose={() => { setDryRunWarning(false); setPendingDryRunValue(false); }}
        title="⚠️ Aviso — Auto-Aprovação"
        size="md"
      >
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">ATENÇÃO: Está a activar a auto-aprovação!</h3>
          <p className="text-sm text-gray-600 mb-6">
            Esta regra irá automaticamente approve/reject sem intervenção humana.
            <br />
            <strong>Tem a certeza?</strong>
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { setDryRunWarning(false); setPendingDryRunValue(false); }}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
            >
              Cancelar — Manter Dry Run
            </button>
            <button
              onClick={confirmDryRunDisabled}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium"
            >
              Confirmar — Activar Auto-Aprovação
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirmation Modal ── */}
      {deleteConfirm && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirm(null)}
          title="Confirmar Eliminação"
          size="sm"
        >
          <div className="text-center">
            <p className="text-gray-600 mb-6">
              Tem a certeza que deseja eliminar a regra <strong>{deleteConfirm.name}</strong>?
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