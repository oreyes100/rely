import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client';

interface Container {
  name: string;
  status: string;
  image: string;
}

interface DiskInfo { total: string; used: string; free: string; pct: string }
interface MemInfo  { total: string; used: string; free: string }

interface DbInfo {
  tipo: string;
  usuario?: string;
  password?: string;
  nombre?: string;
  urlConexion?: string;
  nota?: string;
}

interface ServerStatus {
  available: boolean;
  reason?: string;
  containers: Container[];
  disk: DiskInfo | null;
  mem: MemInfo | null;
  uptime: string;
  ip: string;
  vmid: number;
  url: string;
  usesSupabase: boolean;
  dbInfo: DbInfo | null;
}

interface LogData {
  ok: boolean;
  lines: string[];
  reason?: string;
}

type Tab = 'estado' | 'logs' | 'db';

export default function MiServidor({ proyectoId, url }: { proyectoId: string; url?: string }) {
  const [tab, setTab] = useState<Tab>('estado');
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<ServerStatus>(`/portal/projects/${proyectoId}/server`);
      setStatus(data);
    } catch (e) {
      setStatus({ available: false, reason: e instanceof Error ? e.message : 'Error', containers: [], disk: null, mem: null, uptime: '', ip: '', vmid: 0, url: url ?? '', usesSupabase: false, dbInfo: null });
    } finally {
      setLoading(false);
    }
  }, [proyectoId, url]);

  useEffect(() => { cargar(); }, [cargar]);

  async function reiniciar() {
    setRestarting(true);
    setRestartMsg(null);
    try {
      const r = await api<{ ok: boolean; mensaje?: string; reason?: string }>(`/portal/projects/${proyectoId}/server/restart`, { method: 'POST', body: '{}' });
      setRestartMsg(r.ok ? r.mensaje ?? 'Reiniciado' : r.reason ?? 'Error');
      if (r.ok) setTimeout(cargar, 3000);
    } catch (e) {
      setRestartMsg(e instanceof Error ? e.message : 'Error al reiniciar');
    } finally {
      setRestarting(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'estado', label: 'Estado', icon: '⬡' },
    { id: 'logs',   label: 'Registros', icon: '📋' },
    { id: 'db',     label: 'Base de datos', icon: '🗄' },
  ];

  if (loading) return <div className="py-8 text-center text-slate-500 text-sm">Conectando con tu servidor...</div>;
  if (!status?.available) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center space-y-2">
        <div className="text-3xl text-slate-600">⎕</div>
        <p className="text-slate-400">Servidor no disponible</p>
        <p className="text-xs text-slate-600">{status?.reason ?? 'El proyecto debe estar activo para gestionar el servidor'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            <span className="text-sm font-semibold text-slate-200">Servidor activo</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            VMID {status.vmid} · {status.ip} · {status.uptime}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.url && (
            <a href={status.url} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-indigo-700/50 px-3 py-1.5 text-xs text-indigo-400 hover:bg-indigo-900/20 transition-colors">
              Abrir app ↗
            </a>
          )}
          <button
            onClick={reiniciar}
            disabled={restarting}
            className="rounded-lg border border-amber-700/50 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
          >
            {restarting ? 'Reiniciando...' : '↺ Reiniciar app'}
          </button>
          <button onClick={cargar} className="text-xs text-slate-500 hover:text-slate-300">↻</button>
        </div>
      </div>

      {restartMsg && (
        <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/30 p-2 text-xs text-emerald-300">{restartMsg}</div>
      )}

      {/* Supabase notice */}
      {status.usesSupabase && !status.dbInfo && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-300 space-y-1">
          <p className="font-medium">Tu app usa Supabase</p>
          <p className="text-xs text-amber-400">Si quieres migrar a tu propia base de datos, crea un nuevo proyecto eligiendo la opción "Supabase compatible (PostgreSQL + PostgREST)".</p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? 'border border-b-transparent border-slate-700 bg-slate-900 text-indigo-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      <div className="pt-1">
        {tab === 'estado' && <EstadoTab status={status} />}
        {tab === 'logs'   && <LogsTab proyectoId={proyectoId} />}
        {tab === 'db'     && <DbTab dbInfo={status.dbInfo} usesSupabase={status.usesSupabase} />}
      </div>
    </div>
  );
}

// ── Estado ────────────────────────────────────────────────────────────────────
function EstadoTab({ status }: { status: ServerStatus }) {
  function containerBadge(s: string) {
    if (!s) return 'bg-slate-800 text-slate-500';
    if (s.toLowerCase().includes('up') || s.toLowerCase().includes('running')) return 'bg-emerald-900/40 text-emerald-300';
    if (s.toLowerCase().includes('exit') || s.toLowerCase().includes('error')) return 'bg-red-900/40 text-red-300';
    return 'bg-amber-900/40 text-amber-300';
  }

  return (
    <div className="space-y-4">
      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3">
        {status.mem && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-500 mb-1">Memoria RAM</div>
            <div className="text-xl font-bold text-slate-200">{status.mem.used} <span className="text-sm font-normal text-slate-500">/ {status.mem.total} MB</span></div>
            <BarProgress value={Number(status.mem.used)} max={Number(status.mem.total)} />
          </div>
        )}
        {status.disk && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3">
            <div className="text-xs text-slate-500 mb-1">Disco</div>
            <div className="text-xl font-bold text-slate-200">{status.disk.used} <span className="text-sm font-normal text-slate-500">/ {status.disk.total}</span></div>
            <BarProgress value={Number(status.disk.pct)} max={100} danger={Number(status.disk.pct) > 85} />
          </div>
        )}
      </div>

      {/* Contenedores */}
      <div>
        <p className="text-xs font-medium text-slate-500 mb-2">Contenedores Docker</p>
        {status.containers.length === 0 ? (
          <p className="text-sm text-slate-600">Sin contenedores detectados</p>
        ) : (
          <div className="space-y-2">
            {status.containers.map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-slate-200">{c.name || '—'}</div>
                  <div className="text-xs text-slate-600 font-mono truncate max-w-xs">{c.image || ''}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${containerBadge(c.status)}`}>
                  {c.status || 'desconocido'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BarProgress({ value, max, danger = false }: { value: number; max: number; danger?: boolean }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = danger && pct > 85 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── Logs ──────────────────────────────────────────────────────────────────────
function LogsTab({ proyectoId }: { proyectoId: string }) {
  const [data, setData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const ref = useRef<HTMLPreElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<LogData>(`/portal/projects/${proyectoId}/server/logs?lines=100`);
      setData(r);
      setTimeout(() => ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' }), 50);
    } catch (e) {
      setData({ ok: false, lines: [], reason: e instanceof Error ? e.message : 'Error' });
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, cargar]);

  function lineColor(l: string) {
    if (/error|fail|exit|crash/i.test(l)) return 'text-red-400';
    if (/warn/i.test(l)) return 'text-amber-400';
    if (/ready|started|listening|success/i.test(l)) return 'text-emerald-400';
    return 'text-slate-400';
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400">
          <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-indigo-500" />
          Auto-actualizar 5s
        </label>
        <button onClick={cargar} disabled={loading} className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">↻ Actualizar</button>
      </div>
      {!data?.ok && data?.reason && (
        <div className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-2 text-xs text-amber-300">{data.reason}</div>
      )}
      <pre ref={ref} className="h-80 overflow-y-auto rounded-xl border border-slate-800 bg-black/60 p-3 text-xs font-mono">
        {loading && !data ? (
          <span className="text-slate-600">Cargando...</span>
        ) : (data?.lines ?? []).map((l, i) => (
          <div key={i} className={lineColor(l)}>{l}</div>
        ))}
      </pre>
    </div>
  );
}

// ── Base de datos ─────────────────────────────────────────────────────────────
function DbTab({ dbInfo, usesSupabase }: { dbInfo: DbInfo | null; usesSupabase: boolean }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, k: string) {
    try { await navigator.clipboard.writeText(text); } catch { /* skip */ }
    setCopied(k);
    setTimeout(() => setCopied(null), 2000);
  }

  if (!dbInfo) {
    return (
      <div className="space-y-3">
        {usesSupabase && (
          <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/20 p-4">
            <p className="font-medium text-indigo-300 mb-2">Migrar de Supabase a tu servidor</p>
            <div className="space-y-1 text-xs text-slate-400">
              <p>Tu app usa Supabase. Para usar la base de datos en tu propio servidor:</p>
              <ol className="mt-2 space-y-1 list-decimal list-inside">
                <li>Elimina este proyecto y crea uno nuevo</li>
                <li>En "Motor de base de datos" elige <strong className="text-indigo-300">Supabase compatible (PostgreSQL + PostgREST)</strong></li>
                <li>Agrega tus migraciones SQL en el retry o mediante la consola de DB</li>
              </ol>
            </div>
          </div>
        )}
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-6 text-center text-slate-500 text-sm">
          Este proyecto no tiene base de datos configurada.
        </div>
      </div>
    );
  }

  const fields: { label: string; value: string; key: string }[] = [
    { label: 'Motor', value: dbInfo.tipo, key: 'tipo' },
    dbInfo.usuario ? { label: 'Usuario', value: dbInfo.usuario, key: 'user' } : null,
    dbInfo.password ? { label: 'Contraseña', value: dbInfo.password, key: 'pass' } : null,
    dbInfo.nombre ? { label: 'Base de datos', value: dbInfo.nombre, key: 'db' } : null,
    dbInfo.urlConexion ? { label: 'URL de conexión', value: dbInfo.urlConexion, key: 'url' } : null,
  ].filter(Boolean) as { label: string; value: string; key: string }[];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-2">
        <p className="text-xs font-medium text-slate-400 mb-3">Credenciales de base de datos</p>
        {fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
            <div>
              <div className="text-xs text-slate-500">{f.label}</div>
              <div className="font-mono text-sm text-slate-200 break-all">{f.value}</div>
            </div>
            {f.key !== 'tipo' && (
              <button onClick={() => copy(f.value, f.key)} className="shrink-0 ml-2 text-xs text-indigo-400 hover:text-indigo-300">
                {copied === f.key ? '✓' : 'Copiar'}
              </button>
            )}
          </div>
        ))}
      </div>
      {dbInfo.nota && <p className="text-xs text-slate-600 px-1">{dbInfo.nota}</p>}
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-xs text-slate-500">
        La base de datos solo es accesible desde tu aplicación (red interna del servidor). No está expuesta a internet.
      </div>
    </div>
  );
}
