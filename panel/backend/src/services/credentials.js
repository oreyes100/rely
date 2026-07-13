import crypto from 'crypto';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import path from 'path';
import { config } from '../config.js';

// Credenciales de los VPS cifradas en reposo (AES-256-GCM) en data/credentials.json.
const FILE = path.join(config.dataDir, 'credentials.json');
const KEY = crypto.createHash('sha256').update(config.credSecret).digest();

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

function decrypt(blob) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function load() {
  if (!existsSync(FILE)) return [];
  return JSON.parse(readFileSync(FILE, 'utf8'));
}

function save(items) {
  const tmp = FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(items, null, 2), { mode: 0o600 });
  renameSync(tmp, FILE);
}

export function upsertCredential({ node, vmid, hostname, user, password }) {
  const items = load();
  const idx = items.findIndex((c) => c.node === node && c.vmid === vmid);
  const now = new Date().toISOString();
  const entry = {
    node,
    vmid,
    hostname,
    user,
    password: encrypt(password),
    createdAt: idx >= 0 ? items[idx].createdAt : now,
    rotatedAt: idx >= 0 ? now : undefined,
  };
  if (idx >= 0) items[idx] = entry;
  else items.push(entry);
  save(items);
}

export function removeCredential(node, vmid) {
  save(load().filter((c) => !(c.node === node && c.vmid === vmid)));
}

export function listCredentials() {
  return load().map((c) => {
    let password;
    try { password = decrypt(c.password); } catch { password = null; }
    return { ...c, password };
  });
}
