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

interface CustomDomain {
  fqdn: string;
  addedAt: string;
  certStatus: 'self-signed' | 'valid' | 'error';
  status: 'active' | 'pending';
}

interface ServerStatus {
  available: boolean;
  reason?: string;
  deployFailed?: boolean;
  containers: Container[];
  disk: DiskInfo | null;
  mem: MemInfo | null;
  uptime: string;
  ip: string;
  vmid: number;
  url: string;
  usesSupabase: boolean;
  dbInfo: DbInfo | null;
  sshUser: string | null;
  sshPassword: string | null;
  sshHost: string | null;
  sshPort: number;
  vpsOnly: boolean;
  customDomains: CustomDomain[];
}

interface LogData {
  ok: boolean;
  lines: string[];
  reason?: string;
}

type Tab = 'estado' | 'logs' | 'db' | 'ssh' | 'dominios';

export default function MiServidor({ proyectoId, url }: { proyectoId: string; url?: string }) {
  const [tab, setTab] = useState<Tab>('estado');
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [restartMsg, setRestartMsg] = useState<string | null>(null);

  const tabInicial = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const data = await api<ServerStatus>(`/portal/projects/${proyectoId}/server`);
      setStatus(data);
      // Primera carga: si es vps-only o el deploy falló, ir directo a la pestaña SSH
      if (!tabInicial.current && (data.vpsOnly || data.deployFailed)) {
        tabInicial.current = true;
        setTab('ssh');
      }
    } catch (e) {
      setStatus({ available: false, reason: e instanceof Error ? e.message : 'Error', containers: [], disk: null, mem: null, uptime: '', ip: '', vmid: 0, url: url ?? '', usesSupabase: false, dbInfo: null, sshUser: null, sshPassword: null, sshHost: null, sshPort: 22, vpsOnly: false, customDomains: [] });
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
    ...(!status?.vpsOnly ? [{ id: 'logs' as Tab, label: 'Registros', icon: '📋' }] : []),
    ...(!status?.vpsOnly ? [{ id: 'db' as Tab, label: 'Base de datos', icon: '🗄' }] : []),
    { id: 'ssh', label: 'Acceso SSH', icon: '🔑' },
    ...(!status?.vpsOnly && !status?.deployFailed ? [{ id: 'dominios' as Tab, label: 'Dominios', icon: '🌐' }] : []),
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
            <span className={`h-2 w-2 rounded-full ${status.deployFailed ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            <span className="text-sm font-semibold text-slate-200">
              {status.deployFailed ? 'Servidor en modo manual' : 'Servidor activo'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            VMID {status.vmid} · {status.ip} · {status.uptime}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.url && !status.deployFailed && (
            <a href={status.url} target="_blank" rel="noopener noreferrer"
              className="rounded-lg border border-indigo-700/50 px-3 py-1.5 text-xs text-indigo-400 hover:bg-indigo-900/20 transition-colors">
              Abrir app ↗
            </a>
          )}
          {!status.deployFailed && !status.vpsOnly && (
            <button
              onClick={reiniciar}
              disabled={restarting}
              className="rounded-lg border border-amber-700/50 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
            >
              {restarting ? 'Reiniciando...' : '↺ Reiniciar app'}
            </button>
          )}
          <button onClick={cargar} className="text-xs text-slate-500 hover:text-slate-300">↻</button>
        </div>
      </div>

      {status.deployFailed && (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3 text-sm space-y-1">
          <p className="font-medium text-amber-300">El despliegue automático falló — tu servidor sigue vivo</p>
          <p className="text-xs text-amber-400/80">
            Puedes conectarte por SSH con las credenciales de la pestaña "Acceso SSH" y subir tu proyecto manualmente,
            o volver a "Mis proyectos" y usar "Reintentar despliegue".
          </p>
        </div>
      )}

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
        {tab === 'estado'   && <EstadoTab status={status} />}
        {tab === 'logs'     && <LogsTab proyectoId={proyectoId} />}
        {tab === 'db'       && <DbTab proyectoId={proyectoId} dbInfo={status.dbInfo} usesSupabase={status.usesSupabase} onRotate={cargar} />}
        {tab === 'ssh'      && <SshTab proyectoId={proyectoId} status={status} onRotate={cargar} />}
        {tab === 'dominios' && <DominiosTab proyectoId={proyectoId} domains={status.customDomains} onRefresh={cargar} />}
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

// ── Helper fila de credencial ─────────────────────────────────────────────────
function CredRow({ label, value, secret = false }: { label: string; value: string; secret?: boolean }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); } catch { /* skip */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="flex items-center gap-2 py-2 border-b border-slate-700/40 last:border-0">
      <span className="text-xs text-slate-500 w-28 shrink-0">{label}</span>
      <span className="font-mono text-xs text-slate-200 flex-1 break-all select-all">
        {secret && !revealed ? '••••••••••••' : value}
      </span>
      {secret && (
        <button onClick={() => setRevealed(v => !v)} className="text-[10px] text-slate-500 hover:text-slate-300 shrink-0">
          {revealed ? 'Ocultar' : 'Ver'}
        </button>
      )}
      <button onClick={copy} className="text-[10px] text-indigo-400 hover:text-indigo-300 shrink-0 w-12 text-right">
        {copied ? '✓ Copiado' : 'Copiar'}
      </button>
    </div>
  );
}

// ── Base de datos ─────────────────────────────────────────────────────────────
function DbTab({ proyectoId, dbInfo, usesSupabase, onRotate }: {
  proyectoId: string;
  dbInfo: DbInfo | null;
  usesSupabase: boolean;
  onRotate: () => void;
}) {
  const [rotating, setRotating] = useState(false);
  const [rotateMsg, setRotateMsg] = useState<string | null>(null);
  const [localDb, setLocalDb] = useState<DbInfo | null>(dbInfo);

  async function handleRotate() {
    setRotating(true);
    setRotateMsg(null);
    try {
      const r = await api<{ ok: boolean; dbInfo: DbInfo }>(`/portal/projects/${proyectoId}/rotate-db`, { method: 'POST', body: '{}' });
      if (r.ok) { setLocalDb(r.dbInfo); setRotateMsg('Contraseña rotada con éxito'); onRotate(); }
    } catch (e: any) {
      setRotateMsg(`Error: ${e.message ?? 'No se pudo rotar la contraseña'}`);
    } finally {
      setRotating(false);
    }
  }

  const db = localDb ?? dbInfo;

  if (!db) {
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

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <p className="text-xs font-medium text-slate-400 mb-2">Credenciales · {db.tipo}</p>
        {db.usuario && <CredRow label="Usuario" value={db.usuario} />}
        {db.password && <CredRow label="Contraseña" value={db.password} secret />}
        {db.nombre && <CredRow label="Base de datos" value={db.nombre} />}
        {db.urlConexion && <CredRow label="URL interna" value={db.urlConexion} secret />}
      </div>
      {db.nota && <p className="text-xs text-slate-600 px-1">{db.nota}</p>}
      <div className="flex items-center gap-3">
        <button
          onClick={handleRotate}
          disabled={rotating}
          className="text-xs rounded-lg border border-amber-700/50 px-3 py-1.5 text-amber-400 hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
        >
          {rotating ? 'Rotando...' : '↺ Rotar contraseña'}
        </button>
        {rotateMsg && <span className={`text-xs ${rotateMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{rotateMsg}</span>}
      </div>
      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-xs text-slate-500">
        La BD está accesible internamente desde tu app. Si elegiste "Solo BD", también tienes acceso externo vía SSH.
      </div>
    </div>
  );
}

// ── Acceso SSH ────────────────────────────────────────────────────────────────
function SshTab({ proyectoId, status, onRotate }: { proyectoId: string; status: ServerStatus; onRotate: () => void }) {
  const [rotating, setRotating] = useState(false);
  const [rotateMsg, setRotateMsg] = useState<string | null>(null);
  const [localSsh, setLocalSsh] = useState<{ sshUser: string; sshPassword: string; sshHost: string | null; sshPort: number } | null>(null);

  async function handleRotateSsh() {
    setRotating(true);
    setRotateMsg(null);
    try {
      const r = await api<{ ok: boolean; ssh: { sshUser: string; sshPassword: string; sshHost: string | null; sshPort: number } }>(
        `/portal/projects/${proyectoId}/rotate-ssh`, { method: 'POST', body: '{}' }
      );
      if (r.ok) { setLocalSsh(r.ssh); setRotateMsg('Contraseña SSH actualizada'); onRotate(); }
    } catch (e) {
      setRotateMsg(`Error: ${e instanceof Error ? e.message : 'No se pudo rotar la contraseña SSH'}`);
    } finally {
      setRotating(false);
    }
  }

  const sshUser = localSsh?.sshUser ?? status.sshUser;
  const sshPassword = localSsh?.sshPassword ?? status.sshPassword;
  const sshHost = localSsh?.sshHost ?? status.sshHost;
  const sshPort = localSsh?.sshPort ?? status.sshPort;

  if (!sshUser || !sshHost) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-6 text-center space-y-3">
        <p className="text-slate-500 text-sm">Las credenciales SSH no están registradas para este proyecto.</p>
        <button
          onClick={handleRotateSsh}
          disabled={rotating}
          className="rounded-lg border border-indigo-700/50 px-4 py-2 text-xs text-indigo-400 hover:bg-indigo-900/20 disabled:opacity-50 transition-colors"
        >
          {rotating ? 'Generando...' : '🔑 Generar credenciales SSH'}
        </button>
        {rotateMsg && <p className={`text-xs ${rotateMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{rotateMsg}</p>}
      </div>
    );
  }

  const sshCmd = `ssh ${sshUser}@${sshHost}${sshPort !== 22 ? ` -p ${sshPort}` : ''}`;
  const scpExample = `scp -r ./mi-proyecto ${sshUser}@${sshHost}:/opt/app/`;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <p className="text-xs font-medium text-slate-400 mb-2">Credenciales de acceso SSH</p>
        <CredRow label="Host / IP" value={sshHost} />
        <CredRow label="Puerto" value={String(sshPort ?? 22)} />
        <CredRow label="Usuario" value={sshUser} />
        {sshPassword && <CredRow label="Contraseña" value={sshPassword} secret />}
        <CredRow label="Comando SSH" value={sshCmd} />
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-700/40">
          <button
            onClick={handleRotateSsh}
            disabled={rotating}
            className="text-xs rounded-lg border border-amber-700/50 px-3 py-1.5 text-amber-400 hover:bg-amber-900/20 disabled:opacity-50 transition-colors"
          >
            {rotating ? 'Rotando...' : sshPassword ? '↺ Rotar contraseña SSH' : '🔑 Generar contraseña SSH'}
          </button>
          {rotateMsg && <span className={`text-xs ${rotateMsg.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>{rotateMsg}</span>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-300">Cómo desplegar tu proyecto vía SSH</p>
        <div className="space-y-2 text-xs text-slate-400">
          <p>1. Conéctate a tu servidor:</p>
          <pre className="bg-black/50 rounded-lg p-2 font-mono text-emerald-400 text-[11px] overflow-x-auto">{sshCmd}</pre>
          <p>2. Sube tu proyecto con SCP:</p>
          <pre className="bg-black/50 rounded-lg p-2 font-mono text-emerald-400 text-[11px] overflow-x-auto">{scpExample}</pre>
          <p>3. Dentro del servidor, instala Docker y levanta tu app con <code className="text-slate-300">docker compose up -d</code></p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-800/30 bg-amber-950/20 p-3 text-xs text-amber-300/80">
        Guarda estas credenciales de forma segura. Solo aparecen aquí — no se enviarán por email.
      </div>
    </div>
  );
}

// ── Dominios personalizados ───────────────────────────────────────────────────
function DominiosTab({ proyectoId, domains, onRefresh }: {
  proyectoId: string;
  domains: CustomDomain[];
  onRefresh: () => void;
}) {
  const [list, setList] = useState<CustomDomain[]>(domains);
  const [fqdn, setFqdn] = useState('');
  const [adding, setAdding] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [sslStatus, setSslStatus] = useState<Record<string, string>>({});

  async function handleAdd() {
    const d = fqdn.trim().toLowerCase();
    if (!d) return;
    setAdding(true);
    setAddMsg(null);
    try {
      const r = await api<{ ok: boolean; domain: CustomDomain }>(`/portal/projects/${proyectoId}/domains`, {
        method: 'POST',
        body: JSON.stringify({ fqdn: d }),
      });
      if (r.ok) { setList(l => [...l, r.domain]); setFqdn(''); onRefresh(); }
    } catch (e: any) {
      setAddMsg(e.message ?? 'Error al agregar dominio');
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(domain: string) {
    try {
      await api(`/portal/projects/${proyectoId}/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });
      setList(l => l.filter(d => d.fqdn !== domain));
      onRefresh();
    } catch (e: any) {
      setSslStatus(s => ({ ...s, [domain]: `Error: ${e.message}` }));
    }
  }

  async function handleSsl(domain: string) {
    setSslStatus(s => ({ ...s, [domain]: 'Activando SSL...' }));
    try {
      await api(`/portal/projects/${proyectoId}/domains/${encodeURIComponent(domain)}/ssl`, { method: 'POST', body: '{}' });
      setList(l => l.map(d => d.fqdn === domain ? { ...d, certStatus: 'valid' } : d));
      setSslStatus(s => ({ ...s, [domain]: 'SSL activado' }));
      onRefresh();
    } catch (e: any) {
      setSslStatus(s => ({ ...s, [domain]: `Error: ${e.message}` }));
    }
  }

  return (
    <div className="space-y-4">
      {/* Instrucciones DNS */}
      <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/20 p-4 text-xs text-slate-400 space-y-1">
        <p className="font-semibold text-indigo-300 mb-2">Cómo conectar tu dominio</p>
        <p>1. En tu proveedor de DNS, crea un registro tipo <strong className="text-slate-200">A</strong> apuntando a:</p>
        <pre className="bg-black/40 rounded p-2 font-mono text-emerald-400">207.248.113.8</pre>
        <p>2. Agrega el dominio aquí. Se configurará automáticamente con un certificado temporal.</p>
        <p>3. Una vez que el DNS propague (5–60 min), pulsa <strong className="text-slate-200">Activar SSL</strong> para obtener el certificado real.</p>
      </div>

      {/* Lista de dominios */}
      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((d) => (
            <div key={d.fqdn} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2">
              <span className="font-mono text-sm text-slate-200 flex-1 min-w-0 break-all">{d.fqdn}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${
                d.certStatus === 'valid' ? 'bg-emerald-900/40 text-emerald-300' :
                d.certStatus === 'error' ? 'bg-red-900/40 text-red-300' :
                'bg-amber-900/40 text-amber-300'
              }`}>
                {d.certStatus === 'valid' ? 'SSL activo' : d.certStatus === 'error' ? 'Error SSL' : 'Cert temporal'}
              </span>
              {d.certStatus !== 'valid' && (
                <button
                  onClick={() => handleSsl(d.fqdn)}
                  disabled={sslStatus[d.fqdn] === 'Activando SSL...'}
                  className="text-[10px] rounded border border-indigo-700/50 px-2 py-0.5 text-indigo-400 hover:bg-indigo-900/20 disabled:opacity-50 shrink-0"
                >
                  {sslStatus[d.fqdn] === 'Activando SSL...' ? 'Activando...' : 'Activar SSL'}
                </button>
              )}
              {sslStatus[d.fqdn] && sslStatus[d.fqdn] !== 'Activando SSL...' && (
                <span className={`text-[10px] shrink-0 ${sslStatus[d.fqdn].startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                  {sslStatus[d.fqdn]}
                </span>
              )}
              <button
                onClick={() => handleRemove(d.fqdn)}
                className="text-[10px] text-slate-600 hover:text-red-400 shrink-0 ml-1"
                title="Eliminar dominio"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Formulario agregar */}
      {list.length < 5 && (
        <div className="flex gap-2 items-start">
          <input
            type="text"
            value={fqdn}
            onChange={(e) => setFqdn(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="mi-dominio.com"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-600 focus:border-indigo-500 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !fqdn.trim()}
            className="rounded-lg border border-indigo-700/50 px-3 py-1.5 text-xs text-indigo-400 hover:bg-indigo-900/20 disabled:opacity-50 transition-colors shrink-0"
          >
            {adding ? 'Agregando...' : 'Agregar'}
          </button>
        </div>
      )}
      {addMsg && <p className="text-xs text-red-400">{addMsg}</p>}
      {list.length >= 5 && (
        <p className="text-xs text-slate-600">Máximo 5 dominios por proyecto.</p>
      )}
    </div>
  );
}
