import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  getProducts,
  getCategories,
  deleteProduct,
} from '../../api/client';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import SearchableSelect from '../../components/SearchableSelect';

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
  type: string;
  color: string;
  icon: string;
  is_active: boolean;
}

// Format price in Brazilian Reais
const formatBRL = (price: number | undefined | null) => {
  if (price == null) return '-';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price);
};

export default function AdminProducts() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);

  // Product image upload/delete mutations (kept in Products.tsx for list page)

  // Queries
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () =>
      getProducts({
        category_id: filterCategory || undefined,
        search: searchName || undefined,
      }).then((r) => r.data as Product[]),
  });

  const { data: categoryOptions = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories().then(r => r.data as Category[]),
  });

  const categoryMap = Object.fromEntries(
    (categoryOptions as Category[]).map((c) => [c.id, c])
  );

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setIsDeleteOpen(false);
      setProductToDelete(null);
    },
    onError: (err: any) => {
      console.error(err);
    },
  });

  // Helpers
  const openEdit = (product: Product) => {
    navigate(`/admin/products/${product.id}/edit`);
  };

  const openImagePreview = (product: Product, index = 0) => {
    setViewingProduct(product);
    setPreviewImageIndex(index);
    setIsImagePreviewOpen(true);
  };

  const openDeleteConfirm = (product: Product) => {
    setProductToDelete(product);
    setIsDeleteOpen(true);
  };

  const handleDelete = () => {
    if (!productToDelete) return;
    deleteMutation.mutate(productToDelete.id);
  };

  const categorySelectOptions = (categoryOptions as Category[]).map((c) => ({
    value: c.id,
    label: c.name,
    color: c.color,
  }));

  // Filter products by search
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchName ||
      p.name.toLowerCase().includes(searchName.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchName.toLowerCase());
    const matchesCategory = !filterCategory || p.category_id === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Produtos</h2>
        <button
          onClick={() => navigate('/admin/products/new')}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium"
        >
          + Novo Produto
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Pesquisar por nome ou SKU..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-full"
          />
          {searchName && (
            <button
              onClick={() => setSearchName('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
        <div className="w-64">
          <SearchableSelect
            options={[{ value: '', label: 'Todas as categorias' }, ...categorySelectOptions]}
            value={filterCategory}
            onChange={setFilterCategory}
            placeholder="Filtrar por categoria"
          />
        </div>
      </div>

      {/* Products Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500">
            {searchName || filterCategory
              ? 'Nenhum produto encontrado.'
              : 'Nenhum produto criado.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase w-16">Img</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">SKU</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Categoria</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Preço</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Stock</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acções</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredProducts.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                  {/* Image */}
                  <td className="px-4 py-3">
                    <div
                      className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center cursor-pointer overflow-hidden"
                      onClick={() => p.images?.length > 0 && openImagePreview(p, 0)}
                    >
                      {p.images?.length > 0 ? (
                        <img src={p.images[0]} alt={p.name} className="max-h-full max-w-full object-contain" />
                      ) : (
                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      )}
                    </div>
                  </td>
                  {/* Name */}
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 truncate max-w-xs">{p.name}</p>
                    {p.description && (
                      <p className="text-xs text-gray-400 truncate max-w-xs">{p.description}</p>
                    )}
                  </td>
                  {/* SKU */}
                  <td className="px-4 py-3 text-sm text-gray-500">{p.sku || '—'}</td>
                  {/* Category */}
                  <td className="px-4 py-3">
                    {p.category_id && categoryMap[p.category_id] ? (
                      <span
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: categoryMap[p.category_id].color + '20',
                          color: categoryMap[p.category_id].color,
                        }}
                      >
                        {categoryMap[p.category_id].name}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  {/* Price */}
                  <td className="px-4 py-3 text-right font-medium text-indigo-600">
                    {formatBRL(p.price)}
                  </td>
                  {/* Stock */}
                  <td className="px-4 py-3 text-right">
                    <span className={`text-sm font-medium ${(p.stock_quantity ?? 0) <= (p.min_stock ?? 0) ? 'text-red-500' : 'text-gray-700'}`}>
                      {p.stock_quantity ?? 0}
                    </span>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {p.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end">
                      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                        <button
                          onClick={() => openEdit(p)}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Editar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <div className="w-px h-5 bg-gray-200" />
                        <button
                          onClick={() => openDeleteConfirm(p)}
                          className="p-2 text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Image Preview Modal */}
      <Modal
        isOpen={isImagePreviewOpen}
        onClose={() => setIsImagePreviewOpen(false)}
        title="Imagens do Produto"
        size="lg"
      >
        {viewingProduct && viewingProduct.images?.length > 0 && (
          <div>
            <div className="relative bg-gray-900 rounded-lg overflow-hidden mb-4">
              <img
                src={viewingProduct.images[previewImageIndex]}
                alt=""
                className="w-full max-h-96 object-contain"
              />
              {viewingProduct.images.length > 1 && (
                <>
                  <button
                    onClick={() =>
                      setPreviewImageIndex((prev) =>
                        prev === 0 ? viewingProduct.images.length - 1 : prev - 1
                      )
                    }
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/70"
                  >
                    ‹
                  </button>
                  <button
                    onClick={() =>
                      setPreviewImageIndex((prev) =>
                        prev === viewingProduct.images.length - 1 ? 0 : prev + 1
                      )
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/70"
                  >
                    ›
                  </button>
                </>
              )}
            </div>
            <div className="flex justify-center gap-2">
              {viewingProduct.images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setPreviewImageIndex(idx)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 ${
                    idx === previewImageIndex
                      ? 'border-indigo-500'
                      : 'border-transparent'
                  }`}
                >
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
            <p className="text-center text-sm text-gray-500 mt-2">
              {previewImageIndex + 1} de {viewingProduct.images.length}
            </p>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        title="Eliminar Produto"
        size="sm"
      >
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-gray-600 mb-1">
            Tem a certeza que deseja eliminar o produto:
          </p>
          <p className="font-semibold text-gray-800 mb-4">{productToDelete?.name}</p>
          <p className="text-sm text-red-500 mb-6">Esta ação não pode ser revertida.</p>
          <div className="flex gap-3">
            <button
              onClick={() => setIsDeleteOpen(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium disabled:opacity-50"
            >
              {deleteMutation.isPending ? 'A eliminar...' : 'Eliminar'}
            </button>
          </div>
        </div>
      </Modal>

    </Layout>
  );
}
