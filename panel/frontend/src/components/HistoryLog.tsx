import { useHistory } from '../api/queries';
import { formatDate } from '../format';

const ACTION_LABELS: Record<string, string> = {
  create: 'Crear VPS',
  destroy: 'Eliminar VPS',
  start: 'Encender',
  shutdown: 'Apagar',
  stop: 'Detener (forzado)',
  reboot: 'Reiniciar',
  'snapshot-create': 'Snapshot creado',
  'snapshot-rollback': 'Snapshot revertido',
  'snapshot-delete': 'Snapshot borrado',
  'credential-rotate': 'Password regenerada',
};

export default function HistoryLog() {
  const { data: entries, isLoading } = useHistory();

  return (
    <div className="card">
      <h2 className="mb-4 text-lg font-semibold">Historial de operaciones</h2>
      {isLoading && <p className="text-sm text-slate-400">Cargando…</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">Fecha</th>
              <th className="py-2 pr-3">Operación</th>
              <th className="py-2 pr-3">Nodo</th>
              <th className="py-2 pr-3">VMID</th>
              <th className="py-2 pr-3">Detalle</th>
              <th className="py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {entries?.map((e, i) => (
              <tr key={`${e.ts}-${i}`} className="border-b border-slate-800/50">
                <td className="py-2 pr-3 text-xs text-slate-400">{formatDate(e.ts)}</td>
                <td className="py-2 pr-3">{ACTION_LABELS[e.action] ?? e.action}</td>
                <td className="py-2 pr-3 text-slate-400">{e.node}</td>
                <td className="py-2 pr-3 font-mono text-slate-400">{e.vmid ?? '—'}</td>
                <td className="py-2 pr-3 max-w-md truncate text-slate-400" title={e.detail}>{e.detail}</td>
                <td className="py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${e.ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {e.ok ? 'OK' : 'Error'}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && entries?.length === 0 && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-slate-500">Sin operaciones registradas.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
