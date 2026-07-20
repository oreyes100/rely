import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { allNodes, refreshNodeToken } from '../proxmox.js';
import { HttpError } from '../errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodesFile = path.join(__dirname, '../../config/nodes.json');

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

// Actualizar tokenSecret de un nodo Proxmox sin reiniciar el panel
nodesRouter.post('/:nodeName/token', async (req, res, next) => {
  try {
    const { nodeName } = req.params;
    const { tokenSecret } = req.body ?? {};

    if (typeof tokenSecret !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tokenSecret)) {
      throw new HttpError(400, 'tokenSecret debe ser un UUID válido (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)');
    }

    const nodes = JSON.parse(readFileSync(nodesFile, 'utf8'));
    const node = nodes.find((n) => n.name === nodeName);
    if (!node) throw new HttpError(404, `Nodo no encontrado: ${nodeName}`);
    if (node.type === 'hyperv') throw new HttpError(400, 'Los nodos Hyper-V no usan tokenSecret de Proxmox');

    node.tokenSecret = tokenSecret;
    writeFileSync(nodesFile, JSON.stringify(nodes, null, 2));

    const refreshed = refreshNodeToken(nodeName, tokenSecret);
    res.json({
      ok: true,
      mensaje: refreshed
        ? `Token de ${nodeName} actualizado y aplicado. El nodo debería aparecer online en el próximo refresco.`
        : `Token guardado en nodes.json. Reinicia el panel para aplicarlo.`,
    });
  } catch (e) { next(e); }
});
