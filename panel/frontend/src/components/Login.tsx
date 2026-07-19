import { useState } from 'react';
import { api, setToken } from '../api/client';

type Tab = 'admin' | 'cliente';
type ClientMode = 'login' | 'registro';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [tab, setTab] = useState<Tab>('admin');
  const [clientMode, setClientMode] = useState<ClientMode>('login');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [clientPassword, setClientPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { token } = await api<{ token: string }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ password }),
      });
      setToken(token); onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Credenciales incorrectas');
    } finally { setBusy(false); }
  }

  async function submitClient(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const path = clientMode === 'login' ? '/auth/portal/login' : '/auth/portal/register';
      const body = clientMode === 'login'
        ? { email, password: clientPassword }
        : { email, password: clientPassword, name, inviteCode };
      const { token } = await api<{ token: string }>(path, {
        method: 'POST', body: JSON.stringify(body),
      });
      setToken(token); onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Panel VPS</h1>
          <p className="text-sm text-slate-400">Plataforma de hosting gestionado</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg bg-slate-800 p-1">
          {(['admin', 'cliente'] as Tab[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setError(null); }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-slate-700 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}>
              {t === 'admin' ? 'Administrador' : 'Cliente'}
            </button>
          ))}
        </div>

        {tab === 'admin' ? (
          <form onSubmit={submitAdmin} className="space-y-4">
            <div>
              <label className="label" htmlFor="admin-pass">Contraseña de administrador</label>
              <input id="admin-pass" type="password" className="input" value={password}
                onChange={(e) => setPassword(e.target.value)} autoFocus required />
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Sub-tabs login/registro */}
            <div className="flex border-b border-slate-700">
              {(['login', 'registro'] as ClientMode[]).map((m) => (
                <button key={m} onClick={() => { setClientMode(m); setError(null); }}
                  className={`px-4 py-2 text-sm capitalize transition-colors ${
                    clientMode === m ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
                  }`}>
                  {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                </button>
              ))}
            </div>

            <form onSubmit={submitClient} className="space-y-3">
              {clientMode === 'registro' && (
                <>
                  <div>
                    <label className="label" htmlFor="c-name">Nombre completo</label>
                    <input id="c-name" type="text" className="input" value={name}
                      onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label" htmlFor="c-invite">Código de invitación</label>
                    <input id="c-invite" type="text" className="input font-mono" value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.trim())} required
                      placeholder="xxxxxxxxxxxx" />
                  </div>
                </>
              )}
              <div>
                <label className="label" htmlFor="c-email">Correo electrónico</label>
                <input id="c-email" type="email" className="input" value={email}
                  onChange={(e) => setEmail(e.target.value)} required autoFocus={clientMode === 'login'} />
              </div>
              <div>
                <label className="label" htmlFor="c-pass">Contraseña</label>
                <input id="c-pass" type="password" className="input" value={clientPassword}
                  onChange={(e) => setClientPassword(e.target.value)} required minLength={8} />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
                {busy ? 'Procesando…' : clientMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
