# Manual del Ingeniero Backend — Panel VPS

## Visión general

El backend es un servidor **Express.js 5 (ESM)** que gestiona:
1. La infraestructura Proxmox (VMs, snapshots, credenciales)
2. El portal de auto-deploy para clientes (tipo Vercel+Supabase)

Se ejecuta en el **edge server 192.168.1.34** (VM 210 en Proxmox `pve`), accesible en `http://127.0.0.1:3001`, expuesto al exterior vía nginx como `https://capuvps.duckdns.org/api/`.

---

## Infraestructura de red

```
Internet (WAN 207.248.113.8)
    │ pfSense NAT → 192.168.1.34:443
    ▼
Edge (192.168.1.34) — nginx 1.24
    ├── /api/*          → http://127.0.0.1:3001  (vps-panel backend)
    ├── /proxmox/*      → http://127.0.0.1:3001  (WebSocket proxy UI Proxmox)
    ├── SNI pachucacv.duckdns.org → https://192.168.1.254:8443
    └── /*              → /opt/vps-panel/frontend/dist (React SPA)
```

**Nodos Proxmox:**
| Nombre | IP | VMID range | Uso |
|--------|-----|------------|-----|
| pve | 192.168.1.4 | 210-299 | VMs de plataforma (panel, etc.) |
| pvececyte | 192.168.1.254 | 300-399 | VMs de clientes (VLAN 7) |

---

## Árbol de archivos

```
panel/backend/
├── src/
│   ├── server.js          # Entrada: Express app, monta routers
│   ├── config.js          # Lee .env y nodes.json; valida que todo exista
│   ├── errors.js          # clase HttpError(status, message)
│   ├── proxmox.js         # ProxmoxClient — wrapper axios para la API REST de PVE
│   ├── routes/
│   │   ├── auth.js        # JWT admin + portal login/register; middlewares
│   │   ├── nodes.js       # GET /api/nodes — estado de los nodos
│   │   ├── vms.js         # CRUD de VMs (admin)
│   │   ├── credentials.js # Gestión de credenciales de VMs
│   │   ├── history.js     # Log de acciones
│   │   ├── services.js    # Servicios extra (snapshots, etc.)
│   │   ├── deploys.js     # Deploy pipeline (admin) + signed-URL uploads
│   │   ├── invites.js     # Códigos de invitación (admin)
│   │   ├── portal.js      # Portal cliente: proyectos, uploads, /me
│   │   └── proxmox-ui.js  # Proxy WebSocket para la UI de Proxmox
│   └── services/
│       ├── clients.js     # Registro/auth de clientes (bcryptjs, JSON store)
│       ├── sitegen.js     # Generador de landing HTML + ZIP (adm-zip)
│       ├── deploy.js      # Pipeline completo de 12 pasos
│       ├── provision.js   # Provisión de VMs (clonación de template)
│       ├── credentials.js # Almacén de credenciales cifradas
│       └── history.js     # Logging de eventos
├── config/
│   ├── nodes.json         # Tokens Proxmox y rangos de VMID (no commitear)
│   └── nodes.example.json # Plantilla
└── data/                  # JSON stores: clients.json, invites.json, deploys.json
    └── uploads/           # ZIPs temporales de uploads de clientes
```

---

## Variables de entorno (.env)

```bash
PORT=3001
HOST=127.0.0.1
PANEL_PASSWORD=...         # Contraseña del admin (hash no, plain)
JWT_SECRET=...             # Secreto para firmar JWTs
CRED_SECRET=...            # Secreto para cifrar credenciales de VM
SESSION_HOURS=12

# Portal de clientes
APPS_DOMAIN=apps.capuvps.duckdns.org      # Subdominio wildcard de la plataforma
APPS_DUCKDNS_TOKEN=...                     # Token DuckDNS para el cert wildcard
PANEL_PUBLIC_URL=https://capuvps.duckdns.org  # Para signed URLs de uploads
```

---

## Sistema de autenticación

**JWT con roles:**

```javascript
// Admin
{ sub: 'panel-admin', role: 'admin' }

// Cliente
{ sub: '<uuid-del-cliente>', role: 'client' }
```

**Middlewares en `routes/auth.js`:**

| Middleware | Qué hace |
|-----------|---------|
| `authMiddleware` | Verifica JWT, pone `req.jwtPayload` |
| `adminOnly` | Rechaza si `role !== 'admin'` |
| `clientOnly` | Rechaza si `role !== 'client'`; pone `req.clientId` |

**Endpoints de auth (públicos):**
- `POST /api/auth/login` — admin (contraseña plana vs. PANEL_PASSWORD)
- `POST /api/auth/portal/register` — cliente con código de invitación
- `POST /api/auth/portal/login` — cliente con email/password

---

## ProxmoxClient (`proxmox.js`)

Wrapper sobre axios con autenticación por API token (`PVEAPIToken=...`).

**Métodos principales:**

```javascript
// CRUD básico
await px.get(nodeName, '/nodes/pve/qemu/210/status/current')
await px.post(nodeName, '/nodes/pve/qemu', { ...params })
await px.delete(nodeName, '/nodes/pve/qemu/210')

// QEMU Guest Agent
await px.agentExec(node, vmid, 'comando bash')
await px.agentExecWait(node, vmid, 'comando largo', timeoutMs=600000)
await px.agentWriteFile(node, vmid, '/ruta/archivo', 'contenido')
await px.getVmMac(node, vmid)  // lee net0 del config

// VM ops
await px.cloneVm(node, templateVmid, newVmid, hostname)
await px.startVm(node, vmid)
await px.stopVm(node, vmid)
await px.deleteVm(node, vmid)
```

**Convención de VMID:** `wanPort = 8000 + vmid` (pve: 8210–8299, pvececyte: 8300–8399)

---

## Pipeline de deploy (`services/deploy.js`)

### Estado de una entrada en `data/deploys.json`

```json
{
  "id": "uuid",
  "hostname": "mi-tienda",
  "clientId": "uuid-cliente",
  "status": "running | done | error | deleted",
  "plan": "basico",
  "source": { "type": "git | zip | template", "gitUrl": "..." },
  "domain": { "type": "wildcard | duckdns | custom", "fqdn": "..." },
  "db": "postgres | mongo | mysql | ninguna",
  "node": "pvececyte",
  "vmid": 342,
  "url": "https://mi-tienda.apps.capuvps.duckdns.org",
  "dbInfo": { "tipo": "postgres", "usuario": "...", "password": "...", "dbName": "..." },
  "steps": [
    { "name": "provision", "status": "ok | running | error | pending", "detail": "..." }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601"
}
```

### Pasos del pipeline (en orden)

| Paso | Qué hace |
|------|---------|
| `provision` | `qm clone <template> <vmid>` vía API Proxmox |
| `wait_ip` | Poll `agent/exec` hasta que `ip addr` retorna IP en el subnet |
| `prepare` | Instala Docker + compose vía `agentExecWait` |
| `fetch` | `git clone` o `curl <signed-URL>` del ZIP |
| `stack` | Detecta tipo: compose / dockerfile / node / static |
| `build` | `docker compose build --no-cache` |
| `run` | `docker compose up -d` + health check HTTP local |
| `ufw` | `ufw allow 80/tcp` en la VM |
| `nat` | SSH al nodo → `iptables -t nat -A PREROUTING -p tcp --dport <wanPort> -j DNAT --to <guestIP>:80` |
| `vhost` | SSH al edge → `sudo panel-vhost add-app <nombre> <nodeIP> <wanPort>` |
| `dns` | POST DuckDNS API o `panel-vhost add <fqdn>` para dominio propio |
| `tls` | `acme.sh --issue --dns dns_duckdns` (solo dominios propios; wildcard usa cert compartido) |
| `verify` | `curl -sk --max-time 30 <url>` desde fuera |

### Selección de nodo

Se elige el nodo con más RAM libre del rango correspondiente al `plan`. Los nodos se definen en `config/nodes.json`.

---

## Script `panel-vhost` (en edge 192.168.1.34)

```bash
# Instalado en /usr/local/sbin/panel-vhost (root, 755)
# Admin puede usarlo sin contraseña via sudoers: /etc/sudoers.d/panel-vhost

sudo panel-vhost add-app <nombre> <nodeIP> <port>    # subdominio wildcard
sudo panel-vhost add <fqdn> <nodeIP> <port>          # dominio propio (cert propio)
sudo panel-vhost update-cert <fqdn>                   # aplica cert definitivo
sudo panel-vhost remove <fqdn>                        # elimina vhost
```

El script valida que `capuvps.duckdns.org` y `pachucacv.duckdns.org` nunca sean modificados.

---

## Cert wildcard

El cert wildcard para `*.apps.capuvps.duckdns.org` está en `/etc/nginx/ssl/wildcard-apps/`.

Para emitirlo por primera vez (o renovar manualmente):
```bash
# En 192.168.1.34 como root
# 1. Poner APPS_DUCKDNS_TOKEN en .env
# 2. Ejecutar:
/opt/vps-panel/setup-wildcard-cert.sh
```

acme.sh tiene cron configurado para renovación automática.

---

## SSH de panel→nodos

La llave `/home/admin/.ssh/panel_nodes` (ed25519) está autorizada en `/root/.ssh/authorized_keys` en `pve` y `pvececyte`.

El backend la usa vía `execFileAsync('ssh', ['-i', config.nodesSshKey, ...])` en `deploy.js`.

---

## Arranque y logs

```bash
# Systemd service
systemctl status vps-panel
systemctl restart vps-panel
journalctl -u vps-panel -f         # logs en vivo
journalctl -u vps-panel -n 100     # últimas 100 líneas
```

---

## Cómo agregar un endpoint nuevo (checklist)

1. Crear (o editar) el archivo en `panel/backend/src/routes/`
2. Exportar el router: `export const fooRouter = Router()`
3. Montarlo en `server.js` con el middleware correcto:
   - Admin: `app.use('/api/foo', authMiddleware, adminOnly, fooRouter)`
   - Cliente: añadir dentro del router usando `clientOnly`
4. Subir el archivo al servidor: `scp src/routes/foo.js root@192.168.1.34:/opt/vps-panel/backend/src/routes/`
5. Reiniciar: `systemctl restart vps-panel`
6. Verificar: `journalctl -u vps-panel -n 20`

---

## Datos persistentes (JSON stores)

Los datos viven en `/opt/vps-panel/backend/data/`. No hay base de datos relacional — todo es JSON en disco, con lectura/escritura síncrona (ok para volumen bajo de operaciones).

| Archivo | Contenido |
|---------|-----------|
| `clients.json` | Clientes registrados (con `passwordHash`, sin token) |
| `invites.json` | Códigos de invitación y quién los usó |
| `deploys.json` | Estado completo de todos los deploys |
| `uploads/` | ZIPs temporales de los proyectos de clientes |

**Backup recomendado:** `rsync -a /opt/vps-panel/backend/data/ backup@host:/backup/panel-data/`

---

## Secretos — regla de oro

Los tokens, contraseñas y secretos van en `.env` y **nunca en el código fuente ni en commits**. El `.env` no está en el repositorio. Si algo sensible llega al código por error, rotarlo inmediatamente en DuckDNS / Proxmox / etc.
