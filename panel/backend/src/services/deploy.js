import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { config } from '../config.js';
import { getNode } from '../proxmox.js';
import { provisionVm, stopAndDestroy } from './provision.js';
import { selectBestNode } from './node-selector.js';
import { HttpError } from '../errors.js';
import { sendAdminAlert } from './mailer.js';
import { upsertCredential } from './credentials.js';

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
  if (step) {
    const now = new Date().toISOString();
    step.status = status;
    step.detail = detail;
    step.updatedAt = now;
    if (status === 'running') {
      step.startedAt = now;
    } else if ((status === 'ok' || status === 'error') && step.startedAt) {
      step.elapsedMs = Date.now() - new Date(step.startedAt).getTime();
    }
  }
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

function makeSteps({ skipDnsTls = false, vpsOnly = false, dbOnly = false } = {}) {
  const all = Object.keys(STEP_LABELS);
  let keys;
  if (vpsOnly) {
    keys = ['provision', 'wait_ip'];
  } else if (dbOnly) {
    keys = ['provision', 'wait_ip', 'prepare', 'run', 'ufw', 'nat'];
  } else if (skipDnsTls) {
    keys = all.filter((k) => k !== 'dns' && k !== 'tls');
  } else {
    keys = all;
  }
  return keys.map((name) => ({ name, label: STEP_LABELS[name], status: 'pending', detail: '', startedAt: null, elapsedMs: null, updatedAt: null }));
}

// ── Compose generator ─────────────────────────────────────────────────────────
function dbService(dbType, password) {
  if (dbType === 'supabase-pg') {
    // PostgreSQL + PostgREST: reemplaza Supabase para apps que sólo usan la DB REST API
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    return {
      yml: `  db:\n    image: postgres:16-alpine\n    restart: unless-stopped\n    environment:\n      POSTGRES_USER: postgres\n      POSTGRES_PASSWORD: "${password}"\n      POSTGRES_DB: postgres\n    volumes:\n      - db-data:/var/lib/postgresql/data\n  postgrest:\n    image: postgrest/postgrest:latest\n    restart: unless-stopped\n    ports:\n      - "3001:3000"\n    environment:\n      PGRST_DB_URI: "postgres://postgres:${password}@db:5432/postgres"\n      PGRST_DB_ANON_ROLE: anon\n      PGRST_DB_SCHEMA: public\n      PGRST_JWT_SECRET: "${jwtSecret}"\n    depends_on:\n      - db`,
      env: `DATABASE_URL=postgres://postgres:${password}@db:5432/postgres\nPOSTGREST_URL=http://postgrest:3000\nSUPABASE_URL=http://postgrest:3000\nSUPABASE_ANON_KEY=placeholder-migra-tu-auth`,
      info: { tipo: 'supabase-pg', usuario: 'postgres', password, dbName: 'postgres', urlInterna: `postgres://postgres:${password}@db:5432/postgres`, postgrestaUrl: 'http://postgrest:3001 (externo)' },
    };
  }
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
    yml: `  db:\n    image: mysql:8\n    restart: unless-stopped\n    environment:\n      MYSQL_USER: app\n      MYSQL_PASSWORD: "${password}"\n      MYSQL_DATABASE: app\n      MYSQL_RANDOM_ROOT_PASSWORD: "yes"\n    ports:\n      - "3306:3306"\n    volumes:\n      - db-data:/var/lib/mysql`,
    env: `DATABASE_URL=mysql://app:${password}@db:3306/app\nMYSQL_USER=app\nMYSQL_PASSWORD=${password}\nMYSQL_DATABASE=app\nMYSQL_HOST=db`,
    info: { tipo: 'mysql', usuario: 'app', password, dbName: 'app', port: 3306, urlInterna: `mysql://app:${password}@db:3306/app` },
  };
  if (dbType === 'redis') return {
    yml: `  db:\n    image: redis:7-alpine\n    restart: unless-stopped\n    command: redis-server --requirepass "${password}"\n    ports:\n      - "6379:6379"\n    volumes:\n      - db-data:/data`,
    env: `REDIS_URL=redis://:${password}@db:6379`,
    info: { tipo: 'redis', password, port: 6379, urlInterna: `redis://:${password}@db:6379` },
  };
  return null;
}

function buildCompose(stack, appPort, dbType, dbPass, hasEnvFile = false) {
  const db = dbType && dbType !== 'ninguna' ? dbService(dbType, dbPass) : null;
  const dbEnvLines = db ? db.env.split('\n').map((e) => `      - ${e}`).join('\n') : '';
  const dependsOn = db ? `\n    depends_on:\n      - db` : '';
  const envFile = hasEnvFile ? `\n    env_file:\n      - .env` : '';
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
    webService = `  web:\n    build: .\n    restart: unless-stopped\n    ports:\n      - "80:${appPort}"\n    environment:\n${dbEnvLines}${envFile}${dependsOn}`;
  }

  const yml = `services:\n${webService}\n${db ? db.yml : ''}${volumes}`;
  return { override: false, yml, dbInfo: db?.info ?? null };
}

// Elimina chars de control y secuencias ANSI que corrompen el display del error
function sanitizeBuildOutput(str) {
  return str
    // Secuencias de escape ANSI (colores, cursores, etc.)
    .replace(/\x1B\[[0-9;]*[A-Za-z]/g, '')
    // Chars de control excepto \n y \t
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Reemplaza bytes Multi-byte inválidos como UTF-8 con '?'
    .replace(/[-]/g, '?')
    .trim();
}

function nodeDockerfile(appPort) {
  // Build en una sola RUN para que el source del .env aplique al npm run build.
  // Next.js y otros frameworks necesitan NEXT_PUBLIC_* disponibles en build-time.
  return `FROM node:lts
WORKDIR /app
COPY . .
RUN if [ -f pnpm-lock.yaml ]; then npm i -g pnpm@10 && pnpm install --frozen-lockfile; \\
    elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; \\
    else npm ci 2>/dev/null || npm install; fi
RUN sh -c 'if [ -f .env ]; then set -a; . ./.env; set +a; fi && \\
    if ! grep -q \\"build\\"[[:space:]]*: package.json 2>/dev/null; then echo "sin script build"; \\
    elif [ -f pnpm-lock.yaml ]; then pnpm run build; \\
    elif [ -f yarn.lock ]; then yarn build; \\
    else npm run build; fi'
ENV HOST=0.0.0.0 PORT=${appPort}
EXPOSE ${appPort}
CMD node dist/server/entry.mjs 2>/dev/null || \\
    node .next/standalone/server.js 2>/dev/null || \\
    node server.js 2>/dev/null || npm start
`;
}

// IDs de deploys solicitados para terminar por el administrador (en memoria)
const killedDeploys = new Set();

export function killDeploy(deployId) {
  const dep = getDeploy(deployId);
  if (dep.status !== 'running') throw new HttpError(400, 'Solo se puede terminar un deploy en estado running');
  killedDeploys.add(deployId);
  const list = readDeploys();
  const d = list.find((d) => d.id === deployId);
  if (d) {
    d.status = 'error';
    d.updatedAt = new Date().toISOString();
    const runningStep = d.steps.find((s) => s.status === 'running');
    if (runningStep) {
      runningStep.status = 'error';
      runningStep.detail = 'Terminado por el administrador';
      runningStep.updatedAt = new Date().toISOString();
      if (runningStep.startedAt) runningStep.elapsedMs = Date.now() - new Date(runningStep.startedAt).getTime();
    }
    saveDeploys(list);
  }
}

// ── Ejecutor principal ────────────────────────────────────────────────────────
async function runStep(deployId, stepName, fn) {
  if (killedDeploys.has(deployId)) throw new Error('Deploy terminado por el administrador');
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

// Asegura egress TCP 443/22 de la subred de VMs hacia internet (NO hacia redes
// privadas — el aislamiento inter-VLAN se preserva con los RETURN). El gateway
// de la VLAN de clientes es el propio nodo (dnsmasq + NAT iptables); sin esto,
// docker pull y git clone por HTTPS mueren con "no route to host".
async function ensureEgress(cfg) {
  if (cfg.type === 'hyperv' || !cfg.subnetPrefix) return;
  const subnet = `${cfg.subnetPrefix}0/24`;
  const cmd = [
    `iptables -N VPS-EGRESS 2>/dev/null || true`,
    `iptables -F VPS-EGRESS`,
    `iptables -A VPS-EGRESS -d 192.168.0.0/16 -j RETURN`,
    `iptables -A VPS-EGRESS -d 10.0.0.0/8 -j RETURN`,
    `iptables -A VPS-EGRESS -d 172.16.0.0/12 -j RETURN`,
    `iptables -A VPS-EGRESS -p tcp -m multiport --dports 443,22 -j ACCEPT`,
    `iptables -C FORWARD -s ${subnet} -j VPS-EGRESS 2>/dev/null || iptables -I FORWARD 1 -s ${subnet} -j VPS-EGRESS`,
    `iptables -C FORWARD -d ${subnet} -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || iptables -I FORWARD 2 -d ${subnet} -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT`,
    `mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4`,
  ].join('\n');
  try {
    await sshNode(cfg.host, cmd);
  } catch (e) {
    // No fatal: si el egress ya funciona el deploy sigue; si no, build/run lo reportará
    console.warn(`[egress] No se pudo asegurar egress en ${cfg.host}: ${e.message}`);
  }
}

// Override de DNS público en la VM — el DNS upstream de la red devuelve
// A-records envenenados para docker.io (100.60.x, rango del ISP). Puerto 53
// directo a resolvers públicos está abierto (verificado desde VLAN 6).
const DNS_FIX_CMD =
  `mkdir -p /etc/systemd/resolved.conf.d && ` +
  `printf '[Resolve]\\nDNS=1.1.1.1 8.8.8.8\\n' > /etc/systemd/resolved.conf.d/panel.conf && ` +
  `systemctl restart systemd-resolved 2>/dev/null || ` +
  `{ rm -f /etc/resolv.conf; printf 'nameserver 1.1.1.1\\nnameserver 8.8.8.8\\n' > /etc/resolv.conf; }; `;

// Habilita login SSH por contraseña en la VM (las imágenes cloud de Ubuntu
// traen PasswordAuthentication no en sshd_config.d) y abre 22 en ufw.
const SSH_PWAUTH_CMD =
  `sed -i 's/^#\\?PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config 2>/dev/null; ` +
  `grep -rl 'PasswordAuthentication no' /etc/ssh/sshd_config.d/ 2>/dev/null | xargs -r sed -i 's/PasswordAuthentication no/PasswordAuthentication yes/'; ` +
  `systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true; ` +
  `ufw allow 22/tcp 2>/dev/null || true; echo SSH-READY`;

// DNAT de SSH en el nodo: puerto 22000+vmid del nodo → guestIP:22. La VM está
// en una VLAN aislada — sin esto el cliente no puede alcanzar su servidor.
// Mismo patrón probado que usa el paso nat para las apps (8000+vmid → 80).
async function ensureSshNat(cfg, vmid, guestIP) {
  if (cfg.type === 'hyperv' || !guestIP) return null;
  const port = 22000 + Number(vmid);
  const cmd = [
    `iptables -t nat -C PREROUTING -p tcp --dport ${port} -j DNAT --to-destination ${guestIP}:22 2>/dev/null || {`,
    `  iptables -t nat -A PREROUTING -p tcp --dport ${port} -j DNAT --to-destination ${guestIP}:22`,
    `  iptables -t nat -A POSTROUTING -p tcp -d ${guestIP} --dport 22 -j MASQUERADE`,
    `  iptables -A FORWARD -p tcp -d ${guestIP} --dport 22 -j ACCEPT`,
    `  mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4`,
    `}`,
  ].join('\n');
  await sshNode(cfg.host, cmd);
  return port;
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
    envVars = null,     // string "KEY=VALUE\n..." — variables de entorno del cliente
  } = deploySpec;

  // Recursos según plan + DB
  const dbExtra = (db !== 'ninguna') ? 512 : 0;
  const resources = plan === 'estandar'
    ? { cores: 2, memoryMb: 2048 + dbExtra, diskGb: 25 }
    : { cores: 1, memoryMb: 1024 + dbExtra, diskGb: 20 };

  // Determinar nodo — selector IA (considera RAM + disco + CPU) con fallback rule-based
  let nodeName = preferNode;
  if (!nodeName) {
    nodeName = await selectBestNode(resources, `plan:${plan} db:${db}`);
  }

  const vpsOnly = source.type === 'vps-only';
  const dbOnly = source.type === 'db-only';
  const skipDnsTls = !vpsOnly && !dbOnly && domain?.type === 'wildcard';
  const id = crypto.randomUUID();
  const url = (vpsOnly || dbOnly)
    ? null
    : skipDnsTls
      ? `https://${hostname}.${config.appsDomain}/`
      : domain?.type === 'duckdns'
        ? `https://${domain.name}.duckdns.org/`
        : `https://${domain?.fqdn}/`;

  const deploy = {
    id, hostname, source, appPort, db, domain: domain ?? null, plan, clientId, envVars,
    node: nodeName, vmid: null, guestIP: null, url,
    status: 'running',
    steps: makeSteps({ skipDnsTls, vpsOnly, dbOnly }),
    dbInfo: null,
    sshUser: null, sshPassword: null, sshHost: null, sshPort: null,
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
  let vmid, guestIP, dbPass, vmResult;
  const vpsOnly = dep.source?.type === 'vps-only';
  const dbOnly = dep.source?.type === 'db-only';
  const dbType = dbOnly
    ? (dep.source?.dbType ?? dep.db)
    : (dep.db !== 'ninguna' ? dep.db : null);
  if (dbType && dbType !== 'ninguna') dbPass = crypto.randomBytes(12).toString('hex');

  // 1. provision
  await runStep(deployId, 'provision', async () => {
    // Proxmox no permite ':' en tags — usar guion
    vmResult = await provisionVm({ node: nodeName, hostname: dep.hostname, ...resources, tags: dep.clientId ? [`client-${dep.clientId}`] : [] });
    vmid = vmResult.vmid;
    patchDeploy(deployId, { vmid, updatedAt: new Date().toISOString() });
    return { detail: `VMID ${vmid} en ${nodeName}` };
  });

  // 2. wait_ip (máx 15 min — el primer boot de cloud-init tarda 3-10 min según carga del nodo)
  await runStep(deployId, 'wait_ip', async () => {
    const deadline = Date.now() + 15 * 60 * 1000;
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

  // Credenciales SSH SIEMPRE disponibles desde este punto — si el deploy falla
  // más adelante, el cliente puede implementar manualmente vía SSH.
  // El acceso va por DNAT del nodo (22000+vmid) porque la VLAN de VMs está aislada.
  let sshHost = guestIP, sshPort = 22;
  try {
    const natPort = await ensureSshNat(cfg, vmid, guestIP);
    if (natPort) { sshHost = cfg.sshWanHost || cfg.host; sshPort = natPort; }
  } catch (e) {
    console.warn(`[deploy:${deployId}] SSH DNAT no disponible: ${e.message}`);
  }
  try { await client.agentExecWait(nodeName, vmid, SSH_PWAUTH_CMD, 30_000); }
  catch (e) { console.warn(`[deploy:${deployId}] SSH pwauth: ${e.message}`); }
  patchDeploy(deployId, {
    sshUser: vmResult?.user ?? 'devops',
    sshPassword: vmResult?.password ?? '',
    sshHost,
    sshPort,
    updatedAt: new Date().toISOString(),
  });

  // ── Modo VPS Solo: servidor + SSH y terminar ─────────────────────────────────
  if (vpsOnly) {
    patchDeploy(deployId, { status: 'done', updatedAt: new Date().toISOString() });
    return;
  }

  // ── Modo DB Solo: instalar Docker + levantar contenedor de BD ────────────────
  if (dbOnly) {
    const db = dbService(dbType, dbPass);
    if (!db) throw new Error(`Tipo de BD no soportado: ${dbType}`);
    const dbPort = { postgres: 5432, mysql: 3306, mongo: 27017, redis: 6379 }[dbType] ?? 5432;

    await runStep(deployId, 'prepare', async () => {
      await ensureEgress(cfg);
      const r = await client.agentExecWait(nodeName, vmid,
        DNS_FIX_CMD +
        'export DEBIAN_FRONTEND=noninteractive; ' +
        'if ! command -v docker >/dev/null 2>&1; then ' +
        '  apt-get -o DPkg::Lock::Timeout=600 update -qq >/tmp/prep.log 2>&1; ' +
        '  apt-get -o DPkg::Lock::Timeout=600 install -y docker.io docker-compose-v2 >>/tmp/prep.log 2>&1; ' +
        'fi; ' +
        'systemctl enable --now docker >/dev/null 2>&1 || true; ' +
        'command -v docker >/dev/null 2>&1 || { echo PREP-FAIL; exit 1; }; echo PREP-OK',
        600_000
      );
      if (!r.out.includes('PREP-OK')) throw new Error(`prepare falló: ${r.out.slice(-200)}`);
      return { detail: 'Docker listo' };
    });

    await runStep(deployId, 'run', async () => {
      const composeYml = `services:\n${db.yml}\nvolumes:\n  db-data:`;
      await client.agentWriteFile(nodeName, vmid, '/opt/app/compose.yaml', composeYml);
      const r = await client.agentExecWait(nodeName, vmid,
        'cd /opt/app && { docker compose pull -q && docker compose up -d; } > /tmp/up.log 2>&1; ' +
        'echo UP_EXIT=$?; tail -c 500 /tmp/up.log',
        300_000
      );
      const upExit = r.out.match(/UP_EXIT=(\d+)/)?.[1] ?? '1';
      if (upExit !== '0') {
        throw new Error(`BD no arrancó: ${sanitizeBuildOutput(r.out.replace(/UP_EXIT=\d+/, '')).slice(-300)}`);
      }
      return { detail: `${dbType} corriendo` };
    });

    await runStep(deployId, 'ufw', async () => {
      await client.agentExecWait(nodeName, vmid, `ufw allow ${dbPort}/tcp comment db && echo OK`, 10_000);
      return { detail: `Puerto ${dbPort} abierto` };
    });

    await runStep(deployId, 'nat', async () => {
      const wanPort = 15000 + vmid;
      await sshNode(cfg.host, [
        `iptables -t nat -C PREROUTING -p tcp --dport ${wanPort} -j DNAT --to-destination ${guestIP}:${dbPort} 2>/dev/null || {`,
        `  iptables -t nat -A PREROUTING -p tcp --dport ${wanPort} -j DNAT --to-destination ${guestIP}:${dbPort}`,
        `  iptables -t nat -A POSTROUTING -p tcp -d ${guestIP} --dport ${dbPort} -j MASQUERADE`,
        `  iptables -A FORWARD -p tcp -d ${guestIP} --dport ${dbPort} -j ACCEPT`,
        `  mkdir -p /etc/iptables && iptables-save > /etc/iptables/rules.v4`,
        `}`,
      ].join('\n'));
      let dbSshHost = guestIP, dbSshPort = 22;
      try {
        const natPort = await ensureSshNat(cfg, vmid, guestIP);
        if (natPort) { dbSshHost = cfg.sshWanHost || cfg.host; dbSshPort = natPort; }
      } catch (e) { console.warn(`[deploy:${deployId}] SSH DNAT db-only: ${e.message}`); }
      patchDeploy(deployId, {
        dbInfo: { ...db.info, host: guestIP, externalHost: cfg.host, externalPort: wanPort },
        sshUser: vmResult?.user ?? 'devops',
        sshPassword: vmResult?.password ?? '',
        sshHost: dbSshHost,
        sshPort: dbSshPort,
        wanPort,
        updatedAt: new Date().toISOString(),
      });
      return { detail: `Puerto WAN ${wanPort} → ${guestIP}:${dbPort}` };
    });

    patchDeploy(deployId, { status: 'done', updatedAt: new Date().toISOString() });
    return;
  }

  // 3. prepare_guest — instala Docker esperando el lock de apt (primer boot puede
  // tenerlo tomado por cloud-init/unattended-upgrades) y VERIFICA el resultado.
  await runStep(deployId, 'prepare', async () => {
    await ensureEgress(cfg);
    const r = await client.agentExecWait(nodeName, vmid,
      DNS_FIX_CMD +
      'export DEBIAN_FRONTEND=noninteractive; ' +
      'if ! command -v docker >/dev/null 2>&1; then ' +
      '  apt-get -o DPkg::Lock::Timeout=600 update -qq >/tmp/prep.log 2>&1; ' +
      '  apt-get -o DPkg::Lock::Timeout=600 install -y docker.io docker-compose-v2 git curl unzip >>/tmp/prep.log 2>&1; ' +
      'fi; ' +
      'command -v docker >/dev/null 2>&1 || { echo PREP-FAIL; tail -8 /tmp/prep.log; exit 1; }; ' +
      'docker compose version >/dev/null 2>&1 || apt-get -o DPkg::Lock::Timeout=600 install -y docker-compose-v2 >>/tmp/prep.log 2>&1; ' +
      'systemctl enable --now docker >/dev/null 2>&1 || true; ' +
      'command -v git >/dev/null 2>&1 || apt-get -o DPkg::Lock::Timeout=600 install -y git curl unzip >>/tmp/prep.log 2>&1; ' +
      'echo PREP-OK',
      600000
    );
    if (r.exitcode !== 0 || !r.out.includes('PREP-OK')) {
      throw new Error(`prepare falló: ${(r.out + ' ' + r.err).slice(-300)}`);
    }
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
      // Push directo vía QEMU guest agent — sin conexión HTTP desde la VM (VLAN 6 aislada)
      const zipPath = path.join(config.dataDir, 'uploads', `${source.uploadId}.zip`);
      if (!existsSync(zipPath)) throw new Error('El archivo subido ya no está disponible. Crea un nuevo deploy y sube el proyecto de nuevo.');
      const zipBuffer = readFileSync(zipPath);
      await client.agentWriteBinaryFile(nodeName, vmid, '/tmp/app.zip', zipBuffer);
      const r = await client.agentExecWait(nodeName, vmid,
        'rm -rf /opt/app && mkdir -p /opt/app && unzip -o /tmp/app.zip -d /opt/app && rm -f /tmp/app.zip && echo OK',
        60_000
      );
      if (r.exitcode !== 0) throw new Error(`Descompresión falló: ${r.err || r.out}`);
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

    // Detectar uso de Supabase para advertir al cliente si no hay vars
    let usesSupabase = false;
    if (detectedStack === 'node' || detectedStack === 'dockerfile') {
      const sbCheck = await client.agentExecWait(nodeName, vmid,
        'grep -q "@supabase/supabase-js\\|@supabase/auth-helpers" /opt/app/package.json 2>/dev/null && echo SUPABASE=yes || echo SUPABASE=no',
        10000
      );
      usesSupabase = sbCheck.out.includes('SUPABASE=yes');
    }
    if (usesSupabase) {
      patchDeploy(deployId, { usesSupabase: true, updatedAt: new Date().toISOString() });
    }

    // Variables de entorno del cliente (build-time vía COPY y runtime vía env_file)
    if (dep.envVars) {
      await client.agentWriteFile(nodeName, vmid, '/opt/app/.env', dep.envVars.trim() + '\n');
    } else if (usesSupabase) {
      // Crear .env mínimo para que el build no falle por vars vacías
      await client.agentWriteFile(nodeName, vmid, '/opt/app/.env',
        '# Agrega tus variables de Supabase al hacer Retry\n' +
        'NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co\n' +
        'NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder\n'
      );
    }

    // Generar Dockerfile para node si no tiene
    if (detectedStack === 'node') {
      await client.agentWriteFile(nodeName, vmid, '/opt/app/Dockerfile', nodeDockerfile(dep.appPort));
    }

    // Generar compose
    const compose = buildCompose(detectedStack, dep.appPort, dbType, dbPass, !!dep.envVars);
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

    const supabaseNote = usesSupabase && !dep.envVars
      ? ' ⚠ App usa Supabase — agrega tus vars en Retry'
      : usesSupabase ? ' + Supabase (vars aplicadas)' : '';
    return { detail: `Stack: ${detectedStack}${dbType ? ' + ' + dbType : ''}${supabaseNote}` };
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
      const rawErr = sanitizeBuildOutput(logR.out.slice(-400));
      const depNow = getDeploy(deployId);
      const hint = depNow.usesSupabase && !dep.envVars
        ? ' | Supabase detectado: agrega NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Retry'
        : '';
      throw new Error(`Build falló (exit ${exitMatch[1]}): ${rawErr}${hint}`);
    }
    return { detail: 'Imagen construida' };
  });

  // 7. run — separar up de la verificación HTTP para NO tragarse el error real
  // de compose (pull de imágenes, puertos ocupados…), y dar tiempo al primer
  // arranque (MySQL 8 tarda 30-60 s en inicializar; apps Node 10-30 s).
  await runStep(deployId, 'run', async () => {
    const up = await client.agentExecWait(nodeName, vmid,
      'cd /opt/app && docker compose up -d > /tmp/up.log 2>&1; echo UP_EXIT=$?; tail -c 600 /tmp/up.log',
      300000
    );
    const upExit = up.out.match(/UP_EXIT=(\d+)/)?.[1] ?? '1';
    if (upExit !== '0') {
      throw new Error(`docker compose up falló: ${sanitizeBuildOutput(up.out.replace(/UP_EXIT=\d+/, '')).slice(-350)}`);
    }

    // Poll HTTP hasta 90 s
    const deadline = Date.now() + 90_000;
    let code = '000';
    for (;;) {
      const r = await client.agentExecWait(nodeName, vmid,
        "curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:80/ 2>/dev/null || echo 000",
        20000
      );
      code = r.out.match(/\d{3}/)?.[0] ?? '000';
      if (code !== '000' && !code.startsWith('5')) break;
      if (Date.now() > deadline) break;
      await new Promise((res) => setTimeout(res, 6000));
    }

    if (code === '000' || code.startsWith('5')) {
      const diag = await client.agentExecWait(nodeName, vmid,
        'cd /opt/app && docker compose ps -a --format "{{.Service}}: {{.Status}}" 2>&1; ' +
        'echo "--- logs ---"; docker compose logs --tail 15 --no-color 2>&1 | tail -c 500',
        30000
      );
      throw new Error(`App no responde (HTTP ${code}). ${sanitizeBuildOutput(diag.out).slice(-380)}`);
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

  if (!killedDeploys.has(deployId)) {
    patchDeploy(deployId, { status: 'done', updatedAt: new Date().toISOString() });
  }
  killedDeploys.delete(deployId);
}

// ── Reintentar deploy fallido ─────────────────────────────────────────────────
export async function retryDeploy(deployId, envVars) {
  const dep = getDeploy(deployId);
  if (dep.status !== 'error') throw new HttpError(400, 'Solo se puede reintentar un deploy en estado error');
  if (envVars !== undefined) { dep.envVars = envVars; patchDeploy(deployId, { envVars }); }

  // Limpiar VM anterior si se llegó a crear
  if (dep.vmid && dep.node) {
    const { client, cfg } = getNode(dep.node);
    try { await stopAndDestroy(client, dep.node, dep.vmid); }
    catch (e) { console.error(`[retry:${deployId}] No se pudo limpiar VMID ${dep.vmid}: ${e.message}`); }
    if (dep.wanPort) {
      try { await sshNode(cfg.host, `iptables -t nat -D PREROUTING -p tcp --dport ${dep.wanPort} -j DNAT --to-destination ${dep.guestIP}:80 2>/dev/null || true`); } catch { /* continuar */ }
    }
    if (dep.sshPort && dep.sshPort >= 22000 && dep.guestIP) {
      try { await sshNode(cfg.host, `iptables -t nat -D PREROUTING -p tcp --dport ${dep.sshPort} -j DNAT --to-destination ${dep.guestIP}:22 2>/dev/null || true`); } catch { /* continuar */ }
    }
  }

  // Reset de pasos y estado
  const resources = dep.plan === 'estandar'
    ? { cores: 2, memoryMb: 2048 + (dep.db !== 'ninguna' ? 512 : 0), diskGb: 25 }
    : { cores: 1, memoryMb: 1024 + (dep.db !== 'ninguna' ? 512 : 0), diskGb: 20 };

  // Re-seleccionar nodo — el nodo original puede estar sin disco o caído
  let retryNode = dep.node;
  try {
    retryNode = await selectBestNode(resources, `retry:${dep.hostname} plan:${dep.plan} db:${dep.db}`);
  } catch (e) {
    console.warn(`[retry:${deployId}] No se pudo re-seleccionar nodo: ${e.message}. Usando ${dep.node}`);
  }

  patchDeploy(deployId, {
    status: 'running',
    node: retryNode,
    vmid: null,
    guestIP: null,
    wanPort: undefined,
    // La VM anterior se destruyó — sus credenciales SSH ya no valen
    sshUser: null, sshPassword: null, sshHost: null, sshPort: null,
    steps: makeSteps({
      skipDnsTls: dep.domain?.type === 'wildcard',
      vpsOnly: dep.source?.type === 'vps-only',
      dbOnly: dep.source?.type === 'db-only',
    }),
    updatedAt: new Date().toISOString(),
  });

  pipeline(deployId, resources, retryNode).catch((err) => {
    patchDeploy(deployId, { status: 'error', updatedAt: new Date().toISOString() });
    console.error(`[deploy:${deployId}] RETRY-FATAL:`, err.message);
    sendAdminAlert({
      subject: `[ALERTA] Retry fallido: ${dep.hostname}`,
      body: `Deploy ID: ${deployId}\nHostname: ${dep.hostname}\nNodo: ${retryNode}\nCliente: ${dep.clientId ?? 'admin'}\n\nError:\n${err.message}`,
    }).catch(() => {});
  });
}

// ── Rotar/generar contraseña SSH del servidor ─────────────────────────────────
// Funciona incluso con el deploy en estado error (implementación manual) y
// cuando la contraseña original se perdió — chpasswd vía guest agent.
export async function rotateSsh(deployId) {
  const dep = getDeploy(deployId);
  if (!dep.vmid || !dep.node) throw new HttpError(400, 'El proyecto no tiene servidor creado');
  if (dep.status === 'deleted') throw new HttpError(400, 'El proyecto fue eliminado');
  if (dep.status === 'running') throw new HttpError(409, 'Espera a que termine el despliegue en curso');

  const { client, cfg } = getNode(dep.node);
  const user = dep.sshUser || 'devops';
  // base64url: solo [A-Za-z0-9_-] — seguro entre comillas simples del shell
  const newPass = crypto.randomBytes(12).toString('base64url');
  const r = await client.agentExecWait(dep.node, dep.vmid,
    SSH_PWAUTH_CMD + `; echo '${user}:${newPass}' | chpasswd && echo ROTATE-OK`, 30_000);
  if (!r.out.includes('ROTATE-OK')) {
    throw new HttpError(502, `No se pudo rotar la contraseña SSH: ${(r.err || r.out).slice(0, 150)}`);
  }

  // Asegurar acceso: DNAT 22000+vmid en el nodo (repara deploys previos al fix
  // que guardaron la IP interna inalcanzable de la VLAN)
  let sshHost = dep.sshHost ?? dep.guestIP ?? null;
  let sshPort = dep.sshPort ?? 22;
  try {
    const natPort = await ensureSshNat(cfg, dep.vmid, dep.guestIP);
    if (natPort) { sshHost = cfg.sshWanHost || cfg.host; sshPort = natPort; }
  } catch (e) {
    console.warn(`[rotate-ssh:${deployId}] SSH DNAT no disponible: ${e.message}`);
  }

  upsertCredential({ node: dep.node, vmid: dep.vmid, hostname: dep.hostname, user, password: newPass });
  const ssh = { sshUser: user, sshPassword: newPass, sshHost, sshPort };
  patchDeploy(deployId, { ...ssh, updatedAt: new Date().toISOString() });
  return ssh;
}

// ── Rotar contraseña de BD ────────────────────────────────────────────────────
export async function rotateDb(deployId) {
  const dep = getDeploy(deployId);
  if (!dep.dbInfo || dep.status !== 'done') throw new HttpError(400, 'El deploy no tiene BD activa');
  const { client } = getNode(dep.node);
  const dbType = dep.dbInfo.tipo;
  const oldPass = dep.dbInfo.password;
  const newPass = crypto.randomBytes(12).toString('hex');

  const rotateCmd = {
    postgres: `docker exec $(cd /opt/app && docker compose ps -q db 2>/dev/null) psql -U app -c "ALTER USER app PASSWORD '${newPass}'" 2>&1`,
    mysql: `docker exec $(cd /opt/app && docker compose ps -q db 2>/dev/null) mysql -u app -p"${oldPass}" app -e "ALTER USER 'app'@'%' IDENTIFIED BY '${newPass}'; FLUSH PRIVILEGES;" 2>&1`,
    redis: `docker exec $(cd /opt/app && docker compose ps -q db 2>/dev/null) redis-cli -a "${oldPass}" CONFIG SET requirepass "${newPass}" 2>&1`,
  }[dbType];

  if (rotateCmd) {
    const r = await client.agentExecWait(dep.node, dep.vmid, rotateCmd, 30_000);
    if (r.exitcode !== 0) throw new Error(`Error rotando contraseña de ${dbType}: ${r.out.slice(-200)}`);
  }

  const newDbInfo = {
    ...dep.dbInfo,
    password: newPass,
    urlInterna: dep.dbInfo.urlInterna?.replace(oldPass, newPass),
  };
  patchDeploy(deployId, { dbInfo: newDbInfo, updatedAt: new Date().toISOString() });
  return newDbInfo;
}

// ── Limpieza al borrar un deploy ──────────────────────────────────────────────
export async function deleteDeploy(deployId) {
  const dep = getDeploy(deployId);
  const errors = [];

  if (dep.vmid && dep.node) {
    try {
      const { client } = getNode(dep.node);
      const { cfg } = getNode(dep.node);
      // Eliminar DNAT (app y SSH)
      if (dep.wanPort || (dep.sshPort && dep.sshPort >= 22000)) {
        try {
          const rules = [];
          if (dep.wanPort) {
            rules.push(
              `iptables -t nat -D PREROUTING -p tcp --dport ${dep.wanPort} -j DNAT --to-destination ${dep.guestIP}:80 2>/dev/null || true`,
              `iptables -t nat -D POSTROUTING -p tcp -d ${dep.guestIP} --dport 80 -j MASQUERADE 2>/dev/null || true`,
              `iptables -D FORWARD -p tcp -d ${dep.guestIP} --dport 80 2>/dev/null || true`
            );
          }
          if (dep.sshPort && dep.sshPort >= 22000) {
            rules.push(
              `iptables -t nat -D PREROUTING -p tcp --dport ${dep.sshPort} -j DNAT --to-destination ${dep.guestIP}:22 2>/dev/null || true`,
              `iptables -t nat -D POSTROUTING -p tcp -d ${dep.guestIP} --dport 22 -j MASQUERADE 2>/dev/null || true`,
              `iptables -D FORWARD -p tcp -d ${dep.guestIP} --dport 22 2>/dev/null || true`
            );
          }
          rules.push(`iptables-save > /etc/iptables/rules.v4`);
          await sshNode(cfg.host, rules.join('\n'));
        } catch (e) { errors.push(`DNAT: ${e.message}`); }
      }
      // Detener y eliminar VM (espera stop real antes de destroy)
      await stopAndDestroy(client, dep.node, dep.vmid);
    } catch (e) { errors.push(`VM: ${e.message}`); }
  }

  // Eliminar vhost principal
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
  // Eliminar dominios personalizados
  for (const cd of dep.customDomains ?? []) {
    await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'remove', cd.fqdn]).catch(() => {});
  }

  // Marcar como eliminado (no borrar del JSON para auditoría)
  patchDeploy(deployId, { status: 'deleted', updatedAt: new Date().toISOString() });
  if (errors.length) throw new Error(`Deploy eliminado con errores parciales: ${errors.join('; ')}`);
}

// ── Gestión de dominios personalizados ───────────────────────────────────────

export async function addCustomDomain(deployId, fqdn) {
  const dep = getDeploy(deployId);
  if (!dep.wanPort || !dep.node) throw new HttpError(400, 'El servidor aún no tiene puerto web configurado');
  const { cfg } = getNode(dep.node);
  const existing = (dep.customDomains ?? []).find((d) => d.fqdn === fqdn);
  if (existing) throw new HttpError(409, `El dominio ${fqdn} ya está registrado en este proyecto`);
  await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'add', fqdn, cfg.host, String(dep.wanPort)]);
  const entry = { fqdn, addedAt: new Date().toISOString(), certStatus: 'self-signed', status: 'active' };
  patchDeploy(deployId, { customDomains: [...(dep.customDomains ?? []), entry] });
  return entry;
}

export async function removeCustomDomain(deployId, fqdn) {
  await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'remove', fqdn]).catch(() => {});
  const dep = getDeploy(deployId);
  patchDeploy(deployId, { customDomains: (dep.customDomains ?? []).filter((d) => d.fqdn !== fqdn) });
}

export async function issueDomainSsl(deployId, fqdn) {
  const dep = getDeploy(deployId);
  const domain = (dep.customDomains ?? []).find((d) => d.fqdn === fqdn);
  if (!domain) throw new HttpError(404, 'Dominio no encontrado');
  await execFileAsync('sudo', ['/usr/local/sbin/panel-vhost', 'issue-cert', fqdn], { timeout: 120000 });
  patchDeploy(deployId, {
    customDomains: (dep.customDomains ?? []).map((d) =>
      d.fqdn === fqdn ? { ...d, certStatus: 'valid', certIssuedAt: new Date().toISOString() } : d
    ),
  });
  return { fqdn, certStatus: 'valid' };
}
