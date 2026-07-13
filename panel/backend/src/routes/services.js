import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNode } from '../proxmox.js';
import { provisionVm } from '../services/provision.js';
import { logOp } from '../services/history.js';
import { HttpError } from '../errors.js';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const installsFile = path.join(config.dataDir, 'service-installs.json');

function readInstalls() {
  if (!existsSync(installsFile)) return [];
  try { return JSON.parse(readFileSync(installsFile, 'utf8')); } catch { return []; }
}

function saveInstalls(list) {
  writeFileSync(installsFile, JSON.stringify(list, null, 2));
}

export const SERVICE_CATALOG = [
  {
    id: 'openclaw',
    name: 'OpenClaw Server',
    description: 'Servidor de juego OpenClaw. Multiplayer sandbox con Docker.',
    category: 'gaming',
    icon: '🎮',
    resources: { cores: 2, memoryMb: 4096, diskGb: 30 },
    ports: [{ port: 25565, proto: 'tcp', label: 'Juego' }, { port: 8080, proto: 'tcp', label: 'Admin Web' }],
    setupScript: `#!/bin/bash
set -e
apt-get update -qq
apt-get install -y docker.io docker-compose-v2 curl
systemctl enable --now docker

mkdir -p /opt/openclaw
cat > /opt/openclaw/docker-compose.yml << 'EOF'
services:
  openclaw:
    image: itzg/minecraft-server:latest
    container_name: openclaw
    restart: unless-stopped
    environment:
      EULA: "TRUE"
      TYPE: PAPER
      VERSION: "1.21"
      MEMORY: "3G"
      SERVER_NAME: "OpenClaw Server"
      ENABLE_AUTOPAUSE: "FALSE"
    ports:
      - "25565:25565"
      - "25575:25575"
    volumes:
      - /opt/openclaw/data:/data
  admin:
    image: itzg/mc-router:latest
    container_name: openclaw-admin
    restart: unless-stopped
    environment:
      API_BINDING: "0.0.0.0:8080"
    ports:
      - "8080:8080"
    depends_on: [openclaw]
EOF
cd /opt/openclaw && docker compose up -d
echo "OpenClaw instalado" > /var/log/service-install.log`,
  },
  {
    id: 'hermes',
    name: 'Hermes Messaging',
    description: 'Servidor de mensajería Rocket.Chat. Chat, canales, videoconferencias.',
    category: 'communication',
    icon: '💬',
    resources: { cores: 2, memoryMb: 4096, diskGb: 30 },
    ports: [{ port: 3000, proto: 'tcp', label: 'Web' }],
    setupScript: `#!/bin/bash
set -e
apt-get update -qq
apt-get install -y docker.io docker-compose-v2
systemctl enable --now docker

mkdir -p /opt/hermes
cat > /opt/hermes/docker-compose.yml << 'EOF'
services:
  rocketchat:
    image: registry.rocket.chat/rocketchat/rocket.chat:latest
    container_name: hermes-chat
    restart: unless-stopped
    environment:
      MONGO_URL: mongodb://mongo:27017/rocketchat
      MONGO_OPLOG_URL: mongodb://mongo:27017/local
      ROOT_URL: http://localhost:3000
      PORT: "3000"
    ports:
      - "3000:3000"
    depends_on: [mongo]
  mongo:
    image: mongo:6
    container_name: hermes-mongo
    restart: unless-stopped
    command: mongod --oplogSize 128 --replSet rs0
    volumes:
      - /opt/hermes/mongo:/data/db
  mongo-init:
    image: mongo:6
    command: >
      bash -c "sleep 10 && mongosh --host mongo:27017 --eval 'rs.initiate({_id: \"rs0\", members: [{_id: 0, host: \"localhost:27017\"}]})'"
    depends_on: [mongo]
EOF
cd /opt/hermes && docker compose up -d
echo "Hermes instalado" > /var/log/service-install.log`,
  },
  {
    id: 'coolify',
    name: 'Coolify (hosting estilo Vercel)',
    description: 'Plataforma PaaS auto-hospedada. Despliega apps desde Git, Docker, Compose. Alternativa a Vercel/Netlify/Heroku.',
    category: 'devops',
    icon: '🚀',
    resources: { cores: 4, memoryMb: 8192, diskGb: 50 },
    ports: [{ port: 8000, proto: 'tcp', label: 'Dashboard' }, { port: 80, proto: 'tcp', label: 'HTTP' }, { port: 443, proto: 'tcp', label: 'HTTPS' }],
    setupScript: `#!/bin/bash
set -e
apt-get update -qq
apt-get install -y curl docker.io
systemctl enable --now docker
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
echo "Coolify instalado" > /var/log/service-install.log`,
  },
  {
    id: 'supabase',
    name: 'Supabase Self-Hosted',
    description: 'Backend como servicio: PostgreSQL + API REST/GraphQL + Auth + Storage + Realtime. Alternativa a Firebase.',
    category: 'backend',
    icon: '🗄️',
    resources: { cores: 4, memoryMb: 8192, diskGb: 60 },
    ports: [
      { port: 8000, proto: 'tcp', label: 'API / Studio' },
      { port: 5432, proto: 'tcp', label: 'PostgreSQL' },
    ],
    setupScript: `#!/bin/bash
set -e
apt-get update -qq
apt-get install -y docker.io docker-compose-v2 git curl
systemctl enable --now docker

cd /opt
git clone --depth 1 https://github.com/supabase/supabase.git
cd supabase/docker

# Generar secrets aleatorios
POSTGRES_PASSWORD=$(openssl rand -hex 20)
JWT_SECRET=$(openssl rand -hex 40)
ANON_KEY=$(python3 -c "
import hmac, hashlib, base64, json, time, struct
header = base64.urlsafe_b64encode(json.dumps({'alg':'HS256','typ':'JWT'}).encode()).rstrip(b'=')
payload = base64.urlsafe_b64encode(json.dumps({'role':'anon','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+315360000}).encode()).rstrip(b'=')
msg = header + b'.' + payload
sig = base64.urlsafe_b64encode(hmac.new(b'$JWT_SECRET', msg, hashlib.sha256).digest()).rstrip(b'=')
print((msg + b'.' + sig).decode())
" 2>/dev/null || echo "anon-key-placeholder")

cp .env.example .env
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" .env
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env
sed -i "s/ANON_KEY=.*/ANON_KEY=$ANON_KEY/" .env
sed -i "s/SERVICE_ROLE_KEY=.*/SERVICE_ROLE_KEY=$ANON_KEY/" .env

docker compose pull
docker compose up -d
cat > /var/log/service-install.log << LOGEOF
Supabase instalado
PostgreSQL password: $POSTGRES_PASSWORD
JWT secret: $JWT_SECRET
LOGEOF
echo "Supabase instalado" >> /var/log/service-install.log`,
  },
];

const installLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de instalaciones alcanzado; espera una hora' },
});

export const servicesRouter = Router();

// Catálogo de servicios disponibles
servicesRouter.get('/catalog', (_req, res) => {
  res.json(SERVICE_CATALOG.map(({ setupScript: _s, ...rest }) => rest));
});

// Lista de servicios instalados
servicesRouter.get('/installs', (_req, res) => {
  res.json(readInstalls());
});

// Instalar un servicio
servicesRouter.post('/install', installLimiter, async (req, res, next) => {
  try {
    const { serviceId, node: nodeName, hostname } = req.body ?? {};

    if (typeof serviceId !== 'string' || !serviceId.match(/^[a-z0-9_-]+$/)) {
      throw new HttpError(400, 'serviceId inválido');
    }
    if (typeof nodeName !== 'string' || !nodeName.match(/^[a-z0-9_-]+$/)) {
      throw new HttpError(400, 'node inválido');
    }
    if (typeof hostname !== 'string' || !hostname.match(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/)) {
      throw new HttpError(400, 'hostname inválido (solo letras, números y guiones)');
    }

    const svc = SERVICE_CATALOG.find((s) => s.id === serviceId);
    if (!svc) throw new HttpError(404, `Servicio desconocido: ${serviceId}`);

    // Verificar nodo accesible
    getNode(nodeName);

    // Aprovisionar VM con los recursos del servicio
    const { cores, memoryMb, diskGb } = svc.resources;
    const vmResult = await provisionVm({
      node: nodeName,
      hostname,
      cores,
      memoryMb,
      diskGb,
      tags: [`svc:${serviceId}`],
    });

    // Registrar en installs
    const installs = readInstalls();
    const install = {
      id: `${nodeName}-${vmResult.vmid}`,
      serviceId,
      serviceName: svc.name,
      icon: svc.icon,
      node: nodeName,
      vmid: vmResult.vmid,
      hostname,
      user: vmResult.user,
      password: vmResult.password,
      subnetHint: vmResult.subnetHint,
      status: 'vm_running',
      setupStatus: 'pending',
      installedAt: new Date().toISOString(),
      ports: svc.ports,
    };
    installs.push(install);
    saveInstalls(installs);

    logOp({
      action: 'service-install',
      node: nodeName,
      vmid: vmResult.vmid,
      detail: `${svc.name} → ${hostname}`,
    });

    res.status(201).json({
      ...install,
      setupScript: svc.setupScript,
      note: 'VM aprovisionada. Ejecuta setupScript en la VM para completar la instalación del servicio.',
    });
  } catch (e) {
    next(e);
  }
});

// Obtener script de setup de un servicio instalado
servicesRouter.get('/installs/:installId/script', (req, res, next) => {
  try {
    const installs = readInstalls();
    const install = installs.find((i) => i.id === req.params.installId);
    if (!install) throw new HttpError(404, 'Instalación no encontrada');
    const svc = SERVICE_CATALOG.find((s) => s.id === install.serviceId);
    if (!svc) throw new HttpError(404, 'Servicio no encontrado en catálogo');
    res.type('text/plain').send(svc.setupScript);
  } catch (e) {
    next(e);
  }
});

// Actualizar estado de una instalación
servicesRouter.patch('/installs/:installId', (req, res, next) => {
  try {
    const { setupStatus } = req.body ?? {};
    if (!['pending', 'running', 'done', 'error'].includes(setupStatus)) {
      throw new HttpError(400, 'setupStatus inválido');
    }
    const installs = readInstalls();
    const idx = installs.findIndex((i) => i.id === req.params.installId);
    if (idx === -1) throw new HttpError(404, 'Instalación no encontrada');
    installs[idx].setupStatus = setupStatus;
    if (setupStatus === 'done') installs[idx].completedAt = new Date().toISOString();
    saveInstalls(installs);
    res.json(installs[idx]);
  } catch (e) {
    next(e);
  }
});
