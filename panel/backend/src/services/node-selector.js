import { allNodes } from '../proxmox.js';
import { HttpError } from '../errors.js';
import { callConfiguredAI, readAiSettings } from './ai-provider.js';

const GiB = 1024 ** 3;

async function gatherNodeMetrics(resources) {
  const { memoryMb, diskGb, dataDiskGb = 0 } = resources;
  const results = [];

  for (const { cfg, client } of allNodes()) {
    if (cfg.type === 'hyperv') continue;
    try {
      const storageNames = [cfg.storage];
      if (cfg.storageBulk && dataDiskGb > 0) storageNames.push(cfg.storageBulk);

      const [status, ...rest] = await Promise.all([
        client.get(`/nodes/${cfg.name}/status`, undefined, 5000),
        ...storageNames.map((s) => client.get(`/nodes/${cfg.name}/storage/${s}/status`, undefined, 5000)),
        client.get(`/nodes/${cfg.name}/qemu`, undefined, 5000),
      ]);
      const storages = rest.slice(0, storageNames.length);
      const vms = rest[storageNames.length] ?? [];
      const fast = storages[0];
      const memFreeGb = (status.memory.total - status.memory.used) / GiB;
      const diskFreeGb = fast.avail / GiB;
      const memTotalGb = status.memory.total / GiB;
      const vmCount = vms.filter((v) => !v.template).length;

      let bulkFreeGb = 0;
      if (cfg.storageBulk && storages.length > 1) {
        bulkFreeGb = storages[1].avail / GiB;
      }

      let meetsRequirements = memFreeGb >= memoryMb / 1024 + 2 && diskFreeGb >= diskGb;
      if (dataDiskGb > 0) {
        meetsRequirements = meetsRequirements && !!cfg.storageBulk && bulkFreeGb >= dataDiskGb;
      }

      results.push({
        name: cfg.name,
        host: cfg.host,
        cpuUsagePct: Math.round((status.cpu ?? 0) * 100),
        memFreeGb: Math.round(memFreeGb * 10) / 10,
        memTotalGb: Math.round(memTotalGb * 10) / 10,
        diskFreeGb: Math.round(diskFreeGb * 10) / 10,
        bulkFreeGb: Math.round(bulkFreeGb * 10) / 10,
        vmCount,
        meetsRequirements,
      });
    } catch (e) {
      results.push({ name: cfg.name, host: cfg.host, error: e.message, meetsRequirements: false });
    }
  }
  return results;
}

function diskScoringMetric(n, hasDataDisk) {
  return hasDataDisk ? (n.bulkFreeGb ?? n.diskFreeGb) : n.diskFreeGb;
}

async function selectWithAI(candidates, resources, projectHint) {
  const eligible = candidates.filter((n) => n.meetsRequirements);
  if (eligible.length === 0) throw new HttpError(503, 'No hay nodos con capacidad suficiente');
  if (eligible.length === 1) return { node: eligible[0].name, reason: 'Único nodo elegible' };

  const hasDataDisk = (resources.dataDiskGb ?? 0) > 0;
  const s = readAiSettings();
  const prompt = `Selecciona el mejor nodo Proxmox para una nueva VM.

Requerimientos:
- RAM: ${resources.memoryMb / 1024} GB (+2 GB margen)
- Cores: ${resources.cores}
${hasDataDisk ? `- Disco OS (SSD rápido): ${resources.diskGb} GB\n- Disco datos (HDD bulk): ${resources.dataDiskGb} GB` : `- Disco: ${resources.diskGb} GB (SSD rápido)`}
${projectHint ? `- Contexto: ${projectHint}` : ''}

Nodos disponibles (capacidad verificada):
${JSON.stringify(eligible, null, 2)}

Prioridades: 1) más disco libre${hasDataDisk ? ' (usar bulkFreeGb como métrica de disco)' : ''}, 2) menor CPU, 3) más RAM libre, 4) menos VMs.

Responde ÚNICAMENTE con JSON: {"node":"nombre_exacto","reason":"razón breve"}`;

  const text = await callConfiguredAI(prompt);
  const match = text.match(/\{[\s\S]+\}/);
  if (!match) throw new Error('Respuesta IA sin JSON válido');
  const result = JSON.parse(match[0]);
  if (!result.node || !candidates.find((c) => c.name === result.node)) {
    throw new Error(`Nodo inválido en respuesta IA: "${result.node}"`);
  }
  return result;
}

function selectRuleBased(candidates, hasDataDisk) {
  const eligible = candidates.filter((n) => n.meetsRequirements && !n.error);
  if (eligible.length === 0) {
    const summary = candidates.map((n) =>
      n.error ? `${n.name}(error)` : `${n.name}(disco:${n.diskFreeGb}GB,ram:${n.memFreeGb}GB)`
    ).join(', ');
    throw new HttpError(503, `No hay nodos con capacidad suficiente. Estado: ${summary}`);
  }
  const score = (n) => 0.6 * diskScoringMetric(n, hasDataDisk) + 0.3 * n.memFreeGb + 0.1 * (100 - n.cpuUsagePct);
  return eligible.reduce((best, n) => (score(n) > score(best) ? n : best));
}

export async function selectBestNode(resources, projectHint = '') {
  const hasDataDisk = (resources.dataDiskGb ?? 0) > 0;
  const candidates = await gatherNodeMetrics(resources);
  const s = readAiSettings();

  if (s.enabled && s.provider && s.model && s.apiKey) {
    try {
      const aiResult = await Promise.race([
        selectWithAI(candidates, resources, projectHint),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout 6s')), 6000)),
      ]);
      console.log(`[node-selector] IA (${s.provider}/${s.model}) → ${aiResult.node}: ${aiResult.reason}`);
      return aiResult.node;
    } catch (aiErr) {
      console.warn(`[node-selector] IA falló (${aiErr.message}), usando rule-based`);
    }
  }

  const best = selectRuleBased(candidates, hasDataDisk);
  console.log(`[node-selector] Rule-based → ${best.name} (disco: ${best.diskFreeGb} GB, ram: ${best.memFreeGb} GB)`);
  return best.name;
}
