import { useMemo, useState } from 'react';
import { useNodes, useProvision } from '../api/queries';
import { formatBytes } from '../format';
import type { ProvisionResult } from '../api/types';
import { copyText } from '../api/client';

// Planes de referencia (MANUAL-1)
const PLANS = [
  { id: 'dev', label: 'Dev', cores: 1, memoryMb: 2048, diskGb: 20, hint: 'Node/Python, apps chicas' },
  { id: 'startup', label: 'Startup', cores: 2, memoryMb: 4096, diskGb: 40, hint: 'Supabase self-hosted completo' },
  { id: 'pro', label: 'Pro', cores: 4, memoryMb: 8192, diskGb: 80, hint: 'Supabase + varias apps' },
];

const HOSTNAME_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const GiB = 1024 ** 3;
const RAM_HEADROOM = 2 * GiB;

function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <code className={`input flex-1 ${mono ? 'font-mono' : ''}`}>{value}</code>
        <button
          type="button"
          className="btn-ghost shrink-0"
          onClick={async () => {
            if (await copyText(value)) {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }
          }}
        >
          {copied ? '✓ Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function ResultView({ result, onReset }: { result: ProvisionResult; onReset: () => void }) {
  return (
    <div className="card max-w-lg space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-emerald-400">✓ VPS creado</h2>
        <p className="text-sm text-slate-400">
          {result.hostname} · VMID {result.vmid} · nodo {result.node}
        </p>
      </div>
      <CopyField label="Usuario" value={result.user} />
      <CopyField label="Contraseña" value={result.password} />
      <p className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300">
        Guarda la contraseña ahora (queda también en la sección Credenciales). IP por DHCP en{' '}
        {result.subnetHint}. El stack (Node, Python, Docker) termina de instalarse en el primer
        arranque.
      </p>
      <button className="btn-primary" onClick={onReset}>Crear otro VPS</button>
    </div>
  );
}

export default function ProvisioningForm() {
  const { data: nodes } = useNodes();
  const provision = useProvision();

  const [node, setNode] = useState('');
  const [hostname, setHostname] = useState('');
  const [cores, setCores] = useState(2);
  const [memoryMb, setMemoryMb] = useState(4096);
  const [diskGb, setDiskGb] = useState(40);
  const [tagsRaw, setTagsRaw] = useState('');
  const [result, setResult] = useState<ProvisionResult | null>(null);

  const onlineNodes = useMemo(() => (nodes ?? []).filter((n) => n.online), [nodes]);
  const selected = onlineNodes.find((n) => n.name === node) ?? onlineNodes[0];
  const effectiveNode = selected?.name ?? '';
  const isHyperV = selected?.nodeType === 'hyperv';
  const templateReady = isHyperV ? !!(selected as any)?.templateReady : true;

  const tags = useMemo(
    () => tagsRaw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    [tagsRaw]
  );

  // Validación de recursos en cliente (el backend re-valida)
  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!HOSTNAME_RE.test(hostname)) {
      errors.push('Hostname: 3-30 caracteres, minúsculas, dígitos y guiones.');
    }
    if (tags.length > 5 || tags.some((t) => !/^[a-z0-9][a-z0-9_.-]{0,20}$/.test(t))) {
      errors.push('Tags: máximo 5, minúsculas/dígitos/._- separadas por comas.');
    }
    if (selected) {
      const memFree = (selected.memTotal ?? 0) - (selected.memUsed ?? 0);
      if (memoryMb * 1024 * 1024 + RAM_HEADROOM > memFree) {
        errors.push(
          `RAM insuficiente en ${selected.name}: libres ${formatBytes(memFree)} (se reservan 2 GB de margen).`
        );
      }
      if (!isHyperV && diskGb * GiB > (selected.storAvail ?? 0)) {
        errors.push(`Disco insuficiente en ${selected.name}: libres ${formatBytes(selected.storAvail)}.`);
      }
      if (isHyperV && !templateReady) {
        errors.push('La plantilla Hyper-V aún no está lista. Espera unos minutos.');
      }
    }
    return errors;
  }, [hostname, tags, selected, memoryMb, diskGb]);

  if (result) return <ResultView result={result} onReset={() => { setResult(null); setHostname(''); provision.reset(); }} />;

  return (
    <form
      className="card max-w-2xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (validation.length) return;
        provision.mutate(
          { node: effectiveNode, hostname, cores, memoryMb, diskGb, tags },
          { onSuccess: setResult }
        );
      }}
    >
      <h2 className="text-lg font-semibold">Aprovisionar nuevo VPS</h2>

      {/* Planes rápidos */}
      <div>
        <span className="label">Plan de referencia</span>
        <div className="grid gap-2 sm:grid-cols-3">
          {PLANS.map((p) => {
            const active = cores === p.cores && memoryMb === p.memoryMb && diskGb === p.diskGb;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { setCores(p.cores); setMemoryMb(p.memoryMb); setDiskGb(p.diskGb); }}
                className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                  active ? 'border-indigo-500 bg-indigo-600/10' : 'border-slate-700 hover:border-slate-500'
                }`}
              >
                <div className="font-semibold">{p.label}</div>
                <div className="text-xs text-slate-400">
                  {p.cores} vCPU · {p.memoryMb / 1024} GB · {p.diskGb} GB
                </div>
                <div className="mt-1 text-xs text-slate-500">{p.hint}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="node">Nodo destino</label>
          <select id="node" className="input" value={effectiveNode} onChange={(e) => setNode(e.target.value)}>
            {onlineNodes.map((n) => (
              <option key={n.name} value={n.name}>
                {n.name}{n.nodeType === 'hyperv' ? ' [Hyper-V]' : ''} — RAM libre {formatBytes((n.memTotal ?? 0) - (n.memUsed ?? 0))}{n.nodeType !== 'hyperv' ? ` · disco libre ${formatBytes(n.storAvail)}` : ''}
              </option>
            ))}
          </select>
          {selected && (
            <p className="mt-1 text-xs text-slate-500">
              Subred {selected.subnet} · VMIDs {selected.vmidRange?.join('–')}
              {isHyperV ? ' · Hyper-V (cloud-init)' : ' · template 9000'}
            </p>
          )}
          {isHyperV && !templateReady && (
            <p className="mt-1 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
              ⏳ La plantilla Ubuntu se está preparando en AULAMEDIOS. Disponible en ~10 min.
            </p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="hostname">Hostname</label>
          <input
            id="hostname"
            className="input"
            placeholder="cliente-acme"
            value={hostname}
            onChange={(e) => setHostname(e.target.value.toLowerCase())}
            required
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="cores">vCPU: {cores}</label>
          <input id="cores" type="range" min={1} max={8} value={cores} onChange={(e) => setCores(+e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="label" htmlFor="ram">RAM: {memoryMb / 1024} GB</label>
          <input id="ram" type="range" min={1024} max={16384} step={1024} value={memoryMb} onChange={(e) => setMemoryMb(+e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="label" htmlFor="disk">Disco: {diskGb} GB</label>
          <input id="disk" type="range" min={20} max={200} step={10} value={diskGb} onChange={(e) => setDiskGb(+e.target.value)} className="w-full" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="tags">Etiquetas (separadas por comas, opcional)</label>
        <input id="tags" className="input" placeholder="cliente-acme, produccion" value={tagsRaw} onChange={(e) => setTagsRaw(e.target.value)} />
      </div>

      {hostname && validation.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">
          {validation.map((v) => <li key={v}>• {v}</li>)}
        </ul>
      )}
      {provision.error && <p className="text-sm text-red-400">{(provision.error as Error).message}</p>}

      <button className="btn-primary" disabled={provision.isPending || validation.length > 0 || !effectiveNode}>
        {provision.isPending ? 'Clonando template… (puede tardar varios minutos)' : 'Crear VPS'}
      </button>
    </form>
  );
}
