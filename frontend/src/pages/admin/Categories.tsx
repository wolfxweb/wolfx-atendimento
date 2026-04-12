import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCategories, createCategory, updateCategory, deleteCategory } from '../../api/client';
import Layout from '../../components/Layout';
import Modal from '../../components/Modal';
import IconPicker from '../../components/IconPicker';

interface Category {
  id: string;
  name: string;
  slug: string;
  type: string;
  description?: string;
  color: string;
  icon?: string;
  is_active: boolean;
  order: number;
  parent_id?: string;
  created_at: string;
}

// Build tree from flat list
type TreeCategory = Category & { children: TreeCategory[] };

function buildTree(categories: Category[]): TreeCategory[] {
  const map: Record<string, TreeCategory> = {};
  const roots: TreeCategory[] = [];

  categories.forEach(cat => {
    map[cat.id] = { ...cat, children: [] };
  });

  categories.forEach(cat => {
    if (cat.parent_id && map[cat.parent_id]) {
      map[cat.parent_id].children.push(map[cat.id]);
    } else {
      roots.push(map[cat.id]);
    }
  });

  return roots;
}

function CategoryIcon({ icon, size = 'w-5 h-5' }: { icon?: string; size?: string }) {
  if (!icon) return null;
  const icons: Record<string, string> = {
    dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    ticket: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    headset: 'M3 18v-6a9 9 0 0118 0v6M3 18a3 3 0 003 3h2a2 2 0 002-2v-3a2 2 0 00-2-2H3v4zm18 0a3 3 0 01-3 3h-2a2 2 0 00-2 2v3a2 2 0 002 2h6v-4z',
    users: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
    user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
    briefcase: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    tag: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z',
    shopping: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
    package: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
    desktop: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    mobile: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
    server: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01',
    cpu: 'M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m14 0h2M3 15h2m14 0h2M7 7h10a2 2 0 012 2v6a2 2 0 01-2 2H7a2 2 0 01-2-2V9a2 2 0 012-2zm0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h4',
    globe: 'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
    shield: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    lock: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
    eye: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
    bell: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9',
    star: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
    heart: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
    flag: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9',
    clock: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    calendar: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
    mail: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
    pencil: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
    check: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    x: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
    wrench: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    folder: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
    document: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    chart: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    location: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
    plus: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z',
    minus: 'M12 15a3 3 0 100-6 3 3 0 000 6z M9 12h6',
    info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  };

  const path = icons[icon || ''];
  if (!path) return null;
  return (
    <svg className={size} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

function TreeItem({
  category,
  onEdit,
  onDelete,
  depth = 0,
}: {
  category: TreeCategory;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  depth?: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = category.children.length > 0;

  return (
    <>
      <tr
        className="hover:bg-gray-50 transition-colors"
        style={{ borderLeft: `3px solid ${category.color}` }}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2" style={{ marginLeft: depth * 24 + 8 }}>
            {hasChildren && (
              <button
                onClick={() => setCollapsed(!collapsed)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
            {!hasChildren && <span className="w-4" />}
            <span className="text-gray-400">
              <CategoryIcon icon={category.icon} />
            </span>
            <div className="min-w-0">
              <p className="font-medium text-gray-800 truncate">{category.name}</p>
              <p className="text-xs text-gray-400">{category.slug}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            category.type === 'ticket' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {category.type}
          </span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded" style={{ backgroundColor: category.color }} />
            <span className="text-xs text-gray-500">{category.color}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            category.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
          }`}>
            {category.is_active ? 'Activa' : 'Inactiva'}
          </span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={() => onEdit(category)}
              className="text-indigo-600 hover:text-indigo-700 text-sm font-medium"
            >
              Editar
            </button>
            <button
              onClick={() => onDelete(category)}
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              Eliminar
            </button>
          </div>
        </td>
      </tr>
      {!collapsed && hasChildren && category.children.map(child => (
        <TreeItem
          key={child.id}
          category={child}
          onEdit={onEdit}
          onDelete={onDelete}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const [filterType, setFilterType] = useState<string>('all');
  const [searchName, setSearchName] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    slug: '',
    type: 'ticket',
    description: '',
    color: '#3B82F6',
    icon: '',
    order: 0,
    parent_id: '' as string | undefined,
    is_active: true,
  });

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(filterType === 'all' ? undefined : filterType).then(r => r.data as Category[]),
  });

  const filteredCategories = categories.filter(c =>
    !searchName || c.name.toLowerCase().includes(searchName.toLowerCase()) ||
    c.slug.toLowerCase().includes(searchName.toLowerCase())
  );
  const tree = buildTree(filteredCategories);

  const createMutation = useMutation({
    mutationFn: createCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsCreateOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Erro ao criar categoria');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setIsEditOpen(false);
      setEditingCategory(null);
      resetForm();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Erro ao atualizar categoria');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Erro ao eliminar categoria');
    },
  });

  const resetForm = () => {
    setForm({ name: '', slug: '', type: 'ticket', description: '', color: '#3B82F6', icon: '', order: 0, parent_id: undefined, is_active: true });
    setError('');
  };

  const openCreate = () => {
    resetForm();
    setIsCreateOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingCategory(cat);
    setForm({
      name: cat.name,
      slug: cat.slug,
      type: cat.type,
      description: cat.description || '',
      color: cat.color,
      icon: cat.icon || '',
      order: cat.order,
      parent_id: cat.parent_id || undefined,
      is_active: cat.is_active,
    });
    setError('');
    setIsEditOpen(true);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug || !form.type) {
      setError('Nome, slug e tipo são obrigatórios');
      return;
    }
    createMutation.mutate({
      name: form.name,
      slug: form.slug,
      type: form.type,
      description: form.description || undefined,
      color: form.color || '#3B82F6',
      icon: form.icon || undefined,
      order: form.order,
      parent_id: form.parent_id || undefined,
    });
  };

  const handleUpdate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    updateMutation.mutate({
      id: editingCategory.id,
      data: {
        name: form.name,
        description: form.description || undefined,
        color: form.color || '#3B82F6',
        icon: form.icon || undefined,
        order: form.order,
        parent_id: form.parent_id || undefined,
        is_active: editingCategory.is_active,
      },
    });
  };

  const handleNameChange = (name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    setForm({ ...form, name, slug });
  };

  // Available parents: same type, excluding self and descendants (simple: just exclude self)
  const availableParents = categories.filter(c =>
    c.type === form.type && c.id !== editingCategory?.id
  );

  return (
    <Layout>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">Categorias</h2>
        <button
          onClick={openCreate}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium"
        >
          + Nova Categoria
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {['all', 'ticket', 'product'].map(type => (
          <button
            key={type}
            onClick={() => setFilterType(type)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filterType === type
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
            }`}
          >
            {type === 'all' ? 'Todas' : type === 'ticket' ? 'Tickets' : 'Produtos'}
          </button>
        ))}
        <div className="flex-1" />
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchName}
            onChange={e => setSearchName(e.target.value)}
            placeholder="Pesquisar por nome..."
            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64"
          />
          {searchName && (
            <button
              onClick={() => setSearchName('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
      </div>
      </div>

      {/* Categories Table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Carregando...</div>
      ) : filteredCategories.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-gray-500">Nenhuma categoria encontrada.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cor</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Acções</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tree.map(cat => (
                <TreeItem
                  key={cat.id}
                  category={cat}
                  onEdit={openEdit}
                  onDelete={(cat) => {
                    if (confirm(`Eliminar categoria "${cat.name}" e as suas subcategorias?`)) {
                      deleteMutation.mutate(cat.id);
                    }
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Nova Categoria" size="lg">
        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                placeholder="Eletrónicos"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                placeholder="eletronicos"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <select
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value, parent_id: undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ticket">Ticket</option>
                <option value="product">Produto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Pai</label>
              <select
                value={form.parent_id || ''}
                onChange={e => setForm({ ...form, parent_id: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Nenhuma (categoria raiz)</option>
                {availableParents.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <span className="text-sm text-gray-500">{form.color}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ícone</label>
              <div className="relative">
                <IconPicker value={form.icon} onChange={icon => setForm({ ...form, icon })} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none"
              placeholder="Descrição opcional..."
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsCreateOpen(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'A criar...' : 'Criar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={isEditOpen} onClose={() => { setIsEditOpen(false); setEditingCategory(null); }} title={`Editar: ${editingCategory?.name}`} size="lg">
        <form onSubmit={handleUpdate} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={e => setForm({ ...form, slug: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                disabled
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <input
                type="text"
                value={form.type}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                disabled
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Pai</label>
              <select
                value={form.parent_id || ''}
                onChange={e => setForm({ ...form, parent_id: e.target.value || undefined })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Nenhuma (categoria raiz)</option>
                {availableParents.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                />
                <span className="text-sm text-gray-500">{form.color}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ícone</label>
              <div className="relative">
                <IconPicker value={form.icon} onChange={icon => setForm({ ...form, icon })} />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={editingCategory?.is_active ?? true}
                onChange={e => setEditingCategory(prev => prev ? { ...prev, is_active: e.target.checked } : null)}
                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-gray-700">Categoria activa</span>
            </label>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => { setIsEditOpen(false); setEditingCategory(null); }}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
            >
              {updateMutation.isPending ? 'A guardar...' : 'Guardar'}
            </button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
