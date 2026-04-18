import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import {
  getKBArticles,
  reindexKBArticle,
  indexAllKBArticles,
  deleteKBRagIndex,
  uploadRagDocument,
  getRagDocuments,
  deleteRagDocument,
  reindexRagDocument,
} from '../../api/client';
import { extractErrorMessage } from '../../api/client';

type Article = {
  id: string;
  title: string;
  content?: string;
  summary?: string;
  status: string;
  views: number;
  category_id?: string;
  author_name?: string;
  category_name?: string;
  tags: { id: string; name: string }[];
  attachment_count: number;
  created_at: string;
  updated_at?: string;
  // RAG fields — may not be present on all backends
  embedding_status?: string;
  chunk_count?: number;
  embedded_at?: string;
};

type RagDocument = {
  id: string;
  title: string;
  original_filename: string;
  status: string;
  chunk_count?: number;
  embedded_at?: string;
  error_message?: string;
  created_at: string;
};

export default function KBRAG() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'articles' | 'documents'>('articles');
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [indexingAll, setIndexingAll] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [deleteRagTarget, setDeleteRagTarget] = useState<RagDocument | null>(null);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['kb-rag-articles', statusFilter],
    queryFn: () => getKBArticles(statusFilter ? { status: statusFilter } : {}).then(r => r.data as Article[]),
  });

  const { data: ragDocuments = [], refetch: refetchRagDocs } = useQuery({
    queryKey: ['rag-documents'],
    queryFn: () => getRagDocuments().then(r => r.data as RagDocument[]),
  });

  const reindexMut = useMutation({
    mutationFn: (articleId: string) => reindexKBArticle(articleId),
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['kb-rag-articles'] });
      showToast(`Artigo reindexado com sucesso`, 'success');
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  const indexAllMut = useMutation({
    mutationFn: () => indexAllKBArticles(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-rag-articles'] });
      showToast('Indexação completa iniciada', 'success');
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  const deleteIndexMut = useMutation({
    mutationFn: (articleId: string) => deleteKBRagIndex(articleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kb-rag-articles'] });
      setDeleteTarget(null);
      showToast('Índice eliminado', 'success');
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  const uploadRagMut = useMutation({
    mutationFn: ({ title, file }: { title: string; file: File }) => uploadRagDocument(title, file),
    onSuccess: (_, { file }) => {
      qc.invalidateQueries({ queryKey: ['rag-documents'] });
      setShowUploadModal(false);
      setUploadTitle('');
      setSelectedFile(null);
      showToast(`PDF "${file.name}" carregado e indexação iniciada`, 'success');
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  const deleteRagMut = useMutation({
    mutationFn: (id: string) => deleteRagDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-documents'] });
      setDeleteRagTarget(null);
      showToast('Documento RAG eliminado', 'success');
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  const reindexRagMut = useMutation({
    mutationFn: (id: string) => reindexRagDocument(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-documents'] });
      showToast('Documento reindexado', 'success');
    },
    onError: (e) => showToast(extractErrorMessage(e), 'error'),
  });

  function showToast(msg: string, type: 'success' | 'error') {
    setToastMsg(msg);
    setToastType(type);
    setTimeout(() => setToastMsg(''), 3500);
  }

  function statusLabel(s?: string) {
    if (s === 'indexed') return { label: 'Indexado', cls: 'bg-green-100 text-green-700' };
    if (s === 'pending') return { label: 'Pendente', cls: 'bg-amber-100 text-amber-700' };
    if (s === 'failed') return { label: 'Falhou', cls: 'bg-red-100 text-red-700' };
    return { label: 'Pendente', cls: 'bg-gray-100 text-gray-500' };
  }

  function ragStatusLabel(s?: string) {
    if (s === 'indexed') return { label: 'Indexado', cls: 'bg-green-100 text-green-700' };
    if (s === 'pending') return { label: 'A processar', cls: 'bg-amber-100 text-amber-700' };
    if (s === 'failed') return { label: 'Falhou', cls: 'bg-red-100 text-red-700' };
    return { label: 'Desconhecido', cls: 'bg-gray-100 text-gray-500' };
  }

  const filtered = articles.filter(a =>
    !search || a.title.toLowerCase().includes(search.toLowerCase())
  );

  const indexedCount = articles.filter(a => a.embedding_status === 'indexed' || a.embedding_status === 'complete').length;

  function embeddingBadge(status?: string) {
    if (!status) return <span className="text-xs text-gray-400">—</span>;
    const map: Record<string, { label: string; cls: string }> = {
      indexed: { label: 'Indexado', cls: 'bg-green-100 text-green-700' },
      complete: { label: 'Indexado', cls: 'bg-green-100 text-green-700' },
      pending: { label: 'Pendente', cls: 'bg-yellow-100 text-yellow-700' },
      failed: { label: 'Falhou', cls: 'bg-red-100 text-red-700' },
      processing: { label: 'A processar', cls: 'bg-blue-100 text-blue-700' },
    };
    const info = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
    return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.cls}`}>{info.label}</span>;
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">KB RAG — Indexação de Embeddings</h1>
            <p className="text-sm text-gray-500 mt-1">
              Gerir a vectorização e indexação RAG dos artigos da base de conhecimento.
              {articles.length > 0 && (
                <span className="ml-2 text-indigo-600 font-medium">
                  {indexedCount}/{articles.length} artigos indexados
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => indexAllMut.mutate()}
              disabled={indexAllMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {indexAllMut.isPending ? '⏳ A indexar...' : '⚡ Indexar Todos'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
            />
            <button
              onClick={() => {
                setSelectedFile(null);
                setUploadTitle('');
                setShowUploadModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              📄 Upload PDF
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-4">
          <nav className="flex gap-6">
            <button
              onClick={() => setActiveTab('articles')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'articles'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Artigos
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'documents'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Documentos RAG
              {ragDocuments.length > 0 && (
                <span className="bg-indigo-100 text-indigo-600 text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {ragDocuments.length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* ─── Artigos tab ─── */}
        {activeTab === 'articles' && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="Pesquisar artigos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Todos os estados</option>
            <option value="published">Publicados</option>
            <option value="draft">Rascunho</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Título', 'Categoria', 'Estado KB', 'Embedding', 'Chunks', 'Indexado em', 'Ações'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">Carregando artigos...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">Nenhum artigo encontrado</td>
                  </tr>
                ) : filtered.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-800 font-medium max-w-xs truncate">{a.title}</div>
                      {a.summary && (
                        <div className="text-xs text-gray-400 max-w-xs truncate mt-0.5">{a.summary}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{a.category_name || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        a.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {a.status === 'published' ? 'Publicado' : 'Rascunho'}
                      </span>
                    </td>
                    <td className="px-4 py-3">{embeddingBadge(a.embedding_status)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 text-center">
                      {a.chunk_count != null ? a.chunk_count : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {a.embedded_at ? new Date(a.embedded_at).toLocaleDateString('pt-BR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 items-center">
                        <button
                          title="Reindexar artigo"
                          onClick={() => reindexMut.mutate(a.id)}
                          disabled={reindexMut.isPending}
                          className="text-indigo-600 hover:text-indigo-800 text-xs font-medium disabled:opacity-50"
                        >
                          🔄 Reindexar
                        </button>
                        <button
                          title="Eliminar índice RAG"
                          onClick={() => setDeleteTarget(a)}
                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info box */}
        <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700">
          <strong>Como funciona:</strong> Cada artigo publicado é automaticamente vectorizado e indexado para pesquisa semântica via RAG.
          Use "Reindexar" para forçar a re-vectorização de um artigo específico, ou "Indexar Todos" para reindexar a totalidade da base.
          A eliminação do índice remove os vectores de embedding mas mantém o artigo intacto.
        </div>
          </>
        )}

        {/* ─── Documentos RAG tab ─── */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {ragDocuments.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <span className="text-4xl mb-3 block">📂</span>
                <p className="text-sm text-gray-500 mb-1">Nenhum documento RAG carregado.</p>
                <p className="text-xs text-gray-400">Use "Upload PDF" para adicionar documentos standalone à RAG.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Documento</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ficheiro</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Chunks</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ragDocuments.map(doc => {
                      const sl = ragStatusLabel(doc.status);
                      return (
                        <tr key={doc.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800">{doc.title}</p>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{doc.original_filename}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sl.cls}`}>
                              {sl.label}
                            </span>
                            {doc.error_message && (
                              <p className="text-xs text-red-500 mt-0.5">{doc.error_message}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600">{doc.chunk_count ?? '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => reindexRagMut.mutate(doc.id)}
                                disabled={reindexRagMut.isPending}
                                className="px-3 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded-lg disabled:opacity-50"
                                title="Reindexar"
                              >
                                🔄 Reindexar
                              </button>
                              <button
                                onClick={() => setDeleteRagTarget(doc)}
                                className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                                title="Eliminar"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toastMsg && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white max-w-sm ${
          toastType === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toastMsg}
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal isOpen={true} onClose={() => setDeleteTarget(null)} title="Eliminar Índice RAG" size="sm">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">
              Pretende eliminar o índice RAG de:
            </p>
            <p className="text-sm font-semibold text-gray-800 mb-4">{deleteTarget.title}</p>
            <p className="text-xs text-gray-500 mb-6">
              O artigo não será eliminado — apenas os vectores de embedding serão removidos.
              Use "Reindexar" para os recriar.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteIndexMut.mutate(deleteTarget.id)}
                disabled={deleteIndexMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteIndexMut.isPending ? 'A eliminar...' : 'Eliminar Índice'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete RAG document confirm */}
      {deleteRagTarget && (
        <Modal isOpen={true} onClose={() => setDeleteRagTarget(null)} title="Eliminar Documento RAG" size="sm">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">
              Pretende eliminar o documento RAG:
            </p>
            <p className="text-sm font-semibold text-gray-800 mb-4">{deleteRagTarget.title}</p>
            <p className="text-xs text-gray-500 mb-6">
              O ficheiro PDF será eliminado e todos os vectores de embedding associados.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setDeleteRagTarget(null)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteRagMut.mutate(deleteRagTarget.id)}
                disabled={deleteRagMut.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteRagMut.isPending ? 'A eliminar...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Upload PDF modal */}
      {showUploadModal && (
        <Modal isOpen={true} onClose={() => { setShowUploadModal(false); setSelectedFile(null); setUploadTitle(''); }} title="Upload de PDF para RAG" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Carregue um PDF para ser indexado standalone na RAG. O documento não está vinculado a nenhum artigo da KB.
            </p>

            {/* Title input */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Título do documento</label>
              <input
                type="text"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                placeholder="Ex: Manual de Procedimentos WolfX 2024"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* File drop zone */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ficheiro PDF</label>
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  selectedFile ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-indigo-300'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => {
                    const files = e.target.files;
                    if (!files?.length) return;
                    setSelectedFile(files[0]);
                  }}
                />
                {selectedFile ? (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl">📄</span>
                    <span className="text-sm font-medium text-gray-700">{selectedFile.name}</span>
                    <span className="text-xs text-gray-500">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-2xl">📤</span>
                    <span className="text-sm text-gray-500">Clique ou arraste um PDF aqui</span>
                    <span className="text-xs text-gray-400">Máximo 10 MB</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => { setShowUploadModal(false); setSelectedFile(null); setUploadTitle(''); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!uploadTitle || !selectedFile) return;
                  uploadRagMut.mutate({ title: uploadTitle, file: selectedFile });
                }}
                disabled={!uploadTitle || !selectedFile || uploadRagMut.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {uploadRagMut.isPending ? '⏳ A carregar...' : '📤 Carregar e Indexar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Layout>
  );
}
