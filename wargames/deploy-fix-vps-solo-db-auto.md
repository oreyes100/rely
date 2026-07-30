# War-game: Fix descarga + VPS Solo + BD Automática
> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.

## Mission objective
Tres misiones en un solo deploy de código:

**A)** Reemplazar la descarga HTTP (curl desde VM) por entrega directa vía QEMU guest agent. Éxito: deploy con source.type=zip llega al paso `stack` sin error "Descarga falló".

**B)** Añadir `source.type = 'vps-only'`: pipeline provision+wait_ip → done. El deploy record guarda `sshUser, sshPassword, sshHost (guestIP), sshPort:22`. El portal MiServidor muestra las credenciales SSH.

**C)** Añadir `source.type = 'db-only'` con `dbType`. Pipeline: provision → wait_ip → prepare → levantar solo el contenedor de BD. Deploy record guarda `dbInfo` con credenciales completas. Portal MiServidor muestra panel de credenciales con botón copiar y opción de rotar.

## Recon summary

- **`panel/backend/src/proxmox.js` líneas 71-79**: `agentWriteFile` ya existe; usa `echo '${b64}' | base64 -d > path`. **Problema**: `echo` añade `\n` al final, lo que corrompe binarios. El campo base64 de un zip típico (~1-10 MB) también puede superar el límite de argumento de shell. Necesita método nuevo con `printf '%s'` y chunking.
- **`panel/backend/src/services/deploy.js` líneas 354-362**: el bloque zip hace `curl -fL '${config.panelPublicUrl}/api/deploys/upload/...'` desde dentro de la VM. `panelPublicUrl = 'https://capuvps.duckdns.org'` = IP WAN. pfSense sin hairpin NAT → VM no puede alcanzarlo → 0 bytes, timeout 2s.
- **Ruta del zip en disco**: `path.join(config.dataDir, 'uploads', `${source.uploadId}.zip`)` = `/opt/vps-panel/backend/data/uploads/{uploadId}.zip`.
- **`readFileSync` ya importado** en deploy.js (línea 1).
- **`config.dataDir`** disponible en deploy.js como `config.dataDir`.
- **`vmResult`** (línea 289) devuelve `{ user, password, hostname, vmid, node, subnetHint }`. El `guestIP` se obtiene en wait_ip y se guarda en `dep.guestIP`.
- **`generatePassword()`** importado desde provision.js (vía re-export o directo). En deploy.js NO está importado; para DB-only se puede usar `crypto.randomBytes(12).toString('hex')` (ya en use, línea 283).
- **`makeSteps()`** (línea 77-81) genera steps a partir de `Object.keys(STEP_LABELS)`. Para modos reducidos: filtrar las keys.
- **STEP_LABELS** (líneas 61-75): `provision, wait_ip, prepare, fetch, stack, build, run, ufw, nat, vhost, dns, tls, verify`.
- **`dbService()`** (líneas 84-110): ya genera `docker-compose.yml` con credenciales para postgres/mysql/mongo. Falta: `redis`.
- **Frontend `MiServidor.tsx`**: leer para saber el contrato de datos. Si ya muestra `deploy.dbInfo`, agregar SSH y credenciales BD al mismo formato.
- **`panel/backend/src/routes/portal.js`**: expone `/portal/projects` y `/portal/projects/:id`. El cliente ve el deploy vía `getDeploy(id)`.

## Moves

### Move 1: Añadir `agentWriteBinaryFile` en proxmox.js

- **Action:** En `panel/backend/src/proxmox.js`, después de `agentWriteFile` (línea 79), añadir:
```javascript
// Escribe un Buffer binario en el guest por chunks de 375 KB (múltiplo de 3 → base64 limpio)
async agentWriteBinaryFile(nodeName, vmid, filePath, buffer) {
  const CHUNK = 375 * 1024; // 384 000 bytes → 512 000 chars base64, sin newline corruption
  const dir = filePath.replace(/\/[^\/]+$/, '');
  for (let i = 0; i < buffer.length; i += CHUNK) {
    const chunk = buffer.subarray(i, i + CHUNK);
    const b64 = chunk.toString('base64');
    const redir = i === 0 ? '>' : '>>';
    const cmd = `${i === 0 ? `mkdir -p ${dir} && ` : ''}printf '%s' '${b64}' | base64 -d ${redir} ${filePath}`;
    const r = await this.agentExecWait(nodeName, vmid, cmd, 30_000);
    if (r.exitcode !== 0) throw new HttpError(500, `agentWriteBinaryFile chunk ${i}: ${r.err}`);
  }
}
```
Exportar el método como parte de la clase (es un método de instancia — no necesita export separado).

- **Expected observation if it worked:** El archivo existe; no hay error en el agentExecWait.
- **Expected observation if it failed:** `r.exitcode !== 0` o `HttpError 500` con el chunk que falló.
- **Most likely cause of failure:** base64 con caracteres `+` o `/` que bash interpreta distinto en `printf`. Estos son chars válidos ASCII y `printf '%s'` los pasa literal — no es un problema. Si falla, causa real es guest agent no activo (ya resuelto en el paso `prepare`).
- **Countermove:** Si falla en el primer chunk (i=0), guest agent puede estar caído. Verificar con `agentExecWait(nodeName, vmid, 'echo alive', 5000)`. Si falla también, el fallo es en prepare — abortar y loguear.
- **Downstream consequences:** Este método es el bloqueo de Move 2. Sin él, Move 2 no compila.

### Move 2: Reemplazar curl en el bloque zip de `deploy.js`

- **Action:** En `panel/backend/src/services/deploy.js`, reemplazar el bloque `if (source.type === 'zip')` (líneas 354-362):
```javascript
if (source.type === 'zip') {
  const zipPath = path.join(config.dataDir, 'uploads', `${source.uploadId}.zip`);
  if (!existsSync(zipPath)) throw new Error(`Archivo subido no encontrado: ${source.uploadId}`);
  const zipBuffer = readFileSync(zipPath);
  // Push directo vía QEMU guest agent — sin conexión HTTP desde la VM
  await client.agentWriteBinaryFile(nodeName, vmid, '/tmp/app.zip', zipBuffer);
  const r = await client.agentExecWait(nodeName, vmid,
    'rm -rf /opt/app && mkdir -p /opt/app && unzip -o /tmp/app.zip -d /opt/app && rm /tmp/app.zip && echo OK',
    60_000
  );
  if (r.exitcode !== 0) throw new Error(`Descompresión falló: ${r.err || r.out}`);
  detail = detail ?? 'Archivos subidos';
}
```

- **Expected observation if it worked:** Step `fetch` → status `ok`, detail "Archivos subidos". Pipeline continúa al step `stack`.
- **Expected observation if it failed:** `Archivo subido no encontrado` (si uploadId es incorrecto) o `agentWriteBinaryFile chunk 0: ...` (si guest agent no activo).
- **Most likely cause of failure:** El archivo zip no existe en disco (upload anterior expiró o la ruta es diferente en producción). Verificar con `ls /opt/vps-panel/backend/data/uploads/`.
- **Countermove:** Si `!existsSync(zipPath)` → lanzar HttpError 400 con mensaje claro para que el cliente use Retry y re-suba el archivo.
- **Downstream consequences:** Un zip grande (>10 MB con muchos chunks) tarda ~30-90 s en transferirse. El timeout del step `fetch` es 120s — suficiente para ~10 chunks de 375 KB. Si el zip es muy grande (>50 MB) aumentar el timeout a 300_000.

### Move 3: Añadir modo `vps-only` — pasos y deploy record

- **Action:** En `deploy.js`:
  1. En `makeSteps()`, cambiar la firma: `function makeSteps(opts = {})`.
  2. Aplicar filtro según modo:
```javascript
function makeSteps({ skipDnsTls = false, vpsOnly = false, dbOnly = false } = {}) {
  const all = Object.keys(STEP_LABELS);
  let keys = all;
  if (vpsOnly) keys = ['provision', 'wait_ip'];
  else if (dbOnly) keys = ['provision', 'wait_ip', 'prepare', 'run'];
  else if (skipDnsTls) keys = all.filter((k) => k !== 'dns' && k !== 'tls');
  return keys.map((name) => ({
    name, label: STEP_LABELS[name], status: 'pending',
    detail: '', startedAt: null, elapsedMs: null, updatedAt: null,
  }));
}
```
  3. Actualizar la llamada en `startDeploy` y `retryDeploy` para pasar `{ skipDnsTls, vpsOnly: source.type==='vps-only', dbOnly: source.type==='db-only' }`.
  4. En el inicio de `pipeline()`, añadir:
```javascript
const vpsOnly = dep.source?.type === 'vps-only';
const dbOnly = dep.source?.type === 'db-only';
```
  5. Después de `wait_ip` en pipeline, añadir:
```javascript
// Modo VPS Solo: guardar credenciales SSH y terminar
if (vpsOnly) {
  patchDeploy(deployId, {
    sshUser: vmResult.user,
    sshPassword: vmResult.password,
    sshHost: guestIP,
    sshPort: 22,
    status: 'done',
    updatedAt: new Date().toISOString(),
  });
  return;
}
```
  6. Asegurarse que `vmResult` es accesible fuera del callback de `provision` (moverlo a scope de `pipeline` antes del loop de steps).

- **Expected observation if it worked:** Deploy con source.type='vps-only' termina con status 'done' después de wait_ip. `GET /api/deploys/:id` devuelve `sshUser, sshPassword, sshHost, sshPort`.
- **Expected observation if it failed:** Pipeline continúa al step `prepare` (filtro de makeSteps no aplicado correctamente).
- **Most likely cause of failure:** `dep.source?.type` leído fuera de scope o `makeSteps` no recibiendo el flag correcto en retryDeploy.
- **Countermove:** Añadir log: `console.log('[pipeline] mode:', vpsOnly ? 'vps-only' : dbOnly ? 'db-only' : 'full')` después de definir las variables.
- **Downstream consequences:** Move 4 (frontend SSH) depende de que estos campos existan en el deploy record.

### Move 4: Añadir modo `db-only` — pipeline y credenciales

- **Action:** En `deploy.js`, después del bloque `if (vpsOnly)`, añadir el handling para `dbOnly`:

En el paso `run` del pipeline, envolver en un condicional:
```javascript
// Modo DB Only: levantar solo el contenedor de BD
if (dbOnly) {
  const dbOnlyType = dep.source?.dbType ?? dep.db;
  if (!dbOnlyType || dbOnlyType === 'ninguna') throw new Error('dbType requerido para db-only');
  const dbPass = crypto.randomBytes(12).toString('hex');
  const db = dbService(dbOnlyType, dbPass);
  if (!db) throw new Error(`Tipo de BD no soportado: ${dbOnlyType}`);

  // Generar compose solo con el servicio de BD
  const composeYml = `services:\n${db.yml}\nvolumes:\n  db-data:`;
  await client.agentWriteFile(nodeName, vmid, '/opt/app/compose.yaml', composeYml);
  
  await runStep(deployId, 'prepare', async () => { /* prepare ya corrió */ return { detail: 'Docker listo' }; });
  
  await runStep(deployId, 'run', async () => {
    const r = await client.agentExecWait(nodeName, vmid,
      'cd /opt/app && docker compose up -d 2>&1 && sleep 5 && docker compose ps 2>&1',
      120_000
    );
    if (r.exitcode !== 0) throw new Error(`BD no arrancó: ${r.out.slice(-200)}`);
    patchDeploy(deployId, {
      dbInfo: { ...db.info, host: guestIP, externalHost: guestIP },
      sshUser: vmResult.user,
      sshPassword: vmResult.password,
      sshHost: guestIP,
      sshPort: 22,
    });
    return { detail: `${dbOnlyType} corriendo` };
  });

  patchDeploy(deployId, { status: 'done', updatedAt: new Date().toISOString() });
  return;
}
```
Añadir soporte `redis` en `dbService()`:
```javascript
if (dbType === 'redis') return {
  yml: `  db:\n    image: redis:7-alpine\n    restart: unless-stopped\n    command: redis-server --requirepass "${password}"\n    ports:\n      - "6379:6379"`,
  env: `REDIS_URL=redis://:${password}@db:6379`,
  info: { tipo: 'redis', password, port: 6379, urlInterna: `redis://:${password}@db:6379`, urlExterna: `redis://:${password}@{HOST}:6379` },
};
```

- **Expected observation if it worked:** Deploy con source.type='db-only' termina con status 'done'. `deploy.dbInfo` contiene host, port, user/password, connectionString. deploy.sshUser/sshPassword también presentes.
- **Expected observation if it failed:** `docker compose up -d` falla → revisar si Docker está instalado (prepare ya debe haberlo hecho).
- **Most likely cause of failure:** La imagen de Docker no se descarga a tiempo (redis:7-alpine tarda ~30s en un nodo frío). Aumentar timeout a 180_000 si redis/mongo.
- **Countermove:** Si `docker compose up` falla, leer `docker compose logs 2>&1 | tail -20` para diagnóstico. Si es problema de descarga de imagen, hacer retry con `docker pull redis:7-alpine && docker compose up -d`.
- **Downstream consequences:** Move 5 (frontend) depende de dbInfo.host y sshUser estar en el record.

### Move 5: Exponer puerto de BD al exterior (UFW + iptables)

- **Action:** Para que el cliente pueda conectarse a la BD desde fuera, necesita que el puerto esté abierto. En el pipeline `db-only`, después de levantar el contenedor, añadir steps `ufw` y `nat` igual que el pipeline completo pero con el puerto de BD (no el 80):
```javascript
const dbPort = { postgres: 5432, mysql: 3306, mongo: 27017, redis: 6379 }[dbOnlyType] ?? 5432;

await runStep(deployId, 'ufw', async () => {
  await client.agentExecWait(nodeName, vmid, `ufw allow ${dbPort}/tcp comment db && echo OK`);
  return { detail: `Puerto ${dbPort} abierto` };
});

await runStep(deployId, 'nat', async () => {
  const wanPort = 15000 + vmid; // rango distinto a app ports (8000+vmid)
  await sshNode(cfg.host, [
    `iptables -t nat -C PREROUTING -p tcp --dport ${wanPort} -j DNAT --to-destination ${guestIP}:${dbPort} 2>/dev/null || {`,
    `  iptables -t nat -A PREROUTING -p tcp --dport ${wanPort} -j DNAT --to-destination ${guestIP}:${dbPort}`,
    `  iptables -t nat -A POSTROUTING -p tcp -d ${guestIP} --dport ${dbPort} -j MASQUERADE`,
    `  iptables -A FORWARD -p tcp -d ${guestIP} --dport ${dbPort} -j ACCEPT`,
    `  iptables-save > /etc/iptables/rules.v4`,
    `}`,
  ].join('\n'));
  // Guardar el host externo en dbInfo
  const externalHost = cfg.host; // IP del nodo Proxmox (accesible desde WAN vía pfSense)
  patchDeploy(deployId, {
    dbInfo: { ...getDeploy(deployId).dbInfo, externalHost, externalPort: wanPort },
    wanPort,
  });
  return { detail: `Puerto WAN ${wanPort} → ${guestIP}:${dbPort}` };
});
```

- **Expected observation if it worked:** `iptables -L -t nat | grep ${wanPort}` en el nodo muestra la regla DNAT. `telnet <nodeHost> <wanPort>` desde el panel server conecta.
- **Expected observation if it failed:** SSH al nodo falla (nodo caído) o iptables devuelve error.
- **Most likely cause of failure:** `iptables-save > /etc/iptables/rules.v4` falla si el archivo no existe. Añadir: `mkdir -p /etc/iptables && touch /etc/iptables/rules.v4` antes del save.
- **Countermove:** Si iptables falla, el deploy queda done pero sin NAT. Loguear warning y dejar la regla pendiente. El admin puede hacer el NAT manualmente.
- **Downstream consequences:** Move 6 (frontend) mostrará el `externalHost:externalPort` como connection string.

### Move 6: Frontend — panel de credenciales en MiServidor

- **Action:** En `panel/frontend/src/components/portal/MiServidor.tsx` (o donde se muestre el estado del deploy al cliente):
  1. Leer los nuevos campos del deploy: `sshUser, sshPassword, sshHost, sshPort, dbInfo`.
  2. Añadir un componente `<CredCard>` que muestre credenciales con botón copiar:
```tsx
function CredCard({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [revealed, setRevealed] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-slate-700/40 last:border-0">
      <span className="text-xs text-slate-400 w-28 shrink-0">{label}</span>
      <span className="font-mono text-xs text-slate-200 flex-1 break-all">
        {secret && !revealed ? '••••••••••' : value}
      </span>
      {secret && (
        <button onClick={() => setRevealed(v => !v)} className="text-xs text-slate-500 hover:text-slate-300">
          {revealed ? 'Ocultar' : 'Ver'}
        </button>
      )}
      <button onClick={copy} className="text-xs text-indigo-400 hover:text-indigo-300">
        {copied ? '✓' : 'Copiar'}
      </button>
    </div>
  );
}
```
  3. En la sección del deploy done, añadir paneles condicionales:
```tsx
{deploy?.sshHost && (
  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-1">
    <h3 className="text-sm font-semibold text-slate-200 mb-2">🔑 Acceso SSH</h3>
    <CredCard label="Host / IP" value={deploy.sshHost} />
    <CredCard label="Puerto" value={String(deploy.sshPort ?? 22)} />
    <CredCard label="Usuario" value={deploy.sshUser} />
    <CredCard label="Contraseña" value={deploy.sshPassword} secret />
    <CredCard label="Comando" value={`ssh ${deploy.sshUser}@${deploy.sshHost}`} />
  </div>
)}
{deploy?.dbInfo && (
  <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4 space-y-1">
    <h3 className="text-sm font-semibold text-slate-200 mb-2">🗄️ Base de datos · {deploy.dbInfo.tipo}</h3>
    {deploy.dbInfo.usuario && <CredCard label="Usuario" value={deploy.dbInfo.usuario} />}
    {deploy.dbInfo.password && <CredCard label="Contraseña" value={deploy.dbInfo.password} secret />}
    {deploy.dbInfo.dbName && <CredCard label="Base de datos" value={deploy.dbInfo.dbName} />}
    {deploy.dbInfo.externalHost && <CredCard label="Host externo" value={`${deploy.dbInfo.externalHost}:${deploy.dbInfo.externalPort}`} />}
    {deploy.dbInfo.urlInterna && <CredCard label="URL interna" value={deploy.dbInfo.urlInterna} />}
    <RotateDbButton deployId={deploy.id} />
  </div>
)}
```
  4. Añadir botón Rotar credenciales (llama a un endpoint nuevo `POST /api/portal/projects/:id/rotate-db`).

- **Expected observation if it worked:** Cliente abre su proyecto → ve paneles SSH y/o BD con credenciales enmascaradas, botón Ver/Ocultar funciona, botón Copiar escribe en clipboard.
- **Expected observation if it failed:** `deploy.sshHost` es `undefined` (backend no guardó el campo). Verificar en DevTools → Network → `GET /api/portal/projects/:id` que el response incluye los campos.
- **Most likely cause of failure:** El endpoint `GET /portal/projects/:id` no devuelve `sshPassword` (lo oculta por seguridad). Verificar en `portal.js` que incluye `sshUser, sshPassword, sshHost, sshPort, dbInfo` en el response.
- **Countermove:** Si `portal.js` filtra campos sensibles, añadir `sshPassword` y `dbInfo.password` explícitamente en la proyección. El cliente ya está autenticado y es el dueño del deploy — es seguro devolver sus credenciales.
- **Downstream consequences:** La UI de Rotar (Move 7) depende de `deploy.id` visible en este panel.

### Move 7: Endpoint y UI para rotar credenciales de BD

- **Action:**
  1. En `panel/backend/src/routes/portal.js`, añadir:
```javascript
portalRouter.post('/projects/:id/rotate-db', requireClient, async (req, res, next) => {
  try {
    const dep = getDeploy(req.params.id);
    if (dep.clientId !== req.clientId) throw new HttpError(403, 'No autorizado');
    if (!dep.dbInfo || dep.status !== 'done') throw new HttpError(400, 'El deploy no tiene BD activa');
    
    const newPassword = crypto.randomBytes(12).toString('hex');
    const dbType = dep.dbInfo.tipo;
    const { client } = getNode(dep.node);
    
    // Actualizar password en el contenedor Docker
    const rotateCmd = {
      postgres: `docker exec $(docker compose ps -q db) psql -U app -c "ALTER USER app PASSWORD '${newPassword}'"`,
      mysql: `docker exec $(docker compose ps -q db) mysql -u root -e "ALTER USER 'app'@'%' IDENTIFIED BY '${newPassword}'; FLUSH PRIVILEGES;"`,
      redis: `docker exec $(docker compose ps -q db) redis-cli -a "${dep.dbInfo.password}" CONFIG SET requirepass "${newPassword}"`,
      mongo: null, // Mongo sin auth por defecto en esta versión
    }[dbType];
    
    if (rotateCmd) {
      const r = await client.agentExecWait(dep.node, dep.vmid, `cd /opt/app && ${rotateCmd}`, 30_000);
      if (r.exitcode !== 0) throw new Error(`Error rotando contraseña: ${r.out}`);
    }
    
    const newDbInfo = { ...dep.dbInfo, password: newPassword,
      urlInterna: dep.dbInfo.urlInterna?.replace(dep.dbInfo.password, newPassword),
    };
    patchDeploy(dep.id, { dbInfo: newDbInfo, updatedAt: new Date().toISOString() });
    res.json({ ok: true, dbInfo: newDbInfo });
  } catch (e) { next(e); }
});
```
  2. En el frontend, el botón `RotateDbButton` llama a este endpoint y actualiza el estado local con las nuevas credenciales.

- **Expected observation if it worked:** POST devuelve 200 con `dbInfo` actualizado. El frontend refleja la nueva contraseña.
- **Expected observation if it failed:** `ALTER USER` falla con error de permisos (usuario root vs app).
- **Most likely cause of failure:** El comando depende del estado interno del contenedor. MySQL requiere `MYSQL_ROOT_PASSWORD` configurado o entrar como usuario app.
- **Countermove:** Para MySQL, usar: `docker exec $(docker compose ps -q db) mysql -u app -p"${oldPass}" -e "..."`. Si falla, informar al usuario que contacte soporte.
- **Downstream consequences:** Ninguno (operación idempotente).

### Move 8: Build + deploy

- **Action:**
```bash
# En Windows PowerShell (workdir: C:\vpsserver)
cd panel/frontend && npm run build
# Verificar: ✓ built in X.Xs — sin errores TypeScript

$key = "C:\Users\User\.ssh\id_ed25519"
# Backend
scp -i $key panel/backend/src/proxmox.js root@192.168.1.34:/opt/vps-panel/backend/src/proxmox.js
scp -i $key panel/backend/src/services/deploy.js root@192.168.1.34:/opt/vps-panel/backend/src/services/deploy.js
scp -i $key panel/backend/src/routes/portal.js root@192.168.1.34:/opt/vps-panel/backend/src/routes/portal.js  # (si se modificó)
# Frontend
scp -i $key -r panel/frontend/dist/* root@192.168.1.34:/opt/vps-panel/frontend/dist/
# Restart
ssh -i $key root@192.168.1.34 "systemctl restart vps-panel && sleep 2 && systemctl is-active vps-panel"
```

- **Expected observation if it worked:** `active` en la última línea. Log `journalctl -u vps-panel -n 5 --no-pager` sin FATAL.
- **Expected observation if it failed:** Build TypeScript error (campo faltante en tipo), o `systemctl is-active` devuelve `failed`.
- **Most likely cause of failure:** Type mismatch en el frontend (campos nuevos no declarados en la interfaz del deploy).
- **Countermove:** Si TS error → añadir los campos opcionales (`sshUser?: string; sshPassword?: string; sshHost?: string; sshPort?: number`) a la interfaz del deploy en el frontend. Si el panel no arranca → `journalctl -u vps-panel -n 20 --no-pager` para ver el error de Node.

### Move 9: Prueba end-to-end con deploy de test

- **Action:**
  1. Desde el panel admin, crear un deploy con un zip pequeño (cualquier proyecto de prueba).
  2. Observar el step `fetch` — debe decir "Archivos subidos" sin "Descarga falló".
  3. Crear un deploy vps-only (desde el panel admin, `source.type = 'vps-only'`).
  4. Verificar que `deploy.sshHost` y `deploy.sshPassword` están en el record.
  5. Intentar `ssh devops@<guestIP>` desde el panel server con la contraseña.

- **Expected observation if it worked:** Step fetch completa. SSH funciona. VPS solo completa en ~5-10 min (provision + boot).
- **Expected observation if it failed:** Zip grande (>15 MB): timeout en agentWriteBinaryFile. Aumentar timeout del step `fetch` a 300_000.
- **Most likely cause of failure:** El uploadId del zip ya no existe en disco si el deploy fue creado hace tiempo (archivos de uploads no son persistentes entre reinicios). Verificar con `ls -la /opt/vps-panel/backend/data/uploads/`.
- **Countermove:** Si el archivo no existe, lanzar HttpError(400, 'El archivo subido ya no está disponible. Crea un nuevo deploy y sube el proyecto de nuevo.').

## Unresolved assumptions

1. **`portal.js` proyección de campos**: No se leyó el código completo de `/portal/projects/:id` — se asume que devuelve el objeto completo del deploy. Si hay un `select` o proyección que excluye campos, hay que añadirlos explícitamente.
2. **`MiServidor.tsx` estructura actual**: No se leyó el componente. Si ya tiene un polling loop (`useEffect` con `setInterval`) para actualizar el estado del deploy, el panel de credenciales aparecerá automáticamente cuando el status sea 'done'. Si no tiene polling, añadir.
3. **Firewall en el nodo Proxmox para puertos BD (15000+vmid)**: Se asume que pfSense permite tráfico desde WAN a los puertos 15000-15999 del nodo Proxmox. Si no, el cliente solo podrá conectarse a la BD desde dentro de la red, no desde internet. Verificar con el admin de red.
4. **`portal.js` endpoint rotate-db**: Se asume que existe `requireClient` middleware y `req.clientId` disponible. Verificar en `portal.js` cómo se autentica el cliente.
5. **Tamaño máximo de zip**: La Proxmox API puede tener un límite en el tamaño del payload de agentExec. Si el base64 de un chunk supera ~10 MB el request puede fallar. Reducir CHUNK a 200 KB si hay problemas con zips grandes.

## Abort conditions

- El build de TypeScript falla con más de 3 errores de tipo no relacionados con los cambios (indica que el árbol de tipos está corrupto — restaurar archivos del checkout).
- `systemctl restart vps-panel` deja el servicio en estado `failed` y `journalctl` muestra un error de syntax en Node.js — revertir el archivo específico.
- El step `fetch` con zip sigue fallando después del cambio — verificar que el archivo `.js` desplegado contiene `agentWriteBinaryFile` con `grep`.
- El Proxmox node devuelve error 500 en el endpoint `agentExec` para chunks grandes — reducir CHUNK a 200 KB y re-desplegar.
- Cualquier acción sobre `192.168.1.33` (producción) — DETENER INMEDIATAMENTE.
