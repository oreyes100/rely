import { useState, useEffect } from 'react';
import { api, ApiError, copyText } from '../api/client';

interface ServiceDef {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  resources: { cores: number; memoryMb: number; diskGb: number };
  ports: { port: number; proto: string; label: string }[];
}

interface ServiceInstall {
  id: string;
  serviceId: string;
  serviceName: string;
  icon: string;
  node: string;
  vmid: number;
  hostname: string;
  user: string;
  password: string;
  subnetHint: string;
  status: string;
  setupStatus: string;
  installedAt: string;
  completedAt?: string;
  ports: { port: number; proto: string; label: string }[];
}

interface NodeInfo {
  name: string;
  online: boolean;
}

const CATEGORY_LABEL: Record<string, string> = {
  ai: 'Inteligencia Artificial',
  gaming: 'Gaming',
  communication: 'Comunicación',
  devops: 'DevOps / Hosting',
  backend: 'Backend as a Service',
};

const SETUP_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Pendiente configurar', cls: 'text-yellow-400' },
  running: { label: 'Instalando…', cls: 'text-blue-400' },
  done: { label: 'Listo', cls: 'text-green-400' },
  error: { label: 'Error en instalación', cls: 'text-red-400' },
};

export default function Services() {
  const [catalog, setCatalog] = useState<ServiceDef[]>([]);
  const [installs, setInstalls] = useState<ServiceInstall[]>([]);
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [nodesLoading, setNodesLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [showInstallModal, setShowInstallModal] = useState<ServiceDef | null>(null);
  const [form, setForm] = useState({ hostname: '', node: '' });
  const [installResult, setInstallResult] = useState<(ServiceInstall & { setupScript?: string }) | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'catalog' | 'installed'>('catalog');

  useEffect(() => {
    Promise.all([
      api<ServiceDef[]>('/services/catalog'),
      api<ServiceInstall[]>('/services/installs'),
    ])
      .then(([cat, inst]) => {
        setCatalog(cat);
        setInstalls(inst);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));

    api<NodeInfo[]>('/nodes')
      .then((nds) => {
        const online = nds.filter((n) => n.online);
        setNodes(online);
        if (online.length > 0) setForm((f) => ({ ...f, node: online[0].name }));
      })
      .catch(() => {})
      .finally(() => setNodesLoading(false));
  }, []);

  // Polling mientras haya installs instalándose en segundo plano
  useEffect(() => {
    const hasRunning = installs.some((i) => i.setupStatus === 'running');
    if (!hasRunning) return;
    const t = setTimeout(async () => {
      try {
        const inst = await api<ServiceInstall[]>('/services/installs');
        setInstalls(inst);
      } catch { /* ignorar errores de polling */ }
    }, 6000);
    return () => clearTimeout(t);
  }, [installs]);

  async function handleInstall() {
    if (!showInstallModal || !form.hostname || !form.node) return;
    setInstalling(showInstallModal.id);
    setError('');
    try {
      const result = await api<ServiceInstall & { setupScript?: string }>('/services/install', {
        method: 'POST',
        body: JSON.stringify({ serviceId: showInstallModal.id, node: form.node, hostname: form.hostname }),
      });
      setInstalls((prev) => [...prev, result]);
      setInstallResult(result);
      setShowInstallModal(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al instalar');
    } finally {
      setInstalling(null);
    }
  }

  async function handleCopy(text: string, key: string) {
    await copyText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function markSetupStatus(installId: string, setupStatus: string) {
    try {
      const updated = await api<ServiceInstall>(`/services/installs/${installId}`, {
        method: 'PATCH',
        body: JSON.stringify({ setupStatus }),
      });
      setInstalls((prev) => prev.map((i) => (i.id === installId ? { ...i, ...updated } : i)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error actualizando estado');
    }
  }

  async function downloadScript(installId: string, hostname: string) {
    const script = await api<string>(`/services/installs/${installId}/script`);
    const blob = new Blob([script as unknown as string], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `setup-${hostname}.sh`;
    a.click();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        Cargando catálogo…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Servicios Gestionados</h2>
          <p className="mt-0.5 text-sm text-slate-400">
            Despliega servicios preconfigurados en un nuevo VPS automáticamente.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`rounded-lg px-4 py-1.5 text-sm ${activeTab === 'catalog' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Catálogo
          </button>
          <button
            onClick={() => setActiveTab('installed')}
            className={`rounded-lg px-4 py-1.5 text-sm ${activeTab === 'installed' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Instalados
            {installs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-indigo-500/30 px-1.5 py-0.5 text-xs">{installs.length}</span>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">cerrar</button>
        </div>
      )}

      {/* ── Catálogo ── */}
      {activeTab === 'catalog' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {catalog.map((svc) => (
            <div
              key={svc.id}
              className="flex flex-col gap-3 rounded-xl border border-slate-700 bg-slate-800/50 p-5"
            >
              <div className="flex items-start gap-3">
                <span className="text-3xl leading-none">{svc.icon}</span>
                <div className="min-w-0">
                  <div className="font-semibold">{svc.name}</div>
                  <div className="text-xs text-indigo-400">{CATEGORY_LABEL[svc.category] ?? svc.category}</div>
                </div>
              </div>
              <p className="text-sm text-slate-400">{svc.description}</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                <span className="rounded bg-slate-700 px-2 py-0.5">{svc.resources.cores} vCPU</span>
                <span className="rounded bg-slate-700 px-2 py-0.5">{svc.resources.memoryMb / 1024} GB RAM</span>
                <span className="rounded bg-slate-700 px-2 py-0.5">{svc.resources.diskGb} GB disco</span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {svc.ports.map((p) => (
                  <span key={p.port} className="rounded border border-slate-600 px-1.5 py-0.5 text-slate-400">
                    :{p.port} {p.label}
                  </span>
                ))}
              </div>
              <button
                onClick={() => {
                  setShowInstallModal(svc);
                  setForm((f) => ({ ...f, hostname: `${svc.id}-01` }));
                }}
                disabled={!!installing || nodesLoading || nodes.length === 0}
                className="mt-auto rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                title={nodesLoading ? 'Verificando nodos…' : nodes.length === 0 ? 'Sin nodos disponibles' : ''}
              >
                {installing === svc.id ? 'Instalando…' : nodesLoading ? 'Verificando nodos…' : 'Instalar servicio'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Instalados ── */}
      {activeTab === 'installed' && (
        <div className="space-y-4">
          {installs.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-800/30 py-12 text-center text-slate-500">
              No hay servicios instalados aún.
            </div>
          ) : (
            installs.map((inst) => {
              const st = SETUP_STATUS_LABEL[inst.setupStatus] ?? { label: inst.setupStatus, cls: 'text-slate-400' };
              return (
                <div key={inst.id} className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{inst.icon}</span>
                      <div>
                        <div className="font-semibold">{inst.hostname}</div>
                        <div className="text-sm text-slate-400">{inst.serviceName}</div>
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${st.cls}`}>{st.label}</span>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="space-y-1 text-slate-400">
                      <div>Nodo: <span className="text-slate-200">{inst.node}</span></div>
                      <div>VMID: <span className="text-slate-200">{inst.vmid}</span></div>
                      <div>Red: <span className="text-slate-200">{inst.subnetHint}</span></div>
                    </div>
                    <div className="space-y-1 text-slate-400">
                      <div>
                        Usuario: <span className="text-slate-200">{inst.user}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        Contraseña:
                        <span className="font-mono text-slate-200">{inst.password}</span>
                        <button
                          onClick={() => handleCopy(inst.password, `pw-${inst.id}`)}
                          className="text-xs text-indigo-400 hover:text-indigo-300"
                        >
                          {copied === `pw-${inst.id}` ? '✓' : 'copiar'}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {inst.ports.map((p) => (
                          <span key={p.port} className="rounded border border-slate-600 px-1.5 py-0.5 text-xs text-slate-400">
                            :{p.port} {p.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {inst.setupStatus === 'pending' && (
                    <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-300">
                      <p className="font-medium">Setup pendiente</p>
                      <p className="mt-1 text-yellow-200/70">
                        El VPS está encendido. Conéctate por SSH y ejecuta el script de instalación.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => downloadScript(inst.id, inst.hostname)}
                          className="rounded-lg bg-yellow-500/20 px-3 py-1.5 text-xs text-yellow-300 hover:bg-yellow-500/30"
                        >
                          Descargar setup.sh
                        </button>
                        <button
                          onClick={() => markSetupStatus(inst.id, 'done')}
                          className="rounded-lg bg-green-500/20 px-3 py-1.5 text-xs text-green-300 hover:bg-green-500/30"
                        >
                          Marcar como instalado
                        </button>
                      </div>
                    </div>
                  )}

                  {inst.setupStatus === 'done' && (
                    <div className="mt-4 text-xs text-slate-500">
                      Completado {inst.completedAt ? new Date(inst.completedAt).toLocaleString() : ''}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Modal instalación ── */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-3xl">{showInstallModal.icon}</span>
              <div>
                <div className="font-semibold text-lg">{showInstallModal.name}</div>
                <div className="text-sm text-slate-400">Configurar nuevo VPS</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block mb-1 text-sm text-slate-400">Hostname del VPS</label>
                <input
                  type="text"
                  value={form.hostname}
                  onChange={(e) => setForm((f) => ({ ...f, hostname: e.target.value }))}
                  placeholder={`${showInstallModal.id}-01`}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block mb-1 text-sm text-slate-400">Nodo Proxmox</label>
                <select
                  value={form.node}
                  onChange={(e) => setForm((f) => ({ ...f, node: e.target.value }))}
                  className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  {nodes.map((n) => (
                    <option key={n.name} value={n.name}>{n.name}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-lg bg-slate-800/60 px-4 py-3 text-sm text-slate-400">
                <div className="font-medium text-slate-300 mb-1">Recursos asignados</div>
                <div className="flex gap-4">
                  <span>{showInstallModal.resources.cores} vCPU</span>
                  <span>{showInstallModal.resources.memoryMb / 1024} GB RAM</span>
                  <span>{showInstallModal.resources.diskGb} GB disco</span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowInstallModal(null)}
                className="flex-1 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-400 hover:bg-slate-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleInstall}
                disabled={!form.hostname || !form.node || !!installing}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {installing ? 'Aprovisionando…' : 'Instalar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal resultado ── */}
      {installResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{installResult.icon}</span>
              <div>
                <div className="font-semibold text-lg text-green-400">VPS aprovisionado</div>
                <div className="text-sm text-slate-400">{installResult.serviceName} — {installResult.hostname}</div>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Usuario SSH</span>
                <span className="font-mono text-slate-200">{installResult.user}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Contraseña</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-slate-200">{installResult.password}</span>
                  <button
                    onClick={() => handleCopy(installResult.password, 'result-pw')}
                    className="text-xs text-indigo-400"
                  >
                    {copied === 'result-pw' ? '✓ copiado' : 'copiar'}
                  </button>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Red</span>
                <span className="text-slate-200 text-right">{installResult.subnetHint}</span>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-200">
              <p className="font-medium mb-1">Próximo paso: instalar el servicio</p>
              <p className="text-yellow-200/70 text-xs">
                Cuando el VPS esté listo (3-5 min), conéctate por SSH y ejecuta el script de setup.
              </p>
              {installResult.setupScript && (
                <button
                  onClick={() => {
                    const blob = new Blob([installResult.setupScript!], { type: 'text/plain' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `setup-${installResult.hostname}.sh`;
                    a.click();
                  }}
                  className="mt-2 rounded-lg bg-yellow-500/20 px-3 py-1.5 text-xs text-yellow-300 hover:bg-yellow-500/30"
                >
                  Descargar setup.sh
                </button>
              )}
            </div>

            <button
              onClick={() => { setInstallResult(null); setActiveTab('installed'); }}
              className="mt-5 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              Ver instalaciones
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
