# RESUMEN — Recreación VM 300 + despliegue RELY POS y subdominio `vid2o.pachucacv.duckdns.org`

> Fecha: 2026-09-08 · Nodo: **pvececyte** (192.168.1.254, Proxmox 8.4) · VMID: **300** (`pachucacv`)
> Verificación E2E completa desde el edge. Cada fix documenta su síntoma, causa raíz y contramedida.

---

## 1. Arquitectura aplicada (descubierta en la documentación del repo)

```
Internet (207.248.113.8)
   │
   ▼
pfSense WAN (192.168.1.1)
   │  WAN:80/443 → edge 192.168.1.34 (nginx, SNI + TLS real Let's Encrypt)
   ▼
Edge nginx (VM "vps-panel", 192.168.1.34)
   │  vhost: vid2o.pachucacv.duckdns.org → proxy_pass http://192.168.1.254:8300
   ▼
pvececyte (192.168.1.254) — iptables DNAT :8300 → 192.168.7.186:8010
   ▼
VM 300 (192.168.7.186, bridge interno vmbr7)
   ├── Docker: rely-pos (FastAPI)   :8000  ← https://pachucacv.duckdns.org (vía :443/DNAT 8443)
   └── Docker: vps-app-1 (vid2o)    :8010  ← https://vid2o.pachucacv.duckdns.org (vía DNAT 8300)
```

**Fuentes de verdad del repo (`C:\vpsserver`) usadas:**
- `procedures/publicar-vm-cliente-https.md` — reglas (paso a paso DNAT, persistencia, troubleshooting acme.sh ZeroSSL, nginx del host, etc.).
- `procedures/acceso-dominio-https.md` — variante edge→nodo→guest, `$host`/SNI, y el caso real 408 por ruta asimétrica (edge /24 vs guest /22).
- `wargames/deploy-estandarizado-webapps.md` — lecciones codificadas: lockfile manda, UFW template bloquea por defecto (`curl externo 000` con `curl local 200`), dnsmasq muere con `dhcp-host` duplicado, nginx 1.24 usa `listen 443 ssl http2;` (`http2 on;` no existe), heredocs para config, IP:puerto reservado por VMID, `panel-vhost` protege `capuvps` y `pachucacv`.
- `wargames/portal-cliente-autodeploy.md` — `panel-vhost add-app` + wildcard `*.capuvps.duckdns.org`; DuckDNS resuelve wildcards multinivel sin configurar DNS.
- `MANUAL-1-crear-VPS.md` + `scripts/provision-vps.sh` + `templates/build-template-pvececyte.sh` — template 9000 (Ubuntu 24.04 devstack: Node 22+PM2, Python 3.12, Docker CE, `install-supabase`), convención VMID/puertos `SSH=2300`, `web=8xxx`.

---

## 2. Recreación de la VM 300

**Estado inicial:** VM dañada (qemu-guest-agent muerto, inaccesible). `qm config 300` mostraba: `protection: 1`, 2 cores / 6144 MB / 20 GB, sshkeys triple (root@pvececyte · user@DESKTOP-6SKF6QM · panel-deploy ×2), `onboot 1`, `startup order=1,up=60,down=60`.

**Reglas DNAT críticas ya persistentes en pvececyte** (la nueva VM DEBE conservar la IP):
- TCP `2300 → 192.168.7.186:22` (SSH)
- TCP `8443 → 192.168.7.186:443` (web → edge `proxy_ssl_verify off`)

**Pasos ejecutados (`/root/recreate-vm300.sh` en pvececyte):**
1. Guardar sshkeys de la VM vieja (decodificar URL-encode del `qm config` con python `urllib.parse.unquote`) → `/root/vm300-keys.pub`.
2. `qm stop 300` (shutdown colgó: agent muerto) → `qm set 300 --protection 0` → `qm destroy 300 --purge`.
3. `qm clone 9000 300 --name pachucacv --full`
4. Restaurar identidad: `--cores 2 --memory 6144 --onboot 1 --startup order=1,up=60,down=60 --cipassword/--sshkeys`.
5. **Reserva DHCP**: nueva MAC `BC:24:11:93:8C:35` → `echo 'dhcp-host=<MAC>,192.168.7.186' >> /etc/dnsmasq.d/vps-static.conf` (con `sed -i '/192\.168\.7\.186/d'` previo — lección de dnsmasq-duplicado). `systemctl restart dnsmasq` → `active`.
6. `qm start 300` → cloud-init instala stack (Node/Python/Docker, ~4 min).

**Resultado:** agent OK, IP **192.168.7.186** exacta (lease confirmado), DNAT intactos sin tocar pfSense.

> Credencial `devops` generada: guardada en `/root/vm300-credentials.txt` en pvececyte (chmod 600). No commitear.

---

## 3. Despliegue RELY POS (pachucacv.duckdns.org)

Repo: `https://github.com/oreyes100/rely` — POS FastAPI/Uvicorn, puerto 8000, `docker-compose.yml` + `Dockerfile` incluidos en raíz; DB SQLite persistida en `./data`.

**Ejecutado en la VM:** repo clonado a `/opt/app` → `docker compose build && up -d` → contenedor `rely-pos` en `0.0.0.0:8000` → **nginx del guest** (instalado en la VM) con cert self-signed 443 → `proxy_pass http://127.0.0.1:8000`, UFW `allow 443/tcp`. El edge termina el TLS real.

### 3.1 FIX — PIN de Abner / login rechazado
- **Síntoma:** "PIN Incorrecto" incluso con el PIN maestro **1234**.
- **Diagnóstico:** el login vive en SQLite (`app_state.state_json`), **no** en `db.json` (el Dockerfile de RELY *no copia* `db.json` al contenedor). El arreglo `users` estaba vacío `[]` → el endpoint `/api/login` fallaba en *User not found* antes de llegar al chequeo del master PIN (`if pin_str == '1234'` está DESPUÉS del lookup).
- **Fix:** insertar los 4 usuarios con PBKDF2 (`salt$hash`, misma lógica de `server.py`) dentro del JSON del estado, conservando ventas:

| Usuario | Rol | PIN |
|---|---|---|
| Abner | administrador | 1234 (también *master*, válido para todos) |
| Marta | cajera | 4321 |
| Luis | mesero | 1111 |
| Pedro | cocinero | 1234 |

- **Verificado vía API interna:** todos OK, PIN erróneo devuelve "Incorrect PIN".

---

## 4. Despliegue VideoToObsidian → `vid2o.pachucacv.duckdns.org`

Repo: `https://github.com/oreyes100/obsidian-vault-deploy` (VideoToObsidian: FastAPI + frontend estático; deploy Docker en `deploy/vps/`). Solo se usa el servicio `app` (Caddy/DuckDNS descartados — el TLS lo hace el edge).

**Cadena de fixes aplicados (en orden cronológico):**

| # | Síntoma | Causa raíz | Solución |
|---|---|---|---|
| 1 | Build Docker falla en `pip install openai-whisper` | `ModuleNotFoundError: No module named 'pkg_resources'` (setuptools ≥81 ya no lo incluye; mismo issue documentado en `PROYECTO_RESUMEN.md`) | Parche al Dockerfile: `pip install "setuptools<81" wheel && pip install --no-build-isolation -r requirements.txt` |
| 2 | Container creado pero arranque falla: `no space left on device` (numpy) | `/` de la VM al 100% (imagen con torch/NVIDIA ~6-8 GB sobre disco de 20 GB) | `qm disk resize 300 scsi0 +15G` en el host + `growpart /dev/sda 1 && resize2fs /dev/sda1` en el guest (instalando `cloud-guest-utils`). 20→35 GB |
| 3 | Crash-loop: `sqlite3.OperationalError: attempt to write a readonly database` | El contenedor corre como `nobody`; los files `data/videos.db` / `data/settings.json` eran de `devops` | `sudo chown -R 65534:65534 data` + `sudo chmod 644` (los chmod *necesitan sudo* tras el chown) |
| 4 | Subdominio erróneo (`vid2o.capuvps...`) | El wildcard `*.capuvps.duckdns.org` NO cubre `vid2o.pachucacv.duckdns.org` | `panel-vhost remove vid2o.capuvps.duckdns.org` → `add vid2o.pachucacv.duckdns.org 192.168.1.254 8300` → `issue-cert` (Let's Encrypt HTTP-01, ECC, renovación ARI automática nov-2026) |

**Config. de red de la app:**
- Compose editado post-clon: `ports: "127.0.0.1:8000:8000"` → **`"8010:8000"`** (el 8000 lo ocupa RELY; global, no localhost-only, para que el DNAT llegue).
- `.env` mínimo creado (compose exige `env_file`): `WHISPER_MODEL=tiny`.
- Archivos pre-creados (`touch videos.db`, `echo '{}' > settings.json`) para evitar el gotcha de Docker convirtiendo en dir los bind-mount de file.
- UFW guest: `allow 8010/tcp`.
- **DNAT persistido en pvececyte:** `8300 → 192.168.7.186:8010` + `FORWARD ACCEPT` + `netfilter-persistent save`.
- **Edge:** vhost con cert LE propio. Token de UI auto-generado en `data/settings.json` (`api_auth_token`).

**Estado IA:** proveedor `openrouter` / modelo `gpt-4o-mini` con **API keys vacías** — transcripción Whisper local funciona; análisis LLM degradado hasta agregar `OPENROUTER_API_KEY` (en `/opt/vid2o/deploy/vps/.env` + `docker compose restart app`, o desde la UI).

---

## 5. Verificación end-to-end final (desde el edge)

| Prueba | Resultado |
|---|---|
| `https://pachucacv.duckdns.org/` (RELY, TLS estricto) | 200 · `tls_verify=0` ✅ |
| Login RELY Abner/1234 (API interna) | `success: true` ✅ |
| `https://vid2o.pachucacv.duckdns.org/` (TLS estricto) | 200 · `tls_verify=0` ✅ |
| `https://vid2o.pachucacv.duckdns.org/api/health` | `{"status":"ok"}` ✅ |
| DNS `vid2o.pachucacv.duckdns.org` | → 207.248.113.8 (DuckDNS wildcard multinivel, sin tocar DNS) ✅ |
| Regresión: `capuvps.duckdns.org` (panel) | 200 ✅ |
| Regresión: `micongre.capuvps.duckdns.org` | 307 (redirect normal) ✅ |

## 6. Operación día-2 / referencias rápidas

```bash
# SSH a la VM 300
ssh -p 2300 devops@207.248.113.8          # (si existe port-forward pfSense WAN)
ssh root@192.168.1.254 'ssh devops@192.168.7.186'   # vía jump siempre disponible

# RELY POS (VM 300)
cd /opt/app && docker compose restart     # app en :8000
docker exec rely-pos python -c '...'      # consola dentro (DB /app/data/rely_pos.db)

# vid2o (VM 300)
cd /opt/vid2o/deploy/vps
docker compose logs -f app && docker compose restart app
~/.acme.sh del edge: renovación auto de vid2o.pachucacv.duckdns.org (~nov 2026)

# Disco (si vuelve a llenarse)
qm disk resize 300 scsi0 +10G   # en pvececyte
# dentro de la VM: sudo growpart /dev/sda 1 && sudo resize2fs /dev/sda1
```

**Gotchas guardados para el futuro:**
- PowerShell no tolera `&&`/`{}`/regex dentro del comando SSH anidado → patrón exitoso: escribir script en `C:\Users\User\AppData\Local\Temp\opencode\` → `scp` → `ssh "bash /tmp/x.sh"`.
- known_hosts de pvececyte guarda la clave SSH de la VM recreada → `ssh-keygen -R 192.168.7.186` después de recrearla.
- Probar DNAT *desde el propio nodo no aplica NAT* (tráfico local → OUTPUT); la prueba válida es desde el edge.
- Nunca tocar pfSense ni pvececyte (reinicio) — convención del repo.
- Actualizar la memoria del proyecto (`MANUAL-2-acceso-VPS.md`): VM 300 nueva MAC + password.
