# VPS 210 "vps-panel" — Síntesis del Edge Server Público

**Fecha:** 2026-08-29  
**Host:** pve (192.168.1.4)  
**VMID:** 210 (QEMU/KVM, cloud-init)

---

## 1. CÓMO LO DESCUBRÍ (Metodología CT 200 panel.md)

### Paso 1: Identificación en pve
```bash
ssh root@192.168.1.4 'qm list'
```
**Resultado:** VMID 210, name `vps-panel`, running, IP 192.168.1.34, 2 GB RAM, 20 GB disco.

### Paso 2: Configuración VM
```bash
ssh root@192.168.1.4 'qm config 210'
```
Reveló: IP estática 192.168.1.34/24, cloud-init user `admin`, qemu-guest-agent enabled, watchdog i6300esb, snippet `vps-resilience.yaml`, protection=1, startup order=1.

### Paso 3: Servicios internos (via guest-agent)
```bash
ssh root@192.168.1.4 'qm guest exec 210 -- systemctl list-units --type=service --state=running'
```
**Hallazgos clave:**
- `vps-panel.service` **systemd** (no PM2) — backend API corriendo en user `admin`
- `nginx` — **edge público** con SSL
- `mariadb`, `php8.3-fpm` — preparados para FossBilling
- `qemu-guest-agent` — activo

### Paso 4: Código y configuración backend
```bash
# Ver service definition
qm guest exec 210 -- cat /etc/systemd/system/vps-panel.service

# Ver entry point
qm guest exec 210 -- cat /opt/vps-panel/backend/src/server.js

# Ver nodos gestionados
qm guest exec 210 -- cat /opt/vps-panel/backend/config/nodes.json

# Ver variables de entorno
qm guest exec 210 -- cat /opt/vps-panel/backend/.env
```
Confirmó: **Edge + Backend unificado**, 4 nodos Proxmox, features avanzadas (portal, pagos, webhooks, Proxmox UI proxy).

### Paso 5: Edge Nginx
```bash
qm guest exec 210 -- cat /etc/nginx/sites-enabled/vps-panel
qm guest exec 210 -- ls -la /etc/nginx/sites-enabled/
qm guest exec 210 -- ls -la /etc/nginx/ssl/
```
Descubrí: **Edge completo** con vhosts para capuvps.duckdns.org, wildcard `*.capuvps.duckdns.org`, proxy a localhost:3001, Proxmox UI proxy (`/proxmox/*`), FossBilling en :8080, y **7 vhosts adicionales** proxy a backends internos.

### Paso 6: Datos persistentes y auditoría
```bash
qm guest exec 210 -- cat /opt/vps-panel/backend/data/credentials.json
qm guest exec 210 -- cat /opt/vps-panel/backend/data/clients.json
qm guest exec 210 -- cat /opt/vps-panel/backend/data/history.jsonl
```
Credenciales VMs (8), clientes portal (5), auditoría completa (20+ operaciones creates/destroys).

---

## 2. QUÉ CONTIENE (Resumen Técnico)

| Componente | Detalle |
|------------|---------|
| **Rol** | **Edge público** (pfSense NAT :80/:443) + **Backend API** unificado |
| **Tecnología** | Node.js 20 + Express + **systemd** (user `admin`) |
| **Puerto backend** | 3001 (bind 127.0.0.1) |
| **Autenticación** | JWT + sesiones (12h) + password panel + adminOnly |
| **Nodos gestionados** | 4 Proxmox (pve, pvececyte, pvelenovo, pvedell) |
| **Edge Nginx** | SSL Let's Encrypt, wildcard `*.capuvps.duckdns.org`, 7 vhosts proxy |
| **Features extra** | Portal apps (wildcard), pagos, invitaciones, deploys, webhooks, sysadmin, Proxmox UI proxy (WS upgrade) |
| **Datos** | credentials.json (8 VMs), clients.json (5), history.jsonl (20+ ops), uploads/ |
| **Certificados** | Let's Encrypt: capuvps.duckdns.org + wildcard-capuvps + wildcard-apps |

---

## 3. CÓMO CONECTARSE

### Desde Windows (host admin)
**Requisito:** Llave `id_ed25519` en `C:\Users\User\.ssh\` (funciona en pve 192.168.1.4).

#### Opción A: Comandos directos via pve (recomendado)
```powershell
# Ver logs panel
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'qm guest exec 210 -- journalctl -u vps-panel -f --lines 100'

# Ver estado
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'qm guest exec 210 -- systemctl status vps-panel'

# Ver config nodos
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'qm guest exec 210 -- cat /opt/vps-panel/backend/config/nodes.json'

# Ver credenciales VMs
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'qm guest exec 210 -- cat /opt/vps-panel/backend/data/credentials.json'

# Reiniciar panel
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'qm guest exec 210 -- systemctl restart vps-panel'

# Ver logs nginx
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'qm guest exec 210 -- journalctl -u nginx -f'
```

#### Opción B: Console serie (interactiva)
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'qm terminal 210'
```

### Credenciales internas
| Usuario | Método | Detalle |
|---------|--------|---------|
| **root** (guest) | `qm guest exec` via pve | `id_ed25519` (via pve) |
| **admin** (panel user) | `sudo -u admin` dentro guest | Owner `/opt/vps-panel` |
| **panel (web)** | HTTP Basic / Form | `XX*NnJ46mjD7w0J%!hw^` (`PANEL_PASSWORD`) |

---

## 4. ARCHIVOS CLAVE

| Ruta | Propósito |
|------|-----------|
| `/opt/vps-panel/backend/src/server.js` | Entry point API (systemd) |
| `/opt/vps-panel/backend/src/config.js` | Config central |
| `/opt/vps-panel/backend/config/nodes.json` | **4 nodos Proxmox** |
| `/opt/vps-panel/backend/.env` | Secrets + features (portal, pagos, SMTP, DuckDNS) |
| `/etc/systemd/system/vps-panel.service` | Service (user=admin, node src/server.js) |
| `/etc/nginx/sites-enabled/vps-panel` | **Edge config principal** |
| `/opt/vps-panel/backend/data/credentials.json` | Credenciales SSH VMs (encriptadas) |
| `/opt/vps-panel/backend/data/clients.json` | Clientes portal |
| `/opt/vps-panel/backend/data/history.jsonl` | Auditoría completa |
| `/opt/vps-panel/frontend/dist/` | Build React frontend |
| `/etc/nginx/ssl/` | Certificados LE (wildcard + dominios) |

---

## 5. DIFERENCIA CLAVE: VM 210 vs CT 200

| Aspecto | **VM 210 "vps-panel"** | **CT 200 "panel"** |
|---------|------------------------|-------------------|
| **Rol** | **Edge público** (pfSense NAT :80/:443) | **API backend interno** |
| **Proceso panel** | systemd service (user `admin`) | PM2 (user `root`) |
| **Nginx** | **Edge completo** (SSL, vhosts, proxy) | Sin vhosts activos |
| **IP pública** | 192.168.1.34 (pfSense NAT directo) | 192.168.1.33 (solo LAN) |
| **Acceso** | Directo desde Internet | Solo via bastión pve |
| **Features** | Portal, pagos, invites, Proxmox UI proxy, webhooks | API core (nodes, vms, creds, history) |
| **Frontend** | React build servido por nginx | No (solo API) |

---

## 6. ESTADO ACTUAL (2026-08-29)

- ✅ VM running, watchdog activo, reboot ordenado hoy
- ✅ vps-panel (systemd, user admin) online
- ✅ nginx edge con SSL LE + wildcard `*.capuvps.duckdns.org`
- ✅ 4 nodos Proxmox configurados (pve, pvececyte, pvelenovo, pvedell)
- ✅ 7 vhosts proxy a backends internos
- ✅ Auditoría history.jsonl (20+ ops), 5 clientes portal, 8 credenciales VMs

---

*Investigación via `qm guest exec` desde host pve (192.168.1.4) siguiendo metodología CT 200 panel.md.*