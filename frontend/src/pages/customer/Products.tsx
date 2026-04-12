import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProducts, getCategories, createProduct, uploadProductImage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function CustomerProducts() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', description: '', price: '', category_id: '' });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts().then(r => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', 'product'],
    queryFn: () => getCategories('product').then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: async (response) => {
      const newProduct = response.data;
      if (imageFile) {
        setUploading(true);
        try {
          await uploadProductImage(newProduct.id, imageFile);
        } catch { /* ignore */ }
        setUploading(false);
      }
      setForm({ name: '', sku: '', description: '', price: '', category_id: '' });
      setImageFile(null);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: any) => setError(err?.response?.data?.detail || 'Erro ao criar produto'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.sku || !form.price || !form.category_id) {
      setError('Preenche todos os campos obrigatórios.');
      return;
    }
    createMutation.mutate({ ...form, price: parseFloat(form.price) });
  };

  // Group products by category
  const byCategory: Record<string, any[]> = {};
  (products || []).forEach((p: any) => {
    const cat = p.category?.name || 'Sem categoria';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-indigo-600">wolfx.atendimento</h1>
          <div className="flex items-center gap-4">
            <nav className="flex gap-4">
              <a href="/customer" className="text-sm text-gray-600 hover:text-indigo-600">Dashboard</a>
              <a href="/customer/tickets" className="text-sm text-gray-600 hover:text-indigo-600">Tickets</a>
              <a href="/customer/products" className="text-sm text-indigo-600 font-medium">Produtos</a>
            </nav>
            <span className="text-sm text-gray-600">{user?.name}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700 font-medium">Sair</button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Meus Produtos</h2>
          <button
            onClick={() => setShowForm(v => !v)}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            {showForm ? 'Cancelar' : '+ Novo Produto'}
          </button>
        </div>

        {/* Create Product Form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-8 border border-indigo-100">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Criar Novo Produto</h3>
            {error && <div className="bg-red-50 text-red-600 px-4 py-2 rounded-lg mb-4 text-sm">{error}</div>}
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Nome do produto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label>
                <input
                  value={form.sku}
                  onChange={e => setForm(f => ({ ...f, sku: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="SKU-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço (€) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                <select
                  value={form.category_id}
                  onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Selecionar categoria</option>
                  {(categories || []).map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Descrição do produto..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Imagem</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => setImageFile(e.target.files?.[0] || null)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || uploading}
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                >
                  {createMutation.isPending || uploading ? 'A criar...' : 'Criar Produto'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Products by Category */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Carregando produtos...</div>
        ) : !products?.length ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-gray-500 mb-2">Ainda não tens produtos cadastrados.</p>
            <p className="text-gray-400 text-sm">Clica em "+ Novo Produto" para adicionar o teu primeiro produto.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(byCategory).map(([catName, catProducts]) => (
              <div key={catName}>
                <h3 className="text-lg font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
                  {catName}
                  <span className="text-sm font-normal text-gray-400">({catProducts.length})</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {catProducts.map((p: any) => (
                    <div key={p.id} className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition">
                      {p.images?.[0] ? (
                        <img
                          src={p.images[0]}
                          alt={p.name}
                          className="w-full h-40 object-cover"
                        />
                      ) : (
                        <div className="w-full h-40 bg-gray-100 flex items-center justify-center">
                          <span className="text-gray-400 text-4xl">📦</span>
                        </div>
                      )}
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-1">
                          <h4 className="font-semibold text-gray-800">{p.name}</h4>
                          <span className="text-sm font-bold text-indigo-600">
                            {p.price != null ? `€${Number(p.price).toFixed(2)}` : '-'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mb-1">SKU: {p.sku}</p>
                        {p.description && (
                          <p className="text-sm text-gray-600 line-clamp-2">{p.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Criado em {new Date(p.created_at).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
