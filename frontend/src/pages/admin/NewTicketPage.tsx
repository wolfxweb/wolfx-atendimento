import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { createTicket, getCustomers, extractErrorMessage } from '../../api/client';

const STEPS = [
  { n: 1, label: 'Dados', sub: 'Título, descrição e cliente' },
  { n: 2, label: 'Categoria', sub: 'Tipo de atendimento' },
  { n: 3, label: 'Produtos', sub: 'Produtos associados' },
  { n: 4, label: 'Equipa', sub: 'Colaboradores' },
  { n: 5, label: 'Relações', sub: 'Tickets relacionados' },
];

export default function NewTicketPage() {
  const navigate = useNavigate();

  // Step 1 fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState('');

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers().then(r => r.data as any[]),
  });

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (result: any) => {
      navigate(`/admin/tickets/${result.data.id}/edit?step=2`);
    },
    onError: (err: any) => setError(extractErrorMessage(err)),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) { setError('Título é obrigatório'); return; }
    if (title.trim().length < 3) { setError('Título precisa de pelo menos 3 caracteres'); return; }
    if (!description.trim()) { setError('Descrição é obrigatória'); return; }
    if (description.trim().length < 10) { setError('Descrição precisa de pelo menos 10 caracteres'); return; }
    if (!customerId.trim()) { setError('Cliente é obrigatório'); return; }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId.trim())) {
      setError('Cliente inválido');
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      description: description.trim(),
      priority,
      customer_id: customerId.trim(),
    });
  };

  const sectionClass = "bg-gray-50 rounded-xl p-5 mb-5";
  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate('/admin/tickets')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Novo Ticket</h1>
        </div>

        {/* Step indicator */}
        <div className="flex gap-1 mb-6">
          {STEPS.map((s) => {
            const active = s.n === 1;
            return (
              <div key={s.n} className="flex-1">
                <div className={`h-1 rounded-full transition-all ${active ? 'bg-indigo-500' : 'bg-gray-200'}`} />
                <p className={`text-xs mt-1 ${active ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>
                  {s.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6">
            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center">1</div>
              <div>
                <h2 className="text-base font-semibold text-gray-800">Dados obrigatórios</h2>
                <p className="text-xs text-gray-400">Título, descrição e cliente</p>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className={sectionClass}>
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Título *</label>
                    <input type="text" value={title} onChange={e => setTitle(e.target.value)} className={inputClass} placeholder="Resumo do problema (mín. 3 caracteres)" maxLength={200} autoFocus />
                  </div>
                  <div>
                    <label className={labelClass}>Descrição *</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} className={inputClass} rows={4} placeholder="Descreva o problema em detalhes (mín. 10 caracteres)" />
                  </div>
                </div>
              </div>

              <div className={sectionClass}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Prioridade *</label>
                    <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass}>
                      <option value="low">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="high">Alta</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Cliente *</label>
                    <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputClass}>
                      <option value="">Selecionar cliente</option>
                      {(customers as any[]).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="submit" disabled={createMutation.isPending}
                  className="bg-indigo-600 text-white px-6 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium text-sm flex items-center gap-2">
                  {createMutation.isPending ? 'A criar...' : 'Avançar →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
}
