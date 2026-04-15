import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { createTicket, getCustomers, extractErrorMessage } from '../../api/client';

export default function NewTicketPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState('');

  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers().then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (response) => {
      navigate(`/admin/tickets/${response.data.id}`);
    },
    onError: (err: any) => {
      setError(extractErrorMessage(err));
    },
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

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const sectionClass = "bg-gray-50 rounded-lg p-4 mb-4";

  return (
    <Layout>
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => navigate('/admin/tickets')} className="text-gray-400 hover:text-gray-600 text-sm">
            ← Voltar
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Novo Ticket</h1>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Step indicator */}
          <div className="flex border-b border-gray-100">
            <div className="flex-1 py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</div>
                <span className="text-sm font-medium text-indigo-600">Dados obrigatórios</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 ml-9">Título, descrição e cliente</p>
            </div>
            <div className="flex-1 py-3 px-4 border-l border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-200 text-gray-400 text-xs font-bold flex items-center justify-center">2</div>
                <span className="text-sm font-medium text-gray-400">Detalhes</span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5 ml-9">Categoria, produtos, colaboradores</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}

            <div className={sectionClass}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Informações principais</h3>

              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Título *</label>
                  <input
                    type="text"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className={inputClass}
                    placeholder="Resumo do problema (mín. 3 caracteres)"
                    maxLength={200}
                  />
                </div>

                <div>
                  <label className={labelClass}>Descrição *</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className={inputClass}
                    rows={5}
                    placeholder="Descreva o problema em detalhes (mín. 10 caracteres)"
                  />
                </div>
              </div>
            </div>

            <div className={sectionClass}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Classificação</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Prioridade *</label>
                  <select
                    value={priority}
                    onChange={e => setPriority(e.target.value)}
                    className={inputClass}
                  >
                    <option value="low">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </select>
                </div>

                <div>
                  <label className={labelClass}>Cliente *</label>
                  <select
                    value={customerId}
                    onChange={e => setCustomerId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Selecionar cliente</option>
                    {(customers as any[]).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className={sectionClass}>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Categoria</h3>
              <select
                value=""
                onChange={() => {}}
                className={inputClass}
                disabled
              >
                <option value="">Poderá seleccionar após criar o ticket</option>
              </select>
              <p className="text-xs text-gray-400 mt-1">A categoria pode ser definida na próxima etapa</p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/admin/tickets')}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'A criar...' : 'Criar Ticket →'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
