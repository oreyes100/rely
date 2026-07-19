import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { getNode, allNodes } from '../proxmox.js';
import { provisionVm, checkCapacity } from './provision.js';
import { HttpError } from '../errors.js';
import { sendAdminAlert } from './mailer.js';

const execFileAsync = promisify(execFile);
const deploysFile = path.join(config.dataDir, 'deploys.json');

// ── Store helpers ─────────────────────────────────────────────────────────────
function readDeploys() {
  if (!existsSync(deploysFile)) return [];
  try { return JSON.parse(readFileSync(deploysFile, 'utf8')); } catch { return []; }
}
function saveDeploys(list) { writeFileSync(deploysFile, JSON.stringify(list, null, 2)); }

export function getDeploy(id) {
  const d = readDeploys().find((d) => d.id === id);
  if (!d) throw new HttpError(404, 'Deploy no encontrado');
  return d;
}
export function listDeploys(clientId) {
  const all = readDeploys();
  return clientId ? all.filter((d) => d.clientId === clientId) : all;
}

function patchDeploy(id, patch) {
  const list = readDeploys();
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...patch };
  saveDeploys(list);
}

function setStepStatus(deployId, stepName, status, detail = '') {
  const list = readDeploys();
  const dep = list.find((d) => d.id === deployId);
  if (!dep) return;
  const step = dep.steps.find((s) => s.name === stepName);
  if (step) { step.status = status; step.detail = detail; step.updatedAt = new Date().toISOString(); }
  saveDeploys(list);
}

// ── Etiquetas legibles para el cliente ───────────────────────────────────────
const STEP_LABELS = {
  provision:   'Creando tu servidor',
  wait_ip:     'Iniciando el servidor',
  prepare:     'Preparando el entorno',
  fetch:       'Descargando tu proyecto',
  stack:       'Analizando el proyecto',
  build:       'Construyendo tu aplicación',
  run:         'Arrancando la aplicación',
  ufw:         'Configurando seguridad',
  nat:         'Conectando a la red',
  vhost:       'Publicando en la web',
  dns:         'Configurando dominio',
  tls:         'Activando HTTPS',
  verify:      'Verificación final',
};

function makeSteps(skipDnsTls = false) {
  return Object.keys(STEP_LABELS)
    .filter((k) => !(skipDnsTls && (k === 'dns' || k === 'tls')))
    .map((name) => ({ name, label: STEP_LABELS[name], status: 'pending', detail: '', updatedAt: null }));
}

// ── Compose generator ─────────────────────────────────────────────────────────
function dbService(dbType, password) {
  if (dbType === 'postgres') return {
    yml: `  db:\n    image: postgres:16-alpine\n    restart: unless-stopped\n    environment:\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: "${password}"\n      POSTGRES_DB: app\n    volumes:\n      - db-data:/var/lib/postgresql/data`,
    env: `DATABASE_URL=postgres://app:${password}@db:5432/app\nPGUSER=app\nPGPASSWORD=${password}\nPGDATABASE=app\nPGHOST=db`,
    info: { tipo: 'postgres', usuario: 'app', password, dbName: 'app', urlInterna: `postgres://app:${password}@db:5432/app` },
  };
  if (dbType === 'mongo') return {
    yml: `  db:\n    image: mongo:7\n    restart: unless-stopped\n    volumes:\n      - db-data:/data/db`,
    env: `MONGO_URI=mongodb://db:27017/app`,
    info: { tipo: 'mongo', urlInterna: `mongodb://db:27017/app` },
  };
  if (dbType === 'mysql') return {
    yml: `  db:\n    image: mysql:8\n    restart: unless-stopped\n    environment:\n      MYSQL_USER: app\n      MYSQL_PASSWORD: "${password}"\n      MYSQL_DATABASE: app\n      MYSQL_RANDOM_ROOT_PASSWORD: "yes"\n    volumes:\n      - db-data:/var/lib/mysql`,
    env: `DATABASE_URL=mysql://app:${password}@db:3306/app\nMYSQL_USER=app\nMYSQL_PASSWORD=${password}\nMYSQL_DATABASE=app\nMYSQL_HOST=db`,
    info: { tipo: 'mysql', usuario: 'app', password, dbName: 'app', urlInterna: `mysql://app:${password}@db:3306/app` },
  };
  return null;
}

function buildCompose(stack, appPort, dbType, dbPass) {
  const db = dbType && dbType !== 'ninguna' ? dbService(dbType, dbPass) : null;
  const dbEnvLines = db ? db.env.split('\n').map((e) => `      - ${e}`).join('\n') : '';
  const dependsOn = db ? `\n    depends_on:\n      - db` : '';
  const volumes = db ? `\nvolumes:\n  db-data:` : '';

  let webService;
  if (stack === 'compose') {
    // El usuario ya tiene compose — agregamos solo un override con env vars
    return { override: true, dbyml: db?.yml, env: db?.env ?? '', dbInfo: db?.info ?? null };
  }

  if (stack === 'static') {
    webService = `  web:\n    image: nginx:alpine\n    restart: unless-stopped\n    volumes:\n      - .:/usr/share/nginx/html:ro\n    ports:\n      - "80:80"${dependsOn}`;
  } else {
    // dockerfile o node (el Dockerfile ya está generado)
    webService = `  web:\n    build: .\n    restart: unless-stopped\n    ports:\n      - "80:${appPort}"\n    environment:\n${dbEnvLines}${dependsOn}`;
  }

  const yml = `services:\n${webService}\n${db ? db.yml : ''}${volumes}`;
  return { override: false, yml, dbInfo: db?.info ?? null };
}

function nodeDockerfile(appPort) {
  return `FROM node:lts
WORKDIR /app
COPY . .
RUN if [ -f pnpm-lock.yaml ]; then npm i -g pnpm@10 && pnpm install --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; \\
    else npm ci 2>/dev/null || npm install; fi
RUN if [ -f pnpm-lock.yaml ]; then pnpm run build 2>/dev/null || true; \\
    elif [ -f yarn.lock ]; then yarn build 2>/dev/null || true; \\
    else npm run build 2>/dev/null || true; fi
ENV HOST=0.0.0.0 PORT=${appPort}
EXPOSE ${appPort}
CMD node dist/server/entry.mjs 2>/dev/null || node server.js 2>/dev/null || npm start
`;
}

// ── Ejecutor principal ────────────────────────────────────────────────────────
async function runStep(deployId, stepName, fn) {
  setStepStatus(deployId, stepName, 'running');
  try {
    const result = await fn();
    setStepStatus(deployId, stepName, 'ok', result?.detail ?? '');
    return result;
  } catch (err) {
    setStepStatus(deployId, stepName, 'error', err.message.slice(0, 400));
    throw err;
  }
}

// Comando SSH al nodo (como usuario admin con la llave del panel)
async function sshNode(nodeHost, command) {
  return execFileAsync('ssh', [
    '-i', config.nodesSshKey,
    '-o', 'StrictHostKeyChecking=accept-new',
    '-o', 'ConnectTimeout=10',
    `root@${nodeHost}`,
    command,
  ], { timeout: 60000 });
}

export async function startDeploy(deploySpec) {
  const {
    hostname,           // nombre del proyecto / subdominio
    source,             // { type: 'git'|'zip'|'template', gitUrl?, uploadId?, fields? }
    appPort = 3000,     // puerto interno que usa la app
    db = 'ninguna',     // 'ninguna'|'postgres'|'mongo'|'mysql'
    domain,             // { type: 'wildcard'|'duckdns'|'custom', name?, token?, fqdn? }
    node: preferNode,   // nodo Proxmox preferido (o auto)
    clientId = null,    // id del cliente si viene del portal
    plan = 'basico',    // 'basico'|'estandar'
  } = deploySpec;

  // Recursos según plan + DB
  const dbExtra = (db !== 'ninguna') ? 512 : 0;
  const resources = plan === 'estandar'
    ? { cores: 2, memoryMb: 2048 + dbExtra, diskGb: 25 }
    : { cores: 1, memoryMb: 1024 + dbExtra, diskGb: 20 };

  // Determinar nodo
  let nodeName = preferNode;
  if (!nodeName) {
    const candidates = allNodes().filter((n) => n.cfg.type !== 'hyperv');
    let best = null; let bestFree = -1;
    for (const { cfg, client } of candidates) {
      try {
        const st = await client.get(`/nodes/${cfg.name}/status`);
        const free = st.memory.total - st.memory.used;
        if (free > bestFree) { bestFree = free; best = cfg.name; }
      } catch { /* nodo caído */ }
    }
    if (!best) throw new HttpError(503, 'No hay nodos disponibles');
    nodeName = best;
  }

  const skipDnsTls = domain.type === 'wildcard';
  const id = crypto.randomUUID();
  const url = skipDnsTls
    ? `https://${hostname}.${config.appsDomain}/`
    : domain.type === 'duckdns'
      ? `https://${domain.name}.duckdns.org/`
      : `https://${domain.fqdn}/`;

  const deploy = {
    id, hostname, source, appPort, db, domain, plan, clientId,
    node: nodeName, vmid: null, guestIP: null, url,
    status: 'running',
    steps: makeSteps(skipDnsTls),
    dbInfo: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const list = readDeploys();
  list.push(deploy);
  saveDeploys(list);

  // Lanzar pipeline async (no bloquear el request)
  pipeline(id, resources, nodeName).catch((err) => {
    patchDeploy(id, { status: 'error', updatedAt: new Date().toISOString() });
    console.error(`[deploy:${id}] FATAL:`, err.message);
    // Notificar al administrador
    sendAdminAlert({
      subject: `[ALERTA] Deploy fallido: ${hostname}`,
      body: `Deploy ID: ${id}\nHostname: ${hostname}\nNodo: ${nodeName}\nPlan: ${plan}\nCliente: ${clientId ?? 'admin'}\n\nError:\n${err.message}`,
    }).catch(() => {});
  });

  return id;
}

async function pipeline(deployId, resources, nodeName) {
  const dep = getDeploy(deployId);
  const { cfg, client } = getNode(nodeName);
  let vmid, guestIP, dbPass;
  const dbType = dep.db !== 'ninguna' ? dep.db : null;
  if (dbType) dbPass = crypto.randomBytes(12).toString('hex');

  // 1. provision
  let vmResult;
  await runStep(deployId, 'provision', async () => {
    vmResult = await provisionVm({ node: nodeName, hostname: dep.hostname, ...resources, tags: dep.clientId ? [`client:${dep.clientId}`] : [] });
    vmid = vmResult.vmid;
    patchDeploy(deployId, { vmid, updatedAt: new Date().toISOString() });
    return { detail: `VMID ${vmid} en ${nodeName}` };
  });

  // 2. wait_ip (máx 8 min — el primer boot de cloud-init tarda ~3-5 min)
  await runStep(deployId, 'wait_ip', async () => {
    const deadline = Date.now() + 8 * 60 * 1000;
    for (;;) {
      try {
        const ifaces = await client.get(`/nodes/${nodeName}/qemu/${vmid}/agent/network-get-interfaces`);
        const ips = (ifaces.result ?? [])
          .flatMap((i) => i['ip-addresses'] ?? [])
          .filter((ip) => ip['ip-address-type'] === 'ipv4' && ip['ip-address'].startsWith(cfg.subnetPrefix))
          .map((ip) => ip['ip-address']);
        if (ips.length) {
          guestIP = ips[0];
          patchDeploy(deployId, { guestIP, updatedAt: new Date().toISOString() });
          return { detail: guestIP };
        }
      } catch { /* agente aún no listo */ }
      if (Date.now() > deadline) throw new HttpError(504, 'Timeout esperando IP del servidor');
      await new Promise((r) => setTimeout(r, 8000));
    }
  });

  // 3. prepare_guest
  await runStep(deployId, 'prepare', async () => {
    const r = await client.agentExecWait(nodeName, vmid,
      'command -v docker || (apt-get update -qq && apt-get install -y docker.io docker-compose-v2 git curl unzip 2>&1 | tail -3)',
      300000
    );
    if (r.exitcode !== 0) throw new Error(`prepare falló: ${r.err}`);
    return { detail: 'Docker y dependencias listas' };
  });

  // 4. fetch_source
  await runStep(deployId, 'fetch', async () => {
    const { source } = dep;
    let detail;
    if (source.type === 'git') {
      const r = await client.agentExecWait(nodeName, vmid,
        `rm -rf /opt/app && git clone --depth 1 "${source.gitUrl}" /opt/app 2>&1 | tail -5`,
        120000
      );
      if (r.exitcode !== 0) throw new Error(`git clone falló: ${r.err || r.out}`);
      detail = `Repo clonado`;
    } else if (source.type === 'template') {
      // Ya fue empaquetado en zip por sitegen antes de llamar startDeploy
      source.type = 'zip'; // tratar igual que zip
      detail = 'Plantilla generada';
    }
    if (source.type === 'zip') {
      const sig = crypto.createHmac('sha256', config.jwtSecret).update(source.uploadId).digest('hex').slice(0, 16);
      const url = `${config.panelPublicUrl}/api/deploys/upload/${source.uploadId}?sig=${sig}`;
      const r = await client.agentExecWait(nodeName, vmid,
        `curl -fL '${url}' -o /tmp/app.zip 2>&1 && rm -rf /opt/app && mkdir -p /opt/app && unzip -o /tmp/app.zip -d /opt/app && echo OK`,
        120000
      );
      if (r.exitcode !== 0) throw new Error(`Descarga falló: ${r.err || r.out}`);
      detail = detail ?? 'Archivos subidos';
    }
    return { detail };
  });

  // 5. detect stack + generar Dockerfile/compose si hace falta
  let detectedStack;
  await runStep(deployId, 'stack', async () => {
    const r = await client.agentExecWait(nodeName, vmid,
      'ls /opt/app/compose.yaml /opt/app/docker-compose.yml 2>/dev/null && echo STACK=compose || ' +
      '(ls /opt/app/Dockerfile 2>/dev/null && echo STACK=dockerfile) || ' +
      '(ls /opt/app/package.json 2>/dev/null && echo STACK=node) || ' +
      '(ls /opt/app/index.html 2>/dev/null && echo STACK=static) || echo STACK=unknown'
    );
    const m = r.out.match(/STACK=(\w+)/);
    detectedStack = m ? m[1] : 'unknown';
    if (detectedStack === 'unknown') throw new Error('No se reconoció el tipo de proyecto (se esperaba compose.yaml, Dockerfile, package.json o index.html)');

    // Generar Dockerfile para node si no tiene
    if (detectedStack === 'node') {
      await client.agentWriteFile(nodeName, vmid, '/opt/app/Dockerfile', nodeDockerfile(dep.appPort));
    }

    // Generar compose
    const compose = buildCompose(detectedStack, dep.appPort, dbType, dbPass);
    if (compose.override && compose.dbyml) {
      // Agregar DB como override
      await client.agentWriteFile(nodeName, vmid, '/opt/app/docker-compose.override.yml',
        `services:\n${compose.dbyml}\nvolumes:\n  db-data:`
      );
      if (compose.env) {
        await client.agentWriteFile(nodeName, vmid, '/opt/app/.env.db', compose.env);
      }
    } else if (!compose.override) {
      await client.agentWriteFile(nodeName, vmid, '/opt/app/compose.yaml', compose.yml);
    }

    if (compose.dbInfo) {
      patchDeploy(deployId, { dbInfo: compose.dbInfo, updatedAt: new Date().toISOString() });
    }

    return { detail: `Stack: ${detectedStack}${dbType ? ' + ' + dbType : ''}` };
  });

  // 6. build
  await runStep(deployId, 'build', async () => {
    const r = await client.agentExecWait(nodeName, vmid,
      'cd /opt/app && docker compose build --no-cache > /tmp/build.log 2>&1; echo BUILD_EXIT=$?; tail -5 /tmp/build.log',
      600000
    );
    const exitMatch = r.out.match(/BUILD_EXIT=(\d+)/);
    if (exitMatch && exitMatch[1] !== '0') {
      const logR = await client.agentExecWait(nodeName, vmid, 'tail -30 /tmp/build.log');
      throw new Error(`Build falló (exit ${exitMatch[1]}): ${logR.out.slice(-400)}`);
    }
    return { detail: 'Imagen construida' };
  });

  // 7. run
  await runStep(deployId, 'run', async () => {
    const r = await client.agentExecWait(nodeName, vmid,
      'cd /opt/app && docker compose up -d 2>&1 && sleep 8 && ' +
      "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/ 2>/dev/null || echo 000",
      120000
    );
    const code = r.out.match(/\d{3}$/)?.[0] ?? '000';
    if (code === '000' || code.startsWith('5')) {
      const logs = await client.agentExecWait(nodeName, vmid, 'cd /opt/app && docker compose logs --tail 20 2>&1');
      throw new Error(`App no responde (HTTP ${code}). Logs: ${logs.out.slice(-300)}`);
    }
    return { detail: `Aplicación corriendo (HTTP ${code})` };
  });

  // 8. UFW
  await runStep(deployId, 'ufw', async () => {
    await client.agentExecWait(nodeName, vmid, 'ufw allow 80/tcp comment deploy 2>&1 && echo OK');
    return { detail: 'Puerto 80 abierto' };
  });

  // 9. DNAT en el nodo (SSH del edge al nodo Proxmox)
  await runStep(deployId, 'nat', async () => {
    const wanPort = 8000 + vmid;
    const nodeHost = cfg.host;
    // DHCP reservation (get MAC first)
    const mac = await client.getVmMac(nodeName, vmid);

    const natCmd = [
      // DHCP reservation idempotente
      mac ? `grep -q "${guestIP}" /etc/dnsmasq.d/vps-static.conf 2>/dev/null || { echo "dhcp-host=${mac},${guestIP}" >> /etc/dnsmasq.d/vps-static.conf && systemctl restart dnsmasq 2>&1; }` : '',
      // iptables idempotente
      `iptables -t nat -C PREROUTING -p tcp --dport ${wanPort} -j DNAT --to-destination ${guestIP}:80 2>/dev/null || {`,
      `  iptables -t nat -A PREROUTING -p tcp --dport ${wanPort} -j DNAT --to-destination ${guestIP}:80`,
      `  iptables -t nat -A POSTROUTING -p tcp -d ${guestIP} --dport 80 -j MASQUERADE`,
      `  iptables -A FORWARD -p tcp -d ${guestIP} --dport 80 -j ACCEPT`,
      `  iptables-save > /etc/iptables/rules.v4`,
      `}`,
    ].filter(Boolean).join('\n');

    await sshNode(nodeHost, natCmd);

    // Verificar que el edge puede alcanzar la app
    try {
      await execFileAsync('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}',
        '--connect-timeout', '5', `http://${nodeHost}:${wanPort}/`], { timeout: 10000 });
    } catch { /* verificación opcional — continuar */ }

    patchDeploy(deployId, { wanPort, updatedAt: new Date().toISOString() });
    return { detail: `Puerto WAN interno ${wanPort} → ${guestIP}:80` };
  });

  // 10. vhost en el edge
  const dep2 = getDeploy(deployId); // releer para tener wanPort
  const wanPort = dep2.wanPort;
  await runStep(deployId, 'vhost', async () => {
    const { domain } = dep;
    const nodeHost = cfg.host;

    if (domain.type === 'wildcard') {
      await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'add-app', dep.hostname, nodeHost, String(wanPort)]);
    } else {
      const fqdn = domain.type === 'duckdns' ? `${domain.name}.duckdns.org` : domain.fqdn;
      await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'add', fqdn, nodeHost, String(wanPort)]);
    }
    return { detail: `Vhost publicado` };
  });

  // 11. DNS (solo para duckdns o custom)
  if (!dep.domain || dep.domain.type !== 'wildcard') {
    await runStep(deployId, 'dns', async () => {
      const { domain } = dep;
      if (domain.type === 'duckdns') {
        const token = domain.token || config.appsDuckdnsToken;
        const r = await execFileAsync('curl', ['-s',
          `https://www.duckdns.org/update?domains=${domain.name}&token=${token}&ip=207.248.113.8`
        ]);
        if (!r.stdout.includes('OK')) throw new Error(`DuckDNS no actualizó: ${r.stdout}`);
        return { detail: `${domain.name}.duckdns.org → 207.248.113.8` };
      }
      // custom: esperar propagación (hasta 10 min)
      const deadline = Date.now() + 10 * 60 * 1000;
      for (;;) {
        try {
          const r = await execFileAsync('nslookup', [domain.fqdn]);
          if (r.stdout.includes('207.248.113.8')) return { detail: `${domain.fqdn} apunta a 207.248.113.8` };
        } catch { /* aún sin propagar */ }
        if (Date.now() > deadline) throw new Error('El dominio no apunta a 207.248.113.8 tras 10 min. Verifica el registro A en tu proveedor de dominio.');
        await new Promise((r) => setTimeout(r, 30000));
      }
    });

    // 12. TLS
    await runStep(deployId, 'tls', async () => {
      const { domain } = dep;
      const fqdn = domain.type === 'duckdns' ? `${domain.name}.duckdns.org` : domain.fqdn;
      if (domain.type === 'duckdns') {
        const token = domain.token || config.appsDuckdnsToken;
        await execFileAsync('bash', ['-c',
          `DuckDNS_Token=${token} /root/.acme.sh/acme.sh --issue --dns dns_duckdns -d ${fqdn} --force 2>&1 | tail -5 && ` +
          `mkdir -p /etc/nginx/ssl/${fqdn} && ` +
          `/root/.acme.sh/acme.sh --install-cert -d ${fqdn} --fullchain-file /etc/nginx/ssl/${fqdn}/fullchain.pem --key-file /etc/nginx/ssl/${fqdn}/key.pem --reloadcmd "systemctl reload nginx" 2>&1 | tail -3`
        ], { timeout: 300000 });
      } else {
        // HTTP-01 webroot
        await execFileAsync('bash', ['-c',
          `mkdir -p /var/www/acme && /root/.acme.sh/acme.sh --issue -w /var/www/acme -d ${fqdn} --force 2>&1 | tail -5 && ` +
          `mkdir -p /etc/nginx/ssl/${fqdn} && ` +
          `/root/.acme.sh/acme.sh --install-cert -d ${fqdn} --fullchain-file /etc/nginx/ssl/${fqdn}/fullchain.pem --key-file /etc/nginx/ssl/${fqdn}/key.pem --reloadcmd "systemctl reload nginx" 2>&1 | tail -3`
        ], { timeout: 300000 });
      }
      // actualizar el vhost para que use el nuevo cert
      await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'update-cert', fqdn]);
      return { detail: `TLS activo para ${fqdn}` };
    });
  }

  // 13. verify
  await runStep(deployId, 'verify', async () => {
    const url = getDeploy(deployId).url;
    await new Promise((r) => setTimeout(r, 5000));
    const r = await execFileAsync('curl', ['-sk', '-o', '/dev/null', '-w', '%{http_code}',
      '--max-time', '10', url], { timeout: 15000 });
    const code = r.stdout.trim();
    if (code === '000') throw new Error('La URL no responde (timeout). El DNS puede tardar unos minutos más.');
    return { detail: `${url} → HTTP ${code}` };
  });

  patchDeploy(deployId, { status: 'done', updatedAt: new Date().toISOString() });
}

// ── Reintentar deploy fallido ─────────────────────────────────────────────────
export async function retryDeploy(deployId) {
  const dep = getDeploy(deployId);
  if (dep.status !== 'error') throw new HttpError(400, 'Solo se puede reintentar un deploy en estado error');

  // Limpiar VM anterior si se llegó a crear
  if (dep.vmid && dep.node) {
    const { client, cfg } = getNode(dep.node);
    try { await client.post(`/nodes/${dep.node}/qemu/${dep.vmid}/status/stop`, {}); } catch { /* ya parada */ }
    await new Promise((r) => setTimeout(r, 3000));
    try { const u = await client.del(`/nodes/${dep.node}/qemu/${dep.vmid}`, { purge: 1 }); await client.waitTask(u); } catch { /* continuar */ }
    if (dep.wanPort) {
      try { await sshNode(cfg.host, `iptables -t nat -D PREROUTING -p tcp --dport ${dep.wanPort} -j DNAT --to-destination ${dep.guestIP}:80 2>/dev/null || true`); } catch { /* continuar */ }
    }
  }

  // Reset de pasos y estado
  const resources = dep.plan === 'estandar'
    ? { cores: 2, memoryMb: 2048 + (dep.db !== 'ninguna' ? 512 : 0), diskGb: 25 }
    : { cores: 1, memoryMb: 1024 + (dep.db !== 'ninguna' ? 512 : 0), diskGb: 20 };

  patchDeploy(deployId, {
    status: 'running',
    vmid: null,
    guestIP: null,
    wanPort: undefined,
    steps: makeSteps(dep.domain?.type === 'wildcard'),
    updatedAt: new Date().toISOString(),
  });

  pipeline(deployId, resources, dep.node).catch((err) => {
    patchDeploy(deployId, { status: 'error', updatedAt: new Date().toISOString() });
    console.error(`[deploy:${deployId}] RETRY-FATAL:`, err.message);
    sendAdminAlert({
      subject: `[ALERTA] Retry fallido: ${dep.hostname}`,
      body: `Deploy ID: ${deployId}\nHostname: ${dep.hostname}\nNodo: ${dep.node}\nCliente: ${dep.clientId ?? 'admin'}\n\nError:\n${err.message}`,
    }).catch(() => {});
  });
}

// ── Limpieza al borrar un deploy ──────────────────────────────────────────────
export async function deleteDeploy(deployId) {
  const dep = getDeploy(deployId);
  const errors = [];

  if (dep.vmid && dep.node) {
    try {
      const { client } = getNode(dep.node);
      const { cfg } = getNode(dep.node);
      // Eliminar DNAT
      if (dep.wanPort) {
        try {
          await sshNode(cfg.host,
            `iptables -t nat -D PREROUTING -p tcp --dport ${dep.wanPort} -j DNAT --to-destination ${dep.guestIP}:80 2>/dev/null || true\n` +
            `iptables -t nat -D POSTROUTING -p tcp -d ${dep.guestIP} --dport 80 -j MASQUERADE 2>/dev/null || true\n` +
            `iptables -D FORWARD -p tcp -d ${dep.guestIP} --dport 80 2>/dev/null || true\n` +
            `iptables-save > /etc/iptables/rules.v4`
          );
        } catch (e) { errors.push(`DNAT: ${e.message}`); }
      }
      // Detener y eliminar VM
      try {
        await client.post(`/nodes/${dep.node}/qemu/${dep.vmid}/status/stop`, {});
        await new Promise((r) => setTimeout(r, 5000));
      } catch { /* ya estaba parada */ }
      const upid = await client.del(`/nodes/${dep.node}/qemu/${dep.vmid}`, { purge: 1 });
      await client.waitTask(upid);
    } catch (e) { errors.push(`VM: ${e.message}`); }
  }

  // Eliminar vhost
  if (dep.domain) {
    try {
      const fqdn = dep.domain.type === 'wildcard'
        ? `${dep.hostname}.${config.appsDomain}`
        : dep.domain.type === 'duckdns'
          ? `${dep.domain.name}.duckdns.org`
          : dep.domain.fqdn;
      await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'remove', fqdn]).catch(() => {});
    } catch { /* continuar */ }
  }

  // Marcar como eliminado (no borrar del JSON para auditoría)
  patchDeploy(deployId, { status: 'deleted', updatedAt: new Date().toISOString() });
  if (errors.length) throw new Error(`Deploy eliminado con errores parciales: ${errors.join('; ')}`);
}
