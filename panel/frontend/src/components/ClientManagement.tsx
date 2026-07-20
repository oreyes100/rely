import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface Client {
  id: string;
  email: string;
  name: string;
  approved: boolean | undefined;
  quota: number;
  plan: string | null;
  createdAt: string;
  approvedAt: string | null;
}

const PLANS = ['basico', 'estandar', 'empresarial'];
const QUOTA_OPTIONS = [1, 2, 3, 5, 10];

export default function ClientManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { plan: string; quota: number }>>({});
  const [inviteInfo, setInviteInfo] = useState<{ code: string; plan: string; quota: number; promo: boolean }>({ code: '', plan: 'basico', quota: 1, promo: false });
  const [newCode, setNewCode] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<Client[]>('/invites/clients');
      setClients(data);
      const defaults: Record<string, { plan: string; quota: number }> = {};
      for (const c of data) defaults[c.id] = { plan: c.plan || 'basico', quota: c.quota ?? 1 };
      setForm(defaults);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function aprobar(id: string, approved: boolean) {
    setUpdating(id);
    try {
      const f = form[id] ?? { plan: 'basico', quota: 1 };
      await api(`/invites/clients/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ approved, quota: f.quota, plan: f.plan }),
      });
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setUpdating(null);
    }
  }

  async function generarInvite() {
    try {
      const data = await api<{ code: string }>('/invites', {
        method: 'POST',
        body: JSON.stringify({ plan: inviteInfo.plan, quota: inviteInfo.quota, promo: inviteInfo.promo }),
      });
      setNewCode(data.code);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error generando invitación');
    }
  }

  if (loading) return <div className="text-slate-500 py-8 text-center">Cargando clientes…</div>;

  const pendientes = clients.filter((c) => c.approved === false);
  const aprobados = clients.filter((c) => c.approved !== false);

  return (
    <div className="space-y-8">
      {/* Generar invitación */}
      <div className="card">
        <h3 className="font-semibold text-slate-100 mb-4">Generar invitación</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="label">Plan</label>
            <select className="input" value={inviteInfo.plan} onChange={(e) => setInviteInfo({ ...inviteInfo, plan: e.target.value })}>
              {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Cuota</label>
            <select className="input" value={inviteInfo.quota} onChange={(e) => setInviteInfo({ ...inviteInfo, quota: Number(e.target.value) })}>
              {QUOTA_OPTIONS.map((q) => <option key={q} value={q}>{q} proyecto{q !== 1 ? 's' : ''}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pb-0.5">
            <input type="checkbox" id="promo" checked={inviteInfo.promo}
              onChange={(e) => setInviteInfo({ ...inviteInfo, promo: e.target.checked })}
              className="h-4 w-4 rounded border-slate-600 bg-slate-700 text-indigo-500" />
            <label htmlFor="promo" className="text-sm text-slate-300">Auto-aprobada (promo)</label>
          </div>
          <button onClick={generarInvite} className="btn-primary">Generar código</button>
        </div>
        {newCode && (
          <div className="mt-3 rounded-lg bg-indigo-900/30 border border-indigo-700/40 p-3">
            <p className="text-xs text-slate-400 mb-1">Código generado — enviar al cliente:</p>
            <div className="flex items-center gap-3">
              <code className="font-mono text-lg font-bold text-indigo-300">{newCode}</code>
              <button onClick={() => { navigator.clipboard.writeText(newCode); }}
                className="text-xs text-slate-400 hover:text-slate-200 transition-colors">Copiar</button>
              <button onClick={() => setNewCode(null)} className="text-xs text-slate-500">✕</button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Plan: {inviteInfo.plan} · Cuota: {inviteInfo.quota} · {inviteInfo.promo ? 'Auto-aprobada' : 'Requiere aprobación'}
            </p>
          </div>
        )}
      </div>

      {/* Pendientes de aprobación */}
      {pendientes.length > 0 && (
        <div className="card border-amber-800/40">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            <h3 className="font-semibold text-amber-300">Pendientes de aprobación ({pendientes.length})</h3>
          </div>
          <div className="space-y-3">
            {pendientes.map((c) => (
              <div key={c.id} className="rounded-lg border border-amber-800/30 bg-amber-900/10 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-200">{c.name}</p>
                    <p className="text-sm text-slate-400">{c.email}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Registrado {new Date(c.createdAt).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="label text-xs">Plan</label>
                      <select className="input text-sm py-1"
                        value={form[c.id]?.plan ?? 'basico'}
                        onChange={(e) => setForm({ ...form, [c.id]: { ...form[c.id], plan: e.target.value } })}>
                        {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Cuota</label>
                      <select className="input text-sm py-1"
                        value={form[c.id]?.quota ?? 1}
                        onChange={(e) => setForm({ ...form, [c.id]: { ...form[c.id], quota: Number(e.target.value) } })}>
                        {QUOTA_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </div>
                    <button onClick={() => aprobar(c.id, true)} disabled={updating === c.id}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50">
                      {updating === c.id ? '…' : '✓ Aprobar'}
                    </button>
                    <button onClick={() => aprobar(c.id, false)} disabled={updating === c.id}
                      className="rounded-lg border border-red-700/40 text-red-400 hover:text-red-300 px-3 py-1.5 text-sm transition-colors disabled:opacity-50">
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Clientes aprobados */}
      <div className="card">
        <h3 className="font-semibold text-slate-100 mb-4">Clientes activos ({aprobados.length})</h3>
        {aprobados.length === 0 ? (
          <p className="text-slate-500 text-sm">Sin clientes aprobados aún.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-400 border-b border-slate-700">
                  <th className="pb-2 pr-4">Cliente</th>
                  <th className="pb-2 pr-4">Plan</th>
                  <th className="pb-2 pr-4">Cuota</th>
                  <th className="pb-2 pr-4">Aprobado</th>
                  <th className="pb-2">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {aprobados.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4">
                      <p className="text-slate-200">{c.name}</p>
                      <p className="text-xs text-slate-500">{c.email}</p>
                    </td>
                    <td className="py-2.5 pr-4">
                      <select className="input text-xs py-0.5 w-28"
                        value={form[c.id]?.plan ?? c.plan ?? 'basico'}
                        onChange={(e) => setForm({ ...form, [c.id]: { ...form[c.id], plan: e.target.value } })}>
                        {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 pr-4">
                      <select className="input text-xs py-0.5 w-20"
                        value={form[c.id]?.quota ?? c.quota ?? 1}
                        onChange={(e) => setForm({ ...form, [c.id]: { ...form[c.id], quota: Number(e.target.value) } })}>
                        {QUOTA_OPTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
                      </select>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-slate-400">
                      {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString('es-MX', { dateStyle: 'short' }) : 'Legacy'}
                    </td>
                    <td className="py-2.5">
                      <button onClick={() => aprobar(c.id, true)} disabled={updating === c.id}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50 mr-3">
                        {updating === c.id ? '…' : 'Actualizar'}
                      </button>
                      <button onClick={() => aprobar(c.id, false)} disabled={updating === c.id}
                        className="text-xs text-red-500 hover:text-red-400 transition-colors disabled:opacity-50">
                        Revocar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
