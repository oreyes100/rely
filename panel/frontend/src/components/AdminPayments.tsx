import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface Order {
  id: string;
  refCode: string;
  clientId: string;
  plan: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  confirmedBy?: string;
  providerRef?: string;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-amber-900/40 text-amber-300',
  processing: 'bg-indigo-900/40 text-indigo-300',
  paid:       'bg-emerald-900/40 text-emerald-300',
  failed:     'bg-red-900/40 text-red-300',
  cancelled:  'bg-slate-800 text-slate-500',
};

const METHOD_LABEL: Record<string, string> = { card: '💳 Tarjeta', spei: '🏦 SPEI', crypto: '₿ Crypto' };
const PLAN_LABEL: Record<string, string> = { basico: 'Básico', estandar: 'Estándar', empresarial: 'Empresarial' };

function fmt(iso: string) {
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminPayments() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmRef, setConfirmRef] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api<Order[]>('/payments/admin/orders');
      setOrders(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando órdenes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Auto-refresh si hay órdenes pendientes
  useEffect(() => {
    const hayPendientes = orders.some((o) => o.status === 'pending' || o.status === 'processing');
    if (!hayPendientes) return;
    const t = setInterval(cargar, 10000);
    return () => clearInterval(t);
  }, [orders, cargar]);

  async function confirmar(id: string) {
    setActing(id);
    try {
      await api(`/payments/admin/orders/${id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({ ref: confirmRef }),
      });
      setConfirming(null);
      setConfirmRef('');
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error confirmando');
    } finally {
      setActing(null);
    }
  }

  async function cancelar(id: string) {
    if (!confirm('¿Cancelar esta orden?')) return;
    setActing(id);
    try {
      await api(`/payments/admin/orders/${id}/cancel`, { method: 'POST', body: '{}' });
      await cargar();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error cancelando');
    } finally {
      setActing(null);
    }
  }

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  const stats = {
    pending: orders.filter((o) => o.status === 'pending').length,
    paid: orders.filter((o) => o.status === 'paid').length,
    total: orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.amount, 0),
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-500 mb-1">Pendientes</div>
          <div className="text-2xl font-bold text-amber-400">{stats.pending}</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-500 mb-1">Pagados</div>
          <div className="text-2xl font-bold text-emerald-400">{stats.paid}</div>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="text-xs text-slate-500 mb-1">Total cobrado</div>
          <div className="text-2xl font-bold text-slate-100">${stats.total.toLocaleString()} MXN</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {[['all', 'Todas'], ['pending', 'Pendientes'], ['paid', 'Pagadas'], ['cancelled', 'Canceladas']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              filter === v ? 'bg-indigo-600 text-white' : 'border border-slate-700 text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
        <button onClick={cargar} className="ml-auto rounded-full border border-slate-700 px-3 py-1 text-sm text-slate-400 hover:text-slate-200">
          ↻ Actualizar
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-500">Cargando órdenes...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-slate-500">Sin órdenes para mostrar</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.id} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm text-indigo-300">{o.refCode}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[o.status] ?? 'text-slate-400'}`}>
                      {o.status}
                    </span>
                    <span className="text-xs text-slate-500">{METHOD_LABEL[o.method] ?? o.method}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    Cliente: <span className="text-slate-300 font-mono">{o.clientId}</span>
                    {' · '}Plan: <span className="text-slate-300">{PLAN_LABEL[o.plan] ?? o.plan}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    Creada: {fmt(o.createdAt)}
                    {o.paidAt && <> · Pagada: {fmt(o.paidAt)}</>}
                    {o.confirmedBy && <> · por: {o.confirmedBy}</>}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="text-xl font-bold text-slate-100">${o.amount} {o.currency}</div>
                  {o.status === 'pending' && (
                    <div className="flex gap-2">
                      {confirming === o.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Ref. pago (opc.)"
                            value={confirmRef}
                            onChange={(e) => setConfirmRef(e.target.value)}
                            className="rounded-lg border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 w-32"
                          />
                          <button
                            onClick={() => confirmar(o.id)}
                            disabled={acting === o.id}
                            className="rounded-lg bg-emerald-700 px-3 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            {acting === o.id ? '...' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setConfirming(null)}
                            className="text-xs text-slate-500 hover:text-slate-300"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => { setConfirming(o.id); setConfirmRef(''); }}
                            className="rounded-lg bg-emerald-700/60 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-700"
                          >
                            Confirmar pago
                          </button>
                          <button
                            onClick={() => cancelar(o.id)}
                            disabled={acting === o.id}
                            className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
