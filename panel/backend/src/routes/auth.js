import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login; espera 15 minutos' },
});

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

authRouter.post('/login', loginLimiter, (req, res, next) => {
  const { password } = req.body ?? {};
  if (typeof password !== 'string' || !safeEqual(password, config.panelPassword)) {
    return next(new HttpError(401, 'Contraseña incorrecta'));
  }
  const token = jwt.sign({ sub: 'panel-user' }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
  res.json({ token, expiresInHours: config.sessionHours });
});

export function authMiddleware(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new HttpError(401, 'No autenticado'));
  try {
    jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new HttpError(401, 'Sesión inválida o expirada'));
  }
}
