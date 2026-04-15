import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';
import { useSidebar } from '../context/SidebarContext';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { logout, user } = useAuth();
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${collapsed ? 'ml-16' : 'ml-64'}`}>
        {/* Top bar */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 fixed top-0 right-0 z-10"
          style={{ left: collapsed ? '4rem' : '16rem' }}>
          <div className="text-sm text-gray-500">
            Bem-vindo, <span className="font-medium text-gray-700">{user?.email || 'Admin'}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded font-medium">
              {user?.role?.toUpperCase() || 'ADMIN'}
            </span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700 font-medium">
              Sair
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="pt-16 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
