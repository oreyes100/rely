import type { ReactNode } from 'react';
import { clearToken } from '../../api/client';

type PortalPage = 'proyectos' | 'nuevo';

export default function PortalLayout({
  page, onNavigate, children, userName,
}: { page: PortalPage; onNavigate: (p: PortalPage) => void; children: ReactNode; userName?: string }) {
  return (
    <div className="flex min-h-screen flex-col text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold text-indigo-400">▦ Mi Portal</span>
            <nav className="hidden gap-1 sm:flex">
              {([['proyectos', 'Mis proyectos'], ['nuevo', '+ Nuevo proyecto']] as [PortalPage, string][]).map(([id, label]) => (
                <button key={id} onClick={() => onNavigate(id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    page === id ? 'bg-indigo-600/20 text-indigo-300' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}>
                  {label}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {userName && <span className="hidden text-sm text-slate-400 sm:inline">Hola, {userName}</span>}
            <button onClick={() => { clearToken(); window.location.reload(); }}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">{children}</main>
      <footer className="border-t border-slate-800 px-4 py-3 text-center text-xs text-slate-600">
        Plataforma VPS — soporte: contacta a tu proveedor
      </footer>
    </div>
  );
}
