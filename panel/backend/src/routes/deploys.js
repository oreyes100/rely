import { Router } from 'express';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { startDeploy, getDeploy, listDeploys, deleteDeploy, retryDeploy, killDeploy } from '../services/deploy.js';

export const deploysRouter = Router();

// Validar hostname/nombre de proyecto
function validHostname(v) { return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(v); }

// Listar todos los deploys (admin)
deploysRouter.get('/', (_req, res) => {
  res.json(listDeploys(null));
});

// Crear deploy (admin)
deploysRouter.post('/', async (req, res, next) => {
  try {
    const { hostname, source, appPort, db, domain, node, plan } = req.body ?? {};
    if (!hostname || !validHostname(hostname)) throw new HttpError(400, 'hostname inválido (3-30 letras minúsculas/números/guiones)');
    if (!source?.type) throw new HttpError(400, 'source.type requerido (git|zip|template)');
    if (!domain?.type) throw new HttpError(400, 'domain.type requerido (wildcard|duckdns|custom)');

    const id = await startDeploy({ hostname, source, appPort, db, domain, node, plan });
    res.status(201).json({ id });
  } catch (e) { next(e); }
});

// Estado de un deploy
deploysRouter.get('/:id', (req, res, next) => {
  try { res.json(getDeploy(req.params.id)); } catch (e) { next(e); }
});

// Terminar pipeline en ejecución (admin)
deploysRouter.post('/:id/kill', (req, res, next) => {
  try {
    killDeploy(req.params.id);
    res.json({ ok: true, mensaje: 'Deploy marcado como error. Limpia la VM huérfana si es necesario.' });
  } catch (e) { next(e); }
});

// Reintentar deploy fallido (admin)
deploysRouter.post('/:id/retry', async (req, res, next) => {
  try {
    await retryDeploy(req.params.id, typeof req.body?.variables === 'string' ? req.body.variables : undefined);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Eliminar deploy
deploysRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteDeploy(req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Servir uploads para que los guests los descarguen (con firma HMAC)
deploysRouter.get('/upload/:uploadId', (req, res, next) => {
  try {
    const { uploadId } = req.params;
    const { sig } = req.query;
    const expected = crypto.createHmac('sha256', config.jwtSecret).update(uploadId).digest('hex').slice(0, 16);
    if (sig !== expected) throw new HttpError(403, 'Firma inválida');
    const filePath = path.join(config.dataDir, 'uploads', `${uploadId}.zip`);
    if (!existsSync(filePath)) throw new HttpError(404, 'Archivo no encontrado');
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${uploadId}.zip"`);
    createReadStream(filePath).pipe(res);
  } catch (e) { next(e); }
});
