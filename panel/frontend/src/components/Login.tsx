import { useState } from 'react';
import { api, setToken } from '../api/client';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token } = await api<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      setToken(token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error de login');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Panel VPS</h1>
          <p className="text-sm text-slate-400">Gestión de VPS · pve / pvececyte</p>
        </div>
        <div>
          <label className="label" htmlFor="password">Contraseña</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" className="btn-primary w-full justify-center" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
