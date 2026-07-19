# MANUAL 3 — Replicar toda la infraestructura en otros servidores

Guía completa y autónoma para reproducir la plataforma de VPS (templates, red,
gateway, pfSense, switches, panel) en un servidor Proxmox nuevo. Refleja lo que
**realmente se implementó y verificó** en pve (192.168.1.4) y pvececyte
(192.168.1.254), incluyendo las lecciones aprendidas.

> Archivos fuente referenciados: carpeta `scripts/` y `templates/` de este repo
> (`C:\vpsserver`). Todos los scripts son idempotentes (se pueden re-correr).

---

## Parte 0 — Arquitectura y la decisión clave

```
Internet (IP pública en pfSense WAN)
        │
   [pfSense]  ← firewall/salida de toda la red (NO gestiona la red de los VPS)
        │ LAN 192.168.0.0/22
        │
   ┌────┴─────────────────────────────────┐
   │ Nodo Proxmox N (cada nodo AUTÓNOMO)  │
   │  ┌─ gateway local 192.168.X.1        │
   │  │   • dnsmasq (DHCP .100-.199)      │
   │  │   • NAT (nftables masquerade)     │
   │  │   • aislamiento (drop → LANs)     │
   │  │   • DNAT (port-forwards entrantes)│
   │  └─ VPS clientes 192.168.X.100-199   │
   └──────────────────────────────────────┘
```

**Decisión clave (aprendida a golpes):** cada nodo Proxmox lleva su **propio
gateway local** para sus VPS (IP .1, DHCP, NAT, firewall). NO se depende de que
pfSense sirva la subred de VPS por VLAN a través de los switches.

**Por qué:** las NICs Broadcom (driver `tg3`) tienen `rx-vlan-offload: on [fixed]`
(no se puede apagar). Con un bridge vlan-aware, el kernel clasifica las tramas
VLAN entrantes en el PVID (VLAN 1) en vez de su VLAN real → pfSense virtualizado
jamás recibe el tráfico etiquetado, aunque los switches estén perfectos. Con el
gateway local, el tráfico de los VPS nunca sale etiquetado por el cable y el
problema desaparece. Además cada nodo queda autocontenido: agregar un nodo nuevo
no requiere tocar switches ni pfSense (salvo los port-forwards de entrada).

**Asignación de subredes por nodo** (para no chocar):

| Nodo | Subred VPS | Gateway | Patrón de bridge |
|---|---|---|---|
| pve (192.168.1.4) | 192.168.6.0/24 | 192.168.6.1 | vmbr0 vlan-aware + tag 6 (tráfico local) |
| pvececyte (192.168.1.254) | 192.168.7.0/24 | 192.168.7.1 | **vmbr7 interno sin puertos físicos** |
| **nodo nuevo →** | **192.168.8.0/24** | 192.168.8.1 | **vmbr7 interno (recomendado)** |

> Para nodos nuevos usa SIEMPRE el patrón **bridge interno** (como pvececyte):
> funciona con cualquier NIC/switch, no toca la red física para nada. El patrón
> "tag local" de pve funciona igual pero es innecesariamente acoplado a la VLAN.

---

## Parte 1 — Preparar un nodo Proxmox nuevo

Prerrequisito: Proxmox VE 8.x o 9.x instalado, con acceso a internet y una IP en
la LAN (ej. 192.168.1.X en vmbr0).

### 1.1 Sanear repos APT (si no hay suscripción)
El repo enterprise da `401 Unauthorized` y rompe `apt-get update`:
```bash
# comentar los repos enterprise y habilitar no-subscription
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/pve-enterprise.list 2>/dev/null
sed -i 's/^deb/#deb/' /etc/apt/sources.list.d/ceph.list 2>/dev/null
echo "deb http://download.proxmox.com/debian/pve bookworm pve-no-subscription" \
  > /etc/apt/sources.list.d/pve-no-subscription.list
apt-get update
```

### 1.2 ⚠️ Verificar que el bridge apunta a la NIC REAL
Lección aprendida: en pve, `/etc/network/interfaces` decía `bridge-ports enp0s25`
pero la NIC real era `eno1` (renombrada tras un cambio de kernel/hardware). El
nodo funcionaba porque alguien colgó la NIC a mano… hasta el próximo reinicio,
que lo habría dejado SIN RED.
```bash
ls /sys/class/net/                      # ¿qué NICs existen de verdad?
grep bridge-ports /etc/network/interfaces
# si no coinciden:
cp /etc/network/interfaces /etc/network/interfaces.bak
sed -i 's/enpXsYY/eno1/g' /etc/network/interfaces   # usa el nombre real
# y elimina estrofas "iface" duplicadas que deje el sed
```

### 1.3 Crear el gateway local de VPS (patrón bridge interno)
Copia `scripts/pvececyte-vps-gateway.sh` al nodo como `/root/vps-gateway.sh` y
**edita las variables de la cabecera** para el nodo nuevo:

```bash
GWIP=192.168.8.1          # gateway del nodo nuevo (subred única por nodo)
NET=192.168.8.0/24
UPLINK=vmbr0              # bridge con salida a la LAN/pfSense
BR=vmbr7                  # bridge interno para VPS (se crea solo)
```

El script hace 5 cosas (idempotente):
1. Crea el bridge interno `vmbr7` (sin puertos físicos) con la IP .1.
2. Activa `ip_forward`.
3. Tabla nftables propia: **masquerade** (NAT de salida), **drop** hacia todas
   las redes internas (192.168.0.0/22, .2/.4/.5/.6/.7.0/24 — agrega las subredes
   VPS de los OTROS nodos para aislar clientes entre nodos), **accept** al resto
   (internet), y cadena **prerouting** con los DNAT del array `PORTFWD`.
4. Instala/configura **dnsmasq**: DHCP `.100-.199`, gateway y DNS = la IP .1.
5. Imprime resumen.

```bash
bash /root/vps-gateway.sh     # debe terminar en GW7_READY
```

### 1.4 Hacerlo persistente (systemd + sysctl)
```bash
printf 'net.ipv4.ip_forward=1\n' > /etc/sysctl.d/99-vps-forward.conf
cat > /etc/systemd/system/vps-gw.service <<'EOF'
[Unit]
Description=VPS gateway (nodo autonomo)
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
ExecStart=/root/vps-gateway.sh
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable v