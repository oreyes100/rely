import { Router } from 'express';
import { createInvite, listInvites, listClients } from '../services/clients.js';

export const invitesRouter = Router();

// Generar código de invitación
invitesRouter.post('/', (_req, res) => {
  const code = createInvite();
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
