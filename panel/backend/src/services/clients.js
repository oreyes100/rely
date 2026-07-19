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

export function createInvite() {
  const code = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 chars
  const invites = readInvites();
  invites.push({ code, createdAt: new Date().toISOString(), usedBy: null });
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
  const client = { id, email: email.toLowerCase(), passwordHash, name: name || email.split('@')[0], quota: 1, createdAt: new Date().toISOString() };

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

export function getClientQuota(clientId) {
  return readClients().find((c) => c.id === clientId)?.quota ?? 1;
}
