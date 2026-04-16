import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getKBCategories, createKBCategory, updateKBCategory, deleteKBCategory,
  getKBArticles, createKBArticle, updateKBArticle, deleteKBArticle,
  uploadKBAttachment, deleteKBAttachment, getKBTags,
} from '../../api/client';
import { extractErrorMessage } from '../../api/client';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';

type Category = { id: string; name: string; description?: string; parent_id?: string; is_active: boolean; children: Category[] };
type Article = {
  id: string; title: string; content?: string; summary?: string; status: string;
  views: number; category_id?: string; author_name?: string; category_name?: string;
  tags: { id: string; name: string }[]; attachment_count: number;
  attachments?: { id: string; original_name: string; mime_type?: string; file_size?: number }[];
  created_at: string; updated_at?: string;
};
type Tag = { id: string; name: string };

const EMPTY_ARTICLE = {
  title: '', content: '', summary: '', category_id: '', status: 'draft', tags: [] as string[],
};

// ─── Category Manager ────────────────────────────────────────────

function CategoryManager() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: '', description: '', parent_id: '' });
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ['kb-categories-admin'],
    queryFn: () => getKBCategories(true).then(r => r.data as Category[]),
  });

  const postCat = useMutation({
    mutationFn: (data: typeof form) =>
      editingCat
        ? updateKBCategory(editingCat.id, { ...data, parent_id: data.parent_id || undefined })
        : createKBCategory({ ...data, parent_id: data.parent_id || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kb-categories-admin'] }); closeModal(); },
    onError: (e) => setFormError(extractErrorMessage(e)),
  });

  const delCat = useMutation({
    mutationFn: (id: string) => deleteKBCategory(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kb-categories-admin'] }); setDeleteTarget(null); },
    onError: (e) => alert(extractErrorMessage(e)),
  });

  function openCreate() { setEditingCat(null); setForm({ name: '', description: '', parent_id: '' }); setFormError(''); setShowModal(true); }
  function openEdit(c: Category) { setEditingCat(c); setForm({ name: c.name, description: c.description || '', parent_id: c.parent_id || '' }); setFormError(''); setShowModal(true); }
  function closeModal() { setShowModal(false); setEditingCat(null); setFormError(''); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Nome é obrigatório'); return; }
    postCat.mutate(form);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-gray-800">Categorias</h3>
        <button onClick={openCreate} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
          + Nova Categoria
        </button>
      </div>
      <div className="p-4">
        {categories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma categoria</p>
        ) : (
          <div className="space-y-1">
            {categories.map(cat => (
              <CategoryRow
                key={cat.id} cat={cat} depth={0}
                onEdit={() => openEdit(cat)}
                onDelete={() => setDeleteTarget(cat)}
                allCats={categories}
              />
            ))}
          </div>
        )}
      </div>

      {/* Category Modal */}
      {showModal && (
        <Modal isOpen={true} onClose={closeModal} title={editingCat ? 'Editar Categoria' : 'Nova Categoria'} size="sm">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Pai</label>
              <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                <option value="">Nenhuma (categoria raiz)</option>
                {categories.filter(c => c.id !== editingCat?.id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {formError && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</div>}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button type="submit" disabled={postCat.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                {postCat.isPending ? 'A gravar...' : editingCat ? 'Guardar' : 'Criar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal isOpen={true} onClose={() => setDeleteTarget(null)} title="Eliminar Categoria" size="sm">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">Eliminar <strong>{deleteTarget.name}</strong>?</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => delCat.mutate(deleteTarget.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {delCat.isPending ? 'A eliminar...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CategoryRow({ cat, depth, onEdit, onDelete, allCats }: {
  cat: Category; depth: number; onEdit: () => void; onDelete: () => void; allCats: Category[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 group">
        <span style={{ marginLeft: depth * 20 }} className="text-gray-400 text-xs">{depth > 0 ? '└─' : ''}</span>
        <span className="flex-1 text-sm text-gray-700">{cat.name}</span>
        {!cat.is_active && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Inactiva</span>}
        <div className="opacity-0 group-hover:opacity-100 flex gap-1 transition-opacity">
          <button onClick={onEdit} className="text-indigo-600 hover:text-indigo-800 text-xs">Editar</button>
          <button onClick={onDelete} className="text-red-500 hover:text-red-700 text-xs">Eliminar</button>
        </div>
      </div>
      {cat.children?.map(child => (
        <CategoryRow key={child.id} cat={child} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} allCats={allCats} />
      ))}
    </div>
  );
}

// ─── Article Manager ──────────────────────────────────────────────

function ArticleManager() {
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [form, setForm] = useState<typeof EMPTY_ARTICLE>(EMPTY_ARTICLE);
  const [formError, setFormError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Article | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [tagInput, setTagInput] = useState('');

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ['kb-articles-admin', statusFilter],
    queryFn: () => getKBArticles(statusFilter ? { status: statusFilter } : {}).then(r => r.data as Article[]),
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['kb-categories-admin'],
    queryFn: () => getKBCategories(true).then(r => r.data as Category[]),
  });

  const { data: allTags = [] } = useQuery({
    queryKey: ['kb-tags'],
    queryFn: () => getKBTags().then(r => r.data as Tag[]),
  });

  const postArticle = useMutation({
    mutationFn: (data: typeof EMPTY_ARTICLE) =>
      editingArticle
        ? updateKBArticle(editingArticle.id, { ...data, category_id: data.category_id || undefined })
        : createKBArticle({ ...data, category_id: data.category_id || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kb-articles-admin'] }); closeModal(); },
    onError: (e) => setFormError(extractErrorMessage(e)),
  });

  const delArticle = useMutation({
    mutationFn: (id: string) => deleteKBArticle(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['kb-articles-admin'] }); setDeleteTarget(null); },
    onError: (e) => alert(extractErrorMessage(e)),
  });

  function openCreate() {
    setEditingArticle(null);
    setForm(EMPTY_ARTICLE);
    setFormError('');
    setShowModal(true);
  }

  async function openEdit(a: Article) {
    const detail = await (await fetch(`/api/v1/kb/articles/${a.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })).json();
    setEditingArticle(detail);
    setForm({
      title: detail.title,
      content: detail.content,
      summary: detail.summary || '',
      category_id: detail.category_id || '',
      status: detail.status,
      tags: detail.tags?.map((t: any) => t.name) || [],
    });
    setFormError('');
    setShowModal(true);
  }

  function closeModal() { setShowModal(false); setEditingArticle(null); setFormError(''); }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError('Título é obrigatório'); return; }
    if (!form.content.trim()) { setFormError('Conteúdo é obrigatório'); return; }
    postArticle.mutate(form);
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  }

  function removeTag(t: string) {
    setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }));
  }

  function handleFileUpload(articleId: string, files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(file => {
      qc.setQueryData(['kb-articles-admin', statusFilter], (old: any[]) =>
        old?.map(a => a.id === articleId ? { ...a, attachment_count: a.attachment_count + 1 } : a)
      );
    });
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-gray-800">Artigos</h3>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="px-2 py-1 border border-gray-200 rounded text-xs text-gray-600">
            <option value="">Todos</option>
            <option value="draft">Rascunho</option>
            <option value="published">Publicados</option>
          </select>
        </div>
        <button onClick={openCreate} className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700">
          + Novo Artigo
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Título', 'Categoria', 'Estado', 'Autor', 'Tags', 'Anexos', 'Actualizado', 'Ações'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Carregando...</td></tr>
            ) : articles.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Nenhum artigo</td></tr>
            ) : articles.map(a => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-800 max-w-xs truncate">{a.title}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{a.category_name || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    a.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {a.status === 'published' ? 'Publicado' : 'Rascunho'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{a.author_name || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {a.tags.slice(0, 2).map(t => (
                      <span key={t.id} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">#{t.name}</span>
                    ))}
                    {a.tags.length > 2 && <span className="text-xs text-gray-400">+{a.tags.length - 2}</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-center text-xs text-gray-600">{a.attachment_count}</td>
                <td className="px-4 py-3 text-xs text-gray-400">
                  {a.updated_at ? new Date(a.updated_at).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(a)} className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">Editar</button>
                    <button onClick={() => setDeleteTarget(a)} className="text-red-500 hover:text-red-700 text-xs font-medium">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Article Modal */}
      {showModal && (
        <Modal isOpen={true} onClose={closeModal}
          title={editingArticle ? 'Editar Artigo' : 'Criar Artigo'}
          size="lg">
          <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                placeholder="Ex: Como criar um ticket de suporte" required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                  <option value="">Sem categoria</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500">
                  <option value="draft">Rascunho</option>
                  <option value="published">Publicado</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resumo (opcional)</label>
              <input type="text" value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                placeholder="Breve descrição do artigo" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo *</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 font-mono"
                placeholder="Contenido del artículo..." required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {form.tags.map(t => (
                  <span key={t} className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                    #{t} <button type="button" onClick={() => removeTag(t)} className="text-indigo-400 hover:text-indigo-700">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                  placeholder="Adicionar tag e pressionar Enter" />
                <button type="button" onClick={addTag} className="px-3 py-2 text-indigo-600 border border-indigo-200 rounded-lg text-sm hover:bg-indigo-50">+ Tag</button>
              </div>
            </div>

            {formError && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</div>}
            <div className="flex justify-end gap-3 pt-2 sticky bottom-0 bg-white">
              <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button type="submit" disabled={postArticle.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
                {postArticle.isPending ? 'A gravar...' : editingArticle ? 'Guardar' : 'Publicar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Confirm */}
      {deleteTarget && (
        <Modal isOpen={true} onClose={() => setDeleteTarget(null)} title="Eliminar Artigo" size="sm">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-4">Eliminar <strong>{deleteTarget.title}</strong>? Todos os anexos serão removidos.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancelar</button>
              <button onClick={() => delArticle.mutate(deleteTarget.id)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                {delArticle.isPending ? 'A eliminar...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main Admin Page ─────────────────────────────────────────────

export default function AdminKB() {
  const [tab, setTab] = useState<'articles' | 'categories'>('articles');

  return (
    <Layout>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Base de Conhecimento</h2>
            <p className="text-sm text-gray-500 mt-1">Gerir artigos, categorias e anexos da KB.</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {(['articles', 'categories'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}>
              {t === 'articles' ? '📄 Artigos' : '📁 Categorias'}
            </button>
          ))}
        </div>

        {tab === 'articles' ? <ArticleManager /> : <CategoryManager />}
      </div>
    </Layout>
  );
}
