# Plataforma de Venta de VPS — Guía de Arquitectura y Operación

Infraestructura tipo "mini-AWS EC2 / Hostinger" montada sobre tu hardware real.
Documento vivo: refleja lo **realmente implementado** el 2026-07-04.

**Documentos:**
- 📘 [MANUAL-1-crear-VPS.md](MANUAL-1-crear-VPS.md) — cómo generar un servidor nuevo.
- 📗 [MANUAL-2-acceso-VPS.md](MANUAL-2-acceso-VPS.md) — acceso a los VPS creados (credenciales, IPs, SSH, ejemplos).
- 📙 [MANUAL-3-replicar-infraestructura.md](MANUAL-3-replicar-infraestructura.md) — montar todo (template, gateway, pfSense, switches) en un servidor nuevo, con lecciones aprendidas.
- 🔧 [RESUELTO-arquitectura-final.md](RESUELTO-arquitectura-final.md) — arquitectura de red final y el porqué (bug tg3, gateway por nodo).
- Este README — arquitectura general, decisiones y operación.

---

## 1. Inventario de hardware y roles

| Equipo | IP | Rol |
|---|---|---|
| **Servidor 1 "pve"** | 192.168.1.4:8006 | Proxmox VE 9.1 — **Nodo de VPS de clientes** (Xeon E3-1225v3, 4 cores, 21 GB RAM, 840 GB LVM-thin) |
| **Servidor 2 "pvececyte"** | 192.168.1.254:8006 | Proxmox VE 8.4 — Infraestructura: corre **pfSense (VM 100)** y ubuntusvr (VM 101). 12.5 GB RAM |
| **Servidor 3** | 192.168.0.17 | Windows Server 2016 — gestión/respaldo (RDP) |
| **pfSense 2.8.1** | 192.168.1.1 (GUI :8443) | Router/Firewall virtualizado. **WAN pública: 207.248.113.8/24** (enlace dedicado) |

### Topología de red

```
Internet (207.248.113.8 pública)
        │
   [pfSense VM en pvececyte]
   WAN vtnet1 │ LAN vtnet0 (192.168.1.1/22)
        │
   Switch físico ── VLANs 802.1Q sobre el cable LAN
        ├─ LAN nativa   192.168.0.0/22  (admin, servidores, Windows)
        ├─ VLAN 4       192.168.4.0/24  (Alumnos WiFi — ya existía)
        ├─ VLAN 5       192.168.5.0/24  (DMZ — ya existía)
        └─ VLAN 6       192.168.6.0/24  (★ VPS de clientes — NUEVA)
                │
        [pve 192.168.1.4] vmbr0 (VLAN-aware)
                └─ VMs de clientes con tag=6
```

---

## 2. Decisiones de arquitectura (el porqué)

1. **Hipervisor: Proxmox VE** (ya instalado). KVM + LXC, API REST completa,
   clonación de templates, cloud-init nativo. Es el estándar de facto para
   empezar barato y escalar (soporta clústeres, migración en vivo, Ceph).
   *Alternativas descartadas:* OpenStack (demasiado pesado para 2 nodos),
   VMware (licencias), Virtualizor (licencia de pago).

2. **Nodo de clientes = pve (192.168.1.4)**: es el que más RAM libre y disco
   tiene (570 GB libres en LVM-thin). pvececyte queda como nodo de
   infraestructura (pfSense) — no se mezclan clientes con el router.

3. **Aislamiento de clientes: VLAN 6** terminada en pfSense.
   Los VPS **no pueden tocar** la LAN interna (regla con alias
   `Redes_Internas`: 192.168.0.0/22, 192.168.4.0/24, 192.168.5.0/24)
   pero sí salir a internet con NAT.

4. **Panel de control: FOSSBilling** (open source, gratis) en un LXC.
   Gestiona clientes, órdenes, facturas y suspensión por impago; se integra
   con Proxmox vía módulo/API token. *Ruta de crecimiento:* WHMCS +
   Virtualizor cuando el volumen justifique licencias (~25-40 USD/mes).

5. **"Supabase propio"**: cada VPS trae `install-supabase` (1 click) que
   despliega la suite oficial self-hosted con Docker Compose y genera
   secretos únicos (JWT, ANON_KEY, SERVICE_ROLE_KEY) por cliente.

---

## 3. Lo implementado paso a paso

### 3.1 pfSense (hecho ✅)
- **Interfaces → VLANs**: VLAN tag 6 sobre vtnet0, descripción `VPS-Clientes`.
- **Interface Assignments**: OPT1 = vtnet0.6 → renombrada **VPS**,
  IPv4 estática `192.168.6.1/24`.
- **Services → DHCP Server → VPS**: rango `192.168.6.100 – 192.168.6.199`.
- **Firewall → Aliases**: `Redes_Internas` = {192.168.0.0/22, 192.168.4.0/24, 192.168.5.0/24}.
- **Firewall → Rules → VPS** (orden importa, first-match):
  1. **Block** IPv4 * | src `192.168.6.0/24` → dst `Redes_Internas`
  2. **Pass** IPv4 * | src `192.168.6.0/24` → dst `any` (salida a internet)
- NAT saliente: automático (los VPS salen por 207.248.113.8).

### 3.2 Proxmox nodo pve (hecho ✅)
- `vmbr0` ahora es **VLAN-aware** (puente troncal; las VMs eligen su VLAN
  con `tag=`). Aplicado vía API sin cortar conectividad.
- Storage `local` con contenido `snippets` habilitado.
- Snippet cloud-init: `/var/lib/vz/snippets/vps-devstack.yaml`
  (copia local en [templates/vps-devstack.yaml](templates/vps-devstack.yaml)).

### 3.3 Template de VPS (VMID 9000)
Script: [templates/build-template.sh](templates/build-template.sh)
(en el nodo: `/root/build-template.sh`).

- Base: **Ubuntu 24.04 cloud image** oficial.
- VM 9000 `ubuntu2404-devstack`: 2 vCPU, 2 GB RAM, disco 20 GB (ampliable
  por clon), NIC virtio en `vmbr0` **tag=6**, qemu-guest-agent, consola serial.
- Cloud-init: usuario `devops`, DHCP, DNS 192.168.6.1,
  `cicustom vendor=local:snippets/vps-devstack.yaml`.
- El snippet instala en el primer arranque:
  - **Node.js 22 LTS** (NodeSource) + **PM2** global + **NVM** para `devops`
  - **Python 3** + pip + venv + build-essential
  - **Docker CE** (get.docker.com)
  - **`install-supabase`** (1-click Supabase self-hosted, ver §5)
  - UFW con SSH permitido

### 3.4 Aprovisionamiento de un VPS de cliente
Script en el nodo pve: [scripts/provision-vps.sh](scripts/provision-vps.sh)

```bash
# VMID nombre cores ram_MB disco_G [password]
./provision-vps.sh 201 cliente-acme 2 4096 40
```

Clona el template, ajusta recursos, fija password de `devops`, arranca y
espera la IP (agent). Otras operaciones día-2:

```bash
qm shutdown 201        # suspensión por impago (o: qm stop)
qm set 201 --memory 8192 --cores 4   # upgrade de plan
qm disk resize 201 scsi0 +20G        # más disco (solo crecer)
qm destroy 201 --purge               # baja definitiva
```

### 3.5 Panel FOSSBilling (LXC 200 en pve) — ✅ instalado
Script: [scripts/setup-fossbilling.sh](scripts/setup-fossbilling.sh)

- LXC Debian 12 (`panel`), VMID **200**, 2 GB RAM, 10 GB disco, DHCP en LAN
  de gestión → obtuvo **192.168.0.11**.
- nginx + PHP-FPM + MariaDB + FOSSBilling (release desde GitHub) instalados y
  activos. `http://192.168.0.11/` responde **307 → /install** (asistente web).
- **Pendiente tuyo**: abrir `http://192.168.0.11/` y completar el asistente
  (datos DB en `/root/fossbilling-db.txt` dentro del LXC:
  base `fossbilling`, usuario `fossbilling`).
- Luego activar el módulo **Proxmox** (Extensions → marketplace) con un API
  token de Proxmox. Créalo tú en el nodo (requiere elevar permisos RBAC, por
  eso no lo generé automáticamente):

```bash
# en el nodo pve:
pveum user add fossbilling@pve --comment "Panel de facturacion"
pveum aclmod / -user fossbilling@pve -role PVEVMAdmin
pveum user token add fossbilling@pve panel --privsep 0
# guarda el token que imprime; se configura en el módulo Proxmox del panel
```

### 3.6 Acceso público a los VPS (NAT con 1 IP)
Con una sola IP pública (207.248.113.8) los clientes reciben **puertos
mapeados** (Firewall → NAT → Port Forward en pfSense):

| Cliente | Puerto WAN | Destino |
|---|---|---|
| VPS .100 (prueba) | TCP 2100 → 22 | SSH |
| VPS .100 (prueba) | TCP 8100 → 8000 | Supabase Studio/API |

Convención sugerida: SSH = `2000 + último octeto`, HTTP = `8000 + último octeto`.
Para web de producción de clientes, mejor un **reverse proxy** (HAProxy pkg
en pfSense o nginx en la DMZ) con subdominios (`cliente.tudominio.com`) —
así una sola IP sirve N webs con TLS.

> 📌 Si tu carrier te puede rutear más IPs del bloque /24, cada VPS puede
> tener IP pública propia vía **IP Alias + NAT 1:1** en pfSense.

### 3.7 Anti-DDoS básico en pfSense
En cada regla WAN que exponga un servicio (editar regla → Display Advanced):
- **Max. src. conn. rate**: p.ej. 15/5 (15 conexiones por 5 s por IP)
- **Max. states per host**: p.ej. 500
- TCP: **State type = synproxy** (pfSense responde el handshake y filtra SYN floods)

Complementos recomendados: caps de ancho de banda por cliente con
**Limiters** (Firewall → Traffic Shaper → Limiters, p.ej. 50 Mbit/VPS)
aplicados en las reglas de la interfaz VPS. Para ataques volumétricos
reales el único remedio efectivo es un tunel/CDN externo (Cloudflare, Path).

---

## 4. Runbook comercial (flujo de venta)

1. Cliente compra plan en FOSSBilling → orden pagada.
2. (Automático con módulo Proxmox, o manual) `provision-vps.sh <vmid> <nombre> <cores> <ram> <disco>`.
3. Alta de port-forwards en pfSense según convención de puertos.
4. Entregar al cliente: IP/puerto SSH, usuario `devops`, password, y la nota:
   *"para tu backend estilo Supabase ejecuta `sudo install-supabase`"*.
5. Impago → suspender: `qm shutdown <vmid>`; reactivación: `qm start <vmid>`.

## 5. Supabase self-hosted por cliente

Dentro de cualquier VPS: `sudo install-supabase`
- Clona `supabase/docker` oficial, genera POSTGRES_PASSWORD, JWT_SECRET,
  ANON_KEY/SERVICE_ROLE_KEY (JWT HS256 firmados localmente con Node) y
  DASHBOARD_PASSWORD únicos.
- Levanta todo con `docker compose up -d`.
- Studio + API: puerto **8000** del VPS (mapear en pfSense).
- Alternativa ligera para planes chicos: solo PostgreSQL + PostgREST
  (~500 MB RAM vs ~2-3 GB de la suite completa).

**Planes sugeridos** (nodo actual aguanta ~6-8 VPS chicos con overcommit):
| Plan | vCPU | RAM | Disco | Nota |
|---|---|---|---|---|
| Dev | 1 | 2 GB | 20 GB | Node/Python, sin Supabase |
| Startup | 2 | 4 GB | 40 GB | corre Supabase completo |
| Pro | 4 | 8 GB | 80 GB | Supabase + apps |

## 6. Estado real — FUNCIONANDO end-to-end ✅

> ⚠️ **Cambio de arquitectura importante**: el gateway/DHCP/NAT de la VLAN 6 NO
> quedó en pfSense sino en **pve**. Motivo: la NIC de pvececyte es Broadcom `tg3`
> con `rx-vlan-offload [fixed]` que, con el bridge vlan-aware, clasifica mal las
> VLANs tagged (la VLAN 6 caía en VLAN 1) y pfSense nunca veía el DHCP. Los 5
> switches estaban correctos. Detalle completo en
> [RESUELTO-arquitectura-final.md](RESUELTO-arquitectura-final.md).

**Verificado hoy con el VPS de prueba 202 (`vps-demo`):**
- **DHCP**: el VPS obtuvo `192.168.6.152` del gateway en **pve** (dnsmasq). ✅
- **Internet**: `ping 8.8.8.8` desde el VPS → OK (NAT pve→pfSense→WAN). ✅
- **Aislamiento**: el VPS NO alcanza la LAN escolar (192.168.1.1) ni el Windows
  Server (192.168.0.17) — bloqueado por nftables en pve. ✅
- **Stack (cloud-init)**: Node.js, Python 3.12, Docker instalados. ✅
- Gateway persistente: `pve-vlan6-gw.service` + dnsmasq + sysctl.
  Script: [scripts/pve-vlan6-gateway.sh](scripts/pve-vlan6-gateway.sh).
- **template 9000** `ubuntu2404-devstack`, panel **FOSSBilling** en `http://192.168.0.11/`.
- Los 5 switches (.101-.105) con VLAN 6 tagged correcto (verificado por CLI).
- Interfaz VPS de pfSense **deshabilitada** (evita conflicto de IP .1).

**Pendiente (menor):**
- [ ] Inbound port-forward a VPS: pfSense WAN → pve (192.168.1.4) → DNAT en pve →
      VPS (pfSense no alcanza la VLAN 6). Ejemplo en RESUELTO-arquitectura-final.md.
      La regla vieja pfSense `WAN:2100→192.168.6.100` quedó obsoleta.
- [ ] Completar instalador web de FOSSBilling y módulo Proxmox (token RBAC).
- [ ] Backups: `vzdump` programado (Datacenter → Backup) hacia el
      Windows Server (compartir carpeta SMB/NFS) o un Proxmox Backup Server.
- [ ] TLS del panel (certbot) y dominio propio.
- [ ] Monitoreo: instalar `pve-monitor` o Zabbix/Netdata en el LXC.
- [ ] Evaluar más RAM para pve (los 2 nodos usan DDR3 ECC — barata).
- [ ] Si el switch físico gestiona VLANs, confirmar que los puertos
      pve↔switch↔pvececyte estén en modo trunk con 4,5,6 permitidas.
