import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { registerProxmoxUiProxies } from './routes/proxmox-ui.js';
import { authRouter, authMiddleware } from './routes/auth.js';
import { nodesRouter } from './routes/nodes.js';
import { vmsRouter } from './routes/vms.js';
import { credentialsRouter } from './routes/credentials.js';
import { historyRouter } from './routes/history.js';
import { servicesRouter } from './routes/services.js';

const app = express();
app.set('trust proxy', 'loopback'); // detrás de nginx en el mismo host
app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '50kb' }));

// ── Proxy de la UI de Proxmox ─────────────────────────────────────────────────
// Montado ANTES del middleware JWT: los iframes no pueden enviar cabeceras
// Authorization. La autenticación corre a cargo del propio Proxmox (PVEAuthCookie).
const proxmoxUiEntries = registerProxmoxUiProxies(app);
// ─────────────────────────────────────────────────────────────────────────────

app.use(
  '/api',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 2000, standardHeaders: true, legacyHeaders: false })
);

app.use('/api/auth', authRouter);
app.use('/api', authMiddleware); // todo lo demás requiere sesión JWT
app.use('/api/nodes', nodesRouter);
app.use('/api/vms', vmsRouter);
app.use('/api/credentials', credentialsRouter);
app.use('/api/history', historyRouter);
app.use('/api/services', servicesRouter);

app.use((_req, _res, next) => next(new HttpError(404, 'Ruta no encontrada')));

// Manejador de errores: nunca filtrar tokens ni detalles internos de axios
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
  console.log(`Nodos configurados: ${config.nodes.map((n) => `${n.name}(${n.host})`).join(', ')}`);
});

// WebSocket: necesario para la consola VNC/SPICE de Proxmox en el iframe
server.on('upgrade', (req, socket, head) => {
  for (const { mountPath, proxy } of proxmoxUiEntries) {
    if (req.url.startsWith(mountPath)) {
      proxy.upgrade(req, socket, head);
      return;
    }
  }
  socket.destroy(); // WebSocket desconocido — cerrar limpiamente
});

// Los clones completos tardan minutos: no cortar respuestas largas
server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 16 * 60 * 1000;
