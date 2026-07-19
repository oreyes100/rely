import axios from 'axios';
import https from 'https';
import { config } from './config.js';
import { HttpError } from './errors.js';
import { HyperVClient } from './hyperv.js';

// La API de Proxmox espera application/x-www-form-urlencoded en POST/PUT.
function form(body = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) p.append(k, String(v));
  }
  return p;
}

class ProxmoxClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.http = axios.create({
      baseURL: `https://${cfg.host}:${cfg.port || 8006}/api2/json`,
      headers: { Authorization: `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}` },
      // Los nodos usan certificado auto-firmado; verifyTls=true si instalas uno válido
      httpsAgent: new https.Agent({ rejectUnauthorized: !!cfg.verifyTls }),
      timeout: 30000,
    });
  }

  async get(p, params, timeoutMs) {
    return (await this.http.get(p, { params, ...(timeoutMs && { timeout: timeoutMs }) })).data.data;
  }
  async post(p, body) { return (await this.http.post(p, form(body))).data.data; }
  async put(p, body) { return (await this.http.put(p, form(body))).data.data; }
  async del(p, params) { return (await this.http.delete(p, { params })).data.data; }

  // Extrae mensaje de error de una respuesta Proxmox (para mejorar diagnóstico)
  static extractError(err) {
    if (err?.response?.data) {
      const d = err.response.data;
      const msg = d.message ?? '';
      const errs = d.errors ? Object.entries(d.errors).map(([k, v]) => `${k}: ${v}`).join('; ') : '';
      const detail = [msg.trim(), errs].filter(Boolean).join(' — ');
      if (detail) return `Proxmox HTTP ${err.response.status}: ${detail}`;
    }
    return err?.message ?? String(err);
  }

  // Ejecuta comando en el guest vía qemu-agent, devuelve pid.
  // Proxmox espera el parámetro 'command' repetido (array), no 'command[N]'.
  async agentExec(nodeName, vmid, cmd) {
    const p = new URLSearchParams();
    p.append('command', 'bash');
    p.append('command', '-c');
    p.append('command', cmd);
    return (await this.http.post(`/nodes/${nodeName}/qemu/${vmid}/agent/exec`, p)).data.data;
  }

  // Ejecuta y espera resultado completo (polling hasta exited:1)
  async agentExecWait(nodeName, vmid, cmd, timeoutMs = 600000) {
    const { pid } = await this.agentExec(nodeName, vmid, cmd);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.get(`/nodes/${nodeName}/qemu/${vmid}/agent/exec-status`, { pid });
      if (st.exited) {
        return { exitcode: st.exitcode ?? 0, out: st['out-data'] ?? '', err: st['err-data'] ?? '' };
      }
      if (Date.now() > deadline) throw new HttpError(504, `Timeout esperando comando en guest ${vmid}`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  // Escribe un archivo en el guest vía base64 (para archivos pequeños <256KB)
  async agentWriteFile(nodeName, vmid, filePath, content) {
    const b64 = Buffer.from(content).toString('base64');
    const dir = filePath.replace(/\/[^/]+$/, '');
    const r = await this.agentExecWait(nodeName, vmid,
      `mkdir -p ${dir} && echo '${b64}' | base64 -d > ${filePath} && echo OK`
    );
    if (r.exitcode !== 0) throw new HttpError(500, `No se pudo escribir ${filePath}: ${r.err}`);
  }

  // Obtiene MAC del adaptador net0 de la VM
  async getVmMac(nodeName, vmid) {
    const cfg = await this.get(`/nodes/${nodeName}/qemu/${vmid}/config`);
    const net0 = cfg.net0 ?? '';
    const m = net0.match(/([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})/);
    return m ? m[1] : null;
  }

  // Espera a que termine una tarea de Proxmox (clone, destroy, snapshot…)
  async waitTask(upid, timeoutMs = 600000) {
    const deadline = Date.now() + timeoutMs;
    const url = `/nodes/${this.cfg.name}/tasks/${encodeURIComponent(upid)}/status`;
    for (;;) {
      const st = await this.get(url);
      if (st.status === 'stopped') {
        if (st.exitstatus !== 'OK') {
          throw new HttpError(502, `Tarea de Proxmox falló: ${st.exitstatus}`);
        }
        return st;
      }
      if (Date.now() > deadline) throw new HttpError(504, 'Timeout esperando tarea de Proxmox');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

export { ProxmoxClient };
const registry = new Map(
  config.nodes.map((n) => [
    n.name,
    { cfg: n, client: n.type === 'hyperv' ? new HyperVClient(n) : new ProxmoxClient(n) },
  ])
);

export function getNode(name) {
  const entry = registry.get(name);
  if (!entry) throw new HttpError(404, `Nodo desconocido: ${name}`);
  return entry;
}

export function allNodes() {
  return [...registry.values()];
}
