import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getMenuItems } from '../api/client';
import { useSidebar } from '../context/SidebarContext';

interface MenuItem {
  id: string;
  parent_id: string | null;
  category: string;
  title: string;
  href: string;
  icon?: string;
  order: number;
  is_active: boolean;
  children?: MenuItem[];
}

// Icon mapping
const iconMap: Record<string, string> = {
  dashboard: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  tickets: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  customers: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-4 4h1m-5 4h.01M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  agents: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  products: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  sla: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  parts: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  ai: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
  category: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z',
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
  const { collapsed, setCollapsed } = useSidebar();

  const { data: menuItems = [], isLoading } = useQuery({
    queryKey: ['menu'],
    queryFn: () => getMenuItems().then(r => r.data as MenuItem[]),
  });

  // Hierarchical menu — build tree from flat items
  const activeItems = [...menuItems].filter(m => m.is_active);

  // Items with no parent are top-level
  const topLevelItems = activeItems
    .filter(m => !m.parent_id)
    .sort((a, b) => a.order - b.order);

  // Map children by parent_id
  const childrenByParent: Record<string, MenuItem[]> = {};
  for (const item of activeItems) {
    if (item.parent_id) {
      if (!childrenByParent[item.parent_id]) {
        childrenByParent[item.parent_id] = [];
      }
      childrenByParent[item.parent_id].push(item);
    }
  }

  // Track expanded AI section (default: expanded)
  const [expandedParents, setExpandedParents] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of topLevelItems) {
      if (childrenByParent[item.id]?.length > 0) {
        initial.add(item.id);
      }
    }
    return initial;
  });

  const toggleParent = (id: string) => {
    setExpandedParents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Exact match for root paths, prefix match for sub-paths.
  // /admin matches ONLY /admin (not /admin/tickets)
  // /admin/tickets matches /admin/tickets and /admin/tickets/123
  const isActive = (href: string) => {
    const path = location.pathname;
    if (href === '/admin') return path === '/admin';
    return path === href || path.startsWith(href + '/');
  };

  return (
    <>
      {/* Sidebar */}
      <aside
        className={`bg-gray-900 text-white flex flex-col h-screen fixed left-0 top-0 transition-all duration-300 z-20 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Logo + Collapse Toggle */}
        <div className={`flex items-center border-b border-gray-700 ${collapsed ? 'justify-center p-3' : 'p-4 gap-3'}`}>
          <Link to="/admin" className="flex items-center gap-2 min-w-0">
            <span className="text-xl font-bold text-indigo-400 flex-shrink-0">W</span>
            {!collapsed && <span className="text-sm text-gray-400 truncate">wolfx</span>}
          </Link>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="ml-auto p-1 text-gray-400 hover:text-white rounded"
              title="Colapsar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          )}
          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="mt-2 p-1 text-gray-400 hover:text-white rounded"
              title="Expandir"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>

        {/* Menu — hierarchical */}
        <nav className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className={`text-gray-400 ${collapsed ? 'text-center px-2' : 'px-4 py-2'} text-sm`}>
              {collapsed ? '...' : 'Carregando...'}
            </div>
          ) : topLevelItems.length === 0 ? (
            <div className={`text-gray-400 text-sm ${collapsed ? 'text-center px-2' : 'px-4'}`}>
              {collapsed ? '—' : 'Nenhum item no menu.'}
            </div>
          ) : collapsed ? (
            // Collapsed: icons only with tooltips
            <div className="space-y-0.5">
              {topLevelItems.map(item => (
                <div key={item.id} className="relative group">
                  <Link
                    to={item.href}
                    className={`flex items-center justify-center py-2.5 transition-colors ${
                      isActive(item.href)
                        ? 'bg-indigo-600 text-white'
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <MenuIcon name={item.icon || item.href.split('/').pop()} className="w-5 h-5" />
                  </Link>
                  <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-50">
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Expanded: hierarchical with collapsible sub-items
            <div className="space-y-0.5 px-2">
              {topLevelItems.map(item => {
                const children = childrenByParent[item.id] || [];
                const hasChildren = children.length > 0;
                const isExpanded = expandedParents.has(item.id);
                const itemIsActive = isActive(item.href);

                return (
                  <div key={item.id}>
                    <div
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
                        itemIsActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                      }`}
                      onClick={() => hasChildren ? toggleParent(item.id) : undefined}
                    >
                      <MenuIcon name={item.icon || item.href.split('/').pop()} className="w-5 h-5 flex-shrink-0" />
                      <Link to={item.href} className="flex-1">{item.title}</Link>
                      {hasChildren && (
                        <button
                          onClick={(e) => { e.preventDefault(); toggleParent(item.id); }}
                          className="p-0.5 rounded hover:bg-indigo-500"
                        >
                          <svg
                            className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                    </div>

                    {/* Sub-items */}
                    {hasChildren && isExpanded && (
                      <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-700 pl-3">
                        {children
                          .sort((a, b) => a.order - b.order)
                          .map(child => (
                            <Link
                              key={child.id}
                              to={child.href}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                                isActive(child.href)
                                  ? 'bg-indigo-600 text-white'
                                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                              }`}
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
                              <span>{child.title}</span>
                            </Link>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </nav>
      </aside>
    </>
  );
}
