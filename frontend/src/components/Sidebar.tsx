import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getMenuItems, createMenuItem } from '../api/client';
import Modal from './Modal';

interface MenuItem {
  id: string;
  category: string;
  title: string;
  href: string;
  icon?: string;
  order: number;
  is_active: boolean;
}

// Icon mapping for menu items
const iconMap: Record<string, string> = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  tickets: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  customers: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-4 4h1m-5 4h.01M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  agents: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  products: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  sla: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  default: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
};

function MenuIcon({ name, className = 'w-5 h-5' }: { name?: string; className?: string }) {
  const path = iconMap[name || 'default'] || iconMap.default;
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={path} />
    </svg>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ category: '', title: '', href: '', icon: '' });
  const [error, setError] = useState('');

  const { data: menuItems = [], isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: () => getMenuItems().then(r => r.data as MenuItem[]),
  });

  const createMutation = useMutation({
    mutationFn: createMenuItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu'] });
      setIsAddModalOpen(false);
      setNewItem({ category: '', title: '', href: '', icon: '' });
      setError('');
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail || 'Erro ao criar item');
    },
  });

  // Group items by category
  const grouped = menuItems.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  // Sort items within each category
  Object.keys(grouped).forEach(cat => {
    grouped[cat].sort((a, b) => a.order - b.order);
  });

  // Sort categories
  const sortedCategories = Object.keys(grouped).sort();

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItem.category || !newItem.title || !newItem.href) {
      setError('Categoria, título e URL são obrigatórios');
      return;
    }
    createMutation.mutate({
      category: newItem.category,
      title: newItem.title,
      href: newItem.href,
      icon: newItem.icon || undefined,
      order: 0,
    });
  };

  return (
    <>
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0">
        {/* Logo */}
        <div className="p-4 border-b border-gray-700">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="text-xl font-bold text-indigo-400">wolfx</span>
            <span className="text-sm text-gray-400">atendimento</span>
          </Link>
        </div>

        {/* Menu */}
        <nav className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="px-4 py-2 text-gray-400">Carregando...</div>
          ) : sortedCategories.length === 0 ? (
            <div className="px-4 py-2 text-gray-400 text-sm">
              Nenhum item no menu.
              <br />
              Clica em "Gerir Menu" para adicionar.
            </div>
          ) : (
            sortedCategories.map(category => (
              <div key={category} className="mb-2">
                {/* Category Header */}
                <button
                  onClick={() => toggleCategory(category)}
                  className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <span>{category}</span>
                  <svg
                    className={`w-4 h-4 transition-transform ${collapsedCategories.has(category) ? '' : 'rotate-90'}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Category Items */}
                {!collapsedCategories.has(category) && grouped[category] && (
                  <div className="mt-1">
                    {grouped[category].map(item => {
                      const isActive = location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                      return (
                        <Link
                          key={item.id}
                          to={item.href}
                          className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                          }`}
                        >
                          <MenuIcon name={item.icon} className="w-5 h-5 flex-shrink-0" />
                          <span>{item.title}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Gerir Menu
          </button>
        </div>
      </aside>

      {/* Add Item Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Adicionar ao Menu">
        <form onSubmit={handleAdd} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-2 rounded-lg">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
            <input
              type="text"
              value={newItem.category}
              onChange={e => setNewItem({ ...newItem, category: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Gestão"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
            <input
              type="text"
              value={newItem.title}
              onChange={e => setNewItem({ ...newItem, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Tickets"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
            <input
              type="text"
              value={newItem.href}
              onChange={e => setNewItem({ ...newItem, href: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="/admin/tickets"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ícone</label>
            <select
              value={newItem.icon}
              onChange={e => setNewItem({ ...newItem, icon: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">Padrão</option>
              <option value="dashboard">Dashboard</option>
              <option value="tickets">Tickets</option>
              <option value="customers">Clientes</option>
              <option value="agents">Agentes</option>
              <option value="products">Produtos</option>
              <option value="sla">SLA</option>
              <option value="settings">Configurações</option>
              <option value="users">Utilizadores</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50"
            >
              {createMutation.isPending ? 'A adicionar...' : 'Adicionar'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
