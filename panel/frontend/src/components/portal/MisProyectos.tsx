import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client';
import type { ProyectoPortal } from '../../api/types';
import ProgresoDeploy from './ProgresoDeploy';

const ESTADO_BADGE: Record<ProyectoPortal['estado'], string> = {
  activo: 'bg-emerald-800/40 text-emerald-300',
  'en progreso': 'bg-indigo-800/40 text-indigo-300',
  error: 'bg-red-800/40 text-red-300',
  eliminado: 'bg-slate-800 text-slate-500',
};

interface ProyectoResumen { id: string; nombre: string; url?: string; estado: string }
export default function MisProyectos({ onNuevo, onGestionarServidor }: { onNuevo: () => void; onGestionarServidor?: (p: ProyectoResumen) => void }) {
  const [proyectos, setProyectos] = useState<ProyectoPortal[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryVars, setRetryVars] = useState('');

  const cargar = useCallback(async () => {
    try {
      const data = await api<ProyectoPortal[]>('/portal/projects');
      setProyectos(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando proyectos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Polling para proyectos en progreso
  useEffect(() => {
    const enProgreso = proyectos.some((p) => p.estado === 'en progreso');
    if (!enProgreso) return;
    const t = setTimeout(cargar, 4000);
    return () => clearTimeout(t);
  }, [proyectos, cargar]);

  async function reintentar(id: string) {
    setRetrying(id);
    try {
      await api(`/portal/projects/${id}/retry`, {
        method: 'POST',
        body: JSON.stringify({ variables: retryVars.trim() || undefined }),
      });
      setRetryVars('');
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al reintentar');
    } finally {
      setRetrying(null);
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este proyecto? Esta acción no se puede deshacer.')) return;
    setDeleting(id);
    try {
      await api(`/portal/projects/${id}`, { method: 'DELETE' });
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al eliminar');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <div className="text-center py-16 text-slate-500">Cargando proyectos…</div>;
  if (error) return <div className="text-center py-16 text-red-400">{error}</div>;

  if (proyectos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <div className="text-4xl">🚀</div>
        <p className="text-slate-300 font-medium">Aún no tienes proyectos</p>
        <p className="text-slate-500 text-sm max-w-sm">Crea tu primer sitio web o aplicación. Solo necesitas un nombre y elegir cómo desplegar.</p>
        <button onClick={onNuevo} className="btn-primary mt-2">Crear mi primer proyecto</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-100">Mis proyectos</h2>
        <button onClick={onNuevo} className="btn-primary text-sm">+ Nuevo proyecto</button>
      </div>

      <div className="space-y-3">
        {proyectos.map((p) => (
          <div key={p.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-slate-100 font-medium">{p.nombre}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_BADGE[p.estado]}`}>
                    {p.estado === 'en progreso' ? 'Desplegando…' : p.estado}
                  </span>
                </div>
                {p.url && p.estado === 'activo' && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer"
                    className="mt-1 block text-sm text-indigo-400 hover:text-indigo-300 truncate">
                    {p.url}
                  </a>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Creado {new Date(p.creadoEl).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {p.estado === 'activo' && onGestionarServidor && (
                  <button onClick={() => onGestionarServidor({ id: p.id, nombre: p.nombre, url: p.url, estado: p.estado })}
                    className="rounded-lg px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/20 transition-colors">
                    ⬡ Mi servidor
                  </button>
                )}
                {p.estado === 'error' && onGestionarServidor && (
                  <button onClick={() => onGestionarServidor({ id: p.id, nombre: p.nombre, url: p.url, estado: p.estado })}
                    className="rounded-lg border border-indigo-700/50 px-3 py-1.5 text-xs text-indigo-400 hover:text-indigo-300 hover:bg-indigo-900/20 transition-colors">
                    🔑 Implementación manual
                  </button>
                )}
                <button onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
                  {expandido === p.id ? 'Ocultar' : 'Detalles'}
                </button>
                {p.estado === 'error' && (
                  <button onClick={() => reintentar(p.id)} disabled={retrying === p.id}
                    className="rounded-lg px-3 py-1.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 transition-colors disabled:opacity-50">
                    {retrying === p.id ? '…' : 'Reintentar'}
                  </button>
                )}
                {(p.estado === 'activo' || p.estado === 'error') && (
                  <button onClick={() => eliminar(p.id)} disabled={deleting === p.id}
                    className="rounded-lg px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors disabled:opacity-50">
                    {deleting === p.id ? '…' : 'Eliminar'}
                  </button>
                )}
              </div>
            </div>
            {expandido === p.id && (
              <div className="mt-4 border-t border-slate-700 pt-4 space-y-4">
                <ProgresoDeploy proyecto={p} />
                {p.estado === 'error' && (
                  <div className="rounded-lg border border-amber-800/40 bg-amber-900/10 p-3 space-y-2">
                    <p className="text-xs font-medium text-amber-300">
                      ¿Tu app necesita variables de entorno? (Supabase, Stripe, APIs externas…)
                    </p>
                    <textarea className="input resize-none font-mono text-xs" rows={3} value={retryVars}
                      onChange={(e) => setRetryVars(e.target.value)}
                      placeholder={'NOMBRE=valor (una por línea)\nNEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co'} />
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={() => reintentar(p.id)} disabled={retrying === p.id}
                        className="btn-primary text-xs disabled:opacity-50">
                        {retrying === p.id ? 'Reintentando…' : 'Reintentar despliegue'}
                      </button>
                      {onGestionarServidor && (
                        <button onClick={() => onGestionarServidor({ id: p.id, nombre: p.nombre, url: p.url, estado: p.estado })}
                          className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2">
                          o impleméntalo tú mismo vía SSH →
                        </button>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Tu servidor sigue creado aunque el despliegue automático haya fallado: puedes conectarte por SSH y subir tu proyecto manualmente.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
