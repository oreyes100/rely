import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { registerProxmoxUiProxies } from './routes/proxmox-ui.js';
import { authRouter, authMiddleware, adminOnly } from './routes/auth.js';
import { nodesRouter } from './routes/nodes.js';
import { vmsRouter } from './routes/vms.js';
import { credentialsRouter } from './routes/credentials.js';
import { historyRouter } from './routes/history.js';
import { servicesRouter } from './routes/services.js';
import { deploysRouter } from './routes/deploys.js';
import { invitesRouter } from './routes/invites.js';
import { portalRouter } from './routes/portal.js';
import { webhookRouter } from './routes/webhook.js';

const app = express();
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '50kb' }));

// Proxy UI de Proxmox (sin JWT — autenticación propia de Proxmox)
const proxmoxUiEntries = registerProxmoxUiProxies(app);

app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false }));

// ── Auth (público) ────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);

// ── Webhooks internos (shared secret, no JWT) ─────────────────────────────────
app.use('/api/webhook', webhookRouter);

// ── Portal: upload de zips y proyectos del cliente ────────────────────────────
// Nota: clientOnly se aplica dentro de portalRouter, no aquí, porque /auth/portal/* es público
app.use('/api/portal', authMiddleware, portalRouter);

// ── Rutas ADMIN (todas protegidas por authMiddleware + adminOnly) ──────────────
app.use('/api', authMiddleware, adminOnly);
app.use('/api/nodes', nodesRouter);
app.use('/api/vms', vmsRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/history', historyRouter);
app.use('/api/services', servicesRouter);
app.use('/api/deploys', deploysRouter);
app.use('/api/invites', invitesRouter);

app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

app.use((err, _req, res, _next) => {
  let status = err instanceof HttpError ? err.status : 500;
  let message = err instanceof HttpError ? err.message : 'Error interno';
  if (err.isAxiosError) {
    status = err.response?.status === 401 ? 502 : err.response?.status ?? 502;
    const pveErrors = err.response?.data?.errors;
    message = pveErrors
      ? `Proxmox: ${Object.entries(pveErrors).map(([k, v]) => `${k}: ${v}`).join('; ')}`
      : `Error comunicando con Proxmox (${err.code ?? status})`;
  }
  if (status >= 500) console.error('[error]', err.message);
  res.status(status).json({ error: message });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Panel backend escuchando en http://${config.host}:${config.port}`);
  console.log(`Nodos: ${config.nodes.map((n) => `${n.name}(${n.host})`).join(', ')}`);
  if (config.appsDomain) console.log(`Portal apps: https://*.${config.appsDomain}/`);
});

server.on('upgrade', (req, socket, head) => {
  for (const { mountPath, proxy } of proxmoxUiEntries) {
    if (req.url.startsWith(mountPath)) { proxy.upgrade(req, socket, head); return; }
  }
  socket.destroy();
});

server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 16 * 60 * 1000;
