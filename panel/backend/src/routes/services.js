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

function updateInstallStatus(installId, setupStatus, errMsg = null) {
  const installs = readInstalls();
  const idx = installs.findIndex((i) => i.id === installId);
  if (idx === -1) return;
  installs[idx].setupStatus = setupStatus;
  if (setupStatus === 'done') installs[idx].completedAt = new Date().toISOString();
  if (errMsg) installs[idx].setupError = errMsg.slice(0, 400);
  saveInstalls(installs);
}

export const SERVICE_CATALOG = [
  {
    id: 'openclaw',
    name: 'OpenClaw AI Server',
    description: 'Servidor de inferencia de IA OpenClaw. Despliega modelos LLM localmente con API compatible con OpenAI. Interfaz web incluida (Open WebUI).',
    category: 'ai',
    icon: '🧠',
    resources: { cores: 4, memoryMb: 8192, diskGb: 60 },
    ports: [
      { port: 11434, proto: 'tcp', label: 'API Ollama' },
      { port: 3000, proto: 'tcp', label: 'Open WebUI' },
    ],
    setupScript: `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

apt-get -o DPkg::Lock::Timeout=300 update -qq
apt-get -o DPkg::Lock::Timeout=300 install -y docker.io docker-compose-v2 curl
systemctl enable --now docker

mkdir -p /opt/openclaw/data /opt/openclaw/webui
cat > /opt/openclaw/docker-compose.yml << 'COMPOSE'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: openclaw-ollama
    restart: unless-stopped
    volumes:
      - /opt/openclaw/data:/root/.ollama
    ports:
      - "11434:11434"
  webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: openclaw-webui
    restart: unless-stopped
    environment:
      OLLAMA_BASE_URL: http://ollama:11434
      WEBUI_NAME: OpenClaw AI
    volumes:
      - /opt/openclaw/webui:/app/backend/data
    ports:
      - "3000:8080"
    depends_on:
      - ollama
COMPOSE

cd /opt/openclaw && docker compose up -d
sleep 15

# Descargar modelo en background (no bloquear la instalación)
docker exec -d openclaw-ollama ollama pull llama3.2:3b || true

echo "OpenClaw instalado - modelo descargando en background" > /var/log/service-install.log
echo SETUP-OK`,
  },
  {
    id: 'hermes',
    name: 'Hermes Agent (Nous Research)',
    description: 'Servidor del modelo Hermes de Nous Research. Agente de IA fine-tuned con capacidades de razonamiento avanzado. API compatible con OpenAI + interfaz web.',
    category: 'ai',
    icon: '⚡',
    resources: { cores: 4, memoryMb: 8192, diskGb: 60 },
    ports: [
      { port: 11434, proto: 'tcp', label: 'API Ollama' },
      { port: 3000, proto: 'tcp', label: 'Open WebUI' },
    ],
    setupScript: `#!/bin/bash
set -e
export DEBIAN_FRONTEND=noninteractive

apt-get -o DPkg::Lock::Timeout=300 update -qq
apt-get -o DPkg::Lock::Timeout=300 install -y docker.io docker-compose-v2 curl
systemctl enable --now docker

mkdir -p /opt/hermes/data /opt/hermes/webui
cat > /opt/hermes/docker-compose.yml << 'COMPOSE'
services:
  ollama:
    image: ollama/ollama:latest
    container_name: hermes-ollama
    restart: unless-stopped
    volumes:
      - /opt/hermes/data:/root/.ollama
    ports:
      - "11434:11434"
  webui:
    image: ghcr.io/open-webui/open-webui:main
    container_name: hermes-webui
    restart: unless-stopped
    environment:
      OLLAMA_BASE_URL: http://ollama:11434
      WEBUI_NAME: Hermes Agent
      DEFAULT_MODELS: nous-hermes2
    volumes:
      - /opt/hermes/webui:/app/backend/data
    ports:
      - "3000:8080"
    depends_on:
      - ollama
COMPOSE

cd /opt/hermes && docker compose up -d
sleep 15

# Descargar modelo Nous Hermes 2 en background
docker exec -d hermes-ollama ollama pull nous-hermes2 || true

echo "Hermes instalado - modelo nous-hermes2 descargando en background" > /var/log/service-install.log
echo SETUP-OK`,
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
echo SETUP-OK`,
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

POSTGRES_PASSWORD=$(openssl rand -hex 20)
JWT_SECRET=$(openssl rand -hex 40)

cp .env.example .env
sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$POSTGRES_PASSWORD/" .env
sed -i "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" .env

docker compose pull
docker compose up -d
echo "Supabase instalado" > /var/log/service-install.log
echo SETUP-OK`,
  },
];

// ── Auto-deploy: ejecutar setup script en la VM via qemu-agent ───────────────
async function runServiceSetup(installId, svc, nodeName, vmid) {
  const { client } = getNode(nodeName);

  // 1. Esperar a que el agente QEMU esté listo (max 10 min)
  const agentDeadline = Date.now() + 10 * 60 * 1000;
  for (;;) {
    try {
      await client.agentExecWait(nodeName, vmid, 'echo AGENT-READY', 5000);
      break;
    } catch {
      if (Date.now() > agentDeadline) throw new Error('Timeout esperando que la VM arranque (10 min)');
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  // 2. Ejecutar setup script (instalación de docker + compose up) — timeout 15 min
  const r = await client.agentExecWait(nodeName, vmid, svc.setupScript, 900000);
  if (r.exitcode !== 0 || !r.out.includes('SETUP-OK')) {
    const detail = (r.out + '\n' + r.err).slice(-400);
    throw new Error(`Setup falló (exit ${r.exitcode}): ${detail}`);
  }

  updateInstallStatus(installId, 'done');
}

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

    getNode(nodeName);

    const { cores, memoryMb, diskGb } = svc.resources;
    const vmResult = await provisionVm({
      node: nodeName,
      hostname,
      cores,
      memoryMb,
      diskGb,
      tags: [`svc:${serviceId}`],
    });

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
      setupStatus: 'running',
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

    // Lanzar setup en background — no bloquear el request
    runServiceSetup(install.id, svc, nodeName, vmResult.vmid).catch((e) => {
      console.error(`[service-setup:${install.id}] FATAL:`, e.message);
      updateInstallStatus(install.id, 'error', e.message);
    });

    res.status(201).json({
      ...install,
      note: 'VM aprovisionada. El servicio se está instalando en segundo plano (5-15 min). Refresca la pestaña "Instalados" para ver el progreso.',
    });
  } catch (e) {
    next(e);
  }
});

// Obtener script de setup de un servicio instalado (para descarga manual / diagnóstico)
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
