import axios from 'axios';
import { HttpError } from './errors.js';

export class HyperVClient {
  constructor(cfg) {
    this.cfg = cfg;
    this.http = axios.create({
      baseURL: `http://${cfg.host}:${cfg.agentPort || 3002}/api`,
      headers: { Authorization: `Bearer ${cfg.agentToken}` },
      timeout: 10000,
    });
  }

  async get(path, timeoutMs) {
    try {
      return (await this.http.get(path, timeoutMs ? { timeout: timeoutMs } : {})).data;
    } catch (e) {
      throw new HttpError(e.response?.status ?? 502, e.message);
    }
  }

  async post(path, body) {
    try {
      return (await this.http.post(path, body)).data;
    } catch (e) {
      throw new HttpError(e.response?.status ?? 502, e.response?.data?.error ?? e.message);
    }
  }

  async del(path) {
    try {
      return (await this.http.delete(path)).data;
    } catch (e) {
      throw new HttpError(e.response?.status ?? 502, e.message);
    }
  }

  // Crea una VM nueva clonando la plantilla Ubuntu cloud-init
  async provisionVm({ name, hostname, cores, memoryMb, diskGb, sshKey }) {
    const result = await this.post('/vms', { name, hostname, cores, memoryMb, diskGb, sshKey });
    return {
      vmid: name,       // Hyper-V usa nombres, no IDs numéricos
      node: this.cfg.name,
      user: result.user,
      password: result.password,
      hostname,
      status: result.status,
    };
  }

  async getStatus(timeoutMs = 5000) {
    return this.get('/status', timeoutMs);
  }
}
