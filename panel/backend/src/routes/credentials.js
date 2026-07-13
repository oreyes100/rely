import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { getNode } from '../proxmox.js';
import { listCredentials, upsertCredential } from '../services/credentials.js';
import { logOp } from '../services/history.js';
import { generatePassword } from '../utils/password.js';
import { validateVmParams } from '../middleware/validate.js';

export const credentialsRouter = Router();

const regenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// Lista de credenciales almacenadas (descifradas; el transporte va por HTTPS)
credentialsRouter.get('/', (_req, res) => {
  res.json(listCredentials());
});

// Regenerar la contraseña de un VPS (aplica vía cloud-init en el siguiente arranque)
credentialsRouter.post('/:node/:vmid/regenerate', regenLimiter, validateVmParams, async (req, res, next) => {
  try {
    const { cfg, client } = getNode(req.vm.node);
    const current = await client.get(`/nodes/${cfg.name}/qemu/${req.vm.vmid}/status/current`);
    const password = generatePassword();
    await client.put(`/nodes/${cfg.name}/qemu/${req.vm.vmid}/config`, { cipassword: password });
    upsertCredential({
      node: cfg.name,
      vmid: req.vm.vmid,
      hostname: current.name ?? String(req.vm.vmid),
      user: 'devops',
      password,
    });
    logOp({ action: 'credential-rotate', node: cfg.name, vmid: req.vm.vmid, detail: 'password regenerada' });
    res.json({
      user: 'devops',
      password,
      note: 'La nueva contraseña se aplica en el siguiente reinicio del VPS (cloud-init).',
    });
  } catch (e) {
    next(e);
  }
});
