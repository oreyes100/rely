import { useState, useEffect } from 'react';
import { api, copyText } from '../../api/client';

interface Plan {
  id: string;
  label: string;
  price: number;
  currency: string;
  priceUsd: number;
  quota: number;
  billing: string;
  features: string[];
}

interface PaymentData {
  mode: string;
  publicKey?: string;
  clabe?: string;
  banco?: string;
  beneficiario?: string;
  amount?: number;
  currency?: string;
  referencia?: string;
  concepto?: string;
  instrucciones?: string[];
  bitcoin?: string | null;
  ethereum?: string | null;
  usdt_trc20?: string | null;
  amountUsd?: number;
  note?: string;
}

interface Order {
  id: string;
  refCode: string;
  plan: string;
  method: string;
  amount: number;
  currency: string;
  status: string;
  paymentData: PaymentData | null;
  createdAt: string;
  paidAt: string | null;
}

type Method = 'card' | 'spei' | 'crypto';

export default function PagoPlanes({ onAprobado }: { onAprobado: () => void }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('spei');
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    api<Plan[]>('/payments/plans').then(setPlans).catch(() => {});
  }, []);

  // Polling de estado de la orden
  useEffect(() => {
    if (!order || order.status === 'paid' || order.status === 'cancelled') return;
    setPolling(true);
    const t = setInterval(async () => {
      try {
        const updated = await api<Order>(`/payments/orders/${order.id}`);
        setOrder(updated);
        if (updated.status === 'paid') {
          clearInterval(t);
          setPolling(false);
          setTimeout(onAprobado, 1500);
        }
      } catch { /* silencioso */ }
    }, 6000);
    return () => { clearInterval(t); setPolling(false); };
  }, [order?.id, order?.status]);

  async function crearOrden() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const o = await api<Order>('/payments/orders', {
        method: 'POST',
        body: JSON.stringify({ plan: selected, method }),
      });
      setOrder(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error creando orden');
    } finally {
      setLoading(false);
    }
  }

  async function copy(text: string, key: string) {
    await copyText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const planInfo = plans.find((p) => p.id === selected);

  if (order) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
          {order.status === 'paid' ? (
            <div className="space-y-3 text-center">
              <div className="text-4xl">✓</div>
              <h2 className="text-xl font-bold text-emerald-400">Pago confirmado</h2>
              <p className="text-slate-400">Tu cuenta ha sido activada. Redirigiendo...</p>
            </div>
          ) : (
            <>
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-100">Completa tu pago</h2>
                  <p className="text-sm text-slate-400">Ref: <span className="font-mono text-indigo-300">{order.refCode}</span></p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-100">${order.amount} {order.currency}</div>
                  <div className="text-xs text-slate-500">{plans.find((p) => p.id === order.plan)?.label}</div>
                </div>
              </div>

              {order.method === 'spei' && order.paymentData && (
                <SpeiInstrucciones data={order.paymentData} copied={copied} onCopy={copy} />
              )}
              {order.method === 'crypto' && order.paymentData && (
                <CryptoInstrucciones data={order.paymentData} copied={copied} onCopy={copy} />
              )}
              {order.method === 'card' && order.paymentData && (
                <CardInstrucciones data={order.paymentData} />
              )}

              <div className="mt-6 rounded-lg border border-slate-700 bg-slate-800/40 p-3 text-center text-sm text-slate-400">
                {polling ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                    Verificando pago automáticamente...
                  </span>
                ) : (
                  'El sistema detectará tu pago y activará tu cuenta automáticamente.'
                )}
              </div>

              <button
                onClick={() => setOrder(null)}
                className="mt-4 w-full rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                ← Cambiar método o plan
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 py-8">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold text-slate-100">Elige tu plan</h1>
        <p className="text-slate-400">Tu cuenta está pendiente de activación. Selecciona un plan para comenzar.</p>
      </div>

      {/* Plan selector */}
      <div className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={`rounded-2xl border p-5 text-left transition-all ${
              selected === p.id
                ? 'border-indigo-500 bg-indigo-950/60 shadow-lg shadow-indigo-900/20'
                : 'border-slate-700 bg-slate-900/60 hover:border-slate-600'
            }`}
          >
            <div className="mb-3 flex items-start justify-between">
              <span className="text-base font-semibold text-slate-100">{p.label}</span>
              {selected === p.id && <span className="text-indigo-400 text-lg">✓</span>}
            </div>
            <div className="mb-4">
              <span className="text-3xl font-bold text-slate-100">${p.price}</span>
              <span className="text-slate-500 text-sm"> MXN/{p.billing}</span>
            </div>
            <ul className="space-y-1.5">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="text-emerald-400">✓</span> {f}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>

      {/* Método de pago */}
      {selected && (
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
          <h3 className="font-semibold text-slate-200">Método de pago</h3>
          <div className="grid grid-cols-3 gap-3">
            {([['card', '💳', 'Tarjeta'], ['spei', '🏦', 'SPEI / Transferencia'], ['crypto', '₿', 'Crypto']] as [Method, string, string][]).map(([id, icon, label]) => (
              <button
                key={id}
                onClick={() => setMethod(id)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border py-4 text-sm font-medium transition-all ${
                  method === id
                    ? 'border-indigo-500 bg-indigo-950/60 text-indigo-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
              >
                <span className="text-2xl">{icon}</span>
                <span className="text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</div>
          )}

          <button
            onClick={crearOrden}
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Generando orden...' : `Continuar → $${planInfo?.price} MXN`}
          </button>
        </div>
      )}
    </div>
  );
}

function SpeiInstrucciones({ data, copied, onCopy }: { data: PaymentData; copied: string | null; onCopy: (v: string, k: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-4">
        <p className="text-sm font-medium text-amber-300 mb-3">Instrucciones de transferencia SPEI</p>
        <div className="space-y-2">
          {data.clabe && (
            <div className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
              <div>
                <div className="text-xs text-slate-500">CLABE Interbancaria</div>
                <div className="font-mono text-base text-slate-100 tracking-wider">{data.clabe}</div>
              </div>
              <button onClick={() => onCopy(data.clabe!, 'clabe')} className="text-xs text-indigo-400 hover:text-indigo-300">
                {copied === 'clabe' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          )}
          {data.banco && (
            <div className="flex justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
              <span className="text-slate-500">Banco</span>
              <span className="text-slate-200">{data.banco}</span>
            </div>
          )}
          {data.beneficiario && (
            <div className="flex justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
              <span className="text-slate-500">Beneficiario</span>
              <span className="text-slate-200">{data.beneficiario}</span>
            </div>
          )}
          {data.amount && (
            <div className="flex justify-between rounded-lg bg-slate-800/60 px-3 py-2 text-sm">
              <span className="text-slate-500">Monto exacto</span>
              <span className="font-semibold text-emerald-300">${data.amount}.00 MXN</span>
            </div>
          )}
          {data.referencia && (
            <div className="flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
              <div>
                <div className="text-xs text-slate-500">Referencia / Concepto</div>
                <div className="font-mono text-sm text-amber-300">{data.referencia}</div>
              </div>
              <button onClick={() => onCopy(data.referencia!, 'ref')} className="text-xs text-indigo-400 hover:text-indigo-300">
                {copied === 'ref' ? '✓ Copiado' : 'Copiar'}
              </button>
            </div>
          )}
        </div>
      </div>
      {data.instrucciones && (
        <ul className="space-y-1">
          {data.instrucciones.map((i, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-slate-400">
              <span className="mt-0.5 text-indigo-500">•</span> {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CryptoInstrucciones({ data, copied, onCopy }: { data: PaymentData; copied: string | null; onCopy: (v: string, k: string) => void }) {
  const cryptos = [
    { key: 'btc', label: 'Bitcoin (BTC)', address: data.bitcoin, icon: '₿' },
    { key: 'eth', label: 'Ethereum (ETH)', address: data.ethereum, icon: 'Ξ' },
    { key: 'usdt', label: 'USDT TRC-20', address: data.usdt_trc20, icon: '₮' },
  ].filter((c) => c.address);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-purple-700/40 bg-purple-950/20 p-4">
        <p className="text-sm font-medium text-purple-300 mb-1">Pago con criptomonedas</p>
        {data.amountUsd && <p className="text-xs text-slate-400 mb-3">Equivalente: ~${data.amountUsd} USD</p>}
        <div className="space-y-3">
          {cryptos.map((c) => (
            <div key={c.key} className="rounded-lg bg-slate-800/60 p-3">
              <div className="text-xs text-slate-500 mb-1">{c.icon} {c.label}</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs text-slate-300 font-mono">{c.address}</code>
                <button onClick={() => onCopy(c.address!, c.key)} className="shrink-0 text-xs text-indigo-400 hover:text-indigo-300">
                  {copied === c.key ? '✓' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
        {data.referencia && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-800/60 px-3 py-2">
            <div>
              <div className="text-xs text-slate-500">Referencia (incluir en memo)</div>
              <div className="font-mono text-sm text-amber-300">{data.referencia}</div>
            </div>
            <button onClick={() => onCopy(data.referencia!, 'ref')} className="text-xs text-indigo-400 hover:text-indigo-300">
              {copied === 'ref' ? '✓' : 'Copiar'}
            </button>
          </div>
        )}
      </div>
      {data.instrucciones && (
        <ul className="space-y-1">
          {data.instrucciones.map((i, idx) => (
            <li key={idx} className="flex items-start gap-2 text-xs text-slate-400">
              <span className="mt-0.5 text-purple-500">•</span> {i}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CardInstrucciones({ data }: { data: PaymentData }) {
  if (data.mode === 'manual') {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 text-sm text-slate-400">
        <p className="text-amber-300 font-medium mb-1">Pago con tarjeta temporalmente no disponible</p>
        <p>{data.note}</p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/20 p-4 text-sm text-slate-300">
      <p>El procesador de pagos con tarjeta (Stripe) está listo. El botón de pago se generará en breve.</p>
    </div>
  );
}
