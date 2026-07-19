#!/bin/bash
# Construye el template VPS "ubuntu2404-devstack" (VMID 9000) en el nodo pve.
# Ejecutar como root en el shell del nodo Proxmox.
set -euo pipefail

VMID=9000
STORAGE=local-lvm
NAME=ubuntu2404-devstack
IMG_DIR=/var/lib/vz/template/iso
IMG=$IMG_DIR/noble-server-cloudimg-amd64.img

echo "[1/7] Habilitando snippets en storage local..."
pvesm set local --content iso,backup,vztmpl,snippets

echo "[2/7] Verificando snippet cloud-init..."
test -f /var/lib/vz/snippets/vps-devstack.yaml || { echo "Falta /var/lib/vz/snippets/vps-devstack.yaml"; exit 1; }

echo "[3/7] Descargando imagen cloud de Ubuntu 24.04 (si no existe)..."
mkdir -p "$IMG_DIR"
if [ ! -f "$IMG" ]; then
  wget -O "$IMG" https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
fi

echo "[4/7] Creando VM $VMID..."
qm destroy $VMID --purge 2>/dev/null || true
qm create $VMID --name $NAME --memory 2048 --cores 2 --cpu host \
  --net0 virtio,bridge=vmbr0,tag=6 --scsihw virtio-scsi-pci --ostype l26 \
  --agent enabled=1 --serial0 socket --vga serial0

echo "[5/7] Importando disco..."
qm importdisk $VMID "$IMG" $STORAGE
qm set $VMID --scsi0 $STORAGE:vm-$VMID-disk-0,discard=on
qm set $VMID --ide2 $STORAGE:cloudinit
qm set $VMID --boot order=scsi0

echo "[6/7] Configurando cloud-init..."
qm set $VMID --ciuser devops --ciupgrade 1
qm set $VMID --ipconfig0 ip=dhcp
qm set $VMID --nameserver 192.168.6.1
qm set $VMID --cicustom vendor=local:snippets/vps-devstack.yaml
qm disk resize $VMID scsi0 20G

echo "[7/7] Convirtiendo a template..."
qm template $VMID
echo "OK: template $VMID ($NAME) listo."
