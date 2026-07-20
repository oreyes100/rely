import { Router } from 'express';
import { createInvite, listInvites, listClients, approveClient, updateClientQuota } from '../services/clients.js';

export const invitesRouter = Router();

// Generar código de invitación (opcionalmente con plan/quota/promo)
invitesRouter.post('/', (req, res) => {
  const { plan, quota, promo } = req.body ?? {};
  const code = createInvite({ plan, quota, promo });
  res.status(201).json({ code });
});

// Listar invitaciones
invitesRouter.get('/', (_req, res) => {
  res.json(listInvites());
});

// Listar clientes registrados
invitesRouter.get('/clients', (_req, res) => {
  res.json(listClients());
});

// Aprobar / gestionar cliente (admin)
invitesRouter.patch('/clients/:id', (req, res, next) => {
  try {
    const { quota, plan, approved } = req.body ?? {};
    const client = approveClient(req.params.id, {
      quota: quota != null ? Number(quota) : undefined,
      plan,
      approved: approved !== undefined ? !!approved : undefined,
    });
    res.json(client);
  } catch (e) { next(e); }
});

// Actualizar solo cuota
invitesRouter.patch('/clients/:id/quota', (req, res, next) => {
  try {
    const { quota } = req.body ?? {};
    if (quota == null || isNaN(Number(quota))) throw new Error('quota requerida');
    const client = updateClientQuota(req.params.id, Number(quota));
    res.json(client);
  } catch (e) { next(e); }
});
