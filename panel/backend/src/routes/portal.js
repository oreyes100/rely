import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import crypto from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { clientOnly } from './auth.js';
import { getClient, getClientQuota } from '../services/clients.js';
import { startDeploy, getDeploy, listDeploys, deleteDeploy, retryDeploy } from '../services/deploy.js';
import { buildLandingZip } from '../services/sitegen.js';

export const portalRouter = Router();

const deployLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Límite de despliegues alcanzado; espera una hora' } });

function validProjectName(v) { return /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(v); }

// Vista sanitizada para el cliente — NUNCA exponer datos internos
function toPortalView(dep) {
  const stepLabels = {
    provision: 'Creando tu servidor', wait_ip: 'Iniciando el servidor',
    prepare: 'Preparando el entorno', fetch: 'Descargando tu proyecto',
    stack: 'Analizando el proyecto', build: 'Construyendo tu aplicación',
    run: 'Arrancando la aplicación', ufw: 'Configurando seguridad',
    nat: 'Conectando a la red', vhost: 'Publicando en la web',
    dns: 'Configurando dominio', tls: 'Activando HTTPS', verify: 'Verificación final',
  };
  const errorStep = dep.steps?.find((s) => s.status === 'error');
  return {
    id: dep.id,
    nombre: dep.hostname,
    url: dep.url,
    plan: dep.plan,
    estado: dep.status === 'done' ? 'activo' : dep.status === 'error' || errorStep ? 'error' : dep.status === 'deleted' ? 'eliminado' : 'en progreso',
    pasos: (dep.steps ?? []).map((s) => ({
      etiqueta: stepLabels[s.name] ?? s.name,
      estado: s.status === 'ok' ? 'listo' : s.status === 'running' ? 'en progreso' : s.status === 'error' ? 'error' : 'pendiente',
      // Solo exponer detalle en error (truncado, sin IPs ni rutas internas)
      ...(s.status === 'error' && {
        mensaje: s.detail?.replace(/192\.168\.\d+\.\d+/g, '(servidor)').replace(/\/[a-z/]+/g, '').slice(0, 200),
      }),
    })),
    db: dep.dbInfo ? {
      tipo: dep.dbInfo.tipo,
      usuario: dep.dbInfo.usuario ?? undefined,
      password: dep.dbInfo.password ?? undefined,
      nombre: dep.dbInfo.dbName ?? undefined,
      urlConexion: dep.dbInfo.urlInterna,
      nota: 'Accesible solo desde tu aplicación (red interna del servidor)',
    } : null,
    creadoEl: dep.createdAt,
  };
}

// ── Mis proyectos ─────────────────────────────────────────────────────────────
portalRouter.get('/projects', clientOnly, (req, res) => {
  const projects = listDeploys(req.clientId).filter((d) => d.status !== 'deleted');
  res.json(projects.map(toPortalView));
});

// ── Estado de un proyecto ─────────────────────────────────────────────────────
portalRouter.get('/projects/:id', clientOnly, (req, res, next) => {
  try {
    const dep = getDeploy(req.params.id);
    if (dep.clientId !== req.clientId) throw new HttpError(404, 'Proyecto no encontrado');
    res.json(toPortalView(dep));
  } catch (e) { next(e); }
});

// ── Crear proyecto ────────────────────────────────────────────────────────────
portalRouter.post('/projects', clientOnly, deployLimiter, async (req, res, next) => {
  try {
    const { nombre, tipo, gitUrl, campos, db = 'ninguna', dominio, plan = 'basico', variables } = req.body ?? {};

    // Variables de entorno opcionales: "KEY=VALUE" por línea
    let envVars = null;
    if (variables) {
      if (typeof variables !== 'string' || variables.length > 8192) throw new HttpError(400, 'Variables de entorno inválidas (máx 8 KB)');
      const lines = variables.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      for (const l of lines) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*=[^\r]*$/.test(l)) throw new HttpError(400, `Variable inválida: "${l.slice(0, 40)}" (formato: NOMBRE=valor, una por línea)`);
      }
      if (lines.length) envVars = lines.join('\n');
    }

    if (!nombre || !validProjectName(nombre)) throw new HttpError(400, 'El nombre del proyecto debe tener 3-30 letras minúsculas, números o guiones');
    if (!['plantilla', 'git'].includes(tipo)) throw new HttpError(400, 'tipo debe ser "plantilla" o "git"');

    // Verificar cupo
    const quota = getClientQuota(req.clientId);
    const active = listDeploys(req.clientId).filter((d) => !['deleted', 'error'].includes(d.status)).length;
    if (active >= quota) throw new HttpError(429, `Ya tienes ${active} proyecto(s) activo(s). Tu plan permite ${quota}. Elimina uno para crear otro.`);

    // Dominio: wildcard (subdominio de la plataforma) o custom
    let domain;
    if (!dominio || dominio.tipo === 'plataforma') {
      if (!config.appsDomain) throw new HttpError(503, 'La plataforma aún no tiene configurado el dominio de apps. Contacta al administrador.');
      domain = { type: 'wildcard' };
    } else if (dominio.tipo === 'propio') {
      if (!dominio.fqdn || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio.fqdn)) throw new HttpError(400, 'Dominio personalizado inválido');
      domain = { type: 'custom', fqdn: dominio.fqdn };
    } else if (dominio.tipo === 'duckdns') {
      if (!dominio.nombre || !/^[a-z0-9-]+$/.test(dominio.nombre)) throw new HttpError(400, 'Nombre DuckDNS inválido');
      domain = { type: 'duckdns', name: dominio.nombre, token: dominio.token };
    } else {
      throw new HttpError(400, 'dominio.tipo debe ser "plataforma", "duckdns" o "propio"');
    }

    // Preparar fuente
    let source;
    if (tipo === 'git') {
      if (!gitUrl || !/^https?:\/\//.test(gitUrl)) throw new HttpError(400, 'URL de repositorio Git inválida (debe ser una URL pública https://)');
      source = { type: 'git', gitUrl };
    } else {
      // plantilla — generar zip en el backend
      if (!campos?.negocio) throw new HttpError(400, 'El campo "negocio" es obligatorio para la plantilla');
      const uploadId = await buildLandingZip(campos);
      source = { type: 'zip', uploadId };
    }

    const id = await startDeploy({ hostname: nombre, source, db, domain, plan, envVars, clientId: req.clientId });
    res.status(201).json({ id, mensaje: 'Tu proyecto está siendo creado. Puedes ver el progreso en tu dashboard.' });
  } catch (e) { next(e); }
});

// ── Subir ZIP del usuario ─────────────────────────────────────────────────────
portalRouter.post('/uploads', clientOnly, async (req, res, next) => {
  try {
    // Recibe el zip como body binario (Content-Type: application/zip)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const data = Buffer.concat(chunks);
    if (data.length > 100 * 1024 * 1024) throw new HttpError(413, 'El archivo no puede superar 100 MB');
    const uploadId = crypto.randomUUID();
    const dir = path.join(config.dataDir, 'uploads');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `${uploadId}.zip`), data);
    res.status(201).json({ uploadId });
  } catch (e) { next(e); }
});

// ── Reintentar proyecto fallido ───────────────────────────────────────────────
portalRouter.post('/projects/:id/retry', clientOnly, deployLimiter, async (req, res, next) => {
  try {
    const dep = getDeploy(req.params.id);
    if (dep.clientId !== req.clientId) throw new HttpError(404, 'Proyecto no encontrado');
    if (dep.status !== 'error') throw new HttpError(400, 'Solo se pueden reintentar proyectos en estado de error');

    // Permitir actualizar variables de entorno en el reintento
    const { variables } = req.body ?? {};
    let envVars;
    if (typeof variables === 'string' && variables.trim()) {
      if (variables.length > 8192) throw new HttpError(400, 'Variables de entorno inválidas (máx 8 KB)');
      const lines = variables.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      for (const l of lines) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*=[^\r]*$/.test(l)) throw new HttpError(400, `Variable inválida: "${l.slice(0, 40)}" (formato: NOMBRE=valor, una por línea)`);
      }
      if (lines.length) envVars = lines.join('\n');
    }

    await retryDeploy(req.params.id, envVars);
    res.json({ ok: true, mensaje: 'Reintentando el despliegue. Puedes ver el progreso en tu dashboard.' });
  } catch (e) { next(e); }
});

// ── Eliminar proyecto ─────────────────────────────────────────────────────────
portalRouter.delete('/projects/:id', clientOnly, async (req, res, next) => {
  try {
    const dep = getDeploy(req.params.id);
    if (dep.clientId !== req.clientId) throw new HttpError(404, 'Proyecto no encontrado');
    await deleteDeploy(req.params.id);
    res.json({ ok: true, mensaje: 'Proyecto eliminado correctamente.' });
  } catch (e) { next(e); }
});

// ── Info del cliente ──────────────────────────────────────────────────────────
portalRouter.get('/me', clientOnly, (req, res, next) => {
  try {
    const c = getClient(req.clientId);
    res.json({ name: c.name, email: c.email, quota: c.quota, createdAt: c.createdAt });
  } catch (e) { next(e); }
});
