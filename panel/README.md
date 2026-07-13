# Panel VPS — gestión de la plataforma Proxmox (pve + pvececyte)

Panel web de auto-servicio para crear y administrar los VPS de la infraestructura
documentada en `C:\vpsserver` (MANUAL-1/2/3). Los desarrolladores entran con una
contraseña compartida y pueden: ver el estado de ambos nodos y de todos los VPS,
aprovisionar desde el template 9000, encender/apagar/eliminar, gestionar snapshots
y consultar/regenerar credenciales SSH.

```
Navegador ──HTTPS──> nginx ──> frontend (React estático)
                        └────> /api ──> backend Express (127.0.0.1:3001)
                                           ├──> API Proxmox pve        (192.168.1.4:8006)
                                           └──> API Proxmox pvececyte  (192.168.1.254:8006)
```

**Punto clave de diseño:** pve y pvececyte NO son un clúster — son nodos autónomos.
El backend habla con las **dos APIs por separado** (un token por nodo) y agrega los
resultados. Los tokens viven SOLO en el backend (`config/nodes.json`, chmod 600);
el navegador nunca los ve.

## Estructura

```
panel/
├── backend/                  # Proxy de API (Node 18+, Express, ESM)
│   ├── src/
│   │   ├── server.js         # bootstrap, helmet, rate-limit global, manejo de errores
│   │   ├── config.js         # carga .env + config/nodes.json
│   │   ├── proxmox.js        # cliente API por nodo (token, TLS, waitTask)
│   │   ├── errors.js
│   │   ├── middleware/validate.js    # validación estricta de inputs
│   │   ├── routes/auth.js            # login (password -> JWT), middleware de sesión
│   │   ├── routes/nodes.js           # GET /api/nodes (recursos por nodo)
│   │   ├── routes/vms.js             # CRUD VPS, acciones, IP, snapshots
│   │   ├── routes/credentials.js     # listado + regeneración de passwords
│   │   ├── routes/history.js         # historial de operaciones
│   │   ├── services/provision.js     # clonar template -> config -> resize -> start
│   │   ├── services/credentials.js   # cifrado AES-256-GCM en data/credentials.json
│   │   ├── services/history.js       # log JSONL en data/history.jsonl
│   │   └── utils/password.js         # generador de contraseñas fuertes
│   ├── config/nodes.example.json     # copia a nodes.json con tus tokens
│   └── .env.example                  # copia a .env
├── frontend/                 # React 18 + TS + Tailwind + React Query (Vite)
│   └── src/
│       ├── components/       # DashboardLayout, VpsList, ProvisioningForm,
│       │                     # ResourceMonitor, CredentialManager, HistoryLog, Login
│       └── api/              # client.ts (fetch+JWT), queries.ts (hooks), types.ts
└── deploy/                   # nginx.conf + ecosystem.config.cjs (PM2)
```

## API del backend

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/login` | `{password}` → `{token}` (JWT 12 h; rate limit 10/15 min) |
| GET | `/api/nodes` | CPU/RAM/storage/uptime por nodo |
| GET | `/api/vms` | Todos los VPS de ambos nodos |
| POST | `/api/vms` | Aprovisionar `{node,hostname,cores,memoryMb,diskGb,tags}` (rate limit 20/h) |
| GET | `/api/vms/:node/:vmid` | Estado detallado |
| GET | `/api/vms/:node/:vmid/ip` | IP vía qemu-guest-agent |
| POST | `/api/vms/:node/:vmid/action` | `{action: start\|shutdown\|stop\|reboot}` |
| DELETE | `/api/vms/:node/:vmid` | Detiene si hace falta y destruye con purge |
| GET/POST | `/api/vms/:node/:vmid/snapshots` | Listar / crear |
| POST | `.../snapshots/:name/rollback` · DELETE `.../snapshots/:name` | Revertir / borrar |
| GET | `/api/credentials` | Credenciales almacenadas (cifradas en reposo) |
| POST | `/api/credentials/:node/:vmid/regenerate` | Nueva password (aplica al reiniciar) |
| GET | `/api/history` | Últimas operaciones |

---

## Guía de implementación

### Paso 1 — Crear el token de API en CADA nodo

En el shell de **pve** y de **pvececyte** (usuario y rol dedicados, sin privilegios de root):

```bash
bash
pveum user add panel@pve --comment "Panel de gestion VPS"
pveum aclmod / -user panel@pve -role PVEVMAdmin    # VMs, clone, snapshots, storage alloc
pveum aclmod / -user panel@pve -role PVEAuditor    # leer estado del nodo/storage
pveum user token add panel@pve panel --privsep 0
# Guarda el "value" (UUID) que imprime: es el tokenSecret de ese nodo.
```

### Paso 2 — Elegir dónde correr el panel y copiar el proyecto

Puede ser un VPS existente (p.ej. uno pequeño en pve) o un LXC como el de
FOSSBilling. Requisitos: Node.js 18+, nginx, acceso a `192.168.1.4:8006` y
`192.168.1.254:8006` (⚠️ si lo corres DENTRO de un VPS de la subred 192.168.6/7,
recuerda que el aislamiento nftables bloquea VPS→LAN; necesitarías una regla
`accept` puntual hacia los dos hosts:8006 en el script del gateway, o mejor córrelo
en un LXC/VM con pata en la LAN 192.168.1.x).

```bash
sudo mkdir -p /opt/vps-panel && sudo chown $USER /opt/vps-panel
# copia backend/ frontend/ deploy/ a /opt/vps-panel (scp, git, etc.)
```

### Paso 3 — Configurar el backend

```bash
cd /opt/vps-panel/backend
npm install --omit=dev

cp .env.example .env
# edita .env:
#   PANEL_PASSWORD=<clave del equipo>
#   JWT_SECRET=$(openssl rand -hex 32)
#   CRED_SECRET=$(openssl rand -hex 32)

cp config/nodes.example.json config/nodes.json
# pega el tokenSecret de cada nodo
chmod 600 .env config/nodes.json

# prueba manual:
node src/server.js
# -> "Panel backend escuchando en http://127.0.0.1:3001"
curl -s -X POST localhost:3001/api/auth/login -H 'Content-Type: application/json' \
  -d '{"password":"<tu PANEL_PASSWORD>"}'
```

### Paso 4 — Compilar el frontend

```bash
cd /opt/vps-panel/frontend
npm install
npm run build          # genera dist/
```

### Paso 5 — nginx + HTTPS

```bash
# Certificado auto-firmado (o usa certbot si tienes dominio público):
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 825 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/panel.key -out /etc/nginx/ssl/panel.crt \
  -subj "/CN=panel.vps.local"

sudo cp /opt/vps-panel/deploy/nginx.conf /etc/nginx/sites-available/vps-panel
sudo ln -s /etc/nginx/sites-available/vps-panel /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### Paso 6 — PM2 (backend como servicio)

```bash
sudo npm install -g pm2
sudo mkdir -p /var/log/vps-panel
pm2 start /opt/vps-panel/deploy/ecosystem.config.cjs
pm2 save
pm2 startup   # sigue la línea que imprime para persistir tras reboot
```

### Paso 7 — Probar

1. Abre `https://<ip-del-host-del-panel>/` (acepta el cert auto-firmado).
2. Entra con `PANEL_PASSWORD`.
3. El dashboard debe mostrar pve y pvececyte online con sus recursos.
4. Crea un VPS de prueba (plan Dev): clona 9000, arranca, y en 3-5 min el
   guest-agent reporta la IP en la tabla. Verifica SSH con las credenciales
   mostradas y elimínalo desde el panel.

### Acceso desde fuera de la LAN (opcional)

Igual que los VPS: port-forward en pfSense (Firewall → NAT → Port Forward):
WAN TCP puerto p.ej. `8443` → IP del host del panel puerto `443`. No lo expongas
sin necesidad; es un panel administrativo.

---

## Notas de seguridad

- **Tokens Proxmox solo en backend** (`config/nodes.json`, chmod 600, en .gitignore).
- **Passwords de VPS cifradas en reposo** (AES-256-GCM con `CRED_SECRET`).
- **Rate limiting**: login 10/15 min, aprovisionamiento 20/h, global 2000/15 min.
- **Validación estricta** de todos los inputs (regex/rangos cerrados) antes de
  tocar la API de Proxmox; el VMID 9000 (template) está protegido contra
  acciones y borrado.
- **JWT de sesión** expira a las 12 h (`SESSION_HOURS`).
- El backend escucha **solo en 127.0.0.1**; el único punto de entrada es nginx/HTTPS.
- La regeneración de password usa cloud-init (`cipassword`): **aplica en el
  siguiente reinicio** del VPS, no en caliente.

## Limitaciones conocidas / siguientes pasos

- Los **port-forwards de entrada** (pfSense + DNAT en el nodo) siguen siendo
  manuales (MANUAL-1 §5); automatizarlos requeriría SSH del panel a los nodos.
- Login de un solo usuario (contraseña compartida). Si crece el equipo: usuarios
  individuales + roles (p.ej. quién puede eliminar).
- El historial registra el usuario como "panel"; con multi-usuario se registraría
  el nombre real.
