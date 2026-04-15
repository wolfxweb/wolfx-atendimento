import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import SearchableSelect from '../../components/SearchableSelect';
import {
  getProduct,
  createProduct,
  updateProduct,
  getCategories,
  uploadProductImage,
  deleteProductImage,
  getProductCompositions,
  addProductComposition,
  removeProductComposition,
  getProducts,
  extractErrorMessage,
} from '../../api/client';

// Format price in Brazilian Reais
const formatBRL = (price: number | undefined | null) => {
  if (price == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
};

interface Product {
  id: string;
  customer_id: string;
  category_id: string;
  name: string;
  sku: string;
  description?: string;
  price: number;
  cost_price?: number;
  brand?: string;
  model?: string;
  barcode?: string;
  stock_quantity: number;
  min_stock?: number;
  weight?: number;
  dimensions?: string;
  warranty_months?: number;
  supplier?: string;
  product_url?: string;
  notes?: string;
  tax_rate?: number;
  is_active: boolean;
  images: string[];
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  color?: string;
  created_at?: string;
  updated_at?: string;
}

interface ProductComposition {
  id: string;
  product_id: string;
  component_product_id: string;
  quantity: number;
  component_product?: Product;
}

export default function ProductForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({
    name: '',
    sku: '',
    description: '',
    price: 0,
    cost_price: 0,
    category_id: '',
    brand: '',
    model: '',
    barcode: '',
    stock_quantity: 0,
    min_stock: 0,
    weight: 0,
    dimensions: '',
    warranty_months: 0,
    supplier: '',
    product_url: '',
    notes: '',
    tax_rate: 0,
    is_active: true,
  });
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [compositionForm, setCompositionForm] = useState({ component_product_id: '', quantity: 1 });
  const [isAddCompositionOpen, setIsAddCompositionOpen] = useState(false);

  // Load product if editing
  const { data: productData } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: () => getProduct(id!).then(r => r.data as Product),
    enabled: isEdit,
  });

  // Load categories
  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: () => getCategories().then(r => r.data as Category[]),
  });

  // Load product compositions — edit mode only
  const { data: compositions = [], refetch: refetchCompositions } = useQuery<ProductComposition[]>({
    queryKey: ['product-compositions', id],
    queryFn: () => getProductCompositions(id!).then(r => r.data as ProductComposition[]),
    enabled: isEdit,
  });

  // Load all products for the composition dropdown
  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ['products-all'],
    queryFn: () => getProducts({}).then(r => r.data as Product[]),
  });

  useEffect(() => {
    if (productData) {
      const p: Product = productData;
      setForm({
        name: p.name || '',
        sku: p.sku || '',
        description: p.description || '',
        price: p.price || 0,
        cost_price: p.cost_price || 0,
        category_id: p.category_id || '',
        brand: p.brand || '',
        model: p.model || '',
        barcode: p.barcode || '',
        stock_quantity: p.stock_quantity || 0,
        min_stock: p.min_stock || 0,
        weight: p.weight || 0,
        dimensions: p.dimensions || '',
        warranty_months: p.warranty_months || 0,
        supplier: p.supplier || '',
        product_url: p.product_url || '',
        notes: p.notes || '',
        tax_rate: p.tax_rate || 0,
        is_active: p.is_active !== false,
      });
      setImages(p.images || []);
    }
  }, [productData]);

  const categoryOptions = [
    { value: '', label: 'Sem categoria' },
    ...(categories || []).map((c: { id: string; name: string; icon?: string; color?: string }) => ({
      value: c.id,
      label: c.name,
    })),
  ];

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/admin/products');
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setError(extractErrorMessage(err));
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Product> }) =>
      updateProduct(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      navigate('/admin/products');
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setError(extractErrorMessage(err));
    },
  });

  // Image upload mutation (edit mode only)
  const uploadImageMutation = useMutation({
    mutationFn: ({ productId, file }: { productId: string; file: File }) =>
      uploadProductImage(productId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
    },
    onError: () => setError('Erro ao carregar imagem'),
  });

  // Image delete mutation (edit mode only)
  const deleteImageMutation = useMutation({
    mutationFn: ({ productId, filename }: { productId: string; filename: string }) =>
      deleteProductImage(productId, filename),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', id] });
      setImages(prev => prev.filter(img => img !== ''));
    },
    onError: () => setError('Erro ao eliminar imagem'),
  });

  // Composition add mutation
  const addCompositionMutation = useMutation({
    mutationFn: (data: { product_id: string; component_product_id: string; quantity: number }) =>
      addProductComposition(data),
    onSuccess: () => {
      refetchCompositions();
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setCompositionForm({ component_product_id: '', quantity: 1 });
      setIsAddCompositionOpen(false);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setError(extractErrorMessage(err));
    },
  });

  // Composition delete mutation
  const deleteCompositionMutation = useMutation({
    mutationFn: (compositionId: string) => removeProductComposition(compositionId),
    onSuccess: () => {
      refetchCompositions();
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setError(extractErrorMessage(err));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) {
      setError('Nome é obrigatório');
      return;
    }
    if (isEdit && id) {
      updateMutation.mutate({
        id,
        data: {
          name: form.name,
          sku: form.sku || undefined,
          description: form.description || undefined,
          price: form.price || undefined,
          cost_price: form.cost_price || undefined,
          category_id: form.category_id || undefined,
          brand: form.brand || undefined,
          model: form.model || undefined,
          barcode: form.barcode || undefined,
          stock_quantity: form.stock_quantity || undefined,
          min_stock: form.min_stock || undefined,
          weight: form.weight || undefined,
          dimensions: form.dimensions || undefined,
          warranty_months: form.warranty_months || undefined,
          supplier: form.supplier || undefined,
          product_url: form.product_url || undefined,
          notes: form.notes || undefined,
          tax_rate: form.tax_rate || undefined,
          is_active: form.is_active,
        },
      });
    } else {
      createMutation.mutate({
        name: form.name,
        sku: form.sku || undefined,
        description: form.description || undefined,
        price: form.price || undefined,
        cost_price: form.cost_price || undefined,
        category_id: form.category_id || undefined,
        brand: form.brand || undefined,
        model: form.model || undefined,
        barcode: form.barcode || undefined,
        stock_quantity: form.stock_quantity || 0,
        min_stock: form.min_stock || undefined,
        weight: form.weight || undefined,
        dimensions: form.dimensions || undefined,
        warranty_months: form.warranty_months || undefined,
        supplier: form.supplier || undefined,
        product_url: form.product_url || undefined,
        notes: form.notes || undefined,
        tax_rate: form.tax_rate || undefined,
        is_active: form.is_active,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Layout>
      <div className="w-full">
        {/* Top Bar */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/admin/products')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Voltar
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={handleSubmit as React.MouseEventHandler}
            disabled={isPending}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
          >
            {isPending ? 'A guardar...' : 'Guardar Produto'}
          </button>
        </div>

        {/* Page Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {isEdit ? 'Editar Produto' : 'Novo Produto'}
        </h1>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">

          {/* ── Identificação ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Identificação
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Nome do produto" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                <input type="text" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Deixe vazio para gerar automático" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
                <input type="text" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Ex: Samsung" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                <input type="text" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Ex: Galaxy S24" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código Barras</label>
                <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="EAN / UPC" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Descrição do produto..." />
            </div>
          </div>

          {/* ── Classificação ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Classificação
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <SearchableSelect options={categoryOptions} value={form.category_id} onChange={(val) => setForm({ ...form, category_id: val })} placeholder="Selecionar categoria" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL do Produto</label>
                <input type="url" value={form.product_url} onChange={(e) => setForm({ ...form, product_url: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="https://..." />
              </div>
            </div>
          </div>

          {/* ── Preços ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Preços
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço Venda (€)</label>
                <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Preço Custo (€)</label>
                <input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Taxa Imposto (%)</label>
                <input type="number" step="0.01" min="0" max="100" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
          </div>

          {/* ── Stock & Logística ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Stock e Logística
            </h2>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stock Qtd</label>
                <input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alerta Mín.</label>
                <input type="number" min="0" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Peso (kg)</label>
                <input type="number" step="0.001" min="0" value={form.weight} onChange={(e) => setForm({ ...form, weight: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dimensões (LxAxP cm)</label>
                <input type="text" value={form.dimensions} onChange={(e) => setForm({ ...form, dimensions: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="30x20x10" />
              </div>
            </div>
          </div>

          {/* ── Garantia & Fornecedor ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Garantia e Fornecedor
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Garantia (meses)</label>
                <input type="number" min="0" value={form.warranty_months} onChange={(e) => setForm({ ...form, warranty_months: parseInt(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
                <input type="text" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" placeholder="Nome do fornecedor" />
              </div>
            </div>
          </div>

          {/* ── Notas & Activo ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
              Notas e Estado
            </h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notas Internas</label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none" placeholder="Notas visíveis apenas para agentes..." />
            </div>
            <div className="flex items-center gap-2 mt-4">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
              <label htmlFor="is_active" className="text-sm text-gray-700">Produto activo (visível para clientes)</label>
            </div>

            {/* Image Upload (edit mode only) */}
            {isEdit && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Imagens do Produto</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img src={img} alt="" className="w-16 h-16 object-cover rounded-lg border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => {
                          const filename = img.split('/').pop() || img;
                          deleteImageMutation.mutate({ productId: id!, filename });
                          setImages(prev => prev.filter((_, i) => i !== idx));
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <label className="cursor-pointer bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-2 rounded-lg inline-flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar Imagem
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadImageMutation.mutate({ productId: id!, file });
                    }}
                  />
                </label>
              </div>
            )}
          </div>

          {/* ── Composição do Produto ── */}
          {isEdit && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Composição do Produto
                </h2>
                <button
                  type="button"
                  onClick={() => setIsAddCompositionOpen(!isAddCompositionOpen)}
                  className="text-indigo-600 hover:text-indigo-700 text-sm font-medium flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  {isAddCompositionOpen ? 'Cancelar' : '+ Adicionar Item'}
                </button>
              </div>

              {isAddCompositionOpen && (
                <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Produto Componente</label>
                    <SearchableSelect
                      value={compositionForm.component_product_id}
                      onChange={v => setCompositionForm({ ...compositionForm, component_product_id: v })}
                      placeholder="Pesquisar produto..."
                      options={allProducts
                        .filter(p => p.id !== id)
                        .map(p => ({
                          value: p.id,
                          label: `${p.name}${p.sku ? ` (${p.sku})` : ''}`,
                        }))
                      }
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Quantidade</label>
                      <input
                        type="number"
                        min="1"
                        value={compositionForm.quantity}
                        onChange={(e) => setCompositionForm({ ...compositionForm, quantity: parseInt(e.target.value) || 1 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!compositionForm.component_product_id) {
                        setError('Selecione um produto componente');
                        return;
                      }
                      addCompositionMutation.mutate({
                        product_id: id!,
                        component_product_id: compositionForm.component_product_id,
                        quantity: compositionForm.quantity,
                      });
                    }}
                    disabled={addCompositionMutation.isPending}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
                  >
                    {addCompositionMutation.isPending ? 'A adicionar...' : 'Adicionar à Composição'}
                  </button>
                </div>
              )}

              {compositions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">
                  Este produto ainda não tem itens na sua composição.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="pb-2 font-medium">SKU</th>
                        <th className="pb-2 font-medium">Nome</th>
                        <th className="pb-2 font-medium text-center">Qtd</th>
                        <th className="pb-2 font-medium text-right">Preço Unit.</th>
                        <th className="pb-2 font-medium text-right">Subtotal</th>
                        <th className="pb-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {compositions.map((comp) => (
                        <tr key={comp.id} className="border-b border-gray-100">
                          <td className="py-2 text-gray-500">{comp.component_product?.sku || '—'}</td>
                          <td className="py-2 font-medium">{comp.component_product?.name || '—'}</td>
                          <td className="py-2 text-center">{comp.quantity}</td>
                          <td className="py-2 text-right">
                            {comp.component_product
                              ? formatBRL(Number(comp.component_product.price))
                              : '—'}
                          </td>
                          <td className="py-2 text-right font-medium">
                            {comp.component_product
                              ? formatBRL(Number(comp.component_product.price) * comp.quantity)
                              : '—'}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => deleteCompositionMutation.mutate(comp.id)}
                              className="text-red-500 hover:text-red-700 text-xs font-medium"
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bottom buttons */}
          <div className="flex gap-3 pb-8">
            <button
              type="button"
              onClick={() => navigate('/admin/products')}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
            >
              {isPending ? 'A guardar...' : 'Guardar Produto'}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
