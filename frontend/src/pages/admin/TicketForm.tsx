import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import {
  getTicket, getTickets, createTicket, updateTicket,
  getCustomers, getCategories, getProducts, getUsers,
  getTicketCollaborators, addTicketCollaborator, removeTicketCollaborator,
  getTicketProducts, addTicketProduct, removeTicketProduct,
  getTicketRelations, addTicketRelation, removeTicketRelation,
} from '../../api/client';

interface TicketFormData {
  title: string;
  description: string;
  priority: string;
  status: string;
  category_id: string;
  customer_id: string;
  parent_ticket_id: string;
  opened_at: string;
  attended_at: string;
  closed_at: string;
}

interface TicketCollaborator {
  id: string;
  ticket_id: string;
  user_id: string;
  user_name?: string;
  hours_spent: number;
  minutes_spent: number;
  notes?: string;
}

interface TicketProduct {
  id: string;
  ticket_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
}

interface TicketRelation {
  id: string;
  source_ticket_id: string;
  target_ticket_id: string;
  target_ticket_title?: string;
}

const emptyForm: TicketFormData = {
  title: '',
  description: '',
  priority: 'normal',
  status: 'open',
  category_id: '',
  customer_id: '',
  parent_ticket_id: '',
  opened_at: '',
  attended_at: '',
  closed_at: '',
};

const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
const labelClass = "block text-sm font-medium text-gray-700 mb-1";
const sectionClass = "bg-gray-50 rounded-lg p-4 mb-4";

export default function TicketForm() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const [form, setForm] = useState<TicketFormData>(emptyForm);
  const [error, setError] = useState('');

  // Collaborators state
  const [collaborators, setCollaborators] = useState<TicketCollaborator[]>([]);
  const [newCollabUserId, setNewCollabUserId] = useState('');
  const [newCollabHours, setNewCollabHours] = useState(0);
  const [newCollabMinutes, setNewCollabMinutes] = useState(0);
  const [newCollabNotes, setNewCollabNotes] = useState('');
  const [showCollabForm, setShowCollabForm] = useState(false);
  const [collabError, setCollabError] = useState('');

  // Products state
  const [ticketProducts, setTicketProducts] = useState<TicketProduct[]>([]);
  const [newProdId, setNewProdId] = useState('');
  const [newProdQty, setNewProdQty] = useState(1);
  const [showProdForm, setShowProdForm] = useState(false);
  const [prodError, setProdError] = useState('');

  // Relations state
  const [ticketRelations, setTicketRelations] = useState<TicketRelation[]>([]);
  const [newRelTicketId, setNewRelTicketId] = useState('');
  const [showRelForm, setShowRelForm] = useState(false);
  // For new tickets (not yet saved), store pending relations
  const [pendingRelations, setPendingRelations] = useState<TicketRelation[]>([]);

  // Load existing ticket data
  const { data: existingTicket } = useQuery({
    queryKey: ['ticket', id],
    queryFn: () => getTicket(id!).then(r => r.data),
    enabled: isEdit,
  });

  // Load collaborators for this ticket
  const { data: existingCollaborators = [] } = useQuery({
    queryKey: ['ticket-collaborators', id],
    queryFn: () => getTicketCollaborators(id!).then(r => r.data as TicketCollaborator[]),
    enabled: isEdit,
  });

  // Load products for this ticket
  const { data: existingProducts = [] } = useQuery({
    queryKey: ['ticket-products', id],
    queryFn: () => getTicketProducts(id!).then(r => r.data as TicketProduct[]),
    enabled: isEdit,
  });

  // Load relations for this ticket
  const { data: existingRelations = [] } = useQuery({
    queryKey: ['ticket-relations', id],
    queryFn: () => getTicketRelations(id!).then(r => r.data as TicketRelation[]),
    enabled: isEdit,
  });

  // Load ticket list (for parent ticket selection)
  const { data: allTickets = [] } = useQuery({
    queryKey: ['tickets-list'],
    queryFn: () => getTickets().then(r => r.data as any[]),
  });

  // Load customers (for customer selection)
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers().then(r => r.data as any[]),
  });

  // Load categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'ticket'],
    queryFn: () => getCategories('ticket').then(r => r.data as any[]),
  });

  // Load products (for product selection)
  const { data: products = [] } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => getProducts().then(r => r.data as any[]),
  });

  // Load users (for collaborator selection)
  const { data: users = [] } = useQuery({
    queryKey: ['users', 'all'],
    queryFn: () => getUsers().then((r: any) => r.data as any[]),
  });

  // Filter users to only show agents/admins
  const collaboratorsOptions = (users as any[]).filter((u: any) => u.role === 'agent' || u.role === 'admin');

  // Available tickets for relation (exclude current ticket)
  const availableForRel = (allTickets as any[]).filter((t: any) => {
    if (!isEdit && id) return t.id !== id;
    return t.id !== id;
  });

  useEffect(() => {
    if (existingTicket) {
      const t = existingTicket as any;
      setForm({
        title: t.title || '',
        description: t.description || '',
        priority: t.priority || 'normal',
        status: t.status || 'open',
        category_id: t.category_id || '',
        customer_id: t.customer_id || '',
        parent_ticket_id: t.parent_ticket_id || '',
        opened_at: t.opened_at ? t.opened_at.slice(0, 16) : '',
        attended_at: t.attended_at ? t.attended_at.slice(0, 16) : '',
        closed_at: t.closed_at ? t.closed_at.slice(0, 16) : '',
      });
    }
  }, [existingTicket]);

  useEffect(() => { setCollaborators(existingCollaborators); }, [existingCollaborators]);
  useEffect(() => { setTicketProducts(existingProducts); }, [existingProducts]);
  useEffect(() => { setTicketRelations(existingRelations); }, [existingRelations]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: async (result: any) => {
      const newTicketId = result.data.id;
      // Add collaborators
      for (const c of collaborators) {
        if (c.user_id) {
          await addTicketCollaborator({ ticket_id: newTicketId, user_id: c.user_id, hours_spent: c.hours_spent, minutes_spent: c.minutes_spent, notes: c.notes });
        }
      }
      // Add products
      for (const p of ticketProducts) {
        if (p.product_id) {
          await addTicketProduct({ ticket_id: newTicketId, product_id: p.product_id, quantity: p.quantity });
        }
      }
      // Add pending relations (new ticket)
      for (const rel of pendingRelations) {
        if (rel.target_ticket_id) {
          await addTicketRelation({ source_ticket_id: newTicketId, target_ticket_id: rel.target_ticket_id });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate('/admin/tickets');
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Erro ao criar ticket'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TicketFormData> }) => updateTicket(id, data as any),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      navigate('/admin/tickets');
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Erro ao atualizar ticket'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.title.trim()) { setError('Título é obrigatório'); return; }
    if (!form.description.trim()) { setError('Descrição é obrigatória'); return; }
    if (!form.customer_id) { setError('Cliente é obrigatório'); return; }

    const submitData = {
      ...form,
      category_id: form.category_id || undefined,
      parent_ticket_id: form.parent_ticket_id || undefined,
      opened_at: form.opened_at ? new Date(form.opened_at).toISOString() : undefined,
      attended_at: form.attended_at ? new Date(form.attended_at).toISOString() : undefined,
      closed_at: form.closed_at ? new Date(form.closed_at).toISOString() : undefined,
    };

    if (isEdit) {
      updateMutation.mutate({ id: id!, data: submitData });
    } else {
      createMutation.mutate(submitData as any);
    }
  };

  const addCollaborator = () => {
    if (!newCollabUserId) {
      setCollabError('Selecione um colaborador.');
      return;
    }
    const user = (users as any[]).find((u: any) => u.id === newCollabUserId);
    const newCollab: TicketCollaborator = {
      id: `temp-${Date.now()}`,
      ticket_id: id || '',
      user_id: newCollabUserId,
      user_name: user?.name || '',
      hours_spent: newCollabHours,
      minutes_spent: newCollabMinutes,
      notes: newCollabNotes,
    };
    setCollaborators([...collaborators, newCollab]);
    setNewCollabUserId('');
    setNewCollabHours(0);
    setNewCollabMinutes(0);
    setNewCollabNotes('');
    setShowCollabForm(false);
  };

  const removeCollaborator = (idx: number) => {
    const col = collaborators[idx];
    if (col.id && !col.id.startsWith('temp-')) {
      removeTicketCollaborator(col.id);
    }
    setCollaborators(collaborators.filter((_, i) => i !== idx));
  };

  const addProduct = () => {
    if (!newProdId) {
      setProdError('Selecione um produto.');
      return;
    }
    const prod = (products as any[]).find((p: any) => p.id === newProdId);
    const newTp: TicketProduct = {
      id: `temp-${Date.now()}`,
      ticket_id: id || '',
      product_id: newProdId,
      product_name: prod?.name || '',
      quantity: newProdQty,
    };
    setTicketProducts([...ticketProducts, newTp]);
    setNewProdId('');
    setNewProdQty(1);
    setShowProdForm(false);
  };

  const removeProduct = (idx: number) => {
    const p = ticketProducts[idx];
    if (p.id && !p.id.startsWith('temp-')) {
      removeTicketProduct(p.id);
    }
    setTicketProducts(ticketProducts.filter((_, i) => i !== idx));
  };

  const addRelation = () => {
    if (!newRelTicketId) return;
    // Avoid duplicates
    if (ticketRelations.some(r => r.target_ticket_id === newRelTicketId)) {
      setNewRelTicketId('');
      setShowRelForm(false);
      return;
    }
    if (pendingRelations.some(r => r.target_ticket_id === newRelTicketId)) {
      setNewRelTicketId('');
      setShowRelForm(false);
      return;
    }
    const ticket = (allTickets as any[]).find((t: any) => t.id === newRelTicketId);
    const newRel: TicketRelation = {
      id: `temp-${Date.now()}`,
      source_ticket_id: id || '',
      target_ticket_id: newRelTicketId,
      target_ticket_title: ticket?.title || newRelTicketId,
    };
    if (isEdit) {
      // For existing tickets, add via API immediately
      addTicketRelation({ source_ticket_id: id!, target_ticket_id: newRelTicketId })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['ticket-relations', id] });
        });
      setTicketRelations([...ticketRelations, newRel]);
    } else {
      // For new tickets, store in pending
      setPendingRelations([...pendingRelations, newRel]);
    }
    setNewRelTicketId('');
    setShowRelForm(false);
  };

  const removeRelation = (idx: number) => {
    if (isEdit) {
      const rel = ticketRelations[idx];
      if (rel.id && !rel.id.startsWith('temp-')) {
        removeTicketRelation(rel.id).then(() => {
          queryClient.invalidateQueries({ queryKey: ['ticket-relations', id] });
        });
      }
    }
    if (isEdit) {
      setTicketRelations(ticketRelations.filter((_, i) => i !== idx));
    } else {
      setPendingRelations(pendingRelations.filter((_, i) => i !== idx));
    }
  };

  const totalHours = collaborators.reduce((acc, c) => acc + (c.hours_spent || 0) + Math.floor((c.minutes_spent || 0) / 60), 0);
  const totalMinutes = collaborators.reduce((acc, c) => acc + (c.minutes_spent || 0), 0) % 60;

  const formatBRL = (price: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);

  const displayRelations = isEdit ? ticketRelations : pendingRelations;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => navigate('/admin/tickets')} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h2 className="text-2xl font-bold text-gray-800">
            {isEdit ? `Editar Ticket: ${existingTicket ? (existingTicket as any).title : '...'}` : 'Novo Ticket'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg">{error}</div>
          )}

          {/* Dados do Ticket */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Dados do Ticket</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className={labelClass}>Título *</label>
                <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className={inputClass} placeholder="Resumo do problema" />
              </div>
              <div className="col-span-2">
                <label className={labelClass}>Descrição *</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className={inputClass} rows={3} placeholder="Descrição detalhada do problema..." />
              </div>
              <div>
                <label className={labelClass}>Prioridade</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} className={inputClass}>
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} className={inputClass}>
                  <option value="open">Aberto</option>
                  <option value="pending">Pendente</option>
                  <option value="in_progress">Em Atendimento</option>
                  <option value="solved">Resolvido</option>
                  <option value="closed">Fechado</option>
                  <option value="reopened">Reaberto</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Categoria</label>
                <select value={form.category_id} onChange={e => setForm({ ...form, category_id: e.target.value })} className={inputClass}>
                  <option value="">Sem categoria</option>
                  {(categories as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Associação */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Associação</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Cliente *</label>
                <select value={form.customer_id} onChange={e => setForm({ ...form, customer_id: e.target.value })} className={inputClass}>
                  <option value="">Selecionar cliente</option>
                  {(customers as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Ticket Pai</label>
                <select value={form.parent_ticket_id} onChange={e => setForm({ ...form, parent_ticket_id: e.target.value })} className={inputClass}>
                  <option value="">Nenhum</option>
                  {(allTickets as any[]).filter((t: any) => t.id !== id).map((t: any) => (
                    <option key={t.id} value={t.id}>{t.id.slice(0, 8)} - {t.title}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tickets Relacionados */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Tickets Relacionados</h3>
              {!showRelForm && (
                <button type="button" onClick={() => setShowRelForm(true)} className="text-indigo-600 text-sm hover:underline">
                  + Associar Ticket
                </button>
              )}
            </div>

            {showRelForm && (
              <div className="grid grid-cols-6 gap-3 mb-4 p-3 bg-white rounded-lg border border-gray-200 items-end">
                <div className="col-span-4">
                  <label className={labelClass}>Ticket</label>
                  <select value={newRelTicketId} onChange={e => setNewRelTicketId(e.target.value)} className={inputClass}>
                    <option value="">Selecionar ticket</option>
                    {(availableForRel as any[]).map((t: any) => {
                      const alreadyLinked = isEdit
                        ? ticketRelations.some(r => r.target_ticket_id === t.id)
                        : pendingRelations.some(r => r.target_ticket_id === t.id);
                      if (alreadyLinked) return null;
                      return <option key={t.id} value={t.id}>{t.id.slice(0, 8)} - {t.title}</option>;
                    })}
                  </select>
                </div>
                <div className="flex gap-2 items-center pb-0.5">
                  <button type="button" onClick={addRelation} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Associar</button>
                  <button type="button" onClick={() => { setShowRelForm(false); setNewRelTicketId(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
              </div>
            )}

            {displayRelations.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nenhum ticket relacionado.</p>
            ) : (
              <div className="space-y-2">
                {displayRelations.map((r, idx) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="flex-1 text-sm font-medium text-gray-700">
                      {r.target_ticket_title || r.target_ticket_id}
                    </span>
                    <span className="text-xs text-gray-400">{r.target_ticket_id.slice(0, 8)}</span>
                    <button type="button" onClick={() => removeRelation(idx)} className="text-red-500 hover:text-red-700 text-sm">Eliminar</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Datas */}
          <div className={sectionClass}>
            <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Datas</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Data de Abertura</label>
                <input type="datetime-local" value={form.opened_at} onChange={e => setForm({ ...form, opened_at: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Data do Atendimento</label>
                <input type="datetime-local" value={form.attended_at} onChange={e => setForm({ ...form, attended_at: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Data de Fechamento</label>
                <input type="datetime-local" value={form.closed_at} onChange={e => setForm({ ...form, closed_at: e.target.value })} className={inputClass} />
              </div>
            </div>
          </div>

          {/* Produtos */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Produtos</h3>
              {!showProdForm && (
                <button type="button" onClick={() => setShowProdForm(true)} className="text-indigo-600 text-sm hover:underline">
                  + Adicionar Produto
                </button>
              )}
            </div>

            {showProdForm && (
              <div className="grid grid-cols-6 gap-3 mb-4 p-3 bg-white rounded-lg border border-gray-200 items-end">
                <div className="col-span-4">
                  <label className={labelClass}>Produto</label>
                  <select value={newProdId} onChange={e => { setNewProdId(e.target.value); setProdError(''); }} className={inputClass}>
                    <option value="">Selecionar produto</option>
                    {(products as any[]).map((p: any) => <option key={p.id} value={p.id}>{p.name} - {formatBRL(parseFloat(p.price) || 0)}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Qtd</label>
                  <input type="number" min={1} value={newProdQty} onChange={e => setNewProdQty(parseInt(e.target.value) || 1)} className={inputClass} />
                </div>
                <div className="flex gap-2 items-center pb-0.5">
                  <button type="button" onClick={addProduct} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Adicionar</button>
                  <button type="button" onClick={() => { setShowProdForm(false); setNewProdId(''); setNewProdQty(1); setProdError(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                {prodError && <p className="col-span-6 text-sm text-red-500">{prodError}</p>}
              </div>
            )}

            {ticketProducts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nenhum produto adicionado.</p>
            ) : (
              <div className="space-y-2">
                {ticketProducts.map((p, idx) => {
                  const prod = (products as any[]).find((pr: any) => pr.id === p.product_id);
                  const price = parseFloat(prod?.price) || 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                      <span className="flex-1 text-sm font-medium text-gray-700">{p.product_name || prod?.name || p.product_id}</span>
                      {price > 0 && (
                        <>
                          <span className="text-xs text-gray-500">× {p.quantity}</span>
                          <span className="text-xs font-medium text-indigo-600">{formatBRL(price * p.quantity)}</span>
                        </>
                      )}
                      <button type="button" onClick={() => removeProduct(idx)} className="text-red-500 hover:text-red-700 text-sm">Eliminar</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Colaboradores */}
          <div className={sectionClass}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Colaboradores
                {collaborators.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    (Total: {totalHours}h {totalMinutes}min)
                  </span>
                )}
              </h3>
              {!showCollabForm && (
                <button type="button" onClick={() => setShowCollabForm(true)} className="text-indigo-600 text-sm hover:underline">
                  + Adicionar Colaborador
                </button>
              )}
            </div>

            {showCollabForm && (
              <div className="grid grid-cols-4 gap-3 mb-4 p-3 bg-white rounded-lg border border-gray-200">
                <div>
                  <label className={labelClass}>Colaborador</label>
                  <select value={newCollabUserId} onChange={e => { setNewCollabUserId(e.target.value); setCollabError(''); }} className={inputClass}>
                    <option value="">Selecionar</option>
                    {collaboratorsOptions.map((u: any) => <option key={u.id} value={u.id}>{u.name} ({u.role === 'admin' ? 'Admin' : 'Colaborador'})</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Horas</label>
                  <input type="number" min={0} value={newCollabHours} onChange={e => setNewCollabHours(parseInt(e.target.value) || 0)} className={inputClass} placeholder="0" />
                </div>
                <div>
                  <label className={labelClass}>Minutos</label>
                  <input type="number" min={0} max={59} value={newCollabMinutes} onChange={e => setNewCollabMinutes(parseInt(e.target.value) || 0)} className={inputClass} placeholder="0" />
                </div>
                <div className="flex items-end gap-2">
                  <button type="button" onClick={addCollaborator} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Adicionar</button>
                  <button type="button" onClick={() => { setShowCollabForm(false); setNewCollabUserId(''); setCollabError(''); }} className="text-gray-400 hover:text-gray-600">✕</button>
                </div>
                {collabError && <p className="col-span-4 text-sm text-red-500">{collabError}</p>}
                <div className="col-span-4">
                  <label className={labelClass}>Notas</label>
                  <input type="text" value={newCollabNotes} onChange={e => setNewCollabNotes(e.target.value)} className={inputClass} placeholder="Notas sobre o trabalho realizado..." />
                </div>
              </div>
            )}

            {collaborators.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nenhum colaborador adicionado.</p>
            ) : (
              <div className="space-y-2">
                {collaborators.map((c, idx) => (
                  <div key={c.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <span className="flex-1 text-sm font-medium text-gray-700">{c.user_name || c.user_id}</span>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {c.hours_spent}h {c.minutes_spent}min
                    </span>
                    {c.notes && <span className="text-xs text-gray-400 italic truncate max-w-48">{c.notes}</span>}
                    <button type="button" onClick={() => removeCollaborator(idx)} className="text-red-500 hover:text-red-700 text-sm">Eliminar</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <button type="button" onClick={() => navigate('/admin/tickets')} className="px-6 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">
              Voltar
            </button>
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">
              {createMutation.isPending || updateMutation.isPending ? 'A guardar...' : isEdit ? 'Guardar Alterações' : 'Criar Ticket'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
