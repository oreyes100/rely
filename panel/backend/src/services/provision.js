import { getNode, ProxmoxClient } from '../proxmox.js';
import { HttpError } from '../errors.js';
import { generatePassword } from '../utils/password.js';
import { upsertCredential } from './credentials.js';
import { logOp } from './history.js';

const GiB = 1024 ** 3;
const RAM_HEADROOM_BYTES = 2 * GiB; // no dejar el nodo sin aire

// Proxmox solo acepta [a-z0-9_.-] en tags
function sanitizeTag(t) { return String(t).toLowerCase().replace(/[^a-z0-9_.-]/g, '-'); }

// Espera a que la VM esté stopped y la destruye (con waitTask). Lanza si no lo logra.
export async function stopAndDestroy(client, nodeName, vmid, timeoutMs = 90000) {
  try { await client.post(`/nodes/${nodeName}/qemu/${vmid}/status/stop`, {}); } catch { /* ya parada */ }
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const st = await client.get(`/nodes/${nodeName}/qemu/${vmid}/status/current`).catch(() => null);
    if (!st || st.status === 'stopped') break;
    if (Date.now() > deadline) throw new HttpError(504, `Timeout esperando stop de VMID ${vmid}`);
    await new Promise((r) => setTimeout(r, 4000));
  }
  const upid = await client.del(`/nodes/${nodeName}/qemu/${vmid}`, { purge: 1 });
  await client.waitTask(upid);
}

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

  let vms = await client.get(`/nodes/${cfg.name}/qemu`);
  const dup = vms.find((vm) => vm.name === hostname && !vm.template);
  if (dup) {
    // Auto-recuperación: si es una huérfana del panel (stopped, en rango del panel,
    // sin ser el template), destruirla y continuar. Si está corriendo, no tocar.
    const inRange = dup.vmid >= cfg.vmidRange[0] && dup.vmid <= cfg.vmidRange[1];
    if (dup.status === 'stopped' && inRange) {
      logOp({ action: 'delete', node: cfg.name, vmid: dup.vmid, detail: `Huérfana "${hostname}" eliminada automáticamente antes de re-deploy` });
      await stopAndDestroy(client, cfg.name, dup.vmid);
      vms = await client.get(`/nodes/${cfg.name}/qemu`);
    } else {
      throw new HttpError(409, `Ya existe un VPS llamado "${hostname}" en ${cfg.name}`);
    }
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
      tags: tags?.length ? tags.map(sanitizeTag).join(';') : undefined,
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
    // limpieza best-effort si falló a medio camino (espera stop real antes de destroy)
    logOp({ action: 'create', node: cfg.name, vmid, detail: `FALLÓ: ${err.message}`, ok: false });
    try { await stopAndDestroy(client, cfg.name, vmid); }
    catch (e) { console.error(`[provision] No se pudo limpiar VMID ${vmid}: ${e.message}`); }
    throw err;
  }
}
