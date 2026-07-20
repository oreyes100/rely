import { useEffect, useRef, useState } from 'react';
import { useNodes } from '../api/queries';
import { api } from '../api/client';
import { formatBytes, formatUptime, pct } from '../format';
import type { NodeInfo } from '../api/types';

function Bar({ value, warnAt = 80 }: { value: number; warnAt?: number }) {
  const color = value >= 90 ? 'bg-red-500' : value >= warnAt ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${value}%` }} />
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return <div className="h-10" />;
  const w = 200;
  const h = 40;
  const step = w / (points.length - 1);
  const path = points.map((p, i) => `${(i * step).toFixed(1)},${(h - Math.min(p, 1) * h).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-10 w-full text-indigo-400" preserveAspectRatio="none">
      <polyline fill="none" stroke="currentColor" strokeWidth="1.5" points={path} />
    </svg>
  );
}

function NodeCard({ node, cpuHistory }: { node: NodeInfo; cpuHistory: number[] }) {
  const isHyperV = node.nodeType === 'hyperv';
  const isTokenError = !node.online && node.error?.includes('Token API');
  const [showTokenForm, setShowTokenForm] = useState(false);
  const [newToken, setNewToken] = useState('');
  const [tokenMsg, setTokenMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleUpdateToken = async () => {
    setSaving(true);
    setTokenMsg('');
    try {
      const data = await api<{ mensaje: string }>(`/nodes/${node.name}/token`, {
        method: 'POST',
        body: JSON.stringify({ tokenSecret: newToken }),
      });
      setTokenMsg(data.mensaje ?? 'Token actualizado');
      setShowTokenForm(false);
      setNewToken('');
    } catch (e: any) {
      setTokenMsg(e.message ?? 'Error al actualizar token');
    } finally {
      setSaving(false);
    }
  };

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  if (!node.online) {
    return (
      <div className="card border-red-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{node.name}</h3>
            {isHyperV && <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-400">Hyper-V</span>}
          </div>
          <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">sin conexión</span>
        </div>
        <p className="mt-2 text-sm text-slate-500">{node.host} · {node.subnet}</p>
        {node.error && (
          <p className="mt-1.5 text-xs text-red-400/80 break-words" title={node.error}>
            {node.error}
          </p>
        )}
        {isTokenError && (
          <div className="mt-3 space-y-2">
            {!showTokenForm ? (
              <button
                className="rounded bg-amber-500/20 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-500/30 transition-colors"
                onClick={() => setShowTokenForm(true)}
              >
                Actualizar token API
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">
                  Proxmox → Datacenter → Permissions → API Tokens → regenerar "panel" y pegar UUID aquí:
                </p>
                <input
                  className="w-full rounded bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={newToken}
                  onChange={(e) => setNewToken(e.target.value.toLowerCase().trim())}
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                    onClick={handleUpdateToken}
                    disabled={saving || !uuidRegex.test(newToken)}
                  >
                    {saving ? 'Aplicando…' : 'Aplicar'}
                  </button>
                  <button
                    className="rounded bg-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
                    onClick={() => { setShowTokenForm(false); setNewToken(''); setTokenMsg(''); }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
            {tokenMsg && (
              <p className={`text-xs ${tokenMsg.includes('Error') || tokenMsg.includes('inválido') ? 'text-red-400' : 'text-emerald-400'}`}>
                {tokenMsg}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  const cpuPct = Math.round((node.cpu ?? 0) * 100);
  const memPct = pct(node.memUsed, node.memTotal);
  const storPct = pct(node.storUsed, node.storTotal);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{node.name}</h3>
            {isHyperV && <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-xs text-blue-400">Hyper-V</span>}
          </div>
          <p className="text-xs text-slate-500">
            {node.host} · {node.subnet}{!isHyperV && ` · uptime ${formatUptime(node.uptime)}`}
          </p>
        </div>
        <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-400">online</span>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>CPU ({node.maxCpu} núcleos)</span>
          <span>{cpuPct}%</span>
        </div>
        <Bar value={cpuPct} />
        <Sparkline points={cpuHistory} />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-400">
          <span>RAM</span>
          <span>
            {formatBytes(node.memUsed)} / {formatBytes(node.memTotal)} ({memPct}%)
          </span>
        </div>
        <Bar value={memPct} />
      </div>

      {!isHyperV && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-slate-400">
            <span>Almacenamiento (local-lvm)</span>
            <span>
              {formatBytes(node.storUsed)} / {formatBytes(node.storTotal)} ({storPct}%)
            </span>
          </div>
          <Bar value={storPct} />
        </div>
      )}

      {isHyperV && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-800/60 px-3 py-2 text-xs">
          <span className="text-slate-400">Plantilla Ubuntu:</span>
          {(node as any).templateReady
            ? <span className="text-emerald-400">✓ lista</span>
            : <span className="text-amber-400">⏳ preparando…</span>}
        </div>
      )}
    </div>
  );
}

const MAX_POINTS = 60; // ~10 min con polling de 10 s

export default function ResourceMonitor() {
  const { data: nodes, isLoading } = useNodes();
  const historyRef = useRef<Record<string, number[]>>({});
  const [, force] = useState(0);

  useEffect(() => {
    if (!nodes) return;
    for (const n of nodes) {
      if (!n.online) continue;
      const arr = historyRef.current[n.name] ?? [];
      arr.push(n.cpu ?? 0);
      if (arr.length > MAX_POINTS) arr.shift();
      historyRef.current[n.name] = arr;
    }
    force((x) => x + 1);
  }, [nodes]);

  if (isLoading) return <p className="text-sm text-slate-400">Cargando nodos…</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {nodes?.map((n) => (
        <NodeCard key={n.name} node={n} cpuHistory={historyRef.current[n.name] ?? []} />
      ))}
    </div>
  );
}
