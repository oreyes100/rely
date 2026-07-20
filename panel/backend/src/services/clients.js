import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from '../config.js';
import { HttpError } from '../errors.js';

const clientsFile = path.join(config.dataDir, 'clients.json');
const invitesFile = path.join(config.dataDir, 'invites.json');

function readClients() {
  if (!existsSync(clientsFile)) return [];
  try { return JSON.parse(readFileSync(clientsFile, 'utf8')); } catch { return []; }
}
function saveClients(list) { writeFileSync(clientsFile, JSON.stringify(list, null, 2)); }

function readInvites() {
  if (!existsSync(invitesFile)) return [];
  try { return JSON.parse(readFileSync(invitesFile, 'utf8')); } catch { return []; }
}
function saveInvites(list) { writeFileSync(invitesFile, JSON.stringify(list, null, 2)); }

export function createInvite({ plan = 'basico', quota = 1, promo = false } = {}) {
  const code = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 chars
  const invites = readInvites();
  invites.push({ code, plan, quota, promo, createdAt: new Date().toISOString(), usedBy: null });
  saveInvites(invites);
  return code;
}

export function listInvites() { return readInvites(); }

export async function registerClient({ email, password, inviteCode, name }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Email inválido');
  if (!password || password.length < 8) throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres');

  const invites = readInvites();
  const invite = invites.find((i) => i.code === inviteCode && !i.usedBy);
  if (!invite) throw new HttpError(400, 'Código de invitación inválido o ya usado');

  const clients = readClients();
  if (clients.some((c) => c.email.toLowerCase() === email.toLowerCase())) {
    throw new HttpError(409, 'Ya existe una cuenta con ese email');
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);

  // Invitaciones de promo o con plan definido → auto-aprobadas.
  // Invitaciones genéricas → pendientes de aprobación del admin.
  const autoApproved = !!invite.promo || !!(invite.plan && invite.quota);
  const client = {
    id,
    email: email.toLowerCase(),
    passwordHash,
    name: name || email.split('@')[0],
    quota: autoApproved ? (invite.quota ?? 1) : 0,
    plan: invite.plan ?? 'basico',
    approved: autoApproved,
    approvedAt: autoApproved ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
  };

  clients.push(client);
  saveClients(clients);

  invite.usedBy = id;
  saveInvites(invites);

  return client;
}

export async function verifyClient(email, password) {
  const clients = readClients();
  const client = clients.find((c) => c.email === email.toLowerCase());
  if (!client) throw new HttpError(401, 'Email o contraseña incorrectos');
  const ok = await bcrypt.compare(password, client.passwordHash);
  if (!ok) throw new HttpError(401, 'Email o contraseña incorrectos');
  return client;
}

export function getClient(id) {
  const clients = readClients();
  const c = clients.find((c) => c.id === id);
  if (!c) throw new HttpError(404, 'Cliente no encontrado');
  return c;
}

export function listClients() {
  return readClients().map(({ passwordHash: _, ...c }) => c);
}

// Backward compat: clientes sin campo 'approved' (creados antes del sistema de aprobación)
// se consideran aprobados. Solo los que tienen approved===false explícitamente están bloqueados.
export function isClientApproved(clientId) {
  const c = readClients().find((c) => c.id === clientId);
  if (!c) return false;
  return c.approved !== false; // undefined (legacy) → true; false → bloqueado
}

export function getClientQuota(clientId) {
  const c = readClients().find((c) => c.id === clientId);
  if (!c) return 0;
  if (c.approved === false) return 0; // no aprobado
  return c.quota ?? 1;
}

export function approveClient(clientId, { quota = 1, plan = 'basico', approved = true } = {}) {
  const clients = readClients();
  const idx = clients.findIndex((c) => c.id === clientId);
  if (idx === -1) throw new HttpError(404, 'Cliente no encontrado');
  clients[idx] = {
    ...clients[idx],
    approved,
    quota: approved ? Math.max(1, quota) : 0,
    plan: plan || clients[idx].plan,
    approvedAt: approved ? new Date().toISOString() : null,
  };
  saveClients(clients);
  const { passwordHash: _, ...safe } = clients[idx];
  return safe;
}

export function updateClientQuota(clientId, quota) {
  const clients = readClients();
  const idx = clients.findIndex((c) => c.id === clientId);
  if (idx === -1) throw new HttpError(404, 'Cliente no encontrado');
  clients[idx] = { ...clients[idx], quota: Math.max(0, quota) };
  saveClients(clients);
  const { passwordHash: _, ...safe } = clients[idx];
  return safe;
}
