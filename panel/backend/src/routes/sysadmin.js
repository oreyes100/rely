import { Router } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { readdirSync, existsSync, statSync } from 'fs';
import path from 'path';
import { HttpError } from '../errors.js';
import { readAiSettings, saveAiSettings, callAI } from '../services/ai-provider.js';

const VALID_PROVIDERS = new Set(['anthropic', 'google', 'openrouter', 'groq']);

const execAsync = promisify(execFile);
export const sysadminRouter = Router();

const ALLOWED_SERVICES = new Set(['nginx', 'vps-panel', 'fossbilling', 'mariadb', 'mysql', 'postgresql', 'redis-server']);
const ALLOWED_ACTIONS = new Set(['start', 'stop', 'restart', 'reload']);
const ALLOWED_LOG_SERVICES = new Set(['nginx', 'vps-panel', 'fossbilling']);

async function safeExec(cmd, args, timeoutMs = 8000) {
  try {
    const { stdout, stderr } = await execAsync(cmd, args, { timeout: timeoutMs });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (e) {
    return { ok: false, stdout: '', stderr: (e.stderr ?? e.message ?? '').trim(), exitCode: e.code };
  }
}

// ── Servicios ─────────────────────────────────────────────────────────────────
sysadminRouter.get('/services', async (_req, res) => {
  const names = ['nginx', 'vps-panel', 'mariadb', 'mysql', 'postgresql', 'redis-server', 'fossbilling'];
  const results = await Promise.all(names.map(async (name) => {
    const [active, enabled] = await Promise.all([
      safeExec('systemctl', ['is-active', name]),
      safeExec('systemctl', ['is-enabled', name]),
    ]);
    const activeStr = active.stdout || 'inactive';
    const enabledStr = enabled.stdout || 'unknown';
    // Filtrar unidades que no existen en el sistema
    if (activeStr.includes('not-found') || enabledStr.includes('not-found')) return null;
    return { name, active: activeStr, enabled: enabledStr, running: activeStr === 'active' };
  }));
  res.json(results.filter(Boolean));
});

sysadminRouter.post('/services/:name/action', async (req, res, next) => {
  try {
    const { name } = req.params;
    const { action } = req.body ?? {};
    if (!ALLOWED_SERVICES.has(name)) throw new HttpError(400, 'Servicio no permitido');
    if (!ALLOWED_ACTIONS.has(action)) throw new HttpError(400, 'Acción no válida: usa start, stop, restart o reload');
    const r = await safeExec('sudo', ['/usr/local/bin/panel-sysadmin', action, name], 20000);
    if (!r.ok) throw new HttpError(500, r.stderr || `Error al ejecutar ${action} ${name}`);
    res.json({ ok: true, output: r.stdout });
  } catch (e) { next(e); }
});

// ── SSL Certs ─────────────────────────────────────────────────────────────────
const CERT_SEARCH_DIRS = [
  '/etc/nginx/ssl',
  '/etc/letsencrypt/live',
  '/etc/letsencrypt/renewal',  // solo para enumerar dominios
];

sysadminRouter.get('/certs', async (_req, res) => {
  const certs = [];

  async function checkCert(domain, filePath) {
    const r = await safeExec('openssl', ['x509', '-enddate', '-subject', '-noout', '-in', filePath]);
    if (!r.ok) return null;
    const dateMatch = r.stdout.match(/notAfter=(.+)/);
    const expiry = dateMatch ? new Date(dateMatch[1].trim()) : null;
    const daysLeft = expiry ? Math.floor((expiry.getTime() - Date.now()) / 86_400_000) : null;
    return { domain, file: filePath, expiry: expiry?.toISOString() ?? null, daysLeft };
  }

  for (const dir of ['/etc/nginx/ssl', '/etc/letsencrypt/live']) {
    if (!existsSync(dir)) continue;
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const entry of entries) {
      const entryPath = path.join(dir, entry);
      // Buscar fullchain.pem dentro del subdirectorio
      const fullchain = path.join(entryPath, 'fullchain.pem');
      if (existsSync(fullchain)) {
        const result = await checkCert(entry, fullchain);
        if (result) certs.push(result);
        continue;
      }
      // O el propio archivo si termina en .pem/.crt
      if (['.pem', '.crt'].some((ext) => entry.endsWith(ext))) {
        try {
          const st = statSync(entryPath);
          if (st.isFile()) {
            const result = await checkCert(entry.replace(/\.(pem|crt)$/, ''), entryPath);
            if (result) certs.push(result);
          }
        } catch { /* skip */ }
      }
    }
  }

  res.json(certs.sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999)));
});

// ── nginx vhosts ──────────────────────────────────────────────────────────────
sysadminRouter.get('/vhosts', (_req, res) => {
  const availDir = '/etc/nginx/sites-available';
  const enabledDir = '/etc/nginx/sites-enabled';

  if (!existsSync(availDir)) return res.json([]);

  let available = [];
  let enabled = [];
  try { available = readdirSync(availDir); } catch { /* */ }
  try { enabled = readdirSync(enabledDir); } catch { /* */ }

  const enabledSet = new Set(enabled);
  const vhosts = available.map((name) => ({ name, enabled: enabledSet.has(name) }));
  res.json(vhosts);
});

sysadminRouter.post('/vhosts/:name/enable', async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new HttpError(400, 'Nombre de vhost inválido');
    const r = await safeExec('sudo', ['/usr/local/bin/panel-sysadmin', 'vhost-enable', name], 15000);
    if (!r.ok) throw new HttpError(500, r.stderr || 'Error habilitando vhost');
    res.json({ ok: true, output: r.stdout });
  } catch (e) { next(e); }
});

sysadminRouter.post('/vhosts/:name/disable', async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) throw new HttpError(400, 'Nombre de vhost inválido');
    const r = await safeExec('sudo', ['/usr/local/bin/panel-sysadmin', 'vhost-disable', name], 15000);
    if (!r.ok) throw new HttpError(500, r.stderr || 'Error deshabilitando vhost');
    res.json({ ok: true, output: r.stdout });
  } catch (e) { next(e); }
});

// ── nginx config test ─────────────────────────────────────────────────────────
sysadminRouter.post('/nginx/test', async (_req, res, next) => {
  try {
    const r = await safeExec('sudo', ['/usr/local/bin/panel-sysadmin', 'nginx-test'], 10000);
    res.json({ ok: r.ok, output: (r.stdout + '\n' + r.stderr).trim() });
  } catch (e) { next(e); }
});

// ── Logs ──────────────────────────────────────────────────────────────────────
sysadminRouter.get('/logs/:service', async (req, res, next) => {
  try {
    const { service } = req.params;
    const lines = Math.min(Math.max(Number(req.query.lines ?? 100), 20), 500);
    if (!ALLOWED_LOG_SERVICES.has(service)) throw new HttpError(400, 'Servicio de log no permitido');
    const r = await safeExec(
      'journalctl',
      ['-u', service, '-n', String(lines), '--no-pager', '-o', 'short-iso', '--no-hostname'],
      15000,
    );
    const logLines = (r.stdout || r.stderr).split('\n').filter(Boolean);
    res.json({ ok: true, service, lines: logLines });
  } catch (e) { next(e); }
});

// ── Modelos gratuitos de OpenRouter (caché 1h en memoria) ────────────────────
let _orCache = null;
let _orCacheAt = 0;
const OR_TTL = 3_600_000;

sysadminRouter.get('/openrouter-models', async (_req, res, next) => {
  try {
    const now = Date.now();
    if (_orCache && now - _orCacheAt < OR_TTL) {
      return res.json({ models: _orCache, cached: true });
    }
    const r = await fetch('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(10_000),
      headers: { 'HTTP-Referer': 'https://capuvps.duckdns.org', 'X-Title': 'VPS Panel' },
    });
    if (!r.ok) throw new HttpError(502, `OpenRouter models API: HTTP ${r.status}`);
    const data = await r.json();
    const free = (data.data ?? [])
      .filter(m => String(m.id).endsWith(':free'))
      .map(m => ({
        id: m.id,
        name: (m.name ?? m.id).replace(/\s*\(free\)\s*/i, '').trim(),
        context: m.context_length ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    _orCache = free;
    _orCacheAt = now;
    res.json({ models: free, cached: false });
  } catch (e) {
    if (e instanceof HttpError) return next(e);
    next(new HttpError(502, e.message));
  }
});

// ── Configuración de IA para selección de nodo ───────────────────────────────
sysadminRouter.get('/ai-settings', (_req, res) => {
  const s = readAiSettings();
  res.json({
    provider: s.provider ?? null,
    model: s.model ?? null,
    apiKeySet: !!(s.apiKey),
    apiKeyHint: s.apiKey ? `...${s.apiKey.slice(-6)}` : null,
    enabled: s.enabled ?? false,
  });
});

sysadminRouter.put('/ai-settings', async (req, res, next) => {
  try {
    const { provider, model, apiKey, enabled } = req.body ?? {};
    if (provider && !VALID_PROVIDERS.has(provider)) throw new HttpError(400, 'Proveedor inválido');
    const current = readAiSettings();
    const updated = {
      provider: provider ?? current.provider,
      model: model ?? current.model,
      // Si apiKey es string vacío → borrar; si es undefined → conservar el actual
      apiKey: typeof apiKey === 'string' ? apiKey : current.apiKey,
      enabled: enabled !== undefined ? !!enabled : current.enabled,
    };
    saveAiSettings(updated);
    res.json({ ok: true, provider: updated.provider, model: updated.model, enabled: updated.enabled });
  } catch (e) { next(e); }
});

sysadminRouter.post('/ai-settings/test', async (req, res, next) => {
  try {
    const s = readAiSettings();
    if (!s.provider || !s.model || !s.apiKey) {
      throw new HttpError(400, 'Configura proveedor, modelo y API key antes de probar');
    }
    const t0 = Date.now();
    const text = await Promise.race([
      callAI(s.provider, s.model, s.apiKey,
        'Responde SOLO con este JSON exacto, sin texto adicional: {"node":"test-ok","reason":"conexion exitosa"}'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 12s')), 12000)),
    ]);
    res.json({ ok: true, provider: s.provider, model: s.model, response: text.slice(0, 300), ms: Date.now() - t0 });
  } catch (e) {
    if (e instanceof HttpError) return next(e);
    // Errores de la IA (modelo inválido, sin cuota, timeout) → 502 con mensaje real
    next(new HttpError(502, e.message));
  }
});

// ── Info de sistema (uptime, kernel) ─────────────────────────────────────────
sysadminRouter.get('/system', async (_req, res) => {
  const [uptime, kernel, hostname] = await Promise.all([
    safeExec('uptime', ['-p']),
    safeExec('uname', ['-r']),
    safeExec('hostname', []),
  ]);
  res.json({
    uptime: uptime.stdout,
    kernel: kernel.stdout,
    hostname: hostname.stdout,
  });
});
