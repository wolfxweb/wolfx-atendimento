import { useQuery } from '@tanstack/react-query';
import { getProducts, getCategories } from '../../api/client';
import Layout from '../../components/Layout';

export default function AdminProducts() {
  const { data: products, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => getProducts().then(r => r.data),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', 'product'],
    queryFn: () => getCategories('product').then(r => r.data),
  });

  const categoryMap = Object.fromEntries((categories || []).map((c: any) => [c.id, c.name]));

  return (
    <Layout>
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Produtos</h2>

        {isLoading ? (
          <div className="text-center py-12">Carregando...</div>
        ) : !products?.length ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <p className="text-gray-500">Nenhum produto criado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p: any) => (
              <div key={p.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-800">{p.name}</h3>
                  <span className="text-sm font-medium text-indigo-600">€{p.price}</span>
                </div>
                <p className="text-xs text-gray-500">SKU: {p.sku}</p>
                <p className="text-xs text-gray-500 mb-2">{categoryMap[p.category_id] || 'Sem categoria'}</p>
                {p.images?.length > 0 && (
                  <p className="text-xs text-gray-400">{p.images.length} imagem(ns)</p>
                )}
              </div>
            ))}
          </div>
        )}
    </Layout>
  );
}
