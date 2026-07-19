# War-game: Pipeline estandarizado de deployment de webapps de clientes
> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.

## Mission objective

Convertir el proceso manual de deployment (probado con pachuca.cv-landing, 2026-07-19) en una función del panel VPS: un cliente **sin conocimientos técnicos**, desde **fuera de la LAN (WAN)**, entra al panel en `https://capuvps.duckdns.org/`, llena un formulario (URL de git o zip + nombre de subdominio) y obtiene su webapp corriendo en un VPS con HTTPS válido en `https://<su-nombre>.duckdns.org/` o su dominio propio. Éxito medible: un deploy de prueba de un repo público completa end-to-end sin intervención humana y responde HTTP 200 con TLS válido desde internet, **sin romper** los sitios ya productivos (`capuvps.duckdns.org` = panel, `pachucacv.duckdns.org` = landing).

## Recon summary

**Topología (verificada 2026-07-19):**
```
Internet → pfSense WAN 207.248.113.8
   :80  → edge 192.168.1.34:80    (verificado: nginx responde 301)
   :443 → edge 192.168.1.34:443   (SNI: capuvps=panel, pachucacv=proxy landing)
   :8091→ edge (panel, ruta histórica)
edge (VM 210 "vps-panel" en pve, Ubuntu, nginx 1.24)
   → nodos Proxmox por LAN: pve 192.168.1.4:8006, pvececyte 192.168.1.254:8006
   → nodo DNAT (iptables) → guest en subred interna del nodo
guests: pve=192.168.6.x (VMID 210-299), pvececyte=192.168.7.x (VMID 300-399)
```

**Panel (en el edge 192.168.1.34):**
- Backend Express en `127.0.0.1:3001`, código en `/opt/vps-panel/backend/`, **corre como usuario `admin`** (NO root), lanzado a mano con `bash -c 'cd /opt/vps-panel/backend && node src/server.js &'` — **no hay systemd unit ni pm2: muere en cada reboot** (Move 8 lo arregla).
- Frontend React (Vite) servido por nginx desde `/opt/vps-panel/frontend/dist`.
- Auth: contraseña única del panel + JWT (`src/routes/auth.js`, `authMiddleware`). No hay multi-tenant.
- `src/services/provision.js`: `provisionVm()` ya clona template 9000, setea cloud-init password, resize disco, arranca, guarda credencial. FUNCIONA — reutilizar tal cual.
- `src/routes/services.js`: patrón catálogo→provision→setupScript, pero el setupScript se entrega para **ejecución manual**. El pipeline nuevo debe ejecutar TODO automáticamente vía qemu-guest-agent.
- `src/proxmox.js`: cliente API con `get/post/put/del/waitTask`. **NO tiene helper de agent exec** — hay que añadirlo (Move 2).
- `config/nodes.json`: pve (210-299, 192.168.6.), pvececyte (300-399, 192.168.7.), pvelenovo 192.168.1.15 (**caído, HTTP 000 — excluir de v1**), posible nodo hyperv (excluir de v1: sin qemu-agent).

**SSH y accesos:**
- Operador desde LAN: `ssh -i ~/.ssh/id_ed25519 root@192.168.1.34` (edge), `root@192.168.1.4` (pve), `root@192.168.1.254` (pvececyte) — llave `user@DESKTOP-6SKF6QM` instalada en los tres.
- Guests: usuario `devops`, password por VM en el store de credenciales del panel; qemu-guest-agent activo (el template lo trae).
- El guest NO alcanza 192.168.1.34 directamente (ping 100% loss, probado) pero SÍ alcanza `https://capuvps.duckdns.org/` vía NAT reflection PFREFLECT de pfSense. Consecuencia: para pasar archivos panel→guest, publicar URL firmada y que el guest la descargue con curl.
- El edge SÍ alcanza `192.168.1.254:8443` (probado: vhost pachucacv proxya ahí). Patrón edge→nodo:puertoDNAT→guest es el camino probado.

**Lecciones del deploy pachuca.cv (TODAS deben quedar codificadas en el pipeline):**
1. **Lockfile manda**: `npm install` ignora `pnpm-lock.yaml` e instala transitivas incompatibles (error real: `"activeAnimations" is not exported by motion-dom`). Detectar lockfile y usar el package manager correcto.
2. `docker compose up --no-cache` **no existe** (error real: `unknown flag: --no-cache`). Correcto: `docker compose build --no-cache && docker compose up -d`.
3. **UFW del template viene activo con policy DROP y solo OpenSSH** — bloquea silenciosamente el puerto del app; el síntoma es curl externo `000` con curl local `200`.
4. Persistir iptables del nodo: `iptables-save > /etc/iptables/rules.v4` (iptables-persistent ya está en pvececyte; verificar en pve con `dpkg -l iptables-persistent`).
5. dnsmasq del nodo: una entrada `dhcp-host` con IP duplicada tumba el servicio (error real: `duplicate dhcp-host IP address ... FAILED to start up`). Antes de añadir, `grep <IP> /etc/dnsmasq.d/vps-static.conf`.
6. nginx 1.24: usar `listen 443 ssl http2;` (la directiva `http2 on;` no existe en 1.24).
7. Configs nginx por SSH: SIEMPRE con heredoc (`ssh host "tee archivo" <<'EOF'`), nunca inline con `$` escapados (error real: `invalid number of arguments in "proxy_set_header"`).
8. Un `server_name` específico en nginx gana al catch-all `server_name _;` — así conviven panel y sitios de clientes en el mismo :443 (probado con pachucacv).
9. qemu-agent `file-write` rechaza payloads grandes ("data too large") — no sirve para transferir proyectos; usar git clone o URL firmada.
10. Primer boot con cloud-init tarda 3-5 min; la IP se obtiene con `agent/network-get-interfaces` filtrando por `subnetPrefix` (patrón ya implementado en `vms.js` GET `/:node/:vmid/ip`).
11. acme.sh DNS-01 con DuckDNS funciona (cert ZeroSSL emitido 2026-07-19); token DuckDNS de la plataforma: `e5932b32-61f6-4477-9355-4e4c889d33ca`. **DuckDNS limita a 5 subdominios por cuenta** — ya hay 2 usados (capuvps, pachucacv).
12. WAN:80 → edge YA funciona ⇒ **HTTP-01 webroot en el edge es posible** para dominios propios del cliente (sin pedirle tokens DNS).

**Convención de puertos (decisión de diseño, fija):**
- Web del cliente: nodo escucha `8000+VMID` → DNAT → guest:80. Solo tráfico LAN-interno (edge→nodo); NO se toca pfSense por deploy. Rango pve: 8210-8299 en 192.168.1.4; pvececyte: 8300-8399 en 192.168.1.254. (8443 en pvececyte ya usado por pachucacv; no colisiona: los VMID topan en 399.)
- El guest SIEMPRE publica su app en el puerto 80 (compose mapea `80:<puerto interno>`).
- SSH del cliente al guest: NO en v1 (el panel ya tiene consola noVNC vía `proxmox-ui.js`). Evita reglas pfSense por cliente.
- TLS: SOLO en el edge. El tramo edge→nodo→guest va en HTTP plano por LAN. Elimina acme.sh/UFW-443 en cada guest.

## Moves

### Move 1: Verificaciones previas y llaves SSH panel→nodos
- **Action:** Desde el edge (`ssh root@192.168.1.34` si eres operador; desde WAN el executor primero verifica si hay SSH WAN al edge probando `ssh -p 2202 devops@207.248.113.8` — si no responde, trabajar vía operador o consola Proxmox del VM 210):
  1. Confirmar producción viva: `curl -sk -o /dev/null -w '%{http_code}' https://capuvps.duckdns.org/` → 200 y lo mismo para `https://pachucacv.duckdns.org/`.
  2. Generar llave del panel como usuario `admin`: `sudo -u admin ssh-keygen -t ed25519 -N '' -f /home/admin/.ssh/panel_nodes -C panel-deploy`.
  3. Instalar la pública en `root@192.168.1.4` y `root@192.168.1.254` (`~/.ssh/authorized_keys`).
  4. Probar: `sudo -u admin ssh -i /home/admin/.ssh/panel_nodes -o StrictHostKeyChecking=accept-new root@192.168.1.4 hostname` → `pve`; ídem pvececyte.
  5. Verificar iptables-persistent en pve: `dpkg -l iptables-persistent || apt-get install -y iptables-persistent` (en pvececyte ya está).
- **Expected observation if it worked:** ambos `hostname` responden; los curl dan 200.
- **Expected observation if it failed:** `Permission denied (publickey)` al probar; o curl ≠ 200 en producción.
- **Most likely cause of failure:** la pública se pegó con salto de línea partido, o se instaló en el usuario equivocado.
- **Countermove:** instalar la llave usando el acceso del operador (llave `user@DESKTOP-6SKF6QM` ya autorizada en root de ambos nodos) con `ssh root@<nodo> "echo '<pubkey>' >> /root/.ssh/authorized_keys"`. Si producción no da 200, ABORT (ver condiciones).
- **Downstream consequences:** sin esta llave, los Moves 5 (DNAT en nodo) no pueden ejecutarse desde el backend; todo el pipeline queda manual.

### Move 2: Helper `agentExec` en el backend
- **Action:** En `/opt/vps-panel/backend/src/proxmox.js` añadir dos métodos al cliente:
  - `agentExec(node, vmid, command)`: `POST /nodes/<node>/qemu/<vmid>/agent/exec` con `{ command: ['bash','-c', command] }` → devuelve `pid`.
  - `agentExecWait(node, vmid, command, timeoutMs=600000)`: llama a `agentExec`, luego pollea `GET .../agent/exec-status?pid=<pid>` cada 3 s hasta `exited: 1`; devuelve `{ exitcode, 'out-data', 'err-data' }`. Si la salida esperada es larga (>4 KB), el comando debe redirigir a un archivo en el guest y leerse a trozos.
- **Expected observation if it worked:** prueba en caliente: `agentExecWait('pvececyte', 300, 'echo ok')` devuelve exitcode 0 y `out-data: "ok\n"` (VM 300 está corriendo y tiene agente).
- **Expected observation if it failed:** HTTP 500 `QEMU guest agent is not running` o timeout del poll.
- **Most likely cause of failure:** VM apagada o agente aún no arriba (primer boot).
- **Countermove:** en el pipeline, `agentExecWait` solo se llama después de que `GET /:node/:vmid/ip` devuelva IP (garantiza agente arriba). Para la prueba usar una VM ya corriendo.
- **Downstream consequences:** todos los pasos de guest (Moves 4) dependen de este helper.

### Move 3: Servicio `deployWebapp.js` — la máquina de estados
- **Action:** Crear `/opt/vps-panel/backend/src/services/deploy.js` + ruta `/opt/vps-panel/backend/src/routes/deploys.js` (montar en `server.js` bajo `authMiddleware`, patrón idéntico a `services.js`). Persistencia en `data/deploys.json`. API:
  - `POST /api/deploys` body: `{ hostname, source: {type:'git', url} | {type:'zip', uploadId}, appPort (default 3000), domain: {type:'duckdns', name, token?} | {type:'custom', fqdn}, node? }` → crea registro con `steps: []`, responde 201 con id, y corre el pipeline **async** (no bloquear el request; actualizar el JSON tras cada paso).
  - `GET /api/deploys` y `GET /api/deploys/:id` → estado y pasos (el frontend pollea cada 3 s).
  - Pasos del pipeline, en orden, cada uno con `{name, status: pending|running|ok|error, detail}`:
    `provision → wait_ip → detect_stack → prepare_guest → fetch_source → build → run → open_ufw → nat_node → edge_vhost → dns → tls → verify`
  - `node` se elige automático si no viene: el nodo con más RAM libre (reusar `checkCapacity`).
- **Expected observation if it worked:** `POST` con un body de prueba devuelve 201 inmediato; `GET /api/deploys/:id` muestra `provision: running` y avanza.
- **Expected observation if it failed:** el proceso node se cae (backend es un solo proceso: una excepción no capturada en el pipeline async tumba TODO el panel).
- **Most likely cause of failure:** promesa sin catch en el pipeline async.
- **Countermove:** envolver el runner en `try/catch` global que marque el paso como `error` y el deploy como `failed`; JAMÁS dejar rechazos sin capturar. En fallo posterior a `provision`, ofrecer `DELETE /api/deploys/:id` que destruya la VM (reusar la limpieza best-effort de `provision.js`).
- **Downstream consequences:** el formato de `steps` es el contrato del frontend (Move 7); congélalo antes de empezar el frontend.

### Move 4: Pasos de guest — detect_stack, fetch, build, run, UFW
- **Action:** Implementar los pasos que corren dentro del guest vía `agentExecWait` (todo como root: el agente ejecuta como root):
  - `prepare_guest`: `command -v docker || (apt-get update -qq && apt-get install -y docker.io docker-compose-v2 git)` — el template ya trae Docker; esto es red de seguridad.
  - `fetch_source`: git → `rm -rf /opt/app && git clone --depth 1 <url> /opt/app`. Zip → el backend guarda el zip subido en `/opt/vps-panel/backend/data/uploads/<uploadId>.zip`, expone `GET /api/deploys/uploads/:uploadId` **con token firmado de un solo uso en el query** (el guest no manda JWT), y el guest ejecuta `curl -fL 'https://capuvps.duckdns.org/api/deploys/uploads/<id>?sig=<token>' -o /tmp/app.zip && unzip -o /tmp/app.zip -d /opt/app` (el guest solo alcanza el panel vía la URL WAN reflejada — NUNCA por 192.168.1.34 directo).
  - `detect_stack` (orden de precedencia, correr con un solo `bash -c` que imprima el veredicto):
    1. `compose.yaml|docker-compose.yml` presente → modo compose.
    2. `Dockerfile` presente → generar compose mínimo que lo builde y mapee `80:<appPort>`.
    3. `package.json` presente → **generar Dockerfile** (plantilla abajo) + compose.
    4. `index.html` presente → compose con `nginx:alpine` montando `/opt/app` en `/usr/share/nginx/html`, mapeo `80:80`.
    5. Nada de lo anterior → paso `error` con detalle "stack no reconocido".
  - Plantilla Dockerfile para Node (LA lección pnpm, textual):
    ```dockerfile
    FROM node:lts
    WORKDIR /app
    COPY . .
    # Detección de package manager EN BUILD por lockfile:
    RUN if [ -f pnpm-lock.yaml ]; then npm i -g pnpm && pnpm install --frozen-lockfile; \
        elif [ -f yarn.lock ]; then corepack enable && yarn install --frozen-lockfile; \
        else npm ci || npm install; fi
    RUN if [ -f pnpm-lock.yaml ]; then pnpm run build || true; \
        elif [ -f yarn.lock ]; then yarn build || true; \
        else npm run build || true; fi
    ENV HOST=0.0.0.0 PORT=<appPort>
    EXPOSE <appPort>
    CMD ["npm","start"]
    ```
    (Si `package.json` tiene `scripts.start` usar `npm start`; si no y existe `dist/server/entry.mjs` —Astro—, `node dist/server/entry.mjs`; si no, error con detalle.)
  - `build`: `cd /opt/app && docker compose build 2>&1 | tail -40 > /tmp/build.log; echo EXIT=$?` — **nunca** `up --no-cache`. Leer `/tmp/build.log` con un `cat` posterior si EXIT≠0.
  - `run`: `docker compose up -d && sleep 5 && curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/`.
  - `open_ufw`: `ufw allow 80/tcp` (idempotente).
- **Expected observation if it worked:** `run` reporta 200 (o 3xx) desde dentro del guest.
- **Expected observation if it failed:** `build` EXIT≠0 (log tiene el error de compilación) o `run` devuelve 000/502.
- **Most likely cause of failure:** app del cliente escucha solo en localhost dentro del contenedor, o el puerto interno declarado no coincide con `appPort`.
- **Countermove:** si `run` da 000 con build OK: `docker compose logs --tail 30 web` al detalle del paso y marcar `error` con ese log — es un bug del app del cliente, no del pipeline; el frontend debe mostrarlo legible.
- **Downstream consequences:** si `run` falla, NO ejecutar Moves de red/DNS/TLS (dejarían un dominio apuntando a un 502).

### Move 5: Paso `nat_node` — DNAT en el nodo Proxmox
- **Action:** Desde el backend (usuario `admin` del edge) por SSH con la llave del Move 1:
  ```bash
  ssh -i /home/admin/.ssh/panel_nodes root@<nodoIP> "
    iptables -t nat -C PREROUTING -p tcp --dport <8000+VMID> -j DNAT --to-destination <guestIP>:80 2>/dev/null || {
      iptables -t nat -A PREROUTING -p tcp --dport <8000+VMID> -j DNAT --to-destination <guestIP>:80
      iptables -t nat -A POSTROUTING -p tcp -d <guestIP> --dport 80 -j MASQUERADE
      iptables -A FORWARD -p tcp -d <guestIP> --dport 80 -j ACCEPT
      iptables-save > /etc/iptables/rules.v4
    }"
  ```
  (`-C` primero = idempotencia; el MASQUERADE es obligatorio por el anti-spoofing de pfSense documentado.) Además fijar la IP del guest en DHCP **solo si no existe ya**: `grep -q '<guestIP>' /etc/dnsmasq.d/vps-static.conf || { echo 'dhcp-host=<MAC>,<guestIP>' >> /etc/dnsmasq.d/vps-static.conf && systemctl restart dnsmasq; }` — el grep previo es OBLIGATORIO (duplicado = dnsmasq muerto = sin DHCP para todos los guests del nodo).
- **Expected observation if it worked:** desde el edge: `curl -s -o /dev/null -w '%{http_code}' http://<nodoIP>:<8000+VMID>/` → 200.
- **Expected observation if it failed:** 000/timeout desde el edge.
- **Most likely cause de failure:** UFW del guest (¿corrió `open_ufw`?) o la IP del guest cambió entre `wait_ip` y ahora.
- **Countermove:** re-leer IP vía agente; verificar `ufw status` vía agente; verificar regla con `iptables -t nat -L PREROUTING -n | grep <puerto>`. En pve (no pvececyte) puede no existir `/etc/iptables/`: instalar iptables-persistent (Move 1.5).
- **Downstream consequences:** el puerto `<8000+VMID>` queda reservado de por vida para ese VMID; al destruir la VM, el DELETE debe borrar la regla (`iptables -t nat -D ...` + save).

### Move 6: Paso `dns` + `tls` — DuckDNS/dominio propio y cert en el edge
- **Action:**
  - Instalar acme.sh en el edge UNA vez (requiere OK explícito del usuario para `curl https://get.acme.sh | sh` — pedirlo si no está): como root del edge, `curl -s https://get.acme.sh | sh -s email=<email-plataforma>`.
  - Caso `duckdns` con token del cliente o de la plataforma: `POST https://www.duckdns.org/update?domains=<name>&token=<token>&ip=207.248.113.8` → respuesta literal `OK`. Cert: `DuckDNS_Token=<token> /root/.acme.sh/acme.sh --issue --dns dns_duckdns -d <name>.duckdns.org` (tarda ~90-150 s por la propagación; correr con timeout 300 s).
  - Caso `custom` (dominio propio): instruir al cliente (pantalla del frontend): crear registro A → `207.248.113.8`. El paso `dns` pollea `nslookup <fqdn>` hasta que resuelva a esa IP (timeout 10 min, reintentable). Cert por **HTTP-01 webroot** (WAN:80→edge ya verificado): `mkdir -p /var/www/acme` + location compartido en nginx (`location /.well-known/acme-challenge/ { root /var/www/acme; }` añadido al server :80 existente) y `acme.sh --issue -w /var/www/acme -d <fqdn>`.
  - Instalar SIEMPRE con hook de recarga: `acme.sh --install-cert -d <dominio> --fullchain-file /etc/nginx/ssl/<dominio>/fullchain.pem --key-file /etc/nginx/ssl/<dominio>/key.pem --reloadcmd "systemctl reload nginx"` → renovación automática queda resuelta (a diferencia del cert de pachucacv que hoy se copia a mano).
- **Expected observation if it worked:** acme.sh imprime `Cert success.` y deja archivos en `/etc/nginx/ssl/<dominio>/`.
- **Expected observation if it failed:** DuckDNS responde `KO` (token/nombre mal); acme.sh `Verify error` (HTTP-01: el dominio no apunta aún a la WAN); `Domain limit` de cuenta DuckDNS (máx 5).
- **Most likely cause of failure:** para duckdns de plataforma, el límite de 5 dominios (ya hay 2 usados); para custom, propagación DNS lenta.
- **Countermove:** límite DuckDNS → pedir al cliente su propio token DuckDNS (gratis, se registra con Google/GitHub en 1 min; el frontend lo explica) o dominio propio. Propagación → el paso es reintentable sin efectos secundarios (acme.sh es idempotente).
- **Downstream consequences:** el backend corre como `admin` y acme.sh/nginx son de root → Move 7 crea el puente sudoers ANTES de que este paso pueda automatizarse.

### Move 7: Paso `edge_vhost` + puente sudo mínimo + frontend
- **Action:**
  1. Script raíz `/usr/local/sbin/panel-vhost` (root:root 755) en el edge: recibe `add <dominio> <nodoIP> <puerto>` | `remove <dominio>` | `cert-duckdns <name> <tokenfile>` | `cert-http01 <fqdn>`. Valida `<dominio>` con regex `^[a-z0-9.-]+$` y **rechaza** `capuvps.duckdns.org` y `pachucacv.duckdns.org` (protege producción). `add` escribe `/etc/nginx/sites-available/<dominio>` con la plantilla probada:
     ```nginx
     server {
         listen 443 ssl http2;
         server_name <dominio>;
         ssl_certificate     /etc/nginx/ssl/<dominio>/fullchain.pem;
         ssl_certificate_key /etc/nginx/ssl/<dominio>/key.pem;
         ssl_protocols       TLSv1.2 TLSv1.3;
         location / {
             proxy_pass http://<nodoIP>:<puerto>;
             proxy_set_header Host $host;
             proxy_set_header X-Real-IP $remote_addr;
             proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
             proxy_set_header X-Forwarded-Proto https;
         }
     }
     ```
     luego `ln -sf`, `nginx -t` y **solo si `nginx -t` pasa** `systemctl reload nginx`; si falla, borra el symlink y sale ≠0 (nunca dejar nginx roto).
  2. Sudoers: `echo 'admin ALL=(root) NOPASSWD: /usr/local/sbin/panel-vhost' > /etc/sudoers.d/panel-vhost && visudo -c`. El backend solo llama `sudo /usr/local/sbin/panel-vhost ...` — superficie mínima.
  3. Frontend: página "Desplegar mi WebApp" (wizard de 3 pantallas): (a) origen — campo URL git público O botón subir zip; (b) dominio — radio "subdominio gratis .duckdns.org" (campo nombre + link "crea tu token en duckdns.org" con campo token) / "mi propio dominio" (muestra la IP 207.248.113.8 para el registro A); (c) progreso — lista de pasos con spinner/check/error desde `GET /api/deploys/:id`, y al final la URL clickeable + credenciales del VPS. Textos en español, sin jerga (no decir "DNAT", decir "conectando tu dominio").
- **Expected observation if it worked:** `sudo -u admin sudo /usr/local/sbin/panel-vhost add test.example 192.168.1.254 8300` crea el vhost y nginx recarga; `panel-vhost remove test.example` lo revierte limpio. El build del frontend (`npm run build` en `/opt/vps-panel/frontend`) pasa y la página aparece tras login.
- **Expected observation if it failed:** `nginx -t` falla (plantilla mal renderizada) o sudoers pide password.
- **Most likely cause of failure:** escaping de las variables `$host` etc. al generar la plantilla desde node (usar template literal con `\$` NO — escribir el archivo con las `$` literales; en JS son inofensivas dentro de comillas simples/plantilla sin `${}`).
- **Countermove:** si `nginx -t` falla el script ya auto-revierte; inspeccionar `/etc/nginx/sites-available/<dominio>` generado y comparar con el vhost funcional de pachucacv.
- **Downstream consequences:** con `panel-vhost` en su lugar, los pasos `edge_vhost`/`tls` del pipeline son una sola llamada `execFile('sudo', [...])` desde node.

### Move 8: systemd para el backend (hardening obligatorio)
- **Action:** El backend hoy muere en cada reboot del edge. Crear `/etc/systemd/system/vps-panel.service`:
  ```ini
  [Unit]
  Description=VPS Panel API
  After=network.target
  [Service]
  User=admin
  WorkingDirectory=/opt/vps-panel/backend
  ExecStart=/usr/bin/node src/server.js
  Restart=always
  RestartSec=5
  [Install]
  WantedBy=multi-user.target
  ```
  Luego: matar el proceso suelto (`pkill -u admin -f 'node src/server.js'`), `systemctl daemon-reload && systemctl enable --now vps-panel`, y verificar `curl -s 127.0.0.1:3001/api/nodes -o /dev/null -w '%{http_code}'` (401 esperado = vivo con auth).
- **Expected observation if it worked:** `systemctl is-active vps-panel` → `active`; el panel en `https://capuvps.duckdns.org/` sigue logueando.
- **Expected observation if it failed:** `status=1` en el journal — normalmente falta el `.env` (config.js hace `process.exit(1)` si falta una variable).
- **Most likely cause of failure:** el `.env` está en `/opt/vps-panel/backend/.env` y systemd sí lo carga (dotenv lo lee por WorkingDirectory) — pero si estaba en el entorno de la shell de `admin` y no en `.env`, el servicio no arranca.
- **Countermove:** `journalctl -u vps-panel -n 20` dirá qué variable falta; copiarla al `.env`. Mantener el proceso viejo corriendo hasta que el servicio esté `active` (arrancarlo en un puerto de prueba NO: mismo puerto — hacer el switch rápido y verificar).
- **Downstream consequences:** sin esto, cualquier reboot del edge deja el panel caído y el pipeline entero inoperante desde WAN.

### Move 9: Prueba end-to-end desde WAN con cliente simulado
- **Action:** Desde una red externa (o simulando: browser → `https://capuvps.duckdns.org/`), login al panel, wizard: repo de prueba público con Dockerfile simple (crear `https://github.com/<cuenta>/hello-vps` con un `index.html` — cubre la ruta estática), subdominio DuckDNS de prueba con el token de plataforma (cuenta el 3.º de 5 — borrarlo en duckdns.org al terminar), esperar el progreso hasta `verify: ok`.
  Verificación externa: `curl -s https://<nombre>.duckdns.org/ -o /dev/null -w '%{http_code} %{ssl_verify_result}'` → `200 0`, y regresión: capuvps y pachucacv siguen 200.
- **Expected observation if it worked:** los tres dominios responden 200 con TLS válido; `data/deploys.json` registra todos los pasos `ok`.
- **Expected observation if it failed:** cualquier paso en `error` con su detail; o regresión en producción.
- **Most likely cause of failure:** primera ejecución integrada — errores de pegamento (nombres de campos, orden de pasos), no conceptuales.
- **Countermove:** cada paso es re-ejecutable individualmente por diseño (idempotencia con `-C` en iptables, `ln -sf`, acme.sh, `docker compose up -d`). Añadir `POST /api/deploys/:id/retry` que reanuda desde el primer paso ≠ ok.
- **Downstream consequences:** al pasar, documentar en `wargames/MANUAL-deploy-clientes.md`: URL del wizard, límites (DuckDNS 5, tamaño zip, repos públicos solamente), y cómo borrar un deploy (VM + regla NAT + vhost + DNS).

## Unresolved assumptions

- **Contraseña del panel** (`config.panelPassword` en el `.env` del backend): necesaria para probar la API desde WAN. La tiene el dueño del panel; el executor debe pedirla (no está en ningún archivo del repo local).
- **SSH WAN al edge**: se desconoce si el puerto 2202 (u otro) de pfSense apunta hoy a 192.168.1.34:22 tras la migración desde 192.168.1.33. Verificar con `ssh -p 2202 devops@207.248.113.8`; si no, el executor necesita al operador para los Moves 1, 7.1-7.2 y 8 (todo lo que es shell en el edge).
- **Dominios DuckDNS libres en la cuenta de plataforma**: límite 5, hay ≥2 usados; el total actual solo se ve logueado en duckdns.org (cuenta del usuario).
- **pvelenovo (192.168.1.15)**: en nodes.json pero caído (HTTP 000). ¿Se incluye cuando reviva? El pipeline lo soporta sin cambios si su template 9000 y su subred están montados igual — verificar cuando esté arriba.
- **Nodo hyperv (aulamedios)**: excluido de v1 (sin qemu-agent; su agente REST no tiene exec). Decidir si se implementa un `agentExec` equivalente en el agente Hyper-V o se excluye permanentemente del wizard.
- **Multi-tenancy**: hoy hay UNA contraseña de panel — cualquier cliente logueado ve TODOS los VPS y credenciales. Para clientes reales sin confianza mutua hace falta auth por cuenta (fuera del alcance de este war-game; decisión de producto del dueño).
- **Límite de tamaño del zip**: definir (sugerido 200 MB) según disco libre del edge en `/opt/vps-panel/backend/data/uploads` — verificar `df -h /` en el edge antes de fijarlo.

## Abort conditions

- `https://capuvps.duckdns.org/` o `https://pachucacv.duckdns.org/` dejan de responder 200 en cualquier verificación → detener, revertir el último cambio (el vhost/symlink más reciente, `panel-vhost remove`), verificar recuperación, reportar.
- `nginx -t` falla en el edge y el auto-revert del script no lo recupera → NO tocar más nginx; reportar con el output completo.
- dnsmasq de un nodo queda `failed` tras un cambio → revertir la línea añadida en `/etc/dnsmasq.d/vps-static.conf`, `systemctl restart dnsmasq`, confirmar `active`; si no revive, reportar YA (sin DHCP los guests del nodo pierden red al renovar lease).
- Cualquier paso pide reiniciar pfSense o un nodo Proxmox → PROHIBIDO SIEMPRE; buscar countermove o reportar.
- El backend (`systemctl status vps-panel` o el proceso suelto) no revive tras un cambio y el panel queda inaccesible desde WAN → restaurar el lanzamiento manual (`sudo -u admin bash -c 'cd /opt/vps-panel/backend && nohup node src/server.js &'`) y reportar antes de seguir.
- Los tokens/contraseñas NUNCA se escriben en campos de formularios web ni se commitean en texto plano (convención del repo: REDACTED).
