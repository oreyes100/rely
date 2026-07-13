import type { ReactNode } from 'react';
import { clearToken } from '../api/client';

export type Page = 'dashboard' | 'provision' | 'services' | 'credentials' | 'history' | 'console';

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '▦' },
  { id: 'provision', label: 'Crear VPS', icon: '＋' },
  { id: 'services', label: 'Servicios', icon: '⚙' },
  { id: 'credentials', label: 'Credenciales', icon: '🔑' },
  { id: 'history', label: 'Historial', icon: '☰' },
  { id: 'console', label: 'Consola PVE', icon: '⎕' },
];

export default function DashboardLayout({
  page,
  onNavigate,
  children,
}: {
  page: Page;
  onNavigate: (p: Page) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen text-slate-100">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 p-4 sm:flex">
        <div className="mb-8">
          <div className="text-lg font-bold">Panel VPS</div>
          <div className="text-xs text-slate-500">Proxmox · pve + pvececyte</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                page === item.id
                  ? 'bg-indigo-600/20 text-indigo-300'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span className="w-5 text-center">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <button
          onClick={() => {
            clearToken();
            window.location.reload();
          }}
          className="btn-ghost mt-auto justify-center"
        >
          Cerrar sesión
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* nav móvil */}
        <div className="flex gap-1 border-b border-slate-800 bg-slate-900/60 p-2 sm:hidden">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${
                page === item.id ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
