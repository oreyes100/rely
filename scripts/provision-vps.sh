#!/bin/bash
# Aprovisiona un VPS de cliente clonando el template 9000.
# Uso: ./provision-vps.sh <VMID> <nombre> [cores] [ram_MB] [disco_G] [password]
# Ejemplo: ./provision-vps.sh 201 cliente-acme 2 4096 40
set -euo pipefail

TEMPLATE=9000
VMID=${1:?Falta VMID}
NAME=${2:?Falta nombre}
CORES=${3:-2}
RAM=${4:-2048}
DISK=${5:-20}
PASS=${6:-$(openssl rand -base64 12)}

echo "Clonando template $TEMPLATE -> VM $VMID ($NAME)..."
qm clone $TEMPLATE $VMID --name "$NAME" --full
qm set $VMID --cores "$CORES" --memory "$RAM"
qm set $VMID --cipassword "$PASS"

# Ampliar disco si se pidio mas de 20G
if [ "$DISK" -gt 20 ]; then
  qm disk resize $VMID scsi0 "${DISK}G"
fi

qm start $VMID
echo "Esperando IP (necesita qemu-guest-agent, ~2-4 min el primer arranque)..."
for i in $(seq 1 60); do
  # subred 192.168.6.x en pve, 192.168.7.x en pvececyte (genérico)
  IP=$(qm guest cmd $VMID network-get-interfaces 2>/dev/null \
    | grep -oP '192\.168\.[67]\.\d+' | head -1 || true)
  [ -n "${IP:-}" ] && break
  sleep 10
done

echo "=============================================="
echo " VPS listo: $NAME (VMID $VMID)"
echo " IP:       ${IP:-pendiente (revisa consola)}"
echo " Usuario:  devops"
echo " Password: $PASS"
echo " Stack:    Node 22+PM2, Python3, Docker, install-supabase"
echo "=============================================="
