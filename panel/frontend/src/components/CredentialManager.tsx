import { useState } from 'react';
import { useCredentials, useRegenerateCredential } from '../api/queries';
import { formatDate } from '../format';
import { copyText } from '../api/client';

function PasswordCell({ password }: { password: string | null }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!password) return <span className="text-red-400">no descifrable</span>;
  return (
    <div className="flex items-center gap-2">
      <code className="font-mono text-xs">{visible ? password : '••••••••••••'}</code>
      <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => setVisible(!visible)}>
        {visible ? 'ocultar' : 'ver'}
      </button>
      <button
        className="text-xs text-indigo-300 hover:text-indigo-200"
        onClick={async () => {
          if (await copyText(password)) {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }
        }}
      >
        {copied ? '✓' : 'copiar'}
      </button>
    </div>
  );
}

export default function CredentialManager() {
  const { data: creds, isLoading } = useCredentials();
  const regen = useRegenerateCredential();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  return (
    <div className="card">
      <h2 className="mb-1 text-lg font-semibold">Credenciales SSH</h2>
      <p className="mb-4 text-sm text-slate-500">
        Contraseñas cifradas en reposo en el backend. La regeneración se aplica en el
        siguiente reinicio del VPS (cloud-init).
      </p>

      {isLoading && <p className="text-sm text-slate-400">Cargando…</p>}
      {regen.error && <p className="mb-2 text-sm text-red-400">{(regen.error as Error).message}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-3">VPS</th>
              <th className="py-2 pr-3">Nodo/VMID</th>
              <th className="py-2 pr-3">Usuario</th>
              <th className="py-2 pr-3">Contraseña</th>
              <th className="py-2 pr-3">Creado</th>
              <th className="py-2 pr-3">Rotada</th>
              <th className="py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {creds?.map((c) => {
              const key = `${c.node}/${c.vmid}`;
              return (
                <tr key={key} className="border-b border-slate-800/50">
                  <td className="py-2 pr-3 font-medium">{c.hostname}</td>
                  <td className="py-2 pr-3 text-slate-400">{c.node} / {c.vmid}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{c.user}</td>
                  <td className="py-2 pr-3"><PasswordCell password={c.password} /></td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{formatDate(c.createdAt)}</td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{c.rotatedAt ? formatDate(c.rotatedAt) : '—'}</td>
                  <td className="py-2">
                    <button
                      className="btn-ghost !px-2 !py-1 text-xs"
                      disabled={pendingKey === key}
                      onClick={() => {
                        if (!confirm(`¿Regenerar la contraseña de ${c.hostname}? La anterior dejará de valer tras el próximo reinicio.`)) return;
                        setPendingKey(key);
                        regen.mutate({ node: c.node, vmid: c.vmid }, { onSettled: () => setPendingKey(null) });
                      }}
                    >
                      {pendingKey === key ? 'Regenerando…' : 'Regenerar'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && creds?.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-500">
                  Aún no hay credenciales; se generan al crear un VPS desde el panel.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
