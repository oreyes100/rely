import { Router } from 'express';
import { clientOnly, adminOnly } from './auth.js';
import { HttpError } from '../errors.js';
import {
  listPlans, createOrder, getOrder, listClientOrders, listAllOrders,
  confirmPayment, cancelOrder,
} from '../services/payments.js';

export const paymentsRouter = Router();

// ── Portal (cliente) ──────────────────────────────────────────────────────────

// Planes disponibles (público — también usado en landing)
paymentsRouter.get('/plans', (_req, res) => {
  res.json(listPlans());
});

// Crear orden de pago
paymentsRouter.post('/orders', clientOnly, async (req, res, next) => {
  try {
    const { plan, method } = req.body ?? {};
    if (!plan) throw new HttpError(400, 'plan requerido');
    if (!method) throw new HttpError(400, 'method requerido (card|spei|crypto)');
    const order = await createOrder({ clientId: req.clientId, plan, method });
    res.status(201).json(order);
  } catch (e) { next(e); }
});

// Ver mis órdenes
paymentsRouter.get('/orders', clientOnly, (req, res) => {
  res.json(listClientOrders(req.clientId));
});

// Ver orden específica
paymentsRouter.get('/orders/:id', clientOnly, (req, res, next) => {
  try {
    const o = getOrder(req.params.id);
    if (o.clientId !== req.clientId) throw new HttpError(404, 'Orden no encontrada');
    res.json(o);
  } catch (e) { next(e); }
});

// ── Admin ─────────────────────────────────────────────────────────────────────

paymentsRouter.get('/admin/orders', adminOnly, (req, res) => {
  res.json(listAllOrders());
});

paymentsRouter.post('/admin/orders/:id/confirm', adminOnly, async (req, res, next) => {
  try {
    const { ref } = req.body ?? {};
    const order = await confirmPayment(req.params.id, { providerRef: ref, confirmedBy: 'admin-manual' });
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});

paymentsRouter.post('/admin/orders/:id/cancel', adminOnly, async (req, res, next) => {
  try {
    const order = cancelOrder(req.params.id);
    res.json({ ok: true, order });
  } catch (e) { next(e); }
});
