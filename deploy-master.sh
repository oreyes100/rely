#!/bin/bash
set -e

echo "==================================================="
echo "  VidStream — Master Deploy via Proxmox + VPS"
echo "==================================================="
echo ""

# ===== CREDENCIALES =====
PROXMOX_HOST="192.168.1.4"
PROXMOX_USER="root"
PROXMOX_PASS="123"

VPS_HOST="192.168.6.196"
VPS_USER="devops"
VPS_PASS="g5U2z=GXe5K4EuPg"

WAN_IP="207.248.113.8"
WAN_PORT=3000

DEPLOY_DIR="/home/devops/vidstream"
STAGING="/tmp/vidstream-deploy"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ===== DETECTAR sshpass =====
command -v sshpass >/dev/null 2>&1 || {
  echo "[!] sshpass no encontrado, instalando..."
  apt-get install -y sshpass 2>/dev/null || true
}

# ===== PASO 1: Preparar staging local =====
echo "== Paso 1: Preparando archivos de proyecto =="
rsync -a --exclude='node_modules' --exclude='.git' --exclude='vidstream.db' \
  --exclude='.env' --exclude='.dockerignore' --exclude='Dockerfile' \
  --exclude='docker-compose.yml' --exclude='.gitignore' \
  --exclude='.dockerignore' "${SCRIPT_DIR}/" "${STAGING}/" 2>/dev/null || {
    mkdir -p "${STAGING}"
    cp -r "${SCRIPT_DIR}/server" "${STAGING}/"
    cp -r "${SCRIPT_DIR}/public" "${STAGING}/"
    cp "${SCRIPT_DIR}/package.json" "${STAGING}/"
  }
echo "  Archivos preparados en ${STAGING}"
echo ""

# ===== PASO 2: Copiar al Proxmox =====
echo "== Paso 2: Subiendo a Proxmox (${PROXMOX_HOST}) =="
sshpass -p "$PROXMOX_PASS" scp -o StrictHostKeyChecking=no -r "${STAGING}/*" \
  "${PROXMOX_USER}@${PROXMOX_HOST}:${STAGING}/" 2>/dev/null
echo "  Archivos en Proxmox staging OK"
echo ""

# ===== PASO 3: Crear directorios en VPS =====
echo "== Paso 3: Preparando VPS (${VPS_HOST}) =="
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no \
  "${VPS_USER}@${VPS_HOST}" "
  mkdir -p ${DEPLOY_DIR}
  mkdir -p ${DEPLOY_DIR}/media
  mkdir -p ${DEPLOY_DIR}/public/thumbnails
  mkdir -p ${DEPLOY_DIR}/logs
  echo 'Directorios VPS OK'
"
echo ""

# ===== PASO 4: Copiar al VPS a traves de Proxmox =====
echo "== Paso 4: Copiando archivos al VPS =="
sshpass -p "$PROXMOX_PASS" ssh -o StrictHostKeyChecking=no \
  "${PROXMOX_USER}@${PROXMOX_HOST}" "
  scp -o StrictHostKeyChecking=no -r ${STAGING}/* \
    ${VPS_USER}@${VPS_HOST}:${DEPLOY_DIR}/
  echo 'Transferencia Proxmox -> VPS OK'
"
echo "  Archivos en VPS OK"
echo ""

# ===== PASO 5: Instalar TODO en el VPS =====
echo "== Paso 5: Instalando en el VPS =="
sshpass -p "$VPS_PASS" ssh -o StrictHostKeyChecking=no \
  "${VPS_USER}@${VPS_HOST}" << 'VPS_INSTALL'
set -e

DEPLOY_DIR="/home/devops/vidstream"
WAN_PORT=3000

echo "  [5a] Actualizando sistema..."
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -qq 2>&1 | tail -1
sudo apt-get install -y -qq nodejs npm ffmpeg 2>&1 | tail -3

echo "  [5b] Instalando dependencias Node..."
cd /home/devops/vidstream
npm install --production 2>&1 | tail -3

echo "  [5c] Instalando PM2..."
sudo npm install -g pm2 2>&1 | tail -1

echo "  [5d] Configurando UFW..."
sudo ufw allow ${WAN_PORT}/tcp comment 'VidStream WAN'
sudo ufw allow OpenSSH

echo "  [5e] Creando servicio systemd..."
sudo tee /etc/systemd/system/vidstream.service > /dev/null <<'SVCEOF'
[Unit]
Description=VidStream - Video Streaming Webapp
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=devops
Group=devops
WorkingDirectory=/home/devops/vidstream
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
StandardOutput=append:/home/devops/vidstream/logs/app.log
StandardError=append:/home/devops/vidstream/logs/app.log

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable vidstream

echo "  [5f] Iniciando servicio..."
sudo systemctl restart vidstream
sleep 2

echo "  [5g] Verificando..."
if sudo systemctl is-active --quiet vidstream; then
  echo "  OK - VidStream corriendo"
else
  echo "  ERROR - Revisar: sudo journalctl -u vidstream -n 20"
fi

HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:${WAN_PORT}/ 2>/dev/null || echo "000")
echo "  HTTP Status: ${HTTP_CODE}"

echo ""
echo "========================================"
echo "  Instalacion VPS completada!"
echo "========================================"
echo ""
echo "  Local:  http://localhost:${WAN_PORT}"
echo "  WAN:    http://207.248.113.8:${WAN_PORT}"
echo ""
VPS_INSTALL
echo ""

# ===== PASO 6: Configurar WAN (pfSense port-forward) =====
echo "== Paso 6: Configuracion WAN (pfSense) =="
echo ""
echo "  >>> ACCION MANUAL REQUERIDA <<<"
echo ""
echo "  Entra a pfSense: https://192.168.1.1:8443"
echo "  1. Firewall -> NAT -> Port Forward"
echo "  2. Click + (Add)"
echo "  3. Configura:"
echo "     - Interface: WAN"
echo "     - Protocol: TCP"
echo "     - Destination: WAN address"
echo "     - Dest. Port Range: ${WAN_PORT}"
echo "     - Redirect Target IP: 192.168.6.196"
echo "     - Redirect Target Port: ${WAN_PORT}"
echo "     - Marca: Add associated filter rule"
echo "  4. Save -> Apply Changes"
echo ""
echo "  Despues de aplicar, prueba desde afuera:"
echo "    curl http://207.248.113.8:${WAN_PORT}/"
echo ""

# ===== PASO 7: Resumen =====
echo "==================================================="
echo "  DEPLOY COMPLETADO"
echo "==================================================="
echo ""
echo "  Proyecto: VidStream"
echo "  VPS:      ${VPS_HOST} (devops)"
echo "  Ruta:     ${DEPLOY_DIR}"
echo "  Puerto:   ${WAN_PORT}"
echo "  URL WAN:  http://${WAN_IP}:${WAN_PORT}"
echo ""
echo "  Comandos utiles (SSH al VPS):"
echo "    ssh -p 2202 devops@${WAN_IP}"
echo ""
echo "  Comandos utiles (dentro del VPS):"
echo "    sudo systemctl status vidstream"
echo "    sudo journalctl -u vidstream -f"
echo "    sudo systemctl restart vidstream"
echo ""
echo "  Para re-escanear videos (despues de subir archivos):"
echo "    ssh devops@${VPS_HOST}"
echo "    cd ${DEPLOY_DIR}"
echo "    node -e \"const{scanLibrary}=require('./server/scanner');const{getAllLibraries}=require('./server/db');getAllLibraries().then(l=>scanLibrary(l[0]).then(()=>console.log('Scan OK')))\""
echo ""
echo "==================================================="