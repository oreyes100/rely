import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { allNodes, getNode } from '../proxmox.js';
import { HttpError } from '../errors.js';
import { provisionVm } from '../services/provision.js';
import { logOp } from '../services/history.js';
import { removeCredential } from '../services/credentials.js';
import { validateProvision, validateVmParams, validateAction, validateSnapname } from '../middleware/validate.js';

export const vmsRouter = Router();

// Rate limit específico para creación (operación cara: clon completo)
const provisionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de aprovisionamiento alcanzado; espera una hora' },
});

// ---- Listado global (ambos nodos) ----
vmsRouter.get('/', async (_req, res) => {
  const perNode = await Promise.all(
    allNodes().map(async ({ cfg, client }) => {
      try {
        const vms = await client.get(`/nodes/${cfg.name}/qemu`);
        return vms
          .filter((vm) => !vm.template)
          .map((vm) => ({
            node: cfg.name,
            vmid: vm.vmid,
            name: vm.name,
            status: vm.status,
            cpus: vm.cpus,
            cpu: vm.cpu ?? 0,
            mem: vm.mem ?? 0,
            maxmem: vm.maxmem,
            maxdisk: vm.maxdisk,
            uptime: vm.uptime ?? 0,
            tags: vm.tags ? vm.tags.split(/[;,]/).filter(Boolean) : [],
          }));
      } catch {
        return []; // nodo caído: el dashboard lo refleja vía /api/nodes
      }
    })
  );
  res.json(perNode.flat().sort((a, b) => a.vmid - b.vmid));
});

// ---- Crear VPS ----
vmsRouter.post('/', provisionLimiter, validateProvision, async (req, res, next) => {
  try {
    const result = await provisionVm(req.provision);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
});

// ---- Estado detallado de un VPS ----
vmsRouter.get('/:node/:vmid', validateVmParams, async (req, res, next) => {
  try {
    const { client } = getNode(req.vm.node);
    const current = await client.get(`/nodes/${req.vm.node}/qemu/${req.vm.vmid}/status/current`);
    res.json(current);
  } catch (e) {
    next(e);
  }
});

// ---- IP asignada (vía qemu-guest-agent) ----
vmsRouter.get('/:node/:vmid/ip', validateVmParams, async (req, res, next) => {
  try {
    const { cfg, client } = getNode(req.vm.node);
    const data = await client.get(`/nodes/${req.vm.node}/qemu/${req.vm.vmid}/agent/network-get-interfaces`);
    const ips = (data.result ?? [])
      .flatMap((iface) => iface['ip-addresses'] ?? [])
      .filter((ip) => ip['ip-address-type'] === 'ipv4')
      .map((ip) => ip['ip-address'])
      .filter((ip) => ip.startsWith(cfg.subnetPrefix));
    res.json({ ip: ips[0] ?? null });
  } catch {
    // agente aún no arriba (primer boot) o VM apagada
    res.json({ ip: null });
  }
});

// ---- start / shutdown / stop / reboot ----
vmsRouter.post('/:node/:vmid/action', validateVmParams, validateAction, async (req, res, next) => {
  try {
    const { client } = getNode(req.vm.node);
    const upid = await client.post(`/nodes/${req.vm.node}/qemu/${req.vm.vmid}/status/${req.action}`, {});
    await client.waitTask(upid, 120000);
    logOp({ action: req.action, node: req.vm.node, vmid: req.vm.vmid, detail: req.action });
    res.json({ ok: true });
  } catch (e) {
    logOp({ action: req.action, node: req.vm.node, vmid: req.vm.vmid, detail: e.message, ok: false });
    next(e);
  }
});

// ---- Eliminar (detiene si hace falta, purga disco y config) ----
vmsRouter.delete('/:node/:vmid', validateVmParams, async (req, res, next) => {
  const { node, vmid } = req.vm;
  try {
    const { client } = getNode(node);
    const current = await client.get(`/nodes/${node}/qemu/${vmid}/status/current`);
    if (current.status === 'running') {
      const stopUpid = await client.post(`/nodes/${node}/qemu/${vmid}/status/stop`, {});
      await client.waitTask(stopUpid, 120000);
    }
    const upid = await client.del(`/nodes/${node}/qemu/${vmid}`, { purge: 1, 'destroy-unreferenced-disks': 1 });
    await client.waitTask(upid);
    removeCredential(node, vmid);
    logOp({ action: 'destroy', node, vmid, detail: current.name ?? '' });
    res.json({ ok: true });
  } catch (e) {
    logOp({ action: 'destroy', node, vmid, detail: e.message, ok: false });
    next(e);
  }
});

// ---- Snapshots ----
vmsRouter.get('/:node/:vmid/snapshots', validateVmParams, async (req, res, next) => {
  try {
    const { client } = getNode(req.vm.node);
    const snaps = await client.get(`/nodes/${req.vm.node}/qemu/${req.vm.vmid}/snapshot`);
    res.json(snaps.filter((s) => s.name !== 'current'));
  } catch (e) {
    next(e);
  }
});

vmsRouter.post('/:node/:vmid/snapshots', validateVmParams, validateSnapname, async (req, res, next) => {
  try {
    const { client } = getNode(req.vm.node);
    const upid = await client.post(`/nodes/${req.vm.node}/qemu/${req.vm.vmid}/snapshot`, {
      snapname: req.snapname,
      description: typeof req.body?.description === 'string' ? req.body.description.slice(0, 200) : undefined,
    });
    await client.waitTask(upid);
    logOp({ action: 'snapshot-create', node: req.vm.node, vmid: req.vm.vmid, detail: req.snapname });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});

vmsRouter.post('/:node/:vmid/snapshots/:snapname/rollback', validateVmParams, validateSnapname, async (req, res, next) => {
  try {
    const { client } = getNode(req.vm.node);
    const upid = await client.post(
      `/nodes/${req.vm.node}/qemu/${req.vm.vmid}/snapshot/${req.snapname}/rollback`,
      {}
    );
    await client.waitTask(upid);
    logOp({ action: 'snapshot-rollback', node: req.vm.node, vmid: req.vm.vmid, detail: req.snapname });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

vmsRouter.delete('/:node/:vmid/snapshots/:snapname', validateVmParams, validateSnapname, async (req, res, next) => {
  try {
    const { client } = getNode(req.vm.node);
    const upid = await client.del(`/nodes/${req.vm.node}/qemu/${req.vm.vmid}/snapshot/${req.snapname}`);
    await client.waitTask(upid);
    logOp({ action: 'snapshot-delete', node: req.vm.node, vmid: req.vm.vmid, detail: req.snapname });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
