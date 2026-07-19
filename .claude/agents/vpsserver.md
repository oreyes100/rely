---
name: vpsserver
description: Contexto completo del proyecto VPS Panel — infraestructura, arquitectura backend/frontend, reglas de seguridad y workflows de deploy. Usar SIEMPRE que se trabaje en este repositorio (panel/, docs/, wargames/, deploy/). Invocar ante cualquier pregunta sobre cómo funciona el sistema, cómo hacer deploy, cómo agregar features, o cómo opera la infraestructura Proxmox/nginx/pfSense.
---

# VPS Panel — Contexto para Engineers

## Reglas de seguridad críticas (leer antes de cualquier acción)

- **capuvps (192.168.1.33) es producción ANTIGUA — NUNCA tocar.** Todo migró a 192.168.1.34.
- **pfSense y pvececyte (192.168.1.254) NUNCA reiniciar** — afectan toda la red del cliente.
- **Secretos nunca en código ni en commits.** `.env` y `nodes.json` están en `.gitignore`. Si algo sensible llega al repo, rotarlo inmediatamente.
- Los puertos WAN 80 y 443 pertenecen a producción — cualquier cambio en pfSense requiere confirmación explícita del usuario.

---

## Mapa de infraestructura

```
Internet (WAN 207.248.113.8)
    │ pfSense NAT → 192.168.1.34:443
    ▼
Edge 192.168.1.34 (VM 210 en pve) — nginx
    ├── /api/* + /proxmox/* → http://127.0.0.1:3001 (backend Node.js)
    ├── SNI pachucacv.duckdns.org → https://192.168.1.254:8443
    └── /* → /opt/vps-panel/frontend/dist (React SPA)
```

| Nodo | IP | VMID range | Rol |
|------|-----|------------|-----|
| pve | 192.168.1.4 | 210-299 | VMs de plataforma |
| pvececyte | 192.168.1.254 | 300-399 | VMs de clientes (VLAN 7) |
| Edge (panel) | 192.168.1.34 | VM 210 en pve | nginx + backend + cert wildcard |

**SSH desde local al edge:** `ssh -i ~/.ssh/id_ed25519 root@192.168.1.34`  
**SSH panel→nodos:** `/home/admin/.ssh/panel_nodes` (ed25519, ya autorizada en pve y pvececyte)

---

## Arquitectura del backend (`panel/backend/`)

**Stack:** Express.js 5 (ESM), Node.js, sin base de datos (JSON en disco)  
**Puerto:** 3001, solo localhost  
**Systemd:** `systemctl restart vps-panel`  
**Logs:** `journalctl -u vps-panel -f`  
**Data:** `/opt/vps-panel/backend/data/` (clients.json, invites.json, deploys.json)

**Routers y qué protegen:**
- `/api/auth/*` — público (login admin + portal register/login)
- `/api/portal/*` — `authMiddleware` + `clientOnly` (clientes del portal)
- `/api/*` resto — `authMiddleware` + `adminOnly` (admin Proxmox)

**JWT roles:** `{ role: 'admin' }` o `{ role: 'client', sub: '<uuid>' }`

**Leer el manual completo:** `docs/MANUAL-backend-engineer.md`

---

## Arquitectura del frontend (`panel/frontend/`)

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS  
**Build:** `npm run build` → `dist/`  
**Sin React Router** — navegación por `useState<Page>`  
**Sin estado global** — no Redux, no Zustand

**Routing por rol en `App.tsx`:**
- Sin token → `<Login>` (dos tabs: Admin / Cliente)
- `role === 'client'` → `<ClientPortal>` (PortalLayout + MisProyectos + NuevoProyecto)
- `role === 'admin'` → `<AdminPanel>` (DashboardLayout + todas las páginas admin)

**API client:** `api/client.ts` — wrapper fetch con JWT automático; `getRole()` decodifica el payload local (sin verificar).

**Leer el manual completo:** `docs/MANUAL-frontend-engineer.md`

---

## Workflows de deploy

### Backend (cambio en `panel/backend/src/`)

```bash
# 1. Copiar archivo(s) al servidor
scp -i ~/.ssh/id_ed25519 panel/backend/src/routes/foo.js \
    root@192.168.1.34:/opt/vps-panel/backend/src/routes/

# 2. Si se agregan dependencias npm:
ssh -i ~/.ssh/id_ed25519 root@192.168.1.34 "cd /opt/vps-panel/backend && npm install <pkg>"

# 3. Reiniciar y verificar
ssh -i ~/.ssh/id_ed25519 root@192.168.1.34 "systemctl restart vps-panel"
ssh -i ~/.ssh/id_ed25519 root@192.168.1.34 "journalctl -u vps-panel -n 20 --no-pager"
```

### Frontend (cambio en `panel/frontend/src/`)

```bash
# 1. Build (falla si hay errores TypeScript — intencional)
cd panel/frontend && npm run build

# 2. Deploy (nginx sirve los estáticos, no reiniciar nada)
scp -r dist/. root@192.168.1.34:/opt/vps-panel/frontend/dist/

# 3. Verificar
curl -sk https://capuvps.duckdns.org/ | grep '<title>'
# Esperado: <title>Panel VPS — Proxmox</title>
```

### Script `panel-vhost` (en edge, para gestionar nginx de proyectos cliente)

```bash
# Solo root o admin via sudo (/etc/sudoers.d/panel-vhost)
sudo panel-vhost add-app <nombre> <nodeIP> <port>   # subdominio wildcard
sudo panel-vhost add <fqdn> <nodeIP> <port>          # dominio propio
sudo panel-vhost remove <fqdn>                       # eliminar vhost
```

---

## Cert wildcard (*.apps.capuvps.duckdns.org)

Instalado en `/etc/nginx/ssl/wildcard-apps/`. Para emitir o renovar:
```bash
# En 192.168.1.34, poner APPS_DUCKDNS_TOKEN en .env, luego:
/opt/vps-panel/setup-wildcard-cert.sh
```

---

## Variables de entorno clave (en 192.168.1.34:/opt/vps-panel/backend/.env)

```
PANEL_PASSWORD, JWT_SECRET, CRED_SECRET  ← requeridas, nunca loguear
APPS_DOMAIN=apps.capuvps.duckdns.org    ← subdominio plataforma para clientes
APPS_DUCKDNS_TOKEN=...                  ← para cert wildcard y DNS
PANEL_PUBLIC_URL=https://capuvps.duckdns.org
```

---

## Dominios activos

| Dominio | Apunta a | Qué sirve |
|---------|---------|-----------|
| capuvps.duckdns.org | 207.248.113.8 → 192.168.1.34 | VPS Panel (admin + portal) |
| pachucacv.duckdns.org | 207.248.113.8 → 192.168.1.34 → 192.168.1.254:8443 | Pachuca.cv landing (Astro) |
| *.apps.capuvps.duckdns.org | 207.248.113.8 → 192.168.1.34 | Proyectos de clientes (wildcard cert) |

---

## Pipeline de deploy de clientes (12 pasos)

`provision → wait_ip → prepare → fetch → stack → build → run → ufw → nat → vhost → [dns] → [tls] → verify`

Los pasos `dns` y `tls` se omiten para modo wildcard (subdominio de plataforma). El código completo está en `panel/backend/src/services/deploy.js`.

---

## Manuales completos (leer cuando se necesite profundidad)

- **Backend:** `docs/MANUAL-backend-engineer.md` — ProxmoxClient, routers, pipeline, JSON stores, checklist para agregar endpoints
- **Frontend:** `docs/MANUAL-frontend-engineer.md` — routing, API client, tipos, cómo agregar páginas, convenciones Tailwind, build/deploy
- **Cliente final:** `wargames/MANUAL-portal-clientes.md` — guía de usuario (no técnica)
