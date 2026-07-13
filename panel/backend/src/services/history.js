import { appendFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { config } from '../config.js';

const FILE = path.join(config.dataDir, 'history.jsonl');

export function logOp({ action, node, vmid, detail, ok = true, user = 'panel' }) {
  const entry = { ts: new Date().toISOString(), action, node, vmid, detail, ok, user };
  try {
    appendFileSync(FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('[history] no se pudo escribir:', e.message);
  }
  return entry;
}

export function readHistory(limit = 200) {
  if (!existsSync(FILE)) return [];
  const lines = readFileSync(FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines
    .slice(-limit)
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean)
    .reverse();
}
