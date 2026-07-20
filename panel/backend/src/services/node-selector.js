import { allNodes } from '../proxmox.js';
import { HttpError } from '../errors.js';
import { config } from '../config.js';

const GiB = 1024 ** 3;

async function gatherNodeMetrics(resources) {
  const { memoryMb, diskGb } = resources;
  const results = [];

  for (const { cfg, client } of allNodes()) {
    if (cfg.type === 'hyperv') continue;
    try {
      const [status, storage, vms] = await Promise.all([
        client.get(`/nodes/${cfg.name}/status`, undefined, 5000),
        client.get(`/nodes/${cfg.name}/storage/${cfg.storage}/status`, undefined, 5000),
        client.get(`/nodes/${cfg.name}/qemu`, undefined, 5000),
      ]);
      const memFreeGb = (status.memory.total - status.memory.used) / GiB;
      const diskFreeGb = storage.avail / GiB;
      const memTotalGb = status.memory.total / GiB;
      const vmCount = (vms ?? []).filter((v) => !v.template).length;

      results.push({
        name: cfg.name,
        host: cfg.host,
        cpuUsagePct: Math.round((status.cpu ?? 0) * 100),
        memFreeGb: Math.round(memFreeGb * 10) / 10,
        memTotalGb: Math.round(memTotalGb * 10) / 10,
        diskFreeGb: Math.round(diskFreeGb * 10) / 10,
        vmCount,
        meetsRequirements: memFreeGb >= memoryMb / 1024 + 2 && diskFreeGb >= diskGb,
      });
    } catch (e) {
      results.push({ name: cfg.name, host: cfg.host, error: e.message, meetsRequirements: false });
    }
  }
  return results;
}

async function selectWithAI(candidates, resources, projectHint) {
  const eligible = candidates.filter((n) => n.meetsRequirements);
  if (eligible.length === 0) throw new HttpError(503, 'No hay nodos con capacidad suficiente');
  if (eligible.length === 1) return { node: eligible[0].name, reason: 'Único nodo elegible' };

  const prompt = `Selecciona el mejor nodo Proxmox para una nueva VM.

Requerimientos:
- RAM: ${resources.memoryMb / 1024} GB (se requieren +2 GB de margen)
- Disco: ${resources.diskGb} GB
- Cores: ${resources.cores}
${projectHint ? `- Contexto: ${projectHint}` : ''}

Nodos elegibles (ya verificados con capacidad):
${JSON.stringify(eligible, null, 2)}

Prioridades (en orden): 1) más disco libre, 2) menor CPU, 3) más RAM libre, 4) menos VMs existentes.

Responde ÚNICAMENTE con JSON válido: {"node": "nombre_exacto", "reason": "razón breve"}`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.anthropicApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 128,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API HTTP ${response.status}`);
  const data = await response.json();
  const text = (data.content?.[0]?.text ?? '').trim();
  const match = text.match(/\{[\s\S]+\}/);
  if (!match) throw new Error('Respuesta IA sin JSON válido');
  const result = JSON.parse(match[0]);
  if (!result.node || !candidates.find((c) => c.name === result.node)) {
    throw new Error(`Nodo inválido en respuesta IA: "${result.node}"`);
  }
  return result;
}

function selectRuleBased(candidates) {
  const eligible = candidates.filter((n) => n.meetsRequirements && !n.error);
  if (eligible.length === 0) {
    const names = candidates.map((n) => `${n.name}(${n.error ?? `disco:${n.diskFreeGb}GB ram:${n.memFreeGb}GB`})`).join(', ');
    throw new HttpError(503, `No hay nodos con capacidad suficiente. Estado: ${names}`);
  }
  const score = (n) => 0.6 * n.diskFreeGb + 0.3 * n.memFreeGb + 0.1 * (100 - n.cpuUsagePct);
  return eligible.reduce((best, n) => (score(n) > score(best) ? n : best));
}

export async function selectBestNode(resources, projectHint = '') {
  const candidates = await gatherNodeMetrics(resources);

  if (config.anthropicApiKey) {
    try {
      const aiResult = await Promise.race([
        selectWithAI(candidates, resources, projectHint),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout 6s')), 6000)),
      ]);
      console.log(`[node-selector] IA → ${aiResult.node}: ${aiResult.reason}`);
      return aiResult.node;
    } catch (aiErr) {
      console.warn(`[node-selector] IA no disponible (${aiErr.message}), usando rule-based`);
    }
  }

  const best = selectRuleBased(candidates);
  console.log(`[node-selector] Rule-based → ${best.name} (disco: ${best.diskFreeGb} GB, ram: ${best.memFreeGb} GB)`);
  return best.name;
}
