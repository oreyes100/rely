import { Router } from 'express';
import { allNodes } from '../proxmox.js';

export const nodesRouter = Router();

nodesRouter.get('/', async (_req, res) => {
  const results = await Promise.all(
    allNodes().map(async ({ cfg, client }) => {
      try {
        if (cfg.type === 'hyperv') {
          const st = await client.getStatus(5000);
          return {
            name: cfg.name,
            host: cfg.host,
            subnet: `${cfg.subnetPrefix}0/24`,
            vmidRange: cfg.vmidRange,
            nodeType: 'hyperv',
            online: true,
            cpu: st.cpu ?? 0,
            maxCpu: st.maxCpu ?? 4,
            loadavg: [0, 0, 0],
            memUsed: st.memUsed ?? 0,
            memTotal: st.memTotal ?? 0,
            storUsed: 0,
            storTotal: 0,
            storAvail: 0,
            uptime: 0,
            templateReady: st.templateReady ?? false,
          };
        }
        const [status, storage] = await Promise.all([
          client.get(`/nodes/${cfg.name}/status`, undefined, 5000),
          client.get(`/nodes/${cfg.name}/storage/${cfg.storage}/status`, undefined, 5000),
        ]);
        return {
          name: cfg.name,
          host: cfg.host,
          subnet: `${cfg.subnetPrefix}0/24`,
          vmidRange: cfg.vmidRange,
          nodeType: 'proxmox',
          online: true,
          cpu: status.cpu,
          maxCpu: status.cpuinfo?.cpus ?? 0,
          loadavg: status.loadavg,
          memUsed: status.memory.used,
          memTotal: status.memory.total,
          storUsed: storage.used,
          storTotal: storage.total,
          storAvail: storage.avail,
          uptime: status.uptime,
        };
      } catch (e) {
        let error = e.message;
        if (e.isAxiosError) {
          const st = e.response?.status;
          if (st === 401 || st === 403) {
            error = `Token API inválido (HTTP ${st}) — Proxmox > Datacenter > Permissions > API Tokens > regenerar token "panel"`;
          } else if (e.code === 'ECONNREFUSED') {
            error = `Nodo sin conexión (ECONNREFUSED) — verifica que Proxmox esté activo en ${cfg.host}`;
          } else if (e.code === 'ETIMEDOUT' || e.code === 'ECONNABORTED') {
            error = `Timeout conectando a ${cfg.host}:${cfg.port || 8006}`;
          }
        }
        return {
          name: cfg.name, host: cfg.host,
          subnet: `${cfg.subnetPrefix}0/24`,
          nodeType: cfg.type ?? 'proxmox',
          online: false, error,
        };
      }
    })
  );
  res.json(results);
});
