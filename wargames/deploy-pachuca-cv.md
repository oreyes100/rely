# War-game: Deploy de pachuca.cv-landing en VPS misfinanzas (VMID 300) + nombre DuckDNS
> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.

## Mission objective
Dejar la landing **pachuca.cv-landing** (Astro 5 SSR, `C:\vpsserver\pachuca.cv-landing`) corriendo en el VPS **misfinanzas** (VMID 300, nodo pvececyte), accesible públicamente por HTTPS en **https://pachucacv.duckdns.org:8443/** (nombre creado en DuckDNS apuntando a la WAN 207.248.113.8), con SSH del VPS expuesto en WAN:2300. Éxito medible: (1) `curl -sk https://pachucacv.duckdns.org:8443/` desde fuera de la red devuelve HTTP 200 con el HTML de la landing; (2) `ssh -p 2300 devops@207.248.113.8` entra al VPS; (3) el formulario "apply" guarda en MongoDB local del VPS; (4) nada de la infraestructura existente (capuvps 192.168.1.33, panel, reglas NAT previas) se degrada.

## Recon summary
Verificado el 2026-07-18 desde la máquina operadora (Windows 11, IP LAN **192.168.1.229**, Git Bash disponible):

**Proyecto** (`C:\vpsserver\pachuca.cv-landing`, sin git propio, sin `.env`):
- Astro 5.7.5 SSR (`output: 'server'`, adapter `@astrojs/node` standalone, `srcDir: app`), React 19, Tailwind 4. Sirve en puerto **4321**. `astro.config.ts` tiene `site: 'https://www.pachuca.vc'`.
- `Dockerfile` existente: `node:lts`, recibe como **build args** `MONGO_URI` y `R2_*`, hace `npm install && npm run build`, expone 4321, `CMD node ./dist/server/entry.mjs`.
- `app/lib/db.ts` hace `new MongoClient(import.meta.env.MONGO_URI)` **a nivel de módulo**: si `MONGO_URI` falta en el BUILD, el servidor crashea al arrancar. Se necesita en build Y runtime.
- `app/actions/index.ts` usa `process.env.R2_*` (Cloudflare R2) solo para subir documentos del formulario (acta de nacimiento / certificado médico). Sin R2 el sitio funciona; solo la subida de archivos falla.
- **No existen credenciales reales de Mongo ni R2 en el repo** (secretos redactados en commit 55a8bde). Decisión tomada: MongoDB local en contenedor en el VPS (db `pcv`); R2 queda sin configurar (modo degradado, ver Unresolved assumptions).

**VPS destino**: misfinanzas, VMID **300**, nodo **pvececyte** (192.168.1.254:8006, Proxmox 8.4). Usuario cloud-init `devops`, password `[REDACTED - verla en el panel → Credenciales (misfinanzas), o la aporta el operador]`. IP por DHCP en 192.168.7.100-199. Template 9000 "devstack": cloud-init instala Docker (get.docker.com, incluye `docker compose`), Node 22, Python; `ssh_pwauth: true` (SSH por contraseña funciona). Primer arranque tarda 3-5 min instalando el stack.

**Red del nodo pvececyte**: los VPS cuelgan del bridge interno **vmbr7** (gateway = el propio nodo, 192.168.7.1). DHCP lo da **dnsmasq en el nodo** (leases: `/var/lib/misc/dnsmasq.leases`; reservas estáticas: `/etc/dnsmasq.d/vps-static.conf`). Hay tabla nftables **`inet vpsgw7`** con masquerade de salida y **drops de aislamiento** VPS→LAN (192.168.0.0/22) y VPS→otras subredes. Todo tráfico WAN→VPS pasa: pfSense WAN → 192.168.1.254 → DNAT del nodo → VPS.

**pfSense**: WAN estática **207.248.113.8**. GUI: https://192.168.1.1/ (o https://207.248.113.8:8444/, sesión en Chrome). SSH verificado HOY: `ssh -i C:\Users\User\.ssh\pfsense_admin -p 2223 admin@192.168.1.1` (ejecuta comandos directo). NAT actual (bloque `<nat>` en `/cf/conf/config.xml`, líneas ~1393-1511):
- 8091→192.168.1.4:443 (Panel VPS), 8090→192.168.1.33:8443 (capuvps PROD), **443→192.168.1.33:443 (PROD)**, **80→192.168.1.33:80 (PROD)**, 2202→192.168.1.4:2202, 2210→192.168.1.254:2210. WAN 8444 = GUI pfSense.
- **Consecuencia: 80 y 443 públicos están OCUPADOS por producción (capuvps.duckdns.org, "NO tocar")** → la landing sale por WAN **8443** y el SSH por WAN **2300** (convención 2000+VMID, como 2202/2210).
- NAT reflection: usar `natreflection=enable` (PFREFLECT). `purenat` NO funciona en esta topología.

**Accesos verificados HOY desde la máquina operadora**:
- `ssh -i C:\Users\User\.ssh\id_ed25519 root@192.168.1.4` (pve) ✔
- `ssh root@192.168.1.254` (pvececyte): **ninguna llave local funciona** ✘ → bootstrap vía consola GUI de Proxmox en Chrome (sesión logueada, extensión Claude in Chrome).
- Panel VPS: ahora corre en **VM 210 en pve, IP 192.168.1.34** (¡ya no en 192.168.6.152!; vps-demo 202 está APAGADO). Password del panel fue rotada y es desconocida — **no se necesita para esta misión**.
- Llave pública local a instalar donde haga falta: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2LuZMAMCdgUCCQnp4vKKqcCI233o+c3p6Yn61pHTLu user@DESKTOP-6SKF6QM`

**DuckDNS**: el usuario ya tiene cuenta (login OAuth en duckdns.org, sesión de Google en Chrome). Los subdominios no admiten puntos → "pachuca.cv" se materializa como **`pachucacv.duckdns.org`** (fallback `pachuca-cv`). Apuntar a 207.248.113.8 (estática; no hace falta cron de actualización). El token DuckDNS (visible en la página tras login) se usa para el certificado Let's Encrypt vía **DNS-01** (`acme.sh --dns dns_duckdns`), imprescindible porque el puerto 80 público está ocupado y HTTP-01 es imposible.

**Lección previa aplicable**: nginx de Ubuntu 24.04 es 1.24 → la directiva `http2 on;` NO existe (es de 1.25.1+). Usar `listen 443 ssl http2;`.

## Moves

### Move 1: Bootstrap de acceso SSH root a pvececyte (vía GUI Proxmox en Chrome)
- **Action:** Cargar las herramientas de Claude in Chrome (ToolSearch `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp`). Abrir https://192.168.1.254:8006/, confirmar sesión activa (se ve el árbol Datacenter→pvececyte). Abrir nodo **pvececyte → Shell** (xterm.js) y teclear:
  ```
  mkdir -p /root/.ssh && echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIF2LuZMAMCdgUCCQnp4vKKqcCI233o+c3p6Yn61pHTLu user@DESKTOP-6SKF6QM' >> /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys
  ```
  Luego, desde la máquina operadora (Git Bash): `ssh -i /c/Users/User/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new root@192.168.1.254 hostname`.
- **Expected observation if it worked:** el ssh devuelve `pvececyte`.
- **Expected observation if it failed:** GUI pide login (sesión caducada), o el ssh sigue dando `Permission denied (publickey,password)`.
- **Most likely cause of failure:** sesión de Chrome caducada (la memoria de sesiones tiene 7 días), o typo en la llave pegada en la consola xterm (el paste en xterm.js a veces se come caracteres — teclear con `computer type` en bloques cortos y verificar con `cat /root/.ssh/authorized_keys`).
- **Countermove:** si la sesión caducó, probar la GUI espejo https://207.248.113.8:8444 → no aplica (es pfSense); en su lugar PARAR y pedir al usuario la contraseña root de pvececyte o que se loguee en la GUI. Si el ssh falla tras pegar la llave, en la misma consola: `cat -A /root/.ssh/authorized_keys` y corregir la línea (borrarla con `sed -i '$d'` y repetir en trozos de ~40 caracteres).
- **Downstream consequences:** TODOS los movimientos 2-6 y 9 dependen de este acceso. Sin él la misión completa se ejecuta por consola GUI (lento y frágil) — mejor abortar y pedir acceso.

### Move 2: Diagnóstico del estado real del deploy (VM 300)
- **Action:** por SSH a root@192.168.1.254:
  ```
  qm list                                   # ¿existe 300? ¿running?
  qm config 300 | grep -E 'net0|cores|memory|ipconfig'
  qm agent 300 network-get-interfaces 2>/dev/null | grep -o '"ip-address" : "192\.168\.7\.[0-9]*"'
  qm guest exec 300 -- bash -c 'cloud-init status; command -v docker node; free -m | head -2; df -h / | tail -1' 2>/dev/null
  ```
  Anotar: **VPS_IP** (192.168.7.1xx), MAC de net0, RAM y estado de cloud-init. Este snapshot ES el "análisis del estado del deploy" pedido: repórtalo en el informe final (VM creada por el panel; nada de la app está desplegado aún — el deploy de la landing empieza de cero).
- **Expected observation if it worked:** `status: running`, una IP 192.168.7.1xx, `cloud-init status: done`, docker y node presentes.
- **Expected observation if it failed:** VM `stopped`; o agente no responde (`QEMU guest agent is not running`); o `cloud-init status: running` (primer arranque aún instalando); o `error`.
- **Most likely cause of failure:** primer arranque todavía instalando el stack (tarda 3-5 min; si la VM se creó hace poco, esperar) o VM apagada tras un apagado del host.
- **Countermove:** si `stopped` → `qm start 300` y esperar 3 min. Si el agente no responde tras 10 min → `qm terminal 300` (salir con Ctrl+O) y mirar la consola; revisar `/var/log/cloud-init-output.log` dentro de la VM (login devops por consola). Si cloud-init terminó pero falta docker → instalarlo a mano en Move 4 (`curl -fsSL https://get.docker.com | sh`). Si la VM 300 NO existe → abortar y reportar (re-aprovisionar requiere el panel, cuya password se desconoce).
- **Downstream consequences:** VPS_IP y la MAC alimentan los Moves 3, 6 y 9. Si RAM < 4096 MB, el Move 6 DEBE crear swap antes del build (el build de Astro+Vite puede OOM).

### Move 3: Fijar la IP del VPS (reserva DHCP estática)
- **Action:** en root@192.168.1.254, con la MAC de net0 (formato `AA:BB:...`) y la VPS_IP actual del Move 2:
  ```
  echo "dhcp-host=<MAC>,<VPS_IP>" >> /etc/dnsmasq.d/vps-static.conf
  systemctl restart dnsmasq && systemctl is-active dnsmasq
  ```
  (Se reserva la IP ACTUAL — sin renumerar, sin reiniciar la VM.)
- **Expected observation if it worked:** `active`; `grep <MAC> /etc/dnsmasq.d/vps-static.conf` muestra la línea.
- **Expected observation if it failed:** dnsmasq `failed` tras el restart.
- **Most likely cause of failure:** typo en la línea (dnsmasq no arranca con sintaxis inválida y deja a TODOS los VPS del nodo sin DHCP futuro).
- **Countermove:** `journalctl -u dnsmasq -n 5`, corregir o borrar la línea añadida (`sed -i '$d' /etc/dnsmasq.d/vps-static.conf`), restart de nuevo. Verificar SIEMPRE `is-active` antes de continuar.
- **Downstream consequences:** sin reserva, un reboot del VPS puede cambiar la IP y romper silenciosamente los DNAT del Move 9 (síntoma futuro: timeout en 2300/8443 con todo lo demás sano).

### Move 4: Acceso directo al VPS y preparación
- **Action:** desde la máquina operadora, todo por ProxyJump (no depende de pfSense):
  ```
  ssh -o ProxyJump=root@192.168.1.254 devops@<VPS_IP>   # password: la de devops (panel → Credenciales)
  ```
  (Para no teclear password en cada paso: `ssh-copy-id -o ProxyJump=root@192.168.1.254 -i /c/Users/User/.ssh/id_ed25519.pub devops@<VPS_IP>`.) Dentro del VPS:
  ```
  sudo -n true && echo SUDO-OK          # devops debe tener sudo
  docker --version && docker compose version
  free -m | awk '/Mem:/{print $2}'      # si < 4096:
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  ```
- **Expected observation if it worked:** shell en el VPS, `SUDO-OK`, Docker ≥ 24 con plugin compose, swap activo si hizo falta.
- **Expected observation if it failed:** ProxyJump rechaza password (¿teclado/escape de `!` y `#` en la password? — pasarla interactiva, no en línea de comandos); o `docker: command not found`.
- **Most likely cause of failure:** cloud-init aún corriendo (volver a Move 2 y esperar) o password mal tecleada (16 chars, con `!` y `#` — teclearla interactiva, nunca en línea de comandos).
- **Countermove:** si docker falta y cloud-init ya terminó: `curl -fsSL https://get.docker.com | sh && sudo usermod -aG docker devops` (relogin). Si el password no entra tras 3 intentos exactos, resetearla vía `qm guest exec 300 -- bash -c "echo 'devops:NuevaPass123!' | chpasswd"` desde pvececyte y reportar la nueva al usuario.
- **Downstream consequences:** el swap evita el OOM del build en Move 6; el ssh-copy-id hace el resto de moves no interactivos.

### Move 5: Ajustar el proyecto localmente, empaquetar y transferir
- **Action:** en la máquina operadora:
  1. En `C:\vpsserver\pachuca.cv-landing\astro.config.ts`: cambiar `site: 'https://www.pachuca.vc'` → `site: 'https://pachucacv.duckdns.org:8443'` (canónicas/sitemap correctos).
  2. En `app/actions/index.ts`: blindar el cliente S3 para que la ausencia de R2 no tire el server: `endpoint: process.env.R2_ENDPOINT || undefined,` (solo esa línea).
  3. Empaquetar y subir (Git Bash):
  ```
  cd /c/vpsserver/pachuca.cv-landing
  tar czf /c/Users/User/AppData/Local/Temp/landing.tgz --exclude=node_modules --exclude=.astro --exclude=dist .
  scp -o ProxyJump=root@192.168.1.254 /c/Users/User/AppData/Local/Temp/landing.tgz devops@<VPS_IP>:/home/devops/
  ssh -o ProxyJump=root@192.168.1.254 devops@<VPS_IP> 'mkdir -p ~/pachuca-landing && tar xzf ~/landing.tgz -C ~/pachuca-landing && ls ~/pachuca-landing/package.json'
  ```
- **Expected observation if it worked:** `package.json` listado en el destino; el tgz pesa ~2-8 MB (sin node_modules).
- **Expected observation if it failed:** scp cuelga o el tgz pesa >100 MB.
- **Most likely cause of failure:** tgz gigante = olvidó los `--exclude` (node_modules); scp colgado = ProxyJump sin la llave del Move 4.
- **Countermove:** rehacer el tar con excludes; para scp, repetir con `-i /c/Users/User/.ssh/id_ed25519` explícito en ambos saltos (`-o ProxyJump="root@192.168.1.254"` usa la misma llave por defecto).
- **Downstream consequences:** el cambio de `site` afecta el HTML generado en Move 6 — hacerlo ANTES de transferir, no después.

### Move 6: Levantar el stack (MongoDB + landing) con Docker Compose
- **Action:** en el VPS, crear `/home/devops/pachuca-landing/compose.yaml`:
  ```yaml
  services:
    mongo:
      image: mongo:7
      restart: unless-stopped
      volumes:
        - mongo-data:/data/db
    web:
      build:
        context: .
        args:
          MONGO_URI: mongodb://mongo:27017
      restart: unless-stopped
      environment:
        MONGO_URI: mongodb://mongo:27017
      ports:
        - "127.0.0.1:4321:4321"
      depends_on:
        - mongo
  volumes:
    mongo-data:
  ```
  (NO pasar args R2_* — vacíos rompen el constructor del S3Client; ausentes + el parche del Move 5 = arranque limpio.) Luego:
  ```
  cd ~/pachuca-landing && docker compose up -d --build     # build tarda 3-8 min
  docker compose ps
  curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4321/
  curl -s http://127.0.0.1:4321/ | grep -io '<title>[^<]*' | head -1
  ```
- **Expected observation if it worked:** ambos contenedores `Up`; curl devuelve `200` y un `<title>` de la landing.
- **Expected observation if it failed:** `web` en estado `Restarting`; o el build muere (exit code 137 = OOM; error de npm; "Killed").
- **Most likely cause of failure:** (a) OOM en `npm run build` → faltó el swap del Move 4; (b) crash al arrancar por `MONGO_URI` — el arg no llegó al build (verificar que el Dockerfile tiene `ARG MONGO_URI` ANTES de `RUN npm run build`; lo tiene); (c) red de Docker sin DNS para npm (raro; los VPS salen a internet vía masquerade del nodo).
- **Countermove:** (a) activar swap y `docker compose build --no-cache web`; (b) `docker compose logs web --tail 30` — si menciona MongoClient/connection string, rehacer build confirmando el arg; (c) si npm no resuelve, en el VPS `docker run --rm busybox nslookup registry.npmjs.org` y si falla revisar en el nodo `nft list table inet vpsgw7` (el masquerade debe cubrir a los contenedores igual que al VPS, porque salen con la IP del VPS). El formulario "apply" se prueba: `curl -s -X POST http://127.0.0.1:4321/_actions/apply -F name=test ...` no es necesario — basta verificar en el navegador al final (Move 10).
- **Downstream consequences:** el sitio queda escuchando SOLO en 127.0.0.1:4321; nginx (Move 8) es quien lo expone. Si este move falla, los Moves 7-9 pueden avanzar igual (DNS/NAT no dependen de la app), pero NO cerrar la misión sin resolverlo.

### Move 7: Crear el nombre en DuckDNS y capturar el token (Chrome)
- **Action:** con Claude in Chrome: abrir https://www.duckdns.org/. Si no hay sesión, click en "Sign in with Google" (la sesión de Google del usuario existe; es re-login a cuenta ya existente — si Google muestra una pantalla de consentimiento OAuth NUEVA, parar y confirmar con el usuario). Ya dentro:
  1. En "sub domain" teclear `pachucacv` → botón **add domain**.
  2. En la fila creada, poner IP `207.248.113.8` y **update ip** (la auto-detectada debería ser ya esa, porque la LAN sale por esa WAN — verificar).
  3. Copiar el **token** (arriba de la página) y guardarlo en el VPS: `ssh ... devops@<VPS_IP> 'umask 077; echo TOKEN > ~/.duckdns-token'`.
  4. Verificar desde la máquina operadora: `nslookup pachucacv.duckdns.org 8.8.8.8` → 207.248.113.8.
- **Expected observation if it worked:** la fila `pachucacv` aparece con current ip 207.248.113.8; nslookup resuelve a esa IP (propagación DuckDNS es inmediata; TTL 60s).
- **Expected observation if it failed:** "domain taken" al añadir; o nslookup devuelve NXDOMAIN/otra IP.
- **Most likely cause of failure:** nombre ocupado por otro usuario de DuckDNS.
- **Countermove:** probar `pachuca-cv`; si también está tomado, abortar este move y preguntar al usuario qué nombre quiere (actualizar los Moves 8-10 con el nombre final en TODAS las apariciones). Si nslookup da otra IP, corregir el campo ip y re-update.
- **Downstream consequences:** el nombre elegido aparece en: cert (Move 8), nginx `server_name` (Move 8), `site` de astro.config (¡rehacer Move 5.1 + rebuild si cambió!), verificación (Move 10).

### Move 8: TLS (Let's Encrypt DNS-01 con token DuckDNS) + nginx en el VPS
- **Action:** en el VPS (sudo -i):
  ```
  apt-get update && apt-get install -y nginx
  curl https://get.acme.sh | sh -s email=samualepi@gmail.com
  export DuckDNS_Token="$(cat /home/devops/.duckdns-token)"
  /root/.acme.sh/acme.sh --issue --dns dns_duckdns -d pachucacv.duckdns.org --server letsencrypt
  mkdir -p /etc/ssl/pachucacv
  /root/.acme.sh/acme.sh --install-cert -d pachucacv.duckdns.org \
    --fullchain-file /etc/ssl/pachucacv/fullchain.pem \
    --key-file /etc/ssl/pachucacv/key.pem \
    --reloadcmd "systemctl reload nginx"
  ```
  Crear `/etc/nginx/sites-available/pachucacv` (y symlink en sites-enabled, borrar `default`):
  ```nginx
  server {
      listen 443 ssl http2;
      server_name pachucacv.duckdns.org;
      ssl_certificate     /etc/ssl/pachucacv/fullchain.pem;
      ssl_certificate_key /etc/ssl/pachucacv/key.pem;
      client_max_body_size 25m;
      location / {
          proxy_pass http://127.0.0.1:4321;
          proxy_set_header Host $host;
          proxy_set_header X-Forwarded-Proto https;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      }
  }
  ```
  `nginx -t && systemctl reload nginx`, luego `curl -sk https://127.0.0.1/ -H 'Host: pachucacv.duckdns.org' -o /dev/null -w '%{http_code}\n'` → 200.
- **Expected observation if it worked:** acme.sh imprime "Cert success"; `nginx -t` OK; curl local 200.
- **Expected observation if it failed:** acme.sh se queda en "Checking dns record" y falla; o `nginx: [emerg] unknown directive "http2"` si se usó `http2 on;`.
- **Most likely cause of failure:** (a) token DuckDNS mal copiado (espacios/nueva línea); (b) propagación TXT lenta (raro en DuckDNS pero posible).
- **Countermove:** (a) verificar el token con `curl "https://www.duckdns.org/update?domains=pachucacv&token=$DuckDNS_Token&txt=test&verbose=true"` → debe responder `OK`; si `KO`, recopiar token en Move 7.3. (b) reintentar el `--issue` con `--dnssleep 120`. Tras 2 fallos, añadir `--staging` para depurar sin quemar rate limits de Let's Encrypt (5 certs fallidos/hora); al lograr staging, quitar `--staging` y `--issue --force`. NUNCA usar `http2 on;` (nginx 1.24). Como último recurso (>4 fallos): cert autofirmado (`openssl req -x509 ...`) para no bloquear el Move 9, y reportar el pendiente.
- **Downstream consequences:** acme.sh instala su cron de renovación (usa el mismo token DNS-01: la renovación NO depende de puertos abiertos — correcta a largo plazo). El puerto 80 del VPS queda sin uso público (WAN 80 es de producción): no configurar redirect 80→443 en WAN, es inalcanzable.

### Move 9: Publicar en WAN — DNAT en pvececyte + reglas NAT en pfSense (2300 y 8443)
- **Action:** dos capas, en este orden:
  **(a) pvececyte** (root@192.168.1.254). Primero inspeccionar cómo está hecho el forward existente del 2210: `iptables-save -t nat | grep 2210; nft list ruleset | grep 2210; grep -rn 2210 /etc/iptables /etc/nftables.conf /root/*.sh /etc/rc.local 2>/dev/null`. **Replicar exactamente ese patrón** para los nuevos puertos; si el patrón es iptables (lo esperado, como en pve):
  ```
  iptables -t nat -A PREROUTING -p tcp --dport 2300 -j DNAT --to-destination <VPS_IP>:22
  iptables -t nat -A PREROUTING -p tcp --dport 8443 -j DNAT --to-destination <VPS_IP>:443
  iptables -t nat -A POSTROUTING -p tcp -d <VPS_IP> -m multiport --dports 22,443 -j MASQUERADE
  iptables -A FORWARD -p tcp -d <VPS_IP> -m multiport --dports 22,443 -j ACCEPT
  ```
  Persistir igual que el 2210 (si existe `/etc/iptables/rules.v4`: `iptables-save > /etc/iptables/rules.v4`; si fue netfilter-persistent: `netfilter-persistent save`). Probar YA la capa (a) desde la máquina operadora: `ssh -p 2300 devops@192.168.1.254` → debe entrar al VPS (esto NO pasa por pfSense).
  **(b) pfSense** (`ssh -i /c/Users/User/.ssh/pfsense_admin -p 2223 admin@192.168.1.1`):
  ```
  cp /cf/conf/config.xml /cf/conf/config.xml.bak-pachuca
  /usr/local/sbin/pfSsh.php <<'EOF'
  require_once("filter.inc");
  foreach (array(array('p'=>'2300','d'=>'SSH misfinanzas VMID300'),
                 array('p'=>'8443','d'=>'HTTPS pachucacv.duckdns.org VMID300')) as $n) {
    $config['nat']['rule'][] = array(
      'source' => array('any' => ''),
      'destination' => array('network' => 'wanip', 'port' => $n['p']),
      'protocol' => 'tcp', 'target' => '192.168.1.254', 'local-port' => $n['p'],
      'interface' => 'wan', 'natreflection' => 'enable',
      'associated-rule-id' => 'pass', 'descr' => $n['d']);
  }
  write_config("NAT pachucacv 2300/8443");
  filter_configure_sync();
  exec
  EOF
  /etc/rc.filter_configure_sync
  pfctl -s nat | grep -E '2300|8443'
  ```
  (El segundo sync es deliberado: en esta instalación a veces hace falta correrlo dos veces para que la regla aparezca en pfctl.)
- **Expected observation if it worked:** `pfctl -s nat` muestra dos líneas `rdr ... port = 2300/8443 -> 192.168.1.254`. Desde la máquina operadora (vía reflection): `ssh -p 2300 devops@207.248.113.8` entra; `curl -sk https://207.248.113.8:8443/ -H 'Host: pachucacv.duckdns.org' -o /dev/null -w '%{http_code}'` → 200.
- **Expected observation if it failed:** pfctl sin las reglas; o pfSsh.php lanza error PHP; o las reglas existen pero el curl da timeout.
- **Most likely cause of failure:** (1) regla no sincronizada (correr el sync una vez más); (2) capa (a) rota — por eso se prueba ANTES por separado con `-p 2300` directo a 192.168.1.254; (3) el aislamiento nft `vpsgw7` dropea el retorno del tráfico reflejado desde la LAN.
- **Countermove:** para (3): en pvececyte `nft insert rule inet vpsgw7 forward ip daddr <VPS_IP> tcp dport {22,443} accept` y `nft insert rule inet vpsgw7 forward ip saddr <VPS_IP> ct state established,related accept` (insert = antes de los drops; persistir donde viva la tabla — buscar `vpsgw7` en /root/*.sh o /etc/nftables.conf). Si pfSsh.php dio error o pfctl muestra algo raro: **restaurar inmediatamente** `cp /cf/conf/config.xml.bak-pachuca /cf/conf/config.xml && rm -f /tmp/config.cache && /etc/rc.filter_configure_sync` y verificar que los servicios previos (8090, 8091, 443→.33) siguen vivos (`curl -sk https://207.248.113.8:8090/ -o /dev/null -w '%{http_code}'`), luego reportar. NUNCA editar ni reordenar reglas existentes; NUNCA reiniciar pfSense.
- **Downstream consequences:** si la reflection PFREFLECT no funciona para clientes LAN, el sitio SÍ estará bien desde internet — validarlo con el Move 10 (verificación externa) antes de tocar nada más.

### Move 10: Verificación end-to-end + documentación y reporte
- **Action:**
  1. Verificación EXTERNA real (no LAN): WebFetch a `https://pachucacv.duckdns.org:8443/` (la petición sale de infraestructura de Anthropic, no de la LAN). Verificar también `/es/` (versión en español) y que `/aplicar` o `/apply` carga el formulario.
  2. En el navegador del usuario (Chrome): abrir https://pachucacv.duckdns.org:8443/ — candado TLS válido, landing visible.
  3. Prueba funcional del formulario: enviarlo con datos de prueba SIN adjuntar documentos → en el VPS `docker compose exec mongo mongosh pcv --eval 'db.getCollectionNames()'` y confirmar que apareció el registro.
  4. Documentar: añadir a `C:\vpsserver\MANUAL-2-acceso-VPS.md` la entrada de misfinanzas (VMID 300, VPS_IP, `ssh -p 2300 devops@207.248.113.8`, URL pública, ubicación del token DuckDNS). Actualizar la memoria `C:\Users\User\.claude\projects\C--vpsserver\memory\infra-vps-cecytem.md`: panel ahora en VM 210 / 192.168.1.34 (password rotada, desconocida), vps-demo 202 apagado, nueva entrada misfinanzas con puertos 2300/8443, y que root@pvececyte ya acepta la llave id_ed25519.
  5. Reporte final al usuario: URL pública, acceso SSH, estado del deploy encontrado en Move 2, y los pendientes en modo degradado (R2, nombre exacto, puerto :8443 — ver Unresolved assumptions).
- **Expected observation if it worked:** WebFetch devuelve el HTML de la landing con status 200; mongosh muestra la colección con el documento de prueba.
- **Expected observation if it failed:** WebFetch timeout (pero curl por reflection funcionaba en Move 9).
- **Most likely cause of failure:** el ISP/enlace bloquea el puerto 8443 entrante (poco probable: 8090/8091 públicos ya funcionan), o el DNS aún apunta mal.
- **Countermove:** `nslookup pachucacv.duckdns.org 8.8.8.8` de nuevo; probar WebFetch a `https://207.248.113.8:8443/` (con cert mismatch esperado) para separar DNS de NAT; si NAT falla desde fuera pero reflection funciona, revisar en pfSense que la regla quedó en interface `wan` y con `associated-rule-id` generado (ver en GUI Firewall→NAT). Pedir al usuario una prueba desde datos móviles como confirmación independiente.

## Unresolved assumptions
- **Credenciales reales de MongoDB y Cloudflare R2**: no existen en el repo (secretos redactados) y el usuario no las dio. DECISIÓN CODIFICADA: Mongo local en contenedor (los registros del formulario viven SOLO en el VPS, db `pcv` — incluir en el reporte que conviene backup) y R2 deshabilitado → **la subida de acta de nacimiento / certificado médico del formulario fallará** hasta que el usuario entregue `R2_*`. Cuando las dé: añadirlas como `args` y `environment` en compose.yaml y `docker compose up -d --build`.
- **Nombre exacto en DuckDNS**: "pachuca.cv" no es válido como subdominio (sin puntos). Default codificado `pachucacv`, fallback `pachuca-cv`. Si ambos están tomados o el usuario esperaba otra cosa (¿el dominio real pachuca.vc del astro.config?), preguntar.
- **URL con puerto :8443**: los puertos públicos 80/443 pertenecen a capuvps (producción, intocable), así que la URL final lleva `:8443`. Única alternativa para URL limpia: convertir el nginx de 192.168.1.33 en proxy SNI para este dominio — **tocar producción requiere OK explícito del usuario**; no hacerlo por iniciativa propia.
- **Sesiones de Chrome activas** (Proxmox pvececyte GUI y Google/DuckDNS): la evidencia tiene 7 días. Si caducaron, los Moves 1 y 7 necesitan al usuario.
- **Recursos del VM 300** (RAM/cores desconocidos hasta Move 2): el plan asume que con swap alcanza para el build. Si tiene <2 GB y el build muere incluso con swap, hacer el build en la máquina operadora (`npm install && npm run build` con los mismos env) y transferir `dist/` + `node_modules` — más lento pero desbloquea.
- **Password del panel VPS**: rotada y desconocida. No se necesita aquí, pero si algo exige re-aprovisionar la VM, la aporta el usuario.

## Abort conditions
- **Sesión GUI de pvececyte caducada Y sin password root** (Move 1): parar, pedir al usuario login o credencial. Sin shell root en pvececyte no hay misión.
- **VM 300 no existe o el aprovisionamiento quedó a medias** (`qm list` sin 300, o disco/config corruptos): parar y reportar; re-crear es acción del panel (password desconocida).
- **pfSense**: si tras editar config.xml `pfctl` muestra reglas raras, la GUI no carga, o CUALQUIER servicio previo (8090, 8091, 443/80→.33, 2210, 2202) deja de responder → restaurar el backup `config.xml.bak-pachuca` de inmediato, re-sync, verificar servicios, y parar con reporte. Jamás reiniciar pfSense ni pvececyte (red escolar en producción).
- **192.168.1.33 (capuvps)**: intocable en todos los escenarios. Cualquier camino que lo requiera = parar y preguntar.
- **DuckDNS**: `pachucacv` y `pachuca-cv` ambos tomados → parar y preguntar el nombre.
- **Let's Encrypt**: >4 intentos fallidos de emisión → dejar autofirmado temporal, parar y reportar (no quemar rate limits).
- **dnsmasq de pvececyte no vuelve a `active` tras cualquier cambio** → revertir el cambio, verificar, y solo entonces continuar o parar (afecta a TODOS los VPS del nodo).
