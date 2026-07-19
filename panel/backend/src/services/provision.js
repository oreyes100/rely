import { getNode, ProxmoxClient } from '../proxmox.js';
import { HttpError } from '../errors.js';
import { generatePassword } from '../utils/password.js';
import { upsertCredential } from './credentials.js';
import { logOp } from './history.js';

const GiB = 1024 ** 3;
const RAM_HEADROOM_BYTES = 2 * GiB; // no dejar el nodo sin aire

function nextFreeVmid(cfg, existing) {
  const used = new Set(existing.map((vm) => vm.vmid));
  for (let id = cfg.vmidRange[0]; id <= cfg.vmidRange[1]; id++) {
    if (!used.has(id) && id !== cfg.templateVmid) return id;
  }
  throw new HttpError(409, `No quedan VMIDs libres en el rango ${cfg.vmidRange.join('-')} de ${cfg.name}`);
}

// Valida recursos disponibles ANTES de clonar (RAM del nodo y espacio del storage).
export async function checkCapacity(nodeName, { memoryMb, diskGb }) {
  const { cfg, client } = getNode(nodeName);
  const [status, storage] = await Promise.all([
    client.get(`/nodes/${cfg.name}/status`),
    client.get(`/nodes/${cfg.name}/storage/${cfg.storage}/status`),
  ]);
  const memFree = status.memory.total - status.memory.used;
  const memNeeded = memoryMb * 1024 * 1024 + RAM_HEADROOM_BYTES;
  if (memNeeded > memFree) {
    throw new HttpError(
      409,
      `RAM insuficiente en ${cfg.name}: libres ${(memFree / GiB).toFixed(1)} GB, ` +
        `se requieren ${(memNeeded / GiB).toFixed(1)} GB (incluye 2 GB de margen)`
    );
  }
  if (diskGb * GiB > storage.avail) {
    throw new HttpError(
      409,
      `Almacenamiento insuficiente en ${cfg.name}/${cfg.storage}: ` +
        `libres ${(storage.avail / GiB).toFixed(1)} GB, se requieren ${diskGb} GB`
    );
  }
}

export async function provisionVm({ node: nodeName, hostname, cores, memoryMb, diskGb, tags }) {
  const { cfg, client } = getNode(nodeName);

  // Nodo Hyper-V: flujo diferente (agente REST en lugar de Proxmox API)
  if (cfg.type === 'hyperv') {
    const result = await client.provisionVm({ name: hostname, hostname, cores, memoryMb, diskGb });
    upsertCredential({ node: cfg.name, vmid: hostname, hostname, user: result.user, password: result.password });
    logOp({ action: 'create', node: cfg.name, vmid: hostname, detail: `${hostname} (${cores} vCPU, ${memoryMb} MB, ${diskGb} GB) [Hyper-V]` });
    return {
      node: cfg.name,
      vmid: hostname,
      hostname,
      user: result.user,
      password: result.password,
      subnetHint: `${cfg.subnetPrefix}x (DHCP LAN; cloud-init aplica config en el primer arranque ~3-5 min)`,
    };
  }

  const vms = await client.get(`/nodes/${cfg.name}/qemu`);
  if (vms.some((vm) => vm.name === hostname)) {
    throw new HttpError(409, `Ya existe un VPS llamado "${hostname}" en ${cfg.name}`);
  }
  await checkCapacity(nodeName, { memoryMb, diskGb });
  const vmid = nextFreeVmid(cfg, vms);

  // 1. Clon completo del template (storage requerido en lvmthin para full clone)
  let upid;
  try {
    upid = await client.post(`/nodes/${cfg.name}/qemu/${cfg.templateVmid}/clone`, {
      newid: vmid,
      name: hostname,
      full: 1,
      storage: cfg.storage,
    });
  } catch (err) {
    throw new Error(ProxmoxClient.extractError(err));
  }
  await client.waitTask(upid);

  try {
    // 2. Recursos + credenciales cloud-init + etiquetas
    const password = generatePassword();
    await client.put(`/nodes/${cfg.name}/qemu/${vmid}/config`, {
      cores,
      memory: memoryMb,
      cipassword: password,
      tags: tags?.length ? tags.join(';') : undefined,
      description: `Creado por el panel el ${new Date().toISOString()}`,
    });

    // 3. Disco (el template trae 20G; solo se puede crecer)
    if (diskGb > 20) {
      await client.put(`/nodes/${cfg.name}/qemu/${vmid}/resize`, { disk: 'scsi0', size: `${diskGb}G` });
    }

    // 4. Arrancar (cloud-init aplica password y stack en el primer boot)
    await client.post(`/nodes/${cfg.name}/qemu/${vmid}/status/start`, {});

    upsertCredential({ node: cfg.name, vmid, hostname, user: 'devops', password });
    logOp({ action: 'create', node: cfg.name, vmid, detail: `${hostname} (${cores} vCPU, ${memoryMb} MB, ${diskGb} GB)` });

    return {
      node: cfg.name,
      vmid,
      hostname,
      user: 'devops',
      password,
      subnetHint: `${cfg.subnetPrefix}100-199 (DHCP; el primer arranque tarda ~3-5 min)`,
    };
  } catch (err) {
    // limpieza best-effort si falló a medio camino
    logOp({ action: 'create', node: cfg.name, vmid, detail: `FALLÓ: ${err.message}`, ok: false });
    try {
      await client.post(`/nodes/${cfg.name}/qemu/${vmid}/status/stop`, {}).catch(() => {});
      const delUpid = await client.del(`/nodes/${cfg.name}/qemu/${vmid}`, { purge: 1 });
      await client.waitTask(delUpid);
    } catch { /* dejar el VMID para inspección manual */ }
    throw err;
  }
}
