# MANUAL 3 — Replicar la infraestructura completa en un servidor nuevo

Guía de referencia para montar TODA la plataforma de VPS desde cero en otro
servidor Proxmox: template con stack (Node/Python/Docker/Supabase), gateway de red
de los VPS, aislamiento, salida a internet, port-forwards, y los ajustes que tocan
pfSense y los switches. Incluye las **lecciones aprendidas** para no repetir errores.

> **Contexto de este despliegue** (para traducir a tu caso):
> - WAN pública del sitio: `207.248.113.8` (pfSense hace el NAT hacia internet).
> - Router/firewall central: **pfSense** en `192.168.1.1` (GUI `:8443`).
> - LAN de gestión: `192.168.0.0/22`, gateway `192.168.1.1`.
> - Nodos Proxmox: `pve` (192.168.1.4) y `pvececyte` (192.168.1.254).
> - Cada nodo hostea VPS con **su propia subred** y gateway local.

---

## 0. Decisión de arquitectura CLAVE (lee esto primero)

Existen dos formas de dar red a los VPS. **Usa la Opción A**; la B solo si tienes
NICs "buenas".

### ⚠️ La lección más importante: NIC Broadcom `tg3` + bridge vlan-aware = roto
En `pvececyte` las NICs son **Broadcom tg3 con `rx-vlan-offload: on [fixed]`** (no se
puede desactivar). Esto **rompe el paso de VLANs etiquetadas por un bridge
vlan-aware de Proxmox**: la NIC quita el tag 802.1Q por hardware y el bridge
clasifica la trama en su PVID (VLAN 1) en vez de la VLAN correcta. Síntoma: los VPS
no obtienen IP y pfSense nunca ve su DHCP, **aunque los switches estén perfectos**.
- Cómo diagnosticarlo: `bridge fdb show | grep <MAC_del_VPS>` — si aparece en
  `vlan 1` cuando debería estar en otra VLAN, es este bug. **No uses tcpdump** para
  esto: el offload oculta el tag y te miente.
- Cómo saber si una NIC lo sufre: `ethtool -k <iface> | grep rx-vlan-offload`.
  Si dice `[fixed]` y está `on`, esa NIC no sirve para trunk VLAN con bridge
  vlan-aware.

### ✅ Opción A (RECOMENDADA, la que montamos): gateway de VPS EN el nodo
Los VPS viven en un **bridge local del nodo** y su tráfico **nunca sale etiquetado
por la NIC física** — así el bug tg3 es irrelevante y no dependes de configurar
VLANs en los switches para el tráfico VPS. El nodo hace de router: IP `.1` de la
subred, DHCP (dnsmasq), NAT hacia internet (vía pfSense) y aislamiento (nftables).
Cada nodo usa una subred distinta para no chocar.

| Nodo | Subred VPS | Gateway | Bridge de los VPS |
|---|---|---|---|
| pve | 192.168.6.0/24 | 192.168.6.1 | `vmbr0` con `tag=6` (local, no cruza) |
| pvececyte | 192.168.7.0/24 | 192.168.7.1 | `vmbr7` (bridge **interno**, sin NIC) |

> En un servidor nuevo, lo más simple y robusto es **replicar el modelo de
> pvececyte**: un bridge interno dedicado (`vmbr7`, `vmbr8`, …) sin puertos físicos.
> No toca switches, no sufre el bug tg3, y el aislamiento es total.

### Opción B: pfSense como gateway central de una VLAN
Solo viable si el nodo tiene una NIC que **sí** respete el trunk (no tg3) o una NIC
física dedicada por VLAN. Requiere configurar la VLAN tagged en todos los switches
y un puerto/subinterfaz en pfSense. Más "cloud clásico" pero más frágil aquí.
La documentamos abajo por completitud.

---

## 1. Preparar el nodo Proxmox nuevo

Requisitos: Proxmox VE 8/9 instalado, con salida a internet (default route hacia
pfSense) y almacenamiento `local` (snippets/ISOs) + `local-lvm` (discos).

```bash
# 1. Habilitar el tipo de contenido "snippets" en el storage local
pvesm set local --content iso,backup,vztmpl,snippets

# 2. (Opción A) Si vas a usar bridge vlan-aware en el uplink (como pve):
#    Datacenter->Nodo->System->Network: editar vmbr0, marcar "VLAN aware".
#    OJO: esto solo sirve si tu NIC NO es tg3 fixed. Verifícalo:
ethtool -k $(ip route | awk '/default/{print $5; exit}') | grep rx-vlan-offload
#    Si sale "[fixed]" -> NO uses VLAN tagged por esa NIC; usa bridge interno.
```

---

## 2. Crear el template con el stack (idéntico en cualquier nodo)

El template es una VM Ubuntu 24.04 cloud-init (VMID **9000**) que trae, al primer
arranque: Node.js 22 + PM2 + NVM, Python 3 + pip/venv, Docker CE, el comando
`install-supabase` (Supabase self-hosted 1-click) y SSH por contraseña habilitado.

### 2a. Colocar el snippet cloud-init
Copia el archivo [templates/vps-devstack.yaml](templates/vps-devstack.yaml) a:
```
/var/lib/vz/snippets/vps-devstack.yaml
```
(Si no tienes acceso a archivos, transfiérelo por base64:
`echo '<BASE64>' | base64 -d > /var/lib/vz/snippets/vps-devstack.yaml`.)

El snippet contiene, en resumen:
```yaml
#cloud-config
ssh_pwauth: true                 # <-- permite SSH por contraseña (clave para entregar VPS)
package_update: true
packages: [qemu-guest-agent, python3-pip, python3-venv, build-essential, git, curl, ca-certificates, ufw, openssl]
write_files:
  - path: /usr/local/bin/install-supabase   # instalador 1-click de Supabase
    permissions: '0755'
    content: | ...  (clona supabase/docker, genera JWT/claves, docker compose up)
runcmd:
  - systemctl enable --now qemu-guest-agent
  - curl -fsSL https://get.docker.com | sh
  - usermod -aG docker devops
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -   # Node 22
  - apt-get install -y nodejs
  - npm install -g pm2
  - su - devops -c 'curl -fsSL .../nvm/install.sh | bash'       # NVM
  - ufw allow OpenSSH
  - ufw --force enable
```

### 2b. Construir el template
Ejecuta en el shell del nodo (ajusta el `bridge` según tu Opción A/B):

```bash
VMID=9000; STORAGE=local-lvm; NAME=ubuntu2404-devstack
IMG=/var/lib/vz/template/iso/noble-server-cloudimg-amd64.img

# Descargar imagen cloud oficial de Ubuntu 24.04
[ -f "$IMG" ] || wget -O "$IMG" https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img

qm destroy $VMID --purge 2>/dev/null || true
qm create $VMID --name $NAME --memory 2048 --cores 2 --cpu host \
  --net0 virtio,bridge=vmbr7 \        # <-- vmbr7 (bridge interno) en Opción A; o bridge=vmbr0,tag=6
  --scsihw virtio-scsi-pci --ostype l26 --agent enabled=1 --serial0 socket --vga serial0
qm importdisk $VMID "$IMG" $STORAGE
qm set $VMID --scsi0 $STORAGE:vm-$VMID-disk-0,discard=on
qm set $VMID --ide2 $STORAGE:cloudinit
qm set $VMID --boot order=scsi0
qm set $VMID --ciuser devops --ciupgrade 1
qm set $VMID --ipconfig0 ip=dhcp
qm set $VMID --nameserver 192.168.7.1      # <-- el gateway del nodo (192.168.6.1 en pve)
qm set $VMID --cicustom vendor=local:snippets/vps-devstack.yaml
qm disk resize $VMID scsi0 20G
qm template $VMID
```

> Scripts listos: [templates/build-template.sh](templates/build-template.sh) (versión
> pve, `bridge=vmbr0,tag=6`) y
> [templates/build-template-pvececyte.sh](templates/build-template-pvececyte.sh)
> (versión bridge interno `vmbr7`). Copia el que corresponda a tu Opción A/B.

> ⚠️ Nota: `qm importdisk` puede tardar varios minutos en almacenamiento lento; el
> primer intento puede parecer terminar sin crear la VM. Verifica con
> `test -f /etc/pve/qemu-server/9000.conf`.

---

## 3. Montar el gateway de VPS en el nodo (Opción A)

Este es el corazón: crea el bridge/subred, DHCP, NAT hacia internet y aislamiento.
Copia [scripts/pvececyte-vps-gateway.sh](scripts/pvececyte-vps-gateway.sh) al nodo
como `/root/vps-gateway.sh` y **ajusta las 4 variables de cabecera** para el nuevo
nodo (subred única, distinta de 6 y 7):

```bash
GWIP=192.168.8.1          # gateway = .1 de tu nueva subred
NET=192.168.8.0/24        # subred única para este nodo
UPLINK=vmbr0              # el bridge/NIC con salida a internet (default route)
BR=vmbr8                 # bridge INTERNO nuevo para los VPS (sin puertos físicos)
```

Lo que hace el script (idempotente):
```bash
# 1. Crea el bridge interno y le pone la IP de gateway
ip link add name $BR type bridge; ip link set $BR up
ip addr replace $GWIP/24 dev $BR

# 2. Habilita forwarding
sysctl -qw net.ipv4.ip_forward=1

# 3. NAT + aislamiento con nftables (tabla propia por nodo)
nft -f - <<NFT
table inet vpsgw8 {
  chain prerouting  { type nat hook prerouting priority dstnat; policy accept; }   # para port-forwards
  chain postrouting { type nat hook postrouting priority srcnat; policy accept;
    ip saddr $NET oif "$UPLINK" masquerade }                                        # salida a internet
  chain forward { type filter hook forward priority filter; policy accept;
    ct state established,related accept
    ip saddr $NET ip daddr 192.168.0.0/22 drop      # bloquear LAN escolar
    ip saddr $NET ip daddr 192.168.6.0/24 drop      # bloquear VPS de otros nodos
    ip saddr $NET ip daddr 192.168.7.0/24 drop
    ip saddr $NET accept }                          # permitir internet
}
NFT

# 4. DHCP + DNS con dnsmasq en el bridge
apt-get install -y dnsmasq   # si falta
cat > /etc/dnsmasq.d/vps.conf <<CONF
interface=$BR
bind-interfaces
except-interface=lo
dhcp-range=192.168.8.100,192.168.8.199,255.255.255.0,12h
dhcp-option=3,$GWIP
dhcp-option=6,$GWIP,8.8.8.8
CONF
systemctl enable dnsmasq; systemctl restart dnsmasq
```

### Hacerlo persistente (sobrevive reinicios)
```bash
printf 'net.ipv4.ip_forward=1\n' > /etc/sysctl.d/99-vps-forward.conf
cat > /etc/systemd/system/vps-gw.service <<'UNIT'
[Unit]
Description=VPS gateway
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/root/vps-gateway.sh
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload; systemctl enable vps-gw.service
```

> ⚠️ En Proxmox sin suscripción, `apt-get update` falla con 401 del repo
> `enterprise.proxmox.com`. No importa para dnsmasq (viene de repos Debian):
> instálalo directo con `apt-get install -y dnsmasq`.

---

## 4. Colocar el script de aprovisionamiento

Copia [scripts/provision-vps.sh](scripts/provision-vps.sh) a `/root/provision-vps.sh`
en el nodo (`chmod +x`). Ya es genérico (detecta subredes 6/7; agrega la tuya al
regex `192\.168\.[678]\.` si usas otra). Con él creas VPS en un comando:
```bash
./provision-vps.sh <VMID> <nombre> [cores] [ram_MB] [disco_G] [password]
```

Ver **MANUAL-1** para el flujo completo de creación y entrega.

---

## 5. Ajustes en pfSense (router central)

pfSense es la salida a internet de los nodos. Con la **Opción A**, el tráfico de los
VPS llega a pfSense ya "nateado" como si viniera del nodo (IP del nodo en la LAN),
así que **pfSense no necesita saber de las subredes de VPS** para la salida. Solo
tocas pfSense para dos cosas:

### 5a. (Opcional) Aislar/limitar los nodos
Si quieres reglas específicas para el tráfico de los nodos, actúan sobre la IP del
nodo (192.168.1.x), no sobre los VPS.

### 5b. Port-forwards de entrada (dar acceso público a un VPS)
Flujo: `WAN → pfSense → nodo → DNAT en el nodo → VPS`. Dos pasos:

**En el nodo** — agrega la regla al array `PORTFWD` del script del gateway y re-corre:
```bash
# en /root/vps-gateway.sh:
PORTFWD=( "2203:192.168.8.NNN:22" )   # <puertoWAN>:<IP_VPS>:<puerto_interno>
bash /root/vps-gateway.sh
# fija la IP del VPS por reserva DHCP:
echo 'dhcp-host=<MAC_VPS>,192.168.8.NNN' >> /etc/dnsmasq.d/vps-static.conf
systemctl restart dnsmasq
```

**En pfSense** (Firewall → NAT → Port Forward → Add):
- Interface **WAN** · Protocol **TCP**
- Destination **WAN address** · Dest. port **2203**
- Redirect target IP = **IP del nodo** (ej. 192.168.1.4) · Redirect target port **2203**
- Marca "Add associated filter rule" → **Save** + **Apply**

Convención de puertos sugerida: SSH=`2000+id`, HTTP=`8000+id`, etc.

### 5c. (Solo Opción B) VLAN dedicada de VPS en pfSense
Si eliges gateway central en pfSense:
1. Interfaces → VLANs → Add: VLAN tag N sobre la NIC LAN.
2. Interfaces → Assignments: asigna la VLAN como interfaz nueva, habilítala con
   IP estática `192.168.N.1/24`.
3. Services → DHCP Server → (interfaz): rango `.100-.199`.
4. Firewall → Aliases: crea `Redes_Internas` con las redes a proteger.
5. Firewall → Rules → (interfaz VPS), en orden:
   - **Block** de `192.168.N.0/24` a `Redes_Internas`.
   - **Pass** de `192.168.N.0/24` a `any` (salida a internet).
6. Endurecimiento anti-DDoS en reglas WAN expuestas (pestaña Advanced de la regla):
   `Max src conn rate` ~15/5s, `Max states per host` ~500, TCP `State type = synproxy`.

---

## 6. Ajustes en los switches (SOLO si usas Opción B con VLAN tagged)

Con la **Opción A no tocas los switches** (el tráfico VPS no sale etiquetado). Esta
sección aplica solo si transportas una VLAN de VPS entre switches y hasta pfSense.

Switches del sitio: TP-Link **TL-SG3428** (`192.168.1.101-104`) y **TL-SG2218**
(`192.168.1.105`). Acceso: **Telnet** (SSH usa clave `ssh-dss` que OpenSSH moderno
rechaza), usuario `admin` / pass del switch, luego `enable`.

```bash
# desde un host en la LAN:
telnet 192.168.1.101      # user + pass + enable

# Ver estado de una VLAN en un puerto:
show interface switchport gigabitEthernet 1/0/17

# Poner una VLAN tagged en el puerto que va al nodo y en los trunks entre switches:
configure
vlan 6
 name VPS
 exit
interface gigabitEthernet 1/0/24
 switchport general allowed vlan 6 tagged
 switchport general allowed vlan 6 remove untagged   # importante: quitar untagged
 exit
end
copy running-config startup-config     # <-- GUARDAR (o se pierde al reiniciar; error #1)
```

> ⚠️ El **GUI web** del TL-SG3428 solo muestra "Untagged Ports" a primera vista; la
> sección "Tagged Ports" está más abajo (scroll). El GUI es inestable con
> automatización — la **CLI por telnet es más confiable**.
> Para rastrear por dónde pasa un dispositivo entre switches:
> `show mac address-table address <MAC>` (te dice puerto y VLAN aprendida).

---

## 7. Verificación end-to-end (hazla siempre tras replicar)

Desde el shell del nodo, con un VPS de prueba clonado y arrancado:
```bash
VMID=203
# 1) ¿tomó IP por DHCP?
grep <nombre> /var/lib/misc/dnsmasq.leases          # o: qm guest cmd $VMID network-get-interfaces
# 2) ¿el agente subió? (implica que cloud-init corrió con internet)
qm agent $VMID ping && echo AGENT_OK
# 3) ¿internet? (0 = OK)
qm guest exec $VMID -- ping -c2 8.8.8.8 | grep exitcode
# 4) ¿aislado de la LAN escolar? (exitcode != 0 = BLOQUEADO = correcto)
qm guest exec $VMID -- ping -c1 -W2 192.168.1.1 | grep exitcode
# 5) ¿SSH por contraseña?
sshpass -p '<pass>' ssh -o StrictHostKeyChecking=no devops@<IP_VPS> 'echo OK $(hostname)'
# 6) ¿el port-forward? (desde otro host)
ssh -p <puertoWAN> devops@207.248.113.8
```

---

## 8. Componentes opcionales del sitio

- **Panel de facturación (FOSSBilling)**: LXC Debian 12 con nginx+PHP+MariaDB.
  Script: [scripts/setup-fossbilling.sh](scripts/setup-fossbilling.sh). Se instaló en
  un LXC (VMID 200) accesible en `http://<ip-lxc>/`. Automatiza clientes, órdenes,
  suspensión por impago; con el módulo Proxmox (API token) puede crear VPS solo.
- **API token de Proxmox para el panel** (requiere elevar RBAC — hazlo tú):
  ```bash
  pveum user add fossbilling@pve
  pveum aclmod / -user fossbilling@pve -role PVEVMAdmin
  pveum user token add fossbilling@pve panel --privsep 0
  ```
- **Backups**: `vzdump` programado (Datacenter → Backup) hacia NFS/SMB o un Proxmox
  Backup Server.

---

## 9. Checklist de replicación en un servidor nuevo

- [ ] Proxmox instalado, con internet y storage `local`+`local-lvm`.
- [ ] `pvesm set local --content ...,snippets`.
- [ ] Verificar NIC: `ethtool -k <if> | grep rx-vlan-offload` → si `[fixed]`, usar bridge interno.
- [ ] Copiar `vps-devstack.yaml` a `/var/lib/vz/snippets/`.
- [ ] Construir template 9000 (bridge según Opción A/B).
- [ ] Copiar y ajustar `vps-gateway.sh` (subred única) + servicio systemd.
- [ ] Copiar `provision-vps.sh`.
- [ ] (Opción B) VLAN en pfSense + tagged en switches + guardar startup-config.
- [ ] Port-forwards en pfSense según necesidad.
- [ ] Clonar VPS de prueba y pasar la verificación del §7.
- [ ] Documentar subred/puertos del nuevo nodo en MANUAL-2.

---

## Archivos de referencia en C:\vpsserver
```
templates/vps-devstack.yaml              # snippet cloud-init (stack + ssh_pwauth)
templates/build-template.sh              # build template (pve, tag 6)
templates/build-template-pvececyte.sh    # build template (bridge interno vmbr7)
scripts/pve-vlan6-gateway.sh             # gateway pve (192.168.6.0/24)
scripts/pvececyte-vps-gateway.sh         # gateway pvececyte (192.168.7.0/24)  <- base para nodos nuevos
scripts/provision-vps.sh                 # crear un VPS en 1 comando
scripts/setup-fossbilling.sh             # panel de facturación
MANUAL-1-crear-VPS.md / MANUAL-2-acceso-VPS.md / RESUELTO-arquitectura-final.md
```
