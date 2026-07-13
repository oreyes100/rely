import { useMemo, useState } from 'react';
import { useSnapshots, useSnapshotAction, useVmAction, useVmDelete, useVmIp, useVms } from '../api/queries';
import { formatBytes, formatUptime } from '../format';
import type { Vm } from '../api/types';
import { copyText } from '../api/client';

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'running'
      ? 'bg-emerald-500/20 text-emerald-400'
      : 'bg-slate-500/20 text-slate-400';
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles}`}>{status}</span>;
}

function VmIp({ vm }: { vm: Vm }) {
  const { data } = useVmIp(vm.node, vm.vmid, vm.status === 'running');
  if (vm.status !== 'running') return <span className="text-slate-600">—</span>;
  if (!data?.ip) return <span className="text-slate-500">obteniendo…</span>;
  return (
    <button
      className="text-indigo-300 hover:underline"
      title="Copiar IP"
      onClick={() => copyText(data.ip!)}
    >
      {data.ip}
    </button>
  );
}

function SnapshotPanel({ vm, onClose }: { vm: Vm; onClose: () => void }) {
  const { data: snaps, isLoading } = useSnapshots(vm.node, vm.vmid, true);
  const { create, rollback, remove } = useSnapshotAction(vm.node, vm.vmid);
  const [name, setName] = useState('');
  const busy = create.isPending || rollback.isPending || remove.isPending;
  const error = create.error ?? rollback.error ?? remove.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">
            Snapshots · {vm.name} <span className="text-slate-500">({vm.node}/{vm.vmid})</span>
          </h3>
          <button className="text-slate-400 hover:text-slate-200" onClick={onClose}>✕</button>
        </div>

        {isLoading && <p className="text-sm text-slate-400">Cargando…</p>}
        {snaps?.length === 0 && <p className="text-sm text-slate-500">Sin snapshots.</p>}
        <ul className="space-y-2">
          {snaps?.map((s) => (
            <li key={s.name} className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{s.name}</div>
                {s.snaptime && (
                  <div className="text-xs text-slate-500">
                    {new Date(s.snaptime * 1000).toLocaleString('es-MX')}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  className="btn-ghost !px-2 !py-1 text-xs"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`¿Revertir ${vm.name} al snapshot "${s.name}"? Se perderán los cambios posteriores.`)) {
                      rollback.mutate(s.name);
                    }
                  }}
                >
                  Revertir
                </button>
                <button
                  className="btn-danger !px-2 !py-1 text-xs"
                  disabled={busy}
                  onClick={() => confirm(`¿Borrar snapshot "${s.name}"?`) && remove.mutate(s.name)}
                >
                  Borrar
                </button>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name) create.mutate(name, { onSuccess: () => setName('') });
          }}
        >
          <input
            className="input"
            placeholder="nombre-del-snapshot"
            value={name}
            onChange={(e) => setName(e.target.value)}
            pattern="[a-zA-Z][a-zA-Z0-9_\-]{1,39}"
            title="Letras/dígitos/_-, empieza con letra"
          />
          <button className="btn-primary shrink-0" disabled={busy || !name}>
            {create.isPending ? 'Creando…' : 'Crear'}
          </button>
        </form>
        {error && <p className="text-sm text-red-400">{(error as Error).message}</p>}
      </div>
    </div>
  );
}

export default function VpsList() {
  const { data: vms, isLoading, error } = useVms();
  const action = useVmAction();
  const del = useVmDelete();
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped'>('all');
  const [nodeFilter, setNodeFilter] = useState('all');
  const [snapshotVm, setSnapshotVm] = useState<Vm | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const nodes = useMemo(() => [...new Set(vms?.map((v) => v.node) ?? [])], [vms]);

  const filtered = useMemo(
    () =>
      (vms ?? []).filter((vm) => {
        if (statusFilter !== 'all' && vm.status !== statusFilter) return false;
        if (nodeFilter !== 'all' && vm.node !== nodeFilter) return false;
        const q = filter.toLowerCase();
        return !q || vm.name.toLowerCase().includes(q) || String(vm.vmid).includes(q) || vm.tags.some((t) => t.includes(q));
      }),
    [vms, filter, statusFilter, nodeFilter]
  );

  function run(vm: Vm, act: string) {
    const key = `${vm.node}/${vm.vmid}`;
    setPendingKey(key);
    action.mutate({ node: vm.node, vmid: vm.vmid, action: act }, { onSettled: () => setPendingKey(null) });
  }

  function destroy(vm: Vm) {
    const typed = prompt(
      `⚠️ Eliminar ${vm.name} (VMID ${vm.vmid}, nodo ${vm.node}) es DEFINITIVO: se purgan disco y configuración.\n\nEscribe el nombre del VPS para confirmar:`
    );
    if (typed !== vm.name) return;
    const key = `${vm.node}/${vm.vmid}`;
    setPendingKey(key);
    del.mutate({ node: vm.node, vmid: vm.vmid }, { onSettled: () => setPendingKey(null) });
  }

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-lg font-semibold">VPS ({filtered.length})</h2>
        <input
          className="input !w-48"
          placeholder="Buscar nombre/vmid/tag…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select className="input !w-32" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">Todos</option>
          <option value="running">Encendidos</option>
          <option value="stopped">Apagados</option>
        </select>
        <select className="input !w-36" value={nodeFilter} onChange={(e) => setNodeFilter(e.target.value)}>
          <option value="all">Ambos nodos</option>
          {nodes.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Cargando VPS…</p>}
      {error && <p className="text-sm text-red-400">{(error as Error).message}</p>}
      {(action.error || del.error) && (
        <p className="mb-2 text-sm text-red-400">{((action.error ?? del.error) as Error).message}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">VMID</th>
              <th className="py-2 pr-3">Nombre</th>
              <th className="py-2 pr-3">Nodo</th>
              <th className="py-2 pr-3">Estado</th>
              <th className="py-2 pr-3">IP</th>
              <th className="py-2 pr-3">vCPU</th>
              <th className="py-2 pr-3">RAM</th>
              <th className="py-2 pr-3">Disco</th>
              <th className="py-2 pr-3">Uptime</th>
              <th className="py-2 pr-3">Tags</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((vm) => {
              const key = `${vm.node}/${vm.vmid}`;
              const busy = pendingKey === key;
              return (
                <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="py-2 pr-3 font-mono text-slate-400">{vm.vmid}</td>
                  <td className="py-2 pr-3 font-medium">{vm.name}</td>
                  <td className="py-2 pr-3 text-slate-400">{vm.node}</td>
                  <td className="py-2 pr-3"><StatusBadge status={vm.status} /></td>
                  <td className="py-2 pr-3 font-mono text-xs"><VmIp vm={vm} /></td>
                  <td className="py-2 pr-3">{vm.cpus}</td>
                  <td className="py-2 pr-3">{formatBytes(vm.maxmem)}</td>
                  <td className="py-2 pr-3">{formatBytes(vm.maxdisk)}</td>
                  <td className="py-2 pr-3 text-slate-400">{vm.status === 'running' ? formatUptime(vm.uptime) : '—'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {vm.tags.map((t) => (
                        <span key={t} className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-400">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td className="py-2">
                    <div className="flex gap-1">
                      {vm.status === 'running' ? (
                        <>
                          <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => run(vm, 'shutdown')}>
                            Apagar
                          </button>
                          <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => run(vm, 'reboot')}>
                            Reiniciar
                          </button>
                        </>
                      ) : (
                        <button className="btn-primary !px-2 !py-1 text-xs" disabled={busy} onClick={() => run(vm, 'start')}>
                          Encender
                        </button>
                      )}
                      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={busy} onClick={() => setSnapshotVm(vm)}>
                        Snap
                      </button>
                      <button className="btn-danger !px-2 !py-1 text-xs" disabled={busy} onClick={() => destroy(vm)}>
                        {busy && del.isPending ? '…' : 'Eliminar'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={11} className="py-6 text-center text-slate-500">
                  No hay VPS que coincidan con el filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {snapshotVm && <SnapshotPanel vm={snapshotVm} onClose={() => setSnapshotVm(null)} />}
    </div>
  );
}
