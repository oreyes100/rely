import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface DeployStep {
  name: string;
  label: string;
  status: 'pending' | 'running' | 'ok' | 'error';
  detail: string;
  startedAt: string | null;
  elapsedMs: number | null;
}

interface Deploy {
  id: string;
  hostname: string;
  clientId: string | null;
  node: string;
  vmid: number | null;
  guestIP: string | null;
  wanPort: number | null;
  status: string;
  plan: string;
  steps: DeployStep[];
  createdAt: string;
  updatedAt: string;
}

function fmtMs(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m ${sec}s`;
}

function stepColor(status: string) {
  if (status === 'ok') return 'text-emerald-400';
  if (status === 'error') return 'text-red-400';
  if (status === 'running') return 'text-indigo-300';
  return 'text-slate-600';
}

function stepIcon(status: string) {
  if (status === 'ok') return '✓';
  if (status === 'error') return '✗';
  if (status === 'running') return '◌';
  return '·';
}

export default function AdminTools() {
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<'todos' | 'running' | 'error' | 'done'>('todos');

  const cargar = useCallback(async () => {
    try {
      const data = await api<Deploy[]>('/deploys');
      setDeploys(data.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-refresh para deploys en progreso
  useEffect(() => {
    const hayRunning = deploys.some((d) => d.status === 'running');
    if (!hayRunning) return;
    const t = setTimeout(cargar, 5000);
    return () => clearTimeout(t);
  }, [deploys, cargar]);

  async function kill(id: string) {
    if (!confirm('¿Terminar este deploy? Se marcará como error. La VM puede quedar huérfana en Proxmox (elimínala manualmente si es necesario).')) return;
    setActioning(id);
    try {
      await api(`/deploys/${id}/kill`, { method: 'POST' });
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setActioning(null);
    }
  }

  async function retry(id: string) {
    setActioning(id);
    try {
      await api(`/deploys/${id}/retry`, { method: 'POST' });
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setActioning(null);
    }
  }

  async function eliminar(id: string) {
    if (!confirm('¿Eliminar este deploy? Se destruirá la VM en Proxmox.')) return;
    setActioning(id);
    try {
      await api(`/deploys/${id}`, { method: 'DELETE' });
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setActioning(null);
    }
  }

  const filtered = deploys.filter((d) => filtro === 'todos' || d.status === filtro);
  const running = deploys.filter((d) => d.status === 'running');
  const errors = deploys.filter((d) => d.status === 'error');

  if (loading) return <div className="text-slate-500 py-8 text-center">Cargando deploys…</div>;

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'En progreso', val: running.length, color: 'text-indigo-300', pulse: running.length > 0 },
          { label: 'Con error', val: errors.length, color: 'text-red-400', pulse: false },
          { label: 'Completados', val: deploys.filter((d) => d.status === 'done').length, color: 'text-emerald-400', pulse: false },
          { label: 'Total', val: deploys.length, color: 'text-slate-300', pulse: false },
        ].map((s) => (
          <div key={s.label} className="card text-center">
            <div className={`text-2xl font-bold ${s.color} flex items-center justify-center gap-1`}>
              {s.pulse && <span className="inline-block h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />}
              {s.val}
            </div>
            <div className="text-xs text-slate-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filtro */}
      <div className="flex gap-2 flex-wrap">
        {(['todos', 'running', 'error', 'done'] as const).map((f) => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filtro === f ? 'bg-indigo-600/30 text-indigo-300' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}>
            {f === 'todos' ? 'Todos' : f === 'running' ? 'En progreso' : f === 'error' ? 'Error' : 'Completados'}
          </button>
        ))}
        <button onClick={cargar} className="ml-auto rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400 hover:text-slate-200 transition-colors">
          ↻ Actualizar
        </button>
      </div>

      {/* Lista de deploys */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="text-center text-slate-500 py-8">Sin deploys en esta categoría</div>
        )}
        {filtered.map((d) => {
          const nonPending = d.steps.filter((s) => s.status !== 'pending');
          const currentStep = d.steps.find((s) => s.status === 'running') ?? nonPending[nonPending.length - 1];
          const totalMs = d.steps.reduce((acc, s) => acc + (s.elapsedMs ?? 0), 0);
          const errorStep = d.steps.find((s) => s.status === 'error');

          return (
            <div key={d.id} className="card">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-medium text-slate-100">{d.hostname}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      d.status === 'running' ? 'bg-indigo-800/40 text-indigo-300' :
                      d.status === 'error' ? 'bg-red-800/40 text-red-300' :
                      d.status === 'done' ? 'bg-emerald-800/40 text-emerald-300' :
                      'bg-slate-700 text-slate-400'
                    }`}>
                      {d.status === 'running' ? 'Desplegando…' : d.status}
                    </span>
                    <span className="text-xs text-slate-500">{d.plan}</span>
                    {d.vmid && <span className="text-xs text-slate-500">VMID {d.vmid}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                    {d.clientId && <span>Cliente: {d.clientId.slice(0, 8)}…</span>}
                    {d.node && <span>Nodo: {d.node}</span>}
                    {d.guestIP && <span>IP: {d.guestIP}</span>}
                    {totalMs > 0 && <span>Tiempo total: {fmtMs(totalMs)}</span>}
                    <span>Actualizado: {new Date(d.updatedAt).toLocaleTimeString('es-MX')}</span>
                  </div>
                  {currentStep && (
                    <div className={`mt-1 text-xs ${stepColor(currentStep.status)}`}>
                      {stepIcon(currentStep.status)} {currentStep.label}
                      {currentStep.elapsedMs != null && ` (${fmtMs(currentStep.elapsedMs)})`}
                      {currentStep.status === 'running' && ' — en progreso…'}
                    </div>
                  )}
                  {errorStep && errorStep.detail && (
                    <div className="mt-1 text-xs text-red-400 font-mono truncate max-w-lg" title={errorStep.detail}>
                      ✗ {errorStep.detail}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2 flex-wrap">
                  <button onClick={() => setExpandido(expandido === d.id ? null : d.id)}
                    className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors">
                    {expandido === d.id ? 'Ocultar' : 'Pasos'}
                  </button>
                  {d.status === 'running' && (
                    <button onClick={() => kill(d.id)} disabled={actioning === d.id}
                      className="rounded-lg px-3 py-1.5 text-xs text-orange-400 hover:text-orange-300 hover:bg-orange-900/20 transition-colors disabled:opacity-50">
                      {actioning === d.id ? '…' : '⏹ Terminar'}
                    </button>
                  )}
                  {d.status === 'error' && (
                    <button onClick={() => retry(d.id)} disabled={actioning === d.id}
                      className="rounded-lg px-3 py-1.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 transition-colors disabled:opacity-50">
                      {actioning === d.id ? '…' : '↺ Retry'}
                    </button>
                  )}
                  {(d.status === 'error' || d.status === 'done' || d.status === 'deleted') && (
                    <button onClick={() => eliminar(d.id)} disabled={actioning === d.id}
                      className="rounded-lg px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors disabled:opacity-50">
                      {actioning === d.id ? '…' : '🗑 Eliminar'}
                    </button>
                  )}
                </div>
              </div>

              {/* Desglose de pasos con tiempos */}
              {expandido === d.id && (
                <div className="mt-4 border-t border-slate-700 pt-4">
                  <div className="grid gap-1">
                    {d.steps.map((s) => (
                      <div key={s.name} className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
                        s.status === 'running' ? 'bg-indigo-900/20' : ''
                      }`}>
                        <span className={`w-4 text-center font-bold ${stepColor(s.status)}`}>{stepIcon(s.status)}</span>
                        <span className={`w-40 shrink-0 ${s.status === 'pending' ? 'text-slate-600' : 'text-slate-300'}`}>{s.label}</span>
                        <span className="text-slate-500 w-12 shrink-0 text-right">{fmtMs(s.elapsedMs)}</span>
                        {s.status === 'error' && s.detail && (
                          <span className="text-red-400 truncate font-mono" title={s.detail}>{s.detail}</span>
                        )}
                        {s.status === 'running' && (
                          <span className="text-indigo-400 animate-pulse">en progreso…</span>
                        )}
                        {s.status === 'ok' && s.detail && (
                          <span className="text-slate-500">{s.detail}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {totalMs > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
                      <span>Tiempo total registrado</span>
                      <span className="font-mono">{fmtMs(totalMs)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
