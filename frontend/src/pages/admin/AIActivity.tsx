import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import { getAIExecutions, getAIExecutionLogs } from '../../api/client';

interface AIExecution {
  id: string;
  task_type: string;
  task_name: string;
  status: string;
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  error?: string;
  metadata?: Record<string, any>;
}

interface AILogEntry {
  timestamp: string;
  level: string;
  message: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  running: 'Em Execução',
  success: 'Sucesso',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

const TASK_TYPE_LABELS: Record<string, string> = {
  classification: 'Classificação',
  routing: 'Encaminhamento',
  summarization: 'Sumarização',
  suggestion: 'Sugestão',
  extraction: 'Extração',
  generation: 'Geração',
  analysis: 'Análise',
};

export default function AIActivity() {
  const [filterStatus, setFilterStatus] = useState('');
  const [searchTask, setSearchTask] = useState('');
  const [selectedExecution, setSelectedExecution] = useState<AIExecution | null>(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);

  const { data: executions = [], isLoading } = useQuery({
    queryKey: ['ai-executions'],
    queryFn: () => getAIExecutions().then(r => r.data as AIExecution[]),
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery({
    queryKey: ['ai-execution-logs', selectedExecution?.id],
    queryFn: () => selectedExecution ? getAIExecutionLogs(selectedExecution.id).then(r => r.data as AILogEntry[]) : Promise.resolve([]),
    enabled: !!selectedExecution && logsModalOpen,
  });

  const filtered = executions.filter(e => {
    if (filterStatus && e.status !== filterStatus) return false;
    if (searchTask) {
      const search = searchTask.toLowerCase();
      if (!e.task_name.toLowerCase().includes(search) && !e.task_type.toLowerCase().includes(search)) return false;
    }
    return true;
  });

  const formatDateTime = (d?: string) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
  };

  const statusColor = (s: string) => {
    if (s === 'success') return 'bg-green-100 text-green-700';
    if (s === 'failed') return 'bg-red-100 text-red-700';
    if (s === 'running') return 'bg-blue-100 text-blue-700';
    if (s === 'pending') return 'bg-yellow-100 text-yellow-700';
    if (s === 'cancelled') return 'bg-gray-100 text-gray-500';
    return 'bg-gray-100 text-gray-600';
  };

  const taskTypeColor = (t: string) => {
    if (t === 'classification') return 'bg-purple-100 text-purple-700';
    if (t === 'routing') return 'bg-indigo-100 text-indigo-700';
    if (t === 'summarization') return 'bg-teal-100 text-teal-700';
    if (t === 'suggestion') return 'bg-orange-100 text-orange-700';
    if (t === 'extraction') return 'bg-cyan-100 text-cyan-700';
    if (t === 'generation') return 'bg-pink-100 text-pink-700';
    if (t === 'analysis') return 'bg-amber-100 text-amber-700';
    return 'bg-gray-100 text-gray-600';
  };

  const handleViewLogs = (execution: AIExecution) => {
    setSelectedExecution(execution);
    setLogsModalOpen(true);
  };

  const logLevelColor = (level: string) => {
    if (level === 'error') return 'text-red-600';
    if (level === 'warning') return 'text-yellow-600';
    if (level === 'info') return 'text-blue-600';
    if (level === 'debug') return 'text-gray-500';
    return 'text-gray-700';
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Atividade de IA</h2>
        <span className="text-sm text-gray-500">{executions.length} execuções registradas</span>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={searchTask} onChange={e => setSearchTask(e.target.value)}
            placeholder="Pesquisar por tarefa..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="running">Em Execução</option>
          <option value="success">Sucesso</option>
          <option value="failed">Falhou</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500">Nenhuma execução encontrada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tarefa</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Início</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Duração</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Erro</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-xs font-mono text-gray-500">{e.id.slice(0, 12)}...</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${taskTypeColor(e.task_type)}`}>
                      {TASK_TYPE_LABELS[e.task_type] || e.task_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 text-sm">{e.task_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusColor(e.status)}`}>
                      {STATUS_LABELS[e.status] || e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{formatDateTime(e.started_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{formatDuration(e.duration_ms)}</td>
                  <td className="px-4 py-3 text-xs text-red-600 max-w-xs truncate">{e.error || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => handleViewLogs(e)}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 transition-colors rounded-lg"
                        title="Ver Logs"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Logs Modal */}
      {logsModalOpen && selectedExecution && (
        <Modal isOpen={true} onClose={() => { setLogsModalOpen(false); setSelectedExecution(null); }} title={`Logs: ${selectedExecution.task_name}`} size="lg">
          <div className="max-h-96 overflow-y-auto">
            {logsLoading ? (
              <div className="text-center py-8 text-gray-500">Carregando logs...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">Nenhum log disponível.</div>
            ) : (
              <div className="space-y-1 font-mono text-xs">
                {logs.map((log, i) => (
                  <div key={i} className={`flex gap-3 py-1 ${logLevelColor(log.level)}`}>
                    <span className="text-gray-400 shrink-0">{new Date(log.timestamp).toLocaleTimeString('pt-BR')}</span>
                    <span className="uppercase shrink-0 font-bold">{log.level}</span>
                    <span className="text-gray-700">{log.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </Layout>
  );
}
