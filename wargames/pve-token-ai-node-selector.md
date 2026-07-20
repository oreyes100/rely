# War-game: token pve + selector de nodo IA + corrección de retry
> Executor: ejecuta los movimientos en orden. Lee las señales de fallo antes de cada movimiento. Revisa condiciones de abort tras cada movimiento.

## Mission objective
Resolver dos problemas que bloquean el panel en producción (`192.168.1.34`):

**A — Nodo pve sin mostrar**: El dashboard admin muestra pve (192.168.1.4) como "sin conexión" con "Token API inválido (HTTP 401)". El usuario confirma que pve está corriendo. Se necesita: (1) un mecanismo para actualizar el token sin SSH y (2) un endpoint de diagnóstico real que distinga token inválido de nodo caído.

**B — Deploy bloqueado por mal selector de nodo**:
- El selector actual elige el nodo con más RAM libre → ignora disco → elige `pvelenovo` (16.7 GB libres) para un plan que necesita 20 GB → `checkCapacity` falla.
- `retryDeploy` reutiliza `dep.node` en vez de re-seleccionar → el retry vuelve al mismo nodo lleno → fallo en loop.
- El usuario quiere que se use IA (Claude) para seleccionar el mejor nodo del cluster considerando CPU, RAM, disco y carga existente.

Criterios de éxito:
- El panel muestra un botón/endpoint para actualizar el tokenSecret de un nodo sin SSH.
- El log NO muestra más `RETRY-FATAL: Almacenamiento insuficiente en pvelenovo`.
- Los nuevos deploys eligen `pvececyte` (el único nodo con capacidad real).
- `retryDeploy` re-selecciona nodo en vez de reusar el fallido.
- La selección de nodo usa Claude Haiku como árbitro con fallback rule-based.

---

## Recon summary

**Cluster actual:**
- `pve` (192.168.1.4): Responde HTTP, devuelve 401. Token en nodes.json inválido. El nodo SÍ está corriendo.
- `pvececyte` (192.168.1.254): Online, API funcional, tiene capacidad.
- `pvelenovo` (192.168.1.15): EHOSTUNREACH desde el panel O responde pero `local-lvm` tiene sólo 16.7 GB libres. Con 20 GB mínimo requerido → siempre falla.
- `aulamedios` (192.168.1.229): Hyper-V, timeout, agente caído.

**Bug confirmado en código:**
- `panel/backend/src/services/deploy.js` línea ~240: el selector de nodo sólo evalúa `free RAM` (`st.memory.total - st.memory.used`). No consulta storage.
- `retryDeploy` línea ~626: `pipeline(deployId, resources, dep.node)` — pasa `dep.node` directamente, nunca re-selecciona.
- `checkCapacity` en `provision.js` valida RAM Y disco, pero se llama DESPUÉS de haber elegido el nodo. Si el nodo falla checkCapacity, el deploy aborta y el retry vuelve al mismo nodo.

**Selección de nodo con IA:**
- Usar `claude-haiku-4-5-20251001` (rápido, barato) vía `@anthropic-ai/sdk`.
- Input: array de métricas de cada nodo + requerimientos del proyecto.
- Output: JSON `{ node: "nombre", reason: "..." }`.
- Fallback: si Claude no responde en 5s o falla, usar selector rule-based mejorado (considera RAM Y disco).
- `ANTHROPIC_API_KEY` debe estar en `.env` del panel (verificar antes de implementar).

**Actualización de token sin SSH:**
- Nuevo endpoint admin: `POST /api/nodes/:name/token` con body `{ tokenSecret: "uuid" }`.
- Lee nodes.json, actualiza el nodo, escribe de vuelta, reinicia en memoria.
- UI en `DashboardLayout`: botón "Actualizar token" que abre modal con input.
- Alternativa más simple: mostrar en el dashboard admin un formulario inline cuando `online === false && error.includes('Token API')`.

---

## Moves

### Move 1: Verificar ANTHROPIC_API_KEY y dependencia sdk en el backend

**Action:**
```bash
ssh root@192.168.1.34 "grep ANTHROPIC_API_KEY /opt/vps-panel/backend/.env || echo 'NO ENCONTRADA'"
ls C:\vpsserver\panel\backend\package.json  # verificar si @anthropic-ai/sdk ya está
grep -i anthropic C:\vpsserver\panel\backend\package.json || echo 'SDK no instalado'
```
Si el SDK no está instalado:
```powershell
cd C:\vpsserver\panel\backend
npm install @anthropic-ai/sdk
```
Si `ANTHROPIC_API_KEY` no está en el .env del servidor, agregarla:
```bash
echo 'ANTHROPIC_API_KEY=sk-ant-...' >> /opt/vps-panel/backend/.env
```

**Expected observation if it worked:** `grep` devuelve el valor de la key. `package.json` incluye `@anthropic-ai/sdk`.
**Expected observation if it failed:** `NO ENCONTRADA` y `SDK no instalado`.
**Most likely cause of failure:** La clave no está configurada todavía. Hay que obtenerla del usuario o de `console.anthropic.com`.
**Countermove:** Si la clave no está disponible, implementar el selector de nodo IA con fallback rule-based que SIEMPRE se activa (sin llamar a Claude). El módulo de IA queda como wrapper listo para cuando haya clave. El fallback mejorado ya soluciona el problema de disco.
**Downstream consequences:** Si no hay API key, el Move 4 (selector IA) sólo ejecuta el fallback. Sigue funcionando.

---

### Move 2: Corregir el bug de retry — re-seleccionar nodo en vez de reusar

**Action:**
En `panel/backend/src/services/deploy.js`, función `retryDeploy` (línea ~620):

```javascript
// ANTES (buggy):
pipeline(deployId, resources, dep.node).catch(...)

// DESPUÉS (corregido):
// Re-seleccionar nodo — el nodo original puede estar lleno o caído
patchDeploy(deployId, { node: null });  // limpiar nodo anterior
const newNodeName = await selectBestNode(resources, dep.clientId);  // nueva selección
patchDeploy(deployId, { node: newNodeName, guestIP: null, vmid: null, wanPort: undefined });
pipeline(deployId, resources, newNodeName).catch(...)
```

La función `selectBestNode(resources, clientId)` se extrae del bloque de selección actual dentro de `startDeploy`.

**Expected observation if it worked:** El retry elige `pvececyte` en vez de `pvelenovo`. El log muestra un VMID en el rango 300-399.
**Expected observation if it failed:** Syntax error en JS → el panel no arranca.
**Most likely cause of failure:** Error de refactor — el `selectBestNode` extrae lógica que depende de variables locales (resources, etc.). Asegurarse de que recibe todos los parámetros que necesita.
**Countermove:** Si el refactor es complicado, mínimamente agregar `nodeName = null` al inicio de `retryDeploy` y forzar re-selección dentro del pipeline (el pipeline ya tiene lógica de selección si `nodeName` es null).
**Downstream consequences:** Con el fix, el retry puede elegir un nodo diferente. Esto podría crear una VM en un nodo distinto al original — está bien, es el comportamiento deseado.

---

### Move 3: Mejorar el selector rule-based — incluir disco en la evaluación

**Action:**
En `panel/backend/src/services/deploy.js`, extraer/reescribir el bloque de selección de nodo:

```javascript
async function selectBestNodeRuleBased(resources) {
  const { memoryMb, diskGb } = resources;
  const candidates = allNodes().filter((n) => n.cfg.type !== 'hyperv');
  let best = null;
  let bestScore = -Infinity;

  for (const { cfg, client } of candidates) {
    try {
      const [status, storage] = await Promise.all([
        client.get(`/nodes/${cfg.name}/status`, undefined, 5000),
        client.get(`/nodes/${cfg.name}/storage/${cfg.storage}/status`, undefined, 5000),
      ]);

      const memFreeGb = (status.memory.total - status.memory.used) / (1024 ** 3);
      const diskFreeGb = storage.avail / (1024 ** 3);

      // Eliminar nodos que no pueden satisfacer los requerimientos
      if (memFreeGb < memoryMb / 1024 + 2) continue;  // +2 GB headroom
      if (diskFreeGb < diskGb) continue;

      // Score compuesto: 60% RAM libre, 30% disco libre, 10% CPU baja
      const cpuScore = 1 - (status.cpu ?? 0);
      const score = 0.6 * memFreeGb + 0.3 * diskFreeGb + 0.1 * (cpuScore * 100);
      if (score > bestScore) { bestScore = score; best = cfg.name; }
    } catch { /* nodo caído, omitir */ }
  }

  if (!best) throw new HttpError(503, 'No hay nodos con capacidad suficiente (RAM + disco)');
  return best;
}
```

**Expected observation if it worked:** El selector ya no elige `pvelenovo` para proyectos de 20 GB. Log muestra selección de `pvececyte`.
**Expected observation if it failed:** Todos los nodos son filtrados → error "No hay nodos con capacidad suficiente". Esto puede pasar si pvececyte también tiene problema.
**Most likely cause of failure:** El storage check falla para pvececyte también (si `cfg.storage` no coincide con el nombre real del storage en Proxmox). Verificar con `curl .../nodes/pvececyte/storage` cuáles storages existen.
**Countermove:** Si el storage check falla, añadir un try/catch que omita el check de disco y use sólo RAM (degradado) logueando una advertencia.
**Downstream consequences:** Con este selector, el fallback rule-based ya es suficientemente correcto. El Move 4 (IA) lo mejora con razonamiento semántico.

---

### Move 4: Implementar selector IA con Claude Haiku (con fallback)

**Action:**
Crear `panel/backend/src/services/node-selector.js`:

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { allNodes } from '../proxmox.js';
import { HttpError } from '../errors.js';
import { config } from '../config.js';

const GiB = 1024 ** 3;

async function gatherNodeMetrics(resources) {
  const { memoryMb, diskGb } = resources;
  const candidates = [];

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
      const vmCount = vms.filter(v => !v.template).length;

      candidates.push({
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
      candidates.push({ name: cfg.name, host: cfg.host, error: e.message, meetsRequirements: false });
    }
  }
  return candidates;
}

async function selectWithAI(candidates, resources, projectHint = '') {
  if (!config.anthropicApiKey) throw new Error('No hay ANTHROPIC_API_KEY configurada');
  const eligible = candidates.filter(n => n.meetsRequirements);
  if (eligible.length === 0) throw new HttpError(503, 'No hay nodos con capacidad suficiente');
  if (eligible.length === 1) return { node: eligible[0].name, reason: 'Único nodo con capacidad suficiente' };

  const client = new Anthropic({ apiKey: config.anthropicApiKey });
  const prompt = `Selecciona el mejor nodo Proxmox para alojar una nueva VM.

Requerimientos del proyecto:
- RAM: ${resources.memoryMb / 1024} GB
- Disco: ${resources.diskGb} GB
- Cores: ${resources.cores}
${projectHint ? `- Contexto: ${projectHint}` : ''}

Nodos disponibles (con capacidad suficiente):
${JSON.stringify(eligible, null, 2)}

Criterios de selección (en orden de prioridad):
1. Preferir el nodo con mayor disco libre (para crecimiento futuro)
2. Preferir el nodo con menor carga de CPU
3. Preferir el nodo con mayor RAM libre
4. Preferir el nodo con menos VMs existentes (balanceo de carga)

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{"node": "nombre_exacto_del_nodo", "reason": "razón breve (máx 80 chars)"}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 128,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text.trim();
  const result = JSON.parse(text);
  if (!result.node || !candidates.find(c => c.name === result.node)) {
    throw new Error(`Claude devolvió un nodo inválido: ${result.node}`);
  }
  return result;
}

function selectRuleBased(candidates) {
  const eligible = candidates.filter(n => n.meetsRequirements && !n.error);
  if (eligible.length === 0) throw new HttpError(503, 'No hay nodos con capacidad suficiente (RAM + disco)');
  // Score: 60% disco, 30% RAM, 10% CPU baja
  return eligible.reduce((best, n) => {
    const score = 0.6 * n.diskFreeGb + 0.3 * n.memFreeGb + 0.1 * (100 - n.cpuUsagePct);
    const bestScore = 0.6 * best.diskFreeGb + 0.3 * best.memFreeGb + 0.1 * (100 - best.cpuUsagePct);
    return score > bestScore ? n : best;
  });
}

// Función principal — exportar y usar en deploy.js
export async function selectBestNode(resources, projectHint = '') {
  const candidates = await gatherNodeMetrics(resources);

  // Intentar con IA primero (con timeout de 6 segundos)
  try {
    const aiResult = await Promise.race([
      selectWithAI(candidates, resources, projectHint),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 6000)),
    ]);
    console.log(`[node-selector] IA eligió: ${aiResult.node} — ${aiResult.reason}`);
    return aiResult.node;
  } catch (aiErr) {
    console.warn(`[node-selector] IA no disponible (${aiErr.message}), usando selector rule-based`);
  }

  // Fallback: selector rule-based mejorado (RAM + disco)
  const best = selectRuleBased(candidates);
  console.log(`[node-selector] Rule-based eligió: ${best.name}`);
  return best.name;
}
```

En `config.js`, agregar:
```javascript
anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
```

En `deploy.js`, reemplazar el bloque de selección de nodo con:
```javascript
import { selectBestNode } from '../services/node-selector.js';
// ...
nodeName = await selectBestNode({ cores, memoryMb, diskGb }, `plan:${plan} db:${db}`);
```

**Expected observation if it worked:** El log muestra `[node-selector] IA eligió: pvececyte — Mayor disco libre con CPU al 14%` o similar. Los deploys van a pvececyte.
**Expected observation if it failed:**
- Sin API key: `AI no disponible (No hay ANTHROPIC_API_KEY configurada), usando selector rule-based`
- Con API key pero modelo incorrecto: Error 404 del API
- Parsing JSON falla: `Claude devolvió un nodo inválido`

**Most likely cause of failure:** Claude devuelve texto adicional antes del JSON, haciendo fallar `JSON.parse`. Fix: usar `text.match(/\{[^}]+\}/)` para extraer solo el JSON del response.
**Countermove:** Si el JSON parse falla, caer al rule-based sin propagar el error. Añadir `.match(/\{[\s\S]+\}/)?.[0] ?? text` antes de `JSON.parse`.
**Downstream consequences:** Si el selector IA y rule-based ambos fallan → `HttpError(503)` descriptivo → el cliente ve "No hay nodos con capacidad suficiente" en vez de un error críptico.

---

### Move 5: Endpoint admin para actualizar token de nodo + UI

**Action:**
En `panel/backend/src/routes/nodes.js`, agregar:

```javascript
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
// ...

// Endpoint admin: actualizar tokenSecret de un nodo
nodesRouter.post('/:nodeName/token', async (req, res, next) => {
  try {
    const { nodeName } = req.params;
    const { tokenSecret } = req.body ?? {};
    if (!tokenSecret || !/^[0-9a-f-]{36}$/.test(tokenSecret)) {
      throw new HttpError(400, 'tokenSecret debe ser un UUID válido');
    }

    const nodesFile = path.join(process.cwd(), 'config', 'nodes.json');
    const nodes = JSON.parse(readFileSync(nodesFile, 'utf8'));
    const node = nodes.find((n) => n.name === nodeName);
    if (!node) throw new HttpError(404, `Nodo no encontrado: ${nodeName}`);

    node.tokenSecret = tokenSecret;
    writeFileSync(nodesFile, JSON.stringify(nodes, null, 2));

    // Actualizar el cliente en memoria (reinicializar el registry)
    // El registry en proxmox.js es un Map — necesitamos un método para actualizar
    const { refreshNodeToken } = await import('../proxmox.js');
    refreshNodeToken(nodeName, tokenSecret);

    res.json({ ok: true, mensaje: `Token de ${nodeName} actualizado. Probando conexión...` });
  } catch (e) { next(e); }
});
```

En `panel/backend/src/proxmox.js`, agregar función `refreshNodeToken`:
```javascript
export function refreshNodeToken(nodeName, tokenSecret) {
  const entry = registry.get(nodeName);
  if (!entry) return;
  entry.cfg.tokenSecret = tokenSecret;
  // Recrear el cliente con el nuevo token
  entry.client = new ProxmoxClient(entry.cfg);
  registry.set(nodeName, entry);
}
```

En `panel/frontend/src/components/ResourceMonitor.tsx` (o donde se muestre el estado de nodos), agregar:
- Si `!node.online && node.error?.includes('Token API')`: mostrar un botón "Actualizar token" que abre un modal con un input UUID + botón confirmar.
- El modal POST a `/api/nodes/{nodeName}/token` con el nuevo tokenSecret.

**Expected observation if it worked:** El admin pega el nuevo UUID del token de pve en el modal, da clic en confirmar, el endpoint actualiza nodes.json y reinicializa el cliente. El nodo pve aparece online en el dashboard en el siguiente refresh (cada 30s).
**Expected observation if it failed:**
- `refreshNodeToken` no existe en proxmox.js → el restart del panel sería necesario para aplicar el nuevo token (se puede omitir la recarga en memoria y solo actualizar el archivo, requiriendo restart manual)
- El UUID pegado tiene formato incorrecto → el endpoint devuelve 400

**Most likely cause of failure:** El registry de proxmox.js no exporta la función de actualización. En ese caso, simplemente actualizar el archivo y decirle al usuario que reinicie el panel desde el servidor (`ssh root@192.168.1.34 "systemctl restart vps-panel"`), que es una operación aceptable.
**Countermove:** Si `refreshNodeToken` es complejo, simplificarlo: solo actualizar nodes.json (sin recarga en memoria) + mostrar en la UI: "Token actualizado. Reinicia el panel para aplicar cambios".
**Downstream consequences:** Con el restart del panel, el nuevo token aplica y pve aparece online. El restart tarda ~3 segundos y no afecta deploys ya en curso (el proceso Node.js termina limpiamente).

---

### Move 6: Deploy y verificación completa

**Action:**
```powershell
# 1. Instalar SDK si no está
cd C:\vpsserver\panel\backend
npm install @anthropic-ai/sdk 2>&1 | tail -5

# 2. Build frontend (por si hubo cambios de UI)
cd C:\vpsserver\panel\frontend
npm run build

# 3. Deploy backend
scp panel\backend\src\services\node-selector.js root@192.168.1.34:/opt/vps-panel/backend/src/services/
scp panel\backend\src\services\deploy.js root@192.168.1.34:/opt/vps-panel/backend/src/services/
scp panel\backend\src\routes\nodes.js root@192.168.1.34:/opt/vps-panel/backend/src/routes/
scp panel\backend\src\proxmox.js root@192.168.1.34:/opt/vps-panel/backend/src/
scp panel\backend\src\config.js root@192.168.1.34:/opt/vps-panel/backend/src/
scp -r panel\frontend\dist root@192.168.1.34:/opt/vps-panel/frontend/

# 4. Instalar SDK en el servidor
ssh root@192.168.1.34 "cd /opt/vps-panel/backend && npm install @anthropic-ai/sdk --save 2>&1 | tail -3"

# 5. Agregar ANTHROPIC_API_KEY al .env si está disponible
# ssh root@192.168.1.34 "echo 'ANTHROPIC_API_KEY=sk-ant-...' >> /opt/vps-panel/backend/.env"

# 6. Restart y verificar
ssh root@192.168.1.34 "systemctl restart vps-panel && sleep 3 && systemctl is-active vps-panel"
```

Verificar que el selector IA funciona:
```bash
ssh root@192.168.1.34 "journalctl -u vps-panel -f --no-pager" &
# Luego triggear un deploy desde el portal y observar el log
```

**Expected observation if it worked:**
- `systemctl is-active vps-panel` → `active`
- El log muestra `[node-selector] IA eligió: pvececyte` o `Rule-based eligió: pvececyte`
- El deploy progresa más allá del paso `provision` y llega a `wait_ip`

**Expected observation if it failed:**
- `active` pero luego `[deploy:...] FATAL: Cannot find module '../services/node-selector.js'` → el archivo no se copió
- `Cannot find package '@anthropic-ai/sdk'` → npm install no se ejecutó en el servidor
- `SyntaxError` → error de sintaxis en algún archivo modificado

**Most likely cause of failure:** El SDK necesita ser instalado en el servidor (no solo en desarrollo). Sin `npm install` en `/opt/vps-panel/backend`, el import falla.
**Countermove:** Si el SDK no se puede instalar en el servidor, reescribir el AI selector usando `fetch()` nativo (Node 18+) apuntando a la API de Anthropic directamente — sin dependencias externas.
**Downstream consequences:** Con el panel reiniciado y el selector funcionando, los nuevos deploys irán a pvececyte. Los deploys existentes en estado `error` deben ser retried desde el portal de cliente — el retry ahora re-seleccionará pvececyte.

---

## Unresolved assumptions

1. **ANTHROPIC_API_KEY**: El usuario debe proveer la API key de Anthropic. Sin ella, el selector IA funciona en modo fallback rule-based. La key se obtiene en `console.anthropic.com`.

2. **Token nuevo de pve**: El usuario debe crear/obtener el UUID del nuevo token en `https://192.168.1.4:8006/` → Datacenter → Permissions → API Tokens → crear token `panel` para usuario `panel@pve` con rol `PVEAdmin` o `Administrator`.

3. **Capacidad real de pvececyte**: Se asume que pvececyte tiene suficiente RAM y disco para los proyectos actuales. Si también tiene disco lleno, el selector IA/rule-based devolverá "No hay nodos con capacidad suficiente" — el error sería correcto y descriptivo.

4. **El registry de proxmox.js es un `const Map`**: Para `refreshNodeToken` sin restart del panel, el Map debe ser mutable (sí lo es, ya que `const` solo hace inmutable la referencia, no el contenido). La función puede mutar las entradas.

5. **`@anthropic-ai/sdk` disponible en npm**: Asumido. El SDK es público y está en el registry de npm.

---

## Abort conditions

- **ABORT Move 3/4** si `pvececyte` también devuelve error de storage (storage name diferente al configurado en nodes.json). En ese caso: verificar en Proxmox cuáles storages existen (`GET /nodes/pvececyte/storage`) y actualizar `cfg.storage` en nodes.json.
- **ABORT Move 4** si Claude Haiku devuelve respuestas inestables (nodos inventados) en >2 intentos consecutivos. Fallback permanente al rule-based hasta que se afine el prompt.
- **ABORT Move 6** si después del restart `systemctl is-active vps-panel` devuelve `failed` y `journalctl` muestra un SyntaxError desconocido — revertir los archivos modificados con git y reinvestigar.
- **NO** reiniciar pvececyte, pfSense, ni tocar `capuvps (192.168.1.33)` en ningún movimiento.
