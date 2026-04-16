import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getKBCategories, getKBArticles, searchKBArticles } from '../api/client';
import { extractErrorMessage } from '../api/client';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';

type Category = {
  id: string; name: string; description?: string; parent_id?: string;
  is_active: boolean; children: Category[];
};

type Article = {
  id: string; title: string; summary?: string; status: string; views: number;
  category_name?: string; author_name?: string; tags: { id: string; name: string }[];
  attachment_count: number; created_at: string; updated_at?: string;
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function CategoryIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    'Suporte': '🎧', 'Financeiro': '💰', 'Técnico': '🔧', 'RH': '👥',
    'Comercial': '📦', 'Geral': '📋', 'default': '📄',
  };
  const key = Object.keys(icons).find(k => name.toLowerCase().includes(k.toLowerCase())) || 'default';
  return <span className="text-2xl">{icons[key]}</span>;
}

export default function KnowledgeBase() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Article[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['kb-categories'],
    queryFn: () => getKBCategories(false).then(r => r.data as Category[]),
  });

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['kb-articles', selectedCategory],
    queryFn: () => getKBArticles(selectedCategory ? { category_id: selectedCategory } : {}).then(r => r.data as Article[]),
  });

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    try {
      const r = await searchKBArticles(searchQuery);
      setSearchResults(r.data as Article[]);
    } catch {
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  function clearSearch() {
    setSearchQuery('');
    setSearchResults(null);
  }

  const displayArticles = searchResults !== null ? searchResults : articles;

  return (
    <Layout>
      <div>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Base de Conhecimento</h2>
            <p className="text-sm text-gray-500 mb-5">
              Encontre artigos, guias e respostas para as dúvidas mais frequentes.
            </p>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) setSearchResults(null); }}
                  placeholder="Pesquisar artigos..."
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={searchLoading}
                className="bg-indigo-600 text-white px-5 py-2.5 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {searchLoading ? 'A buscar...' : 'Buscar'}
              </button>
              {searchResults !== null && (
                <button type="button" onClick={clearSearch} className="text-gray-500 px-3 py-2.5 text-sm hover:text-gray-700">
                  Limpar
                </button>
              )}
            </form>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 py-8">
          {searchResults !== null ? (
            /* Search Results */
            <div>
              <p className="text-sm text-gray-500 mb-4">
                {searchResults.length === 0
                  ? `Nenhum resultado para "${searchQuery}"`
                  : `${searchResults.length} resultado${searchResults.length !== 1 ? 's' : ''} para "${searchQuery}"`}
              </p>
              {searchResults.length === 0 && (
                <div className="text-center py-12">
                  <span className="text-5xl mb-4 block">🔍</span>
                  <p className="text-gray-500">Não encontrou o que procurava?</p>
                  <p className="text-sm text-gray-400 mt-1">Contacte o suporte através de um ticket.</p>
                </div>
              )}
              <div className="space-y-3">
                {searchResults.map(a => (
                  <ArticleCard key={a.id} article={a} />
                ))}
              </div>
            </div>
          ) : (
            /* Categories + Articles */
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Sidebar: Categories */}
              <div className="lg:col-span-1">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Categorias</h3>
                <nav className="space-y-1">
                  <button
                    onClick={() => setSelectedCategory(null)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                      selectedCategory === null
                        ? 'bg-indigo-100 text-indigo-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span>📋</span> Todas
                  </button>
                  {categories.map(cat => (
                    <div key={cat.id}>
                      <button
                        onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                          selectedCategory === cat.id
                            ? 'bg-indigo-100 text-indigo-700 font-medium'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <CategoryIcon name={cat.name} />
                        {cat.name}
                      </button>
                      {cat.children?.map(child => (
                        <button
                          key={child.id}
                          onClick={() => setSelectedCategory(child.id === selectedCategory ? null : child.id)}
                          className={`w-full text-left pl-8 pr-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
                            selectedCategory === child.id
                              ? 'bg-indigo-100 text-indigo-700 font-medium'
                              : 'text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          └ {child.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </nav>
              </div>

              {/* Articles Grid */}
              <div className="lg:col-span-3">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  {selectedCategory
                    ? categories.find(c => c.id === selectedCategory)?.name || 'Artigos'
                    : 'Todos os Artigos'}
                  <span className="ml-2 text-gray-400 font-normal">({articles.length})</span>
                </h3>
                {isLoading ? (
                  <div className="text-center py-12 text-gray-400">Carregando...</div>
                ) : articles.length === 0 ? (
                  <div className="text-center py-12">
                    <span className="text-4xl mb-3 block">📭</span>
                    <p className="text-gray-500">Nenhum artigo publicado nesta categoria.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {articles.map(a => (
                      <ArticleCard key={a.id} article={a} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function ArticleCard({ article }: { article: Article }) {
  return (
    <Link
      to={`/kb/${article.id}`}
      className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {article.category_name && (
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{article.category_name}</span>
            )}
            {article.tags.map(t => (
              <span key={t.id} className="text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded">#{t.name}</span>
            ))}
          </div>
          <h4 className="font-semibold text-gray-800 group-hover:text-indigo-700 transition-colors mb-1">
            {article.title}
          </h4>
          {article.summary && (
            <p className="text-sm text-gray-500 line-clamp-2 mb-2">{article.summary}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {article.author_name && <span>por {article.author_name}</span>}
            <span>{formatDate(article.created_at)}</span>
            <span>👁 {article.views}</span>
            {article.attachment_count > 0 && <span>📎 {article.attachment_count}</span>}
          </div>
        </div>
        <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}
