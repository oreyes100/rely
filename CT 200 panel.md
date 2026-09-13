# CT 200 "panel" — Síntesis del Contenedor LXC de Gestión de Infraestructura

**Fecha:** 2026-08-28  
**Host:** pve (192.168.1.4)  
**VMID:** 200 (LXC, unprivileged, nesting=1)

---

## 1. CÓMO LO DESCUBRÍ

### Paso 1: Búsqueda en pve
```bash
# Listar VMs y contenedores en pve
ssh root@192.168.1.4 'qm list; pct list'
```
**Resultado:** Apareció `CT 200` con nombre `panel`, status `running`, IP `192.168.1.33`.

### Paso 2: Inspección de configuración
```bash
ssh root@192.168.1.4 'pct config 200'
```
Reveló: Ubuntu, 2 vCPU, 2 GB RAM, 10 GB disco, IP estática 192.168.1.33/24 en vmbr0.

### Paso 3: Servicios activos dentro del contenedor
```bash
ssh root@192.168.1.4 'pct exec 200 -- systemctl list-units --type=service --state=running'
```
Descubrí: **nginx, mariadb, php8.3-fpm, pm2-root, postfix, ssh, cron**.

### Paso 4: Proceso principal (PM2)
```bash
ssh root@192.168.1.4 'pct exec 200 -- pm2 list'
```
**Hallazgo clave:** Proceso `vps-panel` (id 0) corriendo en `/opt/vps-panel/backend/src/server.js` puerto 3001.

### Paso 4: Código fuente y configuración
```bash
# Ver entry point
pct exec 200 -- cat /opt/vps-panel/backend/src/server.js

# Ver configuración de nodos
pct exec 200 -- cat /opt/vps-panel/backend/config/nodes.json

# Ver variables de entorno
pct exec 200 -- cat /opt/vps-panel/backend/.env
```
Esto confirmó: **API REST de gestión Proxmox/Hyper-V** con 4 nodos configurados.

### Paso 5: Base de datos
```bash
pct exec 200 -- mysql -u root -e "SHOW DATABASES"
pct exec 200 -- cat /root/fossbilling-db.txt
```
Bases: `fossbilling`, `dbpruebajorge`. Credenciales FOSSBilling en `/root/fossbilling-db.txt`.

---

## 2. QUÉ CONTIENE (Resumen Técnico)

| Componente | Detalle |
|------------|---------|
| **Rol** | API backend de orquestación Proxmox/Hyper-V |
| **Tecnología** | Node.js 20 + Express + PM2 (fork mode) |
| **Puerto** | 3001 (bind 127.0.0.1) |
| **Autenticación** | JWT + sesiones (12h) + password panel |
| **Nodos gestionados** | 4 (3 Proxmox + 1 Hyper-V) |
| **BD** | MariaDB: `fossbilling` (FOSSBilling pendiente), `dbpruebajorge` |
| **Web server** | nginx (sin vhosts activos) + php8.3-fpm (preparado para FOSSBilling) |
| **Proceso manager** | PM2 (vps-panel, id 0, online) |
| **Mail** | Postfix (local) |
| **Logs** | `/root/.pm2/logs/vps-panel-*.log` |

### Nodos en `nodes.json`
| Nombre | Tipo | Host | VMID Range | Subnet | Storage |
|--------|------|------|------------|--------|---------|
| pve | Proxmox | 192.168.1.4 | 210–299 | 192.168.6.x | local-lvm |
| pvececyte | Proxmox | 192.168.1.254 | 300–399 | 192.168.7.x | local-lvm |
| pvelenovo | Proxmox | 192.168.1.15 | 600–699 | 192.168.6.x | local-lvm |
| aulamedios | Hyper-V | 192.168.1.229 | 500–599 | 192.168.1.x | — |

---

## 3. CÓMO CONECTARSE

### Desde Windows (host administrador)
**Requisito:** Llave `id_ed25519` en `C:\Users\User\.ssh\` (funciona en pve 192.168.1.4).

#### Opción A: SSH a pve + pct enter (interactivo)
```powershell
# 1. Conectar a pve
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4

# 2. Entrar al contenedor
pct enter 200
```

#### Opción B: Comandos directos desde Windows (sin shell interactivo)
```powershell
# Ejecutar cualquier comando dentro del CT
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'pct exec 200 -- <comando>'

# Ejemplos:
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'pct exec 200 -- pm2 list'
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'pct exec 200 -- cat /opt/vps-panel/backend/config/nodes.json'
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'pct exec 200 -- mysql -u root -e "SHOW DATABASES"'
```

#### Opción C: Copiar archivos dentro/fuera del CT
```powershell
# De Windows a CT (via pve)
scp -i "$env:USERPROFILE\.ssh\id_ed25519" archivo.txt root@192.168.1.4:/tmp/
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'pct push 200 /tmp/archivo.txt /ruta/destino/'

# De CT a Windows
ssh -i "$env:USERPROFILE\.ssh\id_ed25519" root@192.168.1.4 'pct exec 200 -- cat /ruta/origen/archivo.txt' > archivo.txt
```

### Credenciales internas
| Usuario | Método | Contraseña/Llave |
|---------|--------|------------------|
| **root** (CT) | `pct enter 200` o SSH via pve | `id_ed25519` (via pve) |
| **panel (web UI)** | HTTP Basic / Form | `XX*NnJ46mjD7w0J%!hw^` (env `PANEL_PASSWORD`) |
| **fossbilling DB** | MySQL | User: `fossbilling`, Pass: `a021715a5f7558ab0268e551` |

---

## 4. ARCHIVOS CLAVE PARA GESTIÓN

| Ruta | Propósito |
|------|-----------|
| `/opt/vps-panel/backend/src/server.js` | Entry point API |
| `/opt/vps-panel/backend/src/config.js` | Config central |
| `/opt/vps-panel/backend/config/nodes.json` | **Nodos Proxmox/Hyper-V** |
| `/opt/vps-panel/backend/.env` | Secrets (PANEL_PASSWORD, JWT_SECRET, CRED_SECRET) |
| `/opt/vps-panel/backend/config/nodes.example.json` | Plantilla |
| `/root/setup-fossbilling.sh` | Instalador FOSSBilling (no ejecutado) |
| `/root/fossbilling-db.txt` | Credenciales DB FOSSBilling |
| `/opt/vps-panel/backend/data/` | Datos persistentes (sqlite, etc.) |
| `/root/.pm2/logs/vps-panel-*.log` | Logs aplicación |

---

## 5. COMANDOS DE GESTIÓN HABITUALES

```bash
# Ver estado panel
pct exec 200 -- pm2 list

# Reiniciar panel
pct exec 200 -- pm2 restart vps-panel

# Ver logs (últimas 100 líneas)
pct exec 200 -- pm2 logs vps-panel --lines 100

# Ver nodos configurados
pct exec 200 -- cat /opt/vps-panel/backend/config/nodes.json

# Snapshot LXC (backup rápido)
pct snapshot 200 pre-cambios --description "Antes de X"

# Rollback snapshot
pct rollback 200 pre-cambios

# Ver BD
pct exec 200 -- mysql -u root fossbilling
```

---

## 6. NOTA IMPORTANTE: DOS "PANELES"

| Panel | Tipo | IP | Puerto | Función |
|-------|------|-----|--------|---------|
| **CT 200 "panel"** | LXC | 192.168.1.33 | 3001 (interno) | **API backend** gestión Proxmox/Hyper-V |
| **VM 210 "vps-panel"** | QEMU | 192.168.1.34 | 3001 (público via edge) | **Edge/Web UI** capuvps (nginx + frontend) |

> **CT 200 NO expone puertos públicos** — se accede via bastión pve (192.168.1.4) o via edge (VM 210) para la UI web.

---

## 7. ESTADO ACTUAL (2026-08-28)

- ✅ Contenedor running, reboot ordenado hoy
- ✅ vps-panel (PM2) online, uptime ~4h
- ✅ MariaDB, nginx, php-fpm, Postfix activos
- ⚠️ FOSSBilling **no instalado** (script listo en `/root/setup-fossbilling.sh`)
- ✅ Hardening aplicado: snapshot automático, health monitor en host
- 🔒 Acceso solo via bastión pve (SSH `id_ed25519`)

---

*Documento generado tras investigación completa via SSH/pct exec desde host pve (192.168.1.4).*