import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api/client';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Service {
  name: string;
  active: string;   // 'active' | 'inactive' | 'failed' | ...
  enabled: string;  // 'enabled' | 'disabled' | 'static'
  running: boolean;
}

interface Cert {
  domain: string;
  file: string;
  expiry: string | null;
  daysLeft: number | null;
}

interface Vhost {
  name: string;
  enabled: boolean;
}

interface SysInfo {
  uptime: string;
  kernel: string;
  hostname: string;
}

type Tab = 'servicios' | 'ssl' | 'dominios' | 'logs';

// ── Helpers ───────────────────────────────────────────────────────────────────
const SERVICE_LABELS: Record<string, string> = {
  nginx: 'Nginx',
  'vps-panel': 'Panel VPS',
  mariadb: 'MariaDB',
  mysql: 'MySQL',
  postgresql: 'PostgreSQL',
  'redis-server': 'Redis',
  fossbilling: 'FossBilling',
};

const SERVICE_ICONS: Record<string, string> = {
  nginx: '🌐',
  'vps-panel': '▦',
  mariadb: '🗄',
  mysql: '🗄',
  postgresql: '🐘',
  'redis-server': '⚡',
  fossbilling: '🧾',
};

function statusBadge(active: string) {
  if (active === 'active') return 'bg-emerald-900/40 text-emerald-300 border-emerald-800/40';
  if (active === 'failed') return 'bg-red-900/40 text-red-300 border-red-800/40';
  if (active === 'activating') return 'bg-amber-900/40 text-amber-300 border-amber-800/40';
  return 'bg-slate-800 text-slate-400 border-slate-700';
}

function certColor(days: number | null) {
  if (days === null) return 'text-slate-400';
  if (days <= 7)  return 'text-red-400';
  if (days <= 30) return 'text-amber-400';
  return 'text-emerald-400';
}

function certBadge(days: number | null) {
  if (days === null) return 'bg-slate-800 text-slate-400';
  if (days <= 7)  return 'bg-red-900/40 text-red-300';
  if (days <= 30) return 'bg-amber-900/40 text-amber-300';
  return 'bg-emerald-900/40 text-emerald-300';
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ServerManager() {
  const [tab, setTab] = useState<Tab>('servicios');
  const [sysInfo, setSysInfo] = useState<SysInfo | null>(null);

  useEffect(() => {
    api<SysInfo>('/sysadmin/system').then(setSysInfo).catch(() => {});
  }, []);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'servicios', label: 'Servicios', icon: '⚙' },
    { id: 'ssl',       label: 'SSL / Certs', icon: '🔒' },
    { id: 'dominios',  label: 'Dominios nginx', icon: '🌐' },
    { id: 'logs',      label: 'Registros', icon: '📋' },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Administración del servidor</h2>
          {sysInfo && (
            <p className="text-xs text-slate-500">
              {sysInfo.hostname} · Kernel {sysInfo.kernel} · {sysInfo.uptime}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Conectado
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-800 pb-0">
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

      {/* Content */}
      <div className="pt-2">
        {tab === 'servicios' && <ServicesPanel />}
        {tab === 'ssl'       && <CertsPanel />}
        {tab === 'dominios'  && <VhostsPanel />}
        {tab === 'logs'      && <LogsPanel />}
      </div>
    </div>
  );
}

// ── Servicios ─────────────────────────────────────────────────────────────────
function ServicesPanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ name: string; msg: string; ok: boolean } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<Service[]>('/sysadmin/services');
      setServices(data);
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function doAction(name: string, action: string) {
    setActing(`${name}:${action}`);
    setActionResult(null);
    try {
      const r = await api<{ ok: boolean; output: string }>(`/sysadmin/services/${name}/action`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setActionResult({ name, msg: r.output || action + ' exitoso', ok: true });
      await cargar();
    } catch (e) {
      setActionResult({ name, msg: e instanceof Error ? e.message : 'Error', ok: false });
    } finally {
      setActing(null);
    }
  }

  if (loading) return <LoadingDots />;

  return (
    <div className="space-y-3">
      {actionResult && (
        <div className={`rounded-lg border p-3 text-sm ${actionResult.ok ? 'border-emerald-800/40 bg-emerald-950/30 text-emerald-300' : 'border-red-800/40 bg-red-950/30 text-red-300'}`}>
          <span className="font-medium">{actionResult.name}:</span> {actionResult.msg}
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={cargar} className="text-xs text-slate-500 hover:text-slate-300">↻ Actualizar</button>
      </div>

      <div className="space-y-2">
        {services.map((svc) => {
          const isActing = acting?.startsWith(svc.name + ':');
          return (
            <div key={svc.name} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl shrink-0">{SERVICE_ICONS[svc.name] ?? '⚙'}</span>
                <div className="min-w-0">
                  <div className="font-medium text-slate-200">{SERVICE_LABELS[svc.name] ?? svc.name}</div>
                  <div className="text-xs text-slate-500 font-mono">{svc.name}</div>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(svc.active)}`}>
                  {svc.active}
                </span>
                <span className="shrink-0 text-xs text-slate-600">{svc.enabled}</span>
              </div>

              <div className="flex gap-2 shrink-0">
                {svc.running ? (
                  <>
                    <ActionBtn label="Reiniciar" onClick={() => doAction(svc.name, 'restart')} loading={isActing && acting === svc.name + ':restart'} color="amber" />
                    {svc.name === 'nginx' && (
                      <ActionBtn label="Recargar" onClick={() => doAction(svc.name, 'reload')} loading={isActing && acting === svc.name + ':reload'} color="indigo" />
                    )}
                    <ActionBtn label="Detener" onClick={() => doAction(svc.name, 'stop')} loading={isActing && acting === svc.name + ':stop'} color="red" />
                  </>
                ) : (
                  <ActionBtn label="Iniciar" onClick={() => doAction(svc.name, 'start')} loading={isActing} color="emerald" />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
        <NginxTest />
      </div>
    </div>
  );
}

function NginxTest() {
  const [result, setResult] = useState<{ ok: boolean; output: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function test() {
    setLoading(true);
    try {
      const r = await api<{ ok: boolean; output: string }>('/sysadmin/nginx/test', { method: 'POST', body: '{}' });
      setResult(r);
    } catch (e) {
      setResult({ ok: false, output: e instanceof Error ? e.message : 'Error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-400">Verificar configuración nginx</span>
        <button onClick={test} disabled={loading} className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50">
          {loading ? 'Verificando...' : 'nginx -t'}
        </button>
      </div>
      {result && (
        <pre className={`rounded-lg p-2 text-xs font-mono ${result.ok ? 'bg-emerald-950/30 text-emerald-300' : 'bg-red-950/30 text-red-300'}`}>
          {result.output}
        </pre>
      )}
    </div>
  );
}

// ── SSL Certs ─────────────────────────────────────────────────────────────────
function CertsPanel() {
  const [certs, setCerts] = useState<Cert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Cert[]>('/sysadmin/certs')
      .then(setCerts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingDots />;

  if (certs.length === 0) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center text-slate-500">
        No se encontraron certificados en /etc/nginx/ssl ni /etc/letsencrypt/live
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {certs.filter((c) => c.daysLeft !== null && c.daysLeft <= 30).length > 0 && (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-300">
          ⚠ {certs.filter((c) => c.daysLeft !== null && c.daysLeft <= 30).length} certificado(s) vencen pronto. Renoválos con acme.sh o Certbot.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
              <th className="pb-2 pr-4 font-medium">Dominio</th>
              <th className="pb-2 pr-4 font-medium">Vencimiento</th>
              <th className="pb-2 pr-4 font-medium">Estado</th>
              <th className="pb-2 font-medium">Ruta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {certs.map((cert) => (
              <tr key={cert.file} className="text-slate-300">
                <td className="py-3 pr-4 font-mono text-sm text-slate-200">{cert.domain}</td>
                <td className="py-3 pr-4">
                  {cert.expiry ? (
                    <span className={certColor(cert.daysLeft)}>
                      {new Date(cert.expiry).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </span>
                  ) : '—'}
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${certBadge(cert.daysLeft)}`}>
                    {cert.daysLeft !== null ? `${cert.daysLeft}d` : '?'}
                  </span>
                </td>
                <td className="py-3">
                  <span className="text-xs font-mono text-slate-600 truncate max-w-xs block" title={cert.file}>
                    {cert.file}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-xs text-slate-500 space-y-1">
        <p className="font-medium text-slate-400">Renovar con acme.sh (en el servidor):</p>
        <pre className="font-mono text-slate-500">~/.acme.sh/acme.sh --renew -d &lt;dominio&gt; --force</pre>
        <pre className="font-mono text-slate-500">sudo nginx -s reload</pre>
      </div>
    </div>
  );
}

// ── nginx vhosts ──────────────────────────────────────────────────────────────
function VhostsPanel() {
  const [vhosts, setVhosts] = useState<Vhost[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<Vhost[]>('/sysadmin/vhosts');
      setVhosts(data);
    } catch { /* */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function toggle(name: string, enable: boolean) {
    setActing(name);
    setMsg(null);
    try {
      const action = enable ? 'enable' : 'disable';
      const r = await api<{ ok: boolean; output: string }>(`/sysadmin/vhosts/${name}/${action}`, { method: 'POST', body: '{}' });
      setMsg({ text: r.output, ok: true });
      await cargar();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : 'Error', ok: false });
    } finally {
      setActing(null);
    }
  }

  if (loading) return <LoadingDots />;

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`rounded-lg border p-3 text-sm ${msg.ok ? 'border-emerald-800/40 bg-emerald-950/30 text-emerald-300' : 'border-red-800/40 bg-red-950/30 text-red-300'}`}>
          {msg.text}
        </div>
      )}

      <div className="flex justify-between items-center">
        <p className="text-xs text-slate-500">{vhosts.length} vhost(s) en /etc/nginx/sites-available</p>
        <button onClick={cargar} className="text-xs text-slate-500 hover:text-slate-300">↻</button>
      </div>

      {vhosts.length === 0 ? (
        <div className="rounded-xl border border-slate-700 p-8 text-center text-slate-500">
          No hay vhosts configurados en /etc/nginx/sites-available
        </div>
      ) : (
        <div className="space-y-2">
          {vhosts.map((v) => (
            <div key={v.name} className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${v.enabled ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                <span className="font-mono text-sm text-slate-200">{v.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${v.enabled ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-500'}`}>
                  {v.enabled ? 'habilitado' : 'deshabilitado'}
                </span>
              </div>
              <button
                onClick={() => toggle(v.name, !v.enabled)}
                disabled={acting === v.name}
                className={`rounded-lg px-3 py-1 text-xs font-medium disabled:opacity-50 transition-colors ${
                  v.enabled
                    ? 'border border-slate-700 text-slate-400 hover:text-red-300 hover:border-red-800'
                    : 'border border-emerald-800 text-emerald-400 hover:bg-emerald-900/20'
                }`}
              >
                {acting === v.name ? '...' : v.enabled ? 'Deshabilitar' : 'Habilitar'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-xs text-slate-500">
        Habilitar/deshabilitar un vhost crea o elimina el symlink en sites-enabled y recarga nginx automáticamente.
      </div>
    </div>
  );
}

// ── Logs ──────────────────────────────────────────────────────────────────────
function LogsPanel() {
  const [service, setService] = useState('nginx');
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const logsRef = useRef<HTMLPreElement>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<{ lines: string[] }>(`/sysadmin/logs/${service}?lines=150`);
      setLines(data.lines);
      setTimeout(() => {
        logsRef.current?.scrollTo({ top: logsRef.current.scrollHeight, behavior: 'smooth' });
      }, 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando logs');
    } finally {
      setLoading(false);
    }
  }, [service]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(cargar, 5000);
    return () => clearInterval(t);
  }, [autoRefresh, cargar]);

  function lineColor(line: string) {
    if (line.includes(' error') || line.includes('ERROR') || line.includes('crit')) return 'text-red-400';
    if (line.includes(' warn') || line.includes('WARN')) return 'text-amber-400';
    if (line.includes(' info') || line.includes('INFO')) return 'text-slate-300';
    return 'text-slate-500';
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {['nginx', 'vps-panel', 'fossbilling'].map((s) => (
            <button
              key={s}
              onClick={() => setService(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                service === s ? 'bg-indigo-600 text-white' : 'border border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 cursor-pointer text-xs text-slate-400 hover:text-slate-200">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-600 bg-slate-800 text-indigo-500"
            />
            Auto-refresh 5s
          </label>
          <button onClick={cargar} disabled={loading} className="text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
            ↻ Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800/40 bg-red-950/30 p-3 text-sm text-red-300">{error}</div>
      )}

      <pre
        ref={logsRef}
        className="h-96 overflow-y-auto rounded-xl border border-slate-800 bg-black/60 p-3 text-xs font-mono"
      >
        {loading && lines.length === 0 ? (
          <span className="text-slate-600">Cargando...</span>
        ) : lines.length === 0 ? (
          <span className="text-slate-600">Sin entradas de log</span>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={lineColor(line)}>{line}</div>
          ))
        )}
      </pre>

      <div className="text-right text-xs text-slate-600">{lines.length} líneas · journalctl -u {service} -n 150</div>
    </div>
  );
}

// ── Utilidades UI ─────────────────────────────────────────────────────────────
function ActionBtn({ label, onClick, loading, color }: { label: string; onClick: () => void; loading?: boolean; color: 'amber' | 'red' | 'indigo' | 'emerald' }) {
  const colors = {
    amber:   'border-amber-800/60 text-amber-400 hover:bg-amber-900/20',
    red:     'border-red-800/60 text-red-400 hover:bg-red-900/20',
    indigo:  'border-indigo-800/60 text-indigo-400 hover:bg-indigo-900/20',
    emerald: 'border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/20',
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`rounded-lg border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${colors[color]}`}
    >
      {loading ? '...' : label}
    </button>
  );
}

function LoadingDots() {
  return <div className="py-12 text-center text-slate-500">Cargando...</div>;
}
