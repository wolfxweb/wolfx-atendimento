import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import { createTicket, getCustomers, getCategories, getProducts, createCategory, createProduct, createCustomer, extractErrorMessage } from '../../api/client';

// ── Quick-create dialogs ──
function QuickAddCustomer({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (result: any) => { onCreated(result.data.id, name); onClose(); },
    onError: (err: any) => setError(extractErrorMessage(err)),
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Novo Cliente</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="p-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Nome da empresa" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="contato@empresa.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="+55 11 99999-9999" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          <button onClick={() => { if (!name.trim()) { setError('Nome é obrigatório'); return; } mutation.mutate({ name: name.trim(), email: email.trim() || undefined, phone: phone.trim() || undefined } as any); }} disabled={mutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
            {mutation.isPending ? 'A criar...' : 'Criar Cliente'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAddProduct({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: createProduct,
    onSuccess: (result: any) => { onCreated(result.data.id, name); onClose(); },
    onError: (err: any) => setError(extractErrorMessage(err)),
  });
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Novo Produto</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="p-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Nome do produto" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
            <input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Descrição opcional" />
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          <button onClick={() => { if (!name.trim()) { setError('Nome é obrigatório'); return; } if (!price || parseFloat(price) < 0) { setError('Preço inválido'); return; } mutation.mutate({ name: name.trim(), price: parseFloat(price), description: description.trim() || undefined } as any); }} disabled={mutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
            {mutation.isPending ? 'A criar...' : 'Criar Produto'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickAddCategory({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string, name: string) => void }) {
  const [name, setName] = useState('');
  const [categoryType, setCategoryType] = useState('ticket');
  const [color, setColor] = useState('#6366f1');
  const [icon, setIcon] = useState('📋');
  const [error, setError] = useState('');
  const mutation = useMutation({
    mutationFn: createCategory,
    onSuccess: (result: any) => { onCreated(result.data.id, name); onClose(); },
    onError: (err: any) => setError(extractErrorMessage(err)),
  });
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Nova Categoria</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="p-2 bg-red-50 text-red-600 text-sm rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm" placeholder="Nome da categoria" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
            <select value={categoryType} onChange={e => setCategoryType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm">
              <option value="ticket">Ticket</option>
              <option value="product">Produto</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} className="w-full h-10 border border-gray-300 rounded-lg cursor-pointer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ícone</label>
              <input type="text" value={icon} onChange={e => setIcon(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-center text-xl" placeholder="📋" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 px-5 py-4 bg-gray-50 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
          <button onClick={() => { if (!name.trim()) { setError('Nome é obrigatório'); return; } mutation.mutate({ name: name.trim(), slug, type: categoryType, color, icon } as any); }} disabled={mutation.isPending}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 text-sm font-medium">
            {mutation.isPending ? 'A criar...' : 'Criar Categoria'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ──
const STEPS = [
  { n: 1, label: 'Dados', sub: 'Título, descrição e cliente' },
  { n: 2, label: 'Categoria', sub: 'Tipo de atendimento' },
  { n: 3, label: 'Produtos', sub: 'Produtos associados' },
  { n: 4, label: 'Equipa', sub: 'Colaboradores' },
  { n: 5, label: 'Relações', sub: 'Tickets relacionados' },
];

export default function NewTicketPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('normal');
  const [customerId, setCustomerId] = useState('');
  const [error, setError] = useState('');

  // Quick-add dialogs
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);

  // Re-fetch customers/categories after dialog creates
  const { data: customers = [], refetch: refetchCustomers } = useQuery({
    queryKey: ['customers'],
    queryFn: () => getCustomers().then(r => r.data as any[]),
  });

  const { refetch: refetchCategories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories().then(r => r.data as any[]),
  });

  const { data: products = [], refetch: refetchProducts } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts().then(r => r.data as any[]),
  });

  // Product quick-add state
  const [showProductDialog, setShowProductDialog] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);

  // ── Ticket creation ──
  const createMutation = useMutation({
    mutationFn: createTicket,
    onSuccess: (result: any) => {
      const tid = result.data.id;
      // If products were selected, add them now
      // (Step 3 will handle full product flow in TicketForm)
      navigate(`/admin/tickets/${tid}/edit?step=2`);
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

  const inputClass = "w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1";
  const sectionClass = "bg-gray-50 rounded-xl p-5 mb-5";

  const PlusIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );

  const handleCustomerCreated = (id: string, _name: string) => {
    setCustomerId(id);
    refetchCustomers();
  };

  const handleCategoryCreated = (_id: string, _name: string) => {
    refetchCategories();
  };

  const handleProductCreated = (_id: string, _name: string) => {
    refetchProducts();
  };

  return (
    <Layout>
      <div className="w-full px-6 py-8">

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
          <div className="p-8">
            {/* Step 1 badge */}
            <div className="flex items-center gap-3 mb-6">
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
                    <div className="flex gap-2">
                      <select value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputClass}>
                        <option value="">Selecionar cliente</option>
                        {(customers as any[]).map((c: any) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setShowCustomerDialog(true)}
                        className="shrink-0 w-10 h-10 border border-gray-300 rounded-lg hover:bg-indigo-50 hover:border-indigo-400 transition-colors flex items-center justify-center text-indigo-500"
                        title="Criar novo cliente">
                        <PlusIcon />
                      </button>
                    </div>
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

        {/* ── Category & Product quick-access (below main card) ── */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Criar rapidamente</h3>
          <div className="grid grid-cols-2 gap-4">
            {/* Quick add category */}
            <div className="border border-gray-100 rounded-lg p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg">📋</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Categoria</p>
                <p className="text-xs text-gray-400">Tipo de atendimento</p>
              </div>
              <button onClick={() => setShowCategoryDialog(true)}
                className="w-8 h-8 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors flex items-center justify-center text-gray-400 hover:text-indigo-500"
                title="Nova categoria">
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick add product */}
            <div className="border border-gray-100 rounded-lg p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
              <div className="w-9 h-9 rounded-lg bg-green-100 text-green-600 flex items-center justify-center text-lg">📦</div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-700">Produto</p>
                <p className="text-xs text-gray-400">Produto para adicionar</p>
              </div>
              <button onClick={() => setShowProductDialog(true)}
                className="w-8 h-8 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors flex items-center justify-center text-gray-400 hover:text-indigo-500"
                title="Novo produto">
                <PlusIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Product selection (step 3 preview) ── */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-6">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">Produtos <span className="font-normal normal-case">(opcional — pode adicionar depois)</span></h3>
          <div className="grid grid-cols-2 gap-3 max-h-48 overflow-y-auto">
            {(products as any[]).map((p: any) => {
              const selected = selectedProductIds.includes(p.id);
              return (
                <label key={p.id} className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${selected ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'}`}>
                  <input type="checkbox" checked={selected} onChange={e => {
                    if (e.target.checked) setSelectedProductIds(prev => [...prev, p.id]);
                    else setSelectedProductIds(prev => prev.filter(x => x !== p.id));
                  }} className="rounded border-gray-300 text-indigo-600" />
                  <span className="text-sm text-gray-700 flex-1">{p.name}</span>
                  <span className="text-xs text-gray-400">R$ {parseFloat(p.price || 0).toFixed(2)}</span>
                </label>
              );
            })}
            {(products as any[]).length === 0 && (
              <p className="col-span-2 text-sm text-gray-400 text-center py-4">Nenhum produto cadastrado.</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick-add dialogs */}
      {showCustomerDialog && (
        <QuickAddCustomer
          onClose={() => setShowCustomerDialog(false)}
          onCreated={handleCustomerCreated}
        />
      )}
      {showCategoryDialog && (
        <QuickAddCategory
          onClose={() => setShowCategoryDialog(false)}
          onCreated={handleCategoryCreated}
        />
      )}
      {showProductDialog && (
        <QuickAddProduct
          onClose={() => setShowProductDialog(false)}
          onCreated={handleProductCreated}
        />
      )}
    </Layout>
  );
}
