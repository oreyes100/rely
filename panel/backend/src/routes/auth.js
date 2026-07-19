import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { verifyClient, registerClient } from '../services/clients.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos; espera 15 minutos' },
});

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ── Admin login ────────────────────────────────────────────────────────────────
authRouter.post('/login', loginLimiter, (req, res, next) => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || !safeEqual(password, config.panelPassword)) {
    return next(new HttpError(401, 'Contraseña incorrecta'));
  }
  const token = jwt.sign({ sub: 'panel-admin', role: 'admin' }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.json({ token, role: 'admin', expiresInHours: config.sessionHours });
});

// ── Portal: registro de cliente ───────────────────────────────────────────────
authRouter.post('/portal/register', loginLimiter, async (req, res, next) => {
  try {
    const { email, password, inviteCode, name } = req.body ?? {};
    if (!email || !password || !inviteCode) throw new HttpError(400, 'Faltan campos obligatorios');
    const client = await registerClient({ email, password, inviteCode, name });
    const token = jwt.sign({ sub: client.id, role: 'client' }, config.jwtSecret, {
      expiresIn: `${config.sessionHours}h`,
    });
    res.status(201).json({ token, role: 'client', expiresInHours: config.sessionHours });
  } catch (e) { next(e); }
});

// ── Portal: login de cliente ──────────────────────────────────────────────────
authRouter.post('/portal/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) throw new HttpError(400, 'Faltan email o contraseña');
    const client = await verifyClient(email, password);
    const token = jwt.sign({ sub: client.id, role: 'client' }, config.jwtSecret, {
      expiresIn: `${config.sessionHours}h`,
    });
    res.json({ token, role: 'client', expiresInHours: config.sessionHours });
  } catch (e) { next(e); }
});

// ── Middlewares ───────────────────────────────────────────────────────────────
export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'No autenticado'));
  try {
    req.jwtPayload = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Sesión inválida o expirada'));
  }
}

export function adminOnly(req, _res, next) {
  if (req.jwtPayload?.role !== 'admin') return next(new HttpError(403, 'Acceso restringido a administradores'));
  next();
}

export function clientOnly(req, _res, next) {
  if (req.jwtPayload?.role !== 'client') return next(new HttpError(403, 'Acceso solo para clientes del portal'));
  req.clientId = req.jwtPayload.sub;
  next();
}
