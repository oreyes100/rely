# RESUELTO: arquitectura final de red de los VPS (VLAN 6)

> Reemplaza a `PENDIENTE-switch-trunk.md`. El problema NO era el switch.

## El diagnóstico (la odisea, resumida)
Los VPS (en pve, VLAN 6) no obtenían IP. Traza definitiva:
1. pve **emite** tagged-6 correcto (12 tramas medidas en su uplink).
2. Los **5 switches** (TL-SG3428 .101-.104, TL-SG2218 .105) tienen VLAN 6
   **tagged** en todos los puertos/trunks — verificado por CLI (telnet). Correctos.
3. La NIC **eno1 de pvececyte es Broadcom `tg3` con `rx-vlan-offload: on [fixed]`**
   (no se puede desactivar). Quita el tag 802.1Q por hardware; el bridge
   **vlan-aware `vmbr0` clasifica la trama en su PVID (VLAN 1) en vez de la VLAN 6.**
   Confirmado con `bridge fdb show`: la MAC del VPS aparecía como
   `dev eno1 vlan 1 master vmbr0`. Por eso pfSense (vtnet0.6) nunca veía el DHCP.
   Ese mismo offload engañaba a `tcpdump` (mostraba las tramas sin tag).

**Moraleja:** tg3/Broadcom + bridge vlan-aware = mala clasificación de VLANs
tagged. Diagnosticar con `bridge fdb show | grep <mac>`, NO con tcpdump.

## La solución implementada: gateway de la VLAN 6 en pve
Los VPS viven en pve; su tráfico VLAN 6 es **local al bridge vmbr0** y nunca pasa
por la NIC tg3 defectuosa. Así que pve hace de router de la VLAN 6:

- Interfaz `vmbr0v6` = **192.168.6.1/24** (gateway).
- **DHCP + DNS**: dnsmasq, rango `192.168.6.100-199`.
- **NAT**: nftables masquerade `192.168.6.0/24 → vmbr0 → pfSense (192.168.1.1) → internet`.
- **Aislamiento**: nftables dropea VPS → `192.168.0.0/22`, `192.168.2/4/5.0/24`
  (LAN escolar, Alumnos, DMZ, red vmbr1); permite VPS → internet.
- **Persistencia**: `pve-vlan6-gw.service` (systemd, corre el script en cada boot)
  + dnsmasq habilitado + `/etc/sysctl.d/99-vps-forward.conf` (ip_forward).
- La interfaz **VPS de pfSense se deshabilitó** para no chocar por la IP .1.

Script idempotente: [scripts/pve-vlan6-gateway.sh](scripts/pve-vlan6-gateway.sh)
(en el nodo: `/root/pve-vlan6-gateway.sh`).

## Verificación end-to-end (VPS 202 "vps-demo")
- DHCP: obtuvo `192.168.6.152` del dnsmasq de pve. ✅
- Internet: `ping 8.8.8.8` desde el VPS → exit 0. ✅
- Aislamiento: `ping 192.168.1.1` y `192.168.0.17` desde el VPS → bloqueados. ✅
- Stack (cloud-init): **Node.js, Python 3.12, Docker 29.6** instalados. ✅
  (PM2, Node 22 de NodeSource y `install-supabase` terminan en la fase `runcmd`.)

## Consecuencias para el diseño
- **DHCP/gateway/NAT/aislamiento de los VPS = pve** (no pfSense). pfSense sigue
  siendo el firewall/gateway del resto de la escuela y la salida a internet (pve
  enruta hacia él).
- **Inbound (port-forward a un VPS)**: como pfSense no alcanza las subredes de VPS,
  el flujo es `WAN → pfSense → nodo → DNAT en el nodo → VPS`. **Ya implementado y
  probado** el lado del nodo (ejemplo SSH al VPS 202):
  - **Lado nodo (pve)**: el script del gateway ahora tiene un array `PORTFWD` que
    crea las reglas DNAT en la cadena `prerouting` de nftables. Ejemplo activo:
    `"2202:192.168.6.152:22"` → conexión a `pve:2202` llega al SSH del VPS.
    ✅ **Verificado**: `bash -c 'exec 3<>/dev/tcp/192.168.1.4/2202; head -1 <&3'`
    devolvió `SSH-2.0-OpenSSH_9.6p1`. Es persistente (systemd re-aplica el script).
    Para más forwards, agrega entradas al array `PORTFWD` y re-corre el script.
    El VPS 202 tiene IP fija por reserva DHCP (`/etc/dnsmasq.d/vps-static.conf`).
  - **Lado pfSense (falta — la sesión web expiró y no tengo credenciales)**: agrega
    un port-forward. Firewall → NAT → Port Forward → Add:
    - Interface: **WAN**, Protocol: **TCP**
    - Destination: **WAN address**, Dest port: **2202**
    - Redirect target IP: **192.168.1.4** (pve), Redirect target port: **2202**
    - Deja marcado "Add associated filter rule". Save + Apply.
    Para un VPS en pvececyte, el target IP sería **192.168.1.254** y agregas el
    PORTFWD equivalente en su script.
    (La regla NAT vieja `WAN:2100→192.168.6.100` quedó obsoleta; bórrala.)

## Segundo nodo de hosting: pvececyte (192.168.1.254)
pvececyte también hostea VPS, con el **mismo patrón local** (evita el bug tg3):
- Bridge **interno `vmbr7`** (sin puertos físicos) → VPS locales, subred
  **192.168.7.0/24**, gateway `192.168.7.1` en pvececyte.
- dnsmasq DHCP `192.168.7.100-199`, NAT a internet vía `vmbr0`→pfSense,
  aislamiento nftables (dropea 192.168.0.0/22, .2/.4/.5/.6.0/24 → no choca con los
  VPS de pve ni la red escolar).
- Persistente: `pvececyte-vps-gw.service` + dnsmasq + sysctl.
  Script: [scripts/pvececyte-vps-gateway.sh](scripts/pvececyte-vps-gateway.sh).
- Template propio (VMID 9000) con `net0=virtio,bridge=vmbr7` (sin tag):
  [templates/build-template-pvececyte.sh](templates/build-template-pvececyte.sh).
- Reserva ~8 GB de RAM para VPS (el resto para pfSense/Proxmox).

**Cada nodo es autónomo**: subred, DHCP, NAT y aislamiento propios. Los VPS de un
nodo no ven a los del otro. Repartes clientes entre pve (192.168.6.x) y pvececyte
(192.168.7.x) según capacidad.

| Nodo | RAM VPS | Subred VPS | Gateway | Bridge |
|---|---|---|---|---|
| pve (.4) | ~17 GB libre | 192.168.6.0/24 | 192.168.6.1 | vmbr0 (tag 6, local) |
| pvececyte (.254) | ~8 GB | 192.168.7.0/24 | 192.168.7.1 | vmbr7 (interno) |

## Para vender un VPS (flujo actualizado)
1. `provision-vps.sh <vmid> <nombre> <cores> <ram> <disco>` clona el template 9000
   en pve. El VPS arranca, toma IP `192.168.6.x` del gateway y provisiona el stack.
2. Alta de inbound (si el cliente necesita puertos públicos): regla en pfSense →
   pve, y DNAT en pve → IP del VPS (ver arriba).
3. Entregar IP/puerto SSH, usuario `devops` + password. `sudo install-supabase`
   para su backend estilo Supabase.
