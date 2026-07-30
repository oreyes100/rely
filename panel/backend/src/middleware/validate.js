import { HttpError } from '../errors.js';
import { getNode } from '../proxmox.js';

// Validación estricta de inputs: todo lo que viaja hacia la API de Proxmox
// pasa por regex/rangos cerrados (anti-inyección en parámetros qm/API).

const HOSTNAME_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const TAG_RE = /^[a-z0-9][a-z0-9_.-]{0,20}$/;
const SNAPNAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{1,39}$/;
const ACTIONS = new Set(['start', 'shutdown', 'stop', 'reboot']);

function intIn(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function validateProvision(req, _res, next) {
  const b = req.body ?? {};
  const errors = [];

  if (typeof b.node !== 'string') errors.push('node requerido');
  if (typeof b.hostname !== 'string' || !HOSTNAME_RE.test(b.hostname)) {
    errors.push('hostname inválido (3-30 chars, minúsculas/dígitos/guiones, empieza con letra o dígito)');
  }
  const cores = intIn(b.cores, 1, 8);
  if (cores === null) errors.push('cores debe ser entero entre 1 y 8');
  const memoryMb = intIn(b.memoryMb, 512, 16384);
  if (memoryMb === null) errors.push('memoryMb debe ser entero entre 512 y 16384');
  const diskGb = intIn(b.diskGb, 20, 200);
  if (diskGb === null) errors.push('diskGb debe ser entero entre 20 y 200');
  const dataDiskGb = b.dataDiskGb === undefined || b.dataDiskGb === 0 ? 0 : intIn(b.dataDiskGb, 10, 800);
  if (dataDiskGb === null) errors.push('dataDiskGb debe ser entero entre 10 y 800, o ausente');

  let tags = [];
  if (b.tags !== undefined) {
    if (!Array.isArray(b.tags) || b.tags.length > 5 || b.tags.some((t) => typeof t !== 'string' || !TAG_RE.test(t))) {
      errors.push('tags: máximo 5, minúsculas/dígitos/._-');
    } else {
      tags = b.tags;
    }
  }

  if (errors.length) return next(new HttpError(400, errors.join('; ')));
  req.provision = { node: b.node, hostname: b.hostname, cores, memoryMb, diskGb, dataDiskGb, tags };
  next();
}

// Valida :node y :vmid de la URL y protege el template.
export function validateVmParams(req, _res, next) {
  try {
    const { cfg } = getNode(req.params.node); // lanza 404 si el nodo no existe
    const vmid = intIn(req.params.vmid, 100, 999999999);
    if (vmid === null) throw new HttpError(400, 'vmid inválido');
    if (vmid === cfg.templateVmid) throw new HttpError(403, 'El template está protegido');
    req.vm = { node: cfg.name, vmid };
    next();
  } catch (e) {
    next(e);
  }
}

export function validateAction(req, _res, next) {
  const { action } = req.body ?? {};
  if (!ACTIONS.has(action)) return next(new HttpError(400, `action debe ser: ${[...ACTIONS].join(', ')}`));
  req.action = action;
  next();
}

export function validateSnapname(req, _res, next) {
  const name = req.body?.name ?? req.params.snapname;
  if (typeof name !== 'string' || !SNAPNAME_RE.test(name)) {
    return next(new HttpError(400, 'Nombre de snapshot inválido (letras/dígitos/_-, empieza con letra, 2-40 chars)'));
  }
  req.snapname = name;
  next();
}
