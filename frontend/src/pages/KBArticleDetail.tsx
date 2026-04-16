import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getKBArticle, getRelatedArticles } from '../api/client';
import Layout from '../components/Layout';

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime?: string }) {
  if (!mime) return '📄';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('word') || mime.includes('document')) return '📘';
  if (mime.includes('excel') || mime.includes('sheet')) return '📗';
  if (mime.includes('zip') || mime.includes('archive')) return '🗜️';
  return '📎';
}

export default function KBArticleDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: article, isLoading } = useQuery({
    queryKey: ['kb-article', id],
    queryFn: () => getKBArticle(id!).then(r => r.data),
    enabled: !!id,
  });

  const { data: related = [] } = useQuery({
    queryKey: ['kb-related', id],
    queryFn: () => getRelatedArticles(id!).then(r => r.data),
    enabled: !!id,
  });

  async function handleDownload(attId: string, name: string) {
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || '';
    const url = `${base}/api/v1/kb/attachments/${attId}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.target = '_blank';
    a.click();
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full" />
        </div>
      </Layout>
    );
  }

  if (!article) {
    return (
      <Layout>
        <div className="text-center py-20">
          <span className="text-5xl mb-4 block">📭</span>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Artigo não encontrado</h3>
          <Link to="/kb" className="text-indigo-600 hover:underline text-sm">Voltar à Base de Conhecimento</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
          <Link to="/kb" className="hover:text-indigo-600">Base de Conhecimento</Link>
          <span>/</span>
          {article.category_name && (
            <>
              <span>{article.category_name}</span>
              <span>/</span>
            </>
          )}
          <span className="text-gray-700 truncate">{article.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Article */}
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="flex items-center gap-2 mb-3">
                {article.category_name && (
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">{article.category_name}</span>
                )}
                {article.tags.map((t: any) => (
                  <span key={t.id} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">#{t.name}</span>
                ))}
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-4">{article.title}</h1>
              <div className="flex items-center gap-4 text-sm text-gray-400 mb-8 pb-6 border-b border-gray-100">
                {article.author_name && <span>Por <strong className="text-gray-600">{article.author_name}</strong></span>}
                <span>Criado em {formatDate(article.created_at)}</span>
                {article.updated_at && article.updated_at !== article.created_at && (
                  <span>Actualizado em {formatDate(article.updated_at)}</span>
                )}
                <span>👁 {article.views} visualizações</span>
              </div>
              {/* Content */}
              <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                {article.content}
              </div>
            </div>

            {/* Attachments */}
            {article.attachments?.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  📎 Anexos <span className="text-gray-400 text-sm font-normal">({article.attachments.length})</span>
                </h3>
                <div className="space-y-2">
                  {article.attachments.map((att: any) => (
                    <div key={att.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xl flex-shrink-0">{FileIcon(att.mime_type)}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-700 truncate">{att.original_name}</p>
                          <p className="text-xs text-gray-400">{formatSize(att.file_size)}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownload(att.id, att.original_name)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex-shrink-0 ml-3"
                      >
                        ⬇ Baixar
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related Articles */}
            {related.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-800 mb-4">Artigos Relacionados</h3>
                <div className="space-y-2">
                  {related.map((r: any) => (
                    <Link key={r.id} to={`/kb/${r.id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 group transition-colors">
                      <span className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                      <span className="text-sm text-gray-700 group-hover:text-indigo-700 flex-1">{r.title}</span>
                      <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Article Info */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Informações</h4>
              <dl className="space-y-2 text-sm">
                {article.author_name && (
                  <>
                    <dt className="text-gray-400">Autor</dt>
                    <dd className="text-gray-700 font-medium">{article.author_name}</dd>
                  </>
                )}
                <dt className="text-gray-400">Criado em</dt>
                <dd className="text-gray-700">{formatDate(article.created_at)}</dd>
                {article.updated_at && article.updated_at !== article.created_at && (
                  <>
                    <dt className="text-gray-400">Actualizado</dt>
                    <dd className="text-gray-700">{formatDate(article.updated_at)}</dd>
                  </>
                )}
                <dt className="text-gray-400">Visualizações</dt>
                <dd className="text-gray-700">{article.views}</dd>
              </dl>
            </div>

            {/* Tags */}
            {article.tags?.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Tags</h4>
                <div className="flex flex-wrap gap-1.5">
                  {article.tags.map((t: any) => (
                    <span key={t.id} className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full">
                      #{t.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Help CTA */}
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-5">
              <h4 className="text-sm font-semibold text-indigo-800 mb-2">Não encontrou o que procurava?</h4>
              <p className="text-xs text-indigo-600 mb-3">Our team is ready to help you with any questions.</p>
              <Link to="/tickets/new" className="block text-center bg-indigo-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                Abrir Ticket
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
