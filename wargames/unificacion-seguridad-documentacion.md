# War-game: Unificar todos los servidores en el Panel, corregir errores, endurecer seguridad y documentar (frontend / backend / usuario final)
> Ejecutor: corre los movimientos en orden. Antes de cada movimiento lee sus señales de fallo. Revisa las condiciones de aborto DESPUÉS de cada movimiento. No inventes credenciales ni IPs: lo que falte está en "Suposiciones sin resolver".

## Objetivo de la misión
Dejar la plataforma VPS del sitio CECyTEM operando como UN solo sistema gestionado desde el Panel VPS (`https://207.248.113.8:8091`), con los 4 nodos de cómputo (pve, pvececyte, pvedell, aulamedios/Hyper-V) **online y aprovisionando**, los errores conocidos corregidos, la seguridad endurecida (secretos fuera del repo, tokens rotados, WAN endurecida, backups), y 3 manuales nuevos escritos paso a paso: **MANUAL-4** (uso del panel — frontend), **MANUAL-5** (operación del backend/API), **MANUAL-6** (guía del usuario final/cliente). **Éxito medible:** (a) el dashboard del panel muestra los 4 nodos "online"; (b) desde el panel se crea 1 VPS de prueba en CADA nodo Proxmox y arranca 1 VM en aulamedios, todos verificados (IP + internet + aislamiento + SSH); (c) `git grep` del repo no encuentra ningún secreto vivo; (d) los 3 manuales existen en `C:\vpsserver` y sus pasos fueron ejecutados al menos una vez tal como están escritos.

**DECISIÓN DE ARQUITECTURA YA TOMADA (no re-decidir):** "unificación" = todos los nodos gestionados por el Panel VPS (un solo panel, un solo punto de entrada). **NO** significa unir nodos al cluster corosync: `pvececyte` tiene VMs en producción (pfSense VM 100 — el router de TODO el sitio) y unir un nodo con VMs a un cluster existente es destructivo/riesgoso. `pve`+`pvedell` ya forman el cluster `vps-cluster`; se queda así. `pvececyte` y `aulamedios` se unifican SOLO a nivel panel.

## Resumen de reconocimiento (verificado en repo/memoria — NO re-descubrir)

### Inventario de servidores
| Nodo | IP | Tipo | Rol | Notas |
|---|---|---|---|---|
| pve | 192.168.1.4 | Proxmox 9.1 | VPS clientes, subred 192.168.6.0/24, gateway `pve-vlan6-gw.service` | root/`Michoacan1`. Hostea el backend del panel vía VPS 202. Corre socat: `socat-pvedell.service` (8007→192.168.1.96:8006) y `socat-pvececyte.service` (8008→192.168.1.254:8006) |
| pvececyte | 192.168.1.254 | Proxmox 8.4 | pfSense VM 100 + VPS subred 192.168.7.0/24 (`pvececyte-vps-gw.service`) | NO unir a cluster. NIC tg3 rota para VLAN tagged |
| pvedell | 192.168.1.96 | Proxmox (kernel 7.x viejo) | En cluster `vps-cluster` con pve; template es **9001** (no 9000) | root/`Michoacan1`. Sus VPS usan tag 6 → gateway de pve |
| aulamedios | **192.168.1.229** (¡NO .3, corregido en commit b9679f6!) | Windows Server 2016 + Hyper-V | Aula en producción (IIS, SQL/WID, ASPEL, perfiles alumnos) — NO degradar | `192.168.1.3\Administrador`/`[REDACTED - password Windows]` vía CIM/DCOM (WinRM bloqueado). Agente REST puerto 3002, token `[REDACTED - agentToken]`. vSwitch VPS-External, VMs en `F:\HyperV-VPS\` |
| pfSense | 192.168.1.1 (GUI :8443, WAN 207.248.113.8, GUI pública :8444) | Firewall/router | NAT de todo | SSH admin puerto 2223 llave `C:\Users\User\.ssh\pfsense_admin`. Reglas NAT DEBEN quedar dentro del bloque `<nat>` del config.xml; `filter_configure_sync` a veces necesita correrse 2 veces |

### Panel VPS (repo local `C:\vpsserver\panel\`, desplegado en VPS 202 = 192.168.6.152, `/opt/vps-panel/`)
- Backend Express (`src/server.js`): helmet, rate-limit, JWT (password única `PANEL_PASSWORD`), credenciales cifradas con `CRED_SECRET`, todo en `.env`; nodos en `config/nodes.json` (el deployado puede estar en otra ruta — el proceso corre con PM2: `pm2 list`, app `vps-panel-api`). `config.js` hace `process.exit(1)` si falta `.env` o `nodes.json` → un reinicio con config rota TUMBA el panel.
- El panel llega a pvedell/pvececyte vía los socat de pve (host `192.168.1.4`, puertos 8007/8008) — en `nodes.json` NO cambiar host/port de esos nodos, solo tokens/templateVmid.
- Frontend React+Vite en `panel/frontend/` servido por nginx (cert autofirmado) en el VPS 202. Acceso: `https://207.248.113.8:8091`, password `[REDACTED - token panel]`.
- Agente Hyper-V (`panel/hyperv-agent/`): `agent.js` + `install-service.ps1` + `config.json` con `agentToken`. **PENDIENTE conocido:** instalarlo como servicio persistente en aulamedios requiere OK explícito del operador (es persistencia en un servidor de aula en producción).
- SSH directo al VPS del panel: `ssh -i C:\Users\User\.ssh\vps_panel_deploy -p 2202 devops@207.248.113.8`.

### Errores conocidos a corregir (lista cerrada)
1. **pvedell en panel:** `templateVmid: 9000` debe ser **9001** (causa `ERR_BAD_RESPONSE` al crear). Ver war-game previo `reparar-pvedell-provision.md` para el detalle.
2. **Regla pfSense faltante:** WAN TCP **2210** → 192.168.1.254:2210 (SSH del VPS 210 `vps-demo-n2`). El DNAT del nodo ya existe.
3. **aulamedios offline en el panel:** combinación de IP histórica errónea (.3 vs .229), token, y que el agente no corre como servicio (se apaga al cerrar sesión).
4. **Secretos vivos en el repo:** `token.txt` (token API de pve `[REDACTED - token pve]`), `nuevo frontend.txt` (token de pvececyte `[REDACTED - token pvececyte]`), y contraseñas en claro en MANUAL-2/memoria (VPS demo, panel). El repo es git: los secretos están en historial si se comitearon.
5. `nodes.example.json` ya corregido en git (IP .229, agentToken) pero hay que verificar que el `nodes.json` DEPLOYADO refleje lo mismo.

### Seguridad — estado actual y huecos
- Bien: helmet, rate-limit de login (10/15min), timingSafeEqual, JWT, credenciales cifradas, error handler que no filtra tokens, aislamiento nftables por nodo, anti-spoofing pfSense.
- Huecos: `verifyTls: false` a Proxmox (aceptable en LAN, documentar); tokens API con `--privsep 0` y rol PVEAdmin (amplio); secretos en repo (punto 4); root+password por SSH en nodos; sin fail2ban en el VPS del panel; sin backups programados (`vzdump`); sin respaldo del config.xml de pfSense; puertos WAN 8091/2202/2210 sin endurecimiento synproxy/límites; contraseñas demo publicadas en manuales que quizá ya se compartieron.

## Movimientos

### Movimiento 1: Inventario en vivo y localización de la config real del panel
- **Acción:** entrar al backend del panel: `ssh -i C:\Users\User\.ssh\vps_panel_deploy -p 2202 devops@207.248.113.8`. Ejecutar:
  ```bash
  pm2 list
  ls -la /opt/vps-panel/backend/config/ /opt/vps-panel/backend/.env
  cat /opt/vps-panel/backend/config/nodes.json 2>/dev/null || \
    { PID=$(pgrep -f "server.js"); ls -l /proc/$PID/cwd; sudo lsof -p $PID 2>/dev/null | grep -i json; }
  curl -sk https://127.0.0.1:443/api/nodes -H "Authorization: Bearer $(curl -sk -X POST https://127.0.0.1/api/auth/login -H 'Content-Type: application/json' -d '{"password":"<PANEL_PASSWORD>"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')"
  ```
  Anotar: ruta real de `nodes.json`, contenido actual (¿cuántos nodos? ¿qué templateVmid tiene pvedell? ¿está aulamedios?), y qué nodos reporta `/api/nodes` como online/offline.
- **Observación esperada si funcionó:** `pm2 list` muestra `vps-panel-api` online; `nodes.json` localizado; `/api/nodes` responde JSON con el estado por nodo.
- **Observación si falló:** SSH rechazado (llave/puerto), o `nodes.json` no aparece en rutas obvias.
- **Causa más probable de fallo:** la llave `vps_panel_deploy` no está en ese Windows, o el backend corre con CWD distinto.
- **Contramovimiento:** entrar por password (`devops`/`VpsDemo-2026!` puerto 2202) si la llave falta. Para la config: `pm2 describe vps-panel-api` muestra el CWD y script exactos; la config está relativa a ese CWD (`config/nodes.json`).
- **Consecuencias posteriores:** TODO el resto edita esa ruta. Si `/api/nodes` ya muestra 4 nodos online, los Movimientos 2-4 se degradan a verificación.

### Movimiento 2: Unificar los 4 nodos en `nodes.json` (pvedell 9001, aulamedios .229)
- **Acción:** respaldar y editar la config real:
  ```bash
  cp nodes.json nodes.json.bak.$(date +%s)
  ```
  Dejar el array con los 4 nodos EXACTOS:
  - `pve`: host 192.168.1.4, port 8006, templateVmid 9000, vmidRange [200,299], subnetPrefix "192.168.6."
  - `pvececyte`: host **192.168.1.4, port 8008** (socat), templateVmid 9000, vmidRange [300,399], subnetPrefix "192.168.7."
  - `pvedell`: host **192.168.1.4, port 8007** (socat), **templateVmid 9001**, vmidRange [500,599], subnetPrefix "192.168.6."
  - `aulamedios`: `"type":"hyperv"`, host **192.168.1.229**, agentPort 3002, agentToken (el vigente de `config.json` del agente), subnetPrefix "192.168.1.", vmidRange [600,699] (o el que ya tenga — no chocar con pvedell 5xx)
  Los `tokenId`/`tokenSecret` existentes NO se tocan aquí (se rotan en el Mov. 7). Validar con `python3 -m json.tool nodes.json` y reiniciar: `pm2 restart vps-panel-api && pm2 logs vps-panel-api --lines 15 --nostream`.
- **Observación esperada si funcionó:** el log arranca con "Panel backend escuchando…" y "Nodos configurados: pve(…), pvececyte(…), pvedell(…), aulamedios(…)". El dashboard muestra pve/pvececyte/pvedell online (aulamedios puede seguir offline hasta el Mov. 4).
- **Observación si falló:** `pm2 logs` muestra `[config] …` y el proceso reinicia en bucle (config.js hace `process.exit(1)` si falta un campo).
- **Causa más probable de fallo:** campo faltante en el nodo hyperv (config.js exige exactamente: name, host, agentPort, agentToken, subnetPrefix, vmidRange) o JSON inválido.
- **Contramovimiento:** el propio log dice QUÉ campo falta — añadirlo. Si el pánico persiste, restaurar el `.bak` y reiniciar (el panel vuelve al estado previo), luego reintentar la edición.
- **Consecuencias posteriores:** con templateVmid 9001, la creación en pvedell deja de dar `ERR_BAD_RESPONSE`. Un `nodes.json` roto tumba el panel entero — por eso el `.bak` es obligatorio.

### Movimiento 3: Regla pfSense 2210 y auditoría de port-forwards (REQUIERE OK DEL OPERADOR)
- **Acción:** pedir OK explícito al operador para tocar pfSense. Con OK: GUI `https://192.168.1.1:8443` → Firewall → NAT → Port Forward → Add: WAN · TCP · WAN address · puerto **2210** · redirect **192.168.1.254:2210** · "Add associated filter rule" · Save+Apply. Después auditar por SSH (`ssh -i C:\Users\User\.ssh\pfsense_admin -p 2223 admin@192.168.1.1`):
  ```sh
  grep -n "<nat>\|</nat>" /cf/conf/config.xml
  # verificar que TODAS las reglas de forward (8091, 2202, 2210, 8090) están DENTRO del bloque <nat>
  pfctl -sn | grep -E '2202|2210|8091'
  ```
- **Observación esperada si funcionó:** `pfctl -sn` lista rdr para 2202, 2210 y 8091; desde fuera `ssh -p 2210 devops@207.248.113.8` da banner y login con `VpsDemo2-2026!`.
- **Observación si falló:** la regla se guardó pero `pfctl` no la muestra, o timeout desde fuera.
- **Causa más probable de fallo:** la regla cayó FUERA del bloque `<nat>` (bug ya visto), o el filtro no recargó.
- **Contramovimiento:** `/etc/rc.filter_configure_sync` **dos veces** y re-verificar `pfctl -sn`. Si la regla está fuera de `<nat>`, moverla dentro editando config.xml (con backup `cp /cf/conf/config.xml /cf/conf/config.xml.bak`) y `rm /tmp/config.cache; /etc/rc.filter_configure_sync`.
- **Consecuencias posteriores:** MANUAL-2 se actualiza quitando la nota "falta regla pfSense 2210". Si el operador NO da OK, marcar el punto como pendiente y seguir — no bloquea los demás movimientos.

### Movimiento 4: Agente Hyper-V persistente en aulamedios (REQUIERE OK DEL OPERADOR — persistencia en servidor de aula)
- **Acción:** pedir OK explícito ("instalar el agente REST como servicio de Windows en aulamedios"). Con OK, desde el Windows del operador usar el helper CIM/DCOM (`Invoke-RemoteAula.ps1`, credencial `192.168.1.3\Administrador`/`[REDACTED - password Windows]` — el usuario local se llama así aunque la IP sea .229) o sesión RDP:
  1. Copiar `panel\hyperv-agent\` a `F:\HyperV-VPS\agent\` por SMB (`\\192.168.1.229\F$\HyperV-VPS\agent`).
  2. Verificar `config.json` con `agentToken` idéntico al de `nodes.json` y puerto 3002.
  3. Ejecutar `install-service.ps1` (crea el servicio) y abrir el puerto: `New-NetFirewallRule -DisplayName "VPS Agent 3002" -Direction Inbound -Protocol TCP -LocalPort 3002 -Action Allow`.
  4. Probar desde el VPS del panel: `curl -s http://192.168.1.229:3002/health -H "Authorization: Bearer <agentToken>"` (o el endpoint de status que exponga `agent.js` — revisarlo antes: `grep -n "app.get\|app.post" agent.js`).
- **Observación esperada si funcionó:** el servicio queda `Running` y arranca `Automatic`; el curl responde 200; el dashboard del panel pasa aulamedios a "online".
- **Observación si falló:** curl `Connection refused` (servicio caído o firewall), 401 (token distinto), o el servicio no arranca (Node no instalado en aulamedios / ruta errónea en el servicio).
- **Causa más probable de fallo:** Node.js no está instalado en aulamedios, o el firewall de Windows bloquea 3002.
- **Contramovimiento:** instalar Node LTS en aulamedios (msi descargado de nodejs.org — pedir OK para el download) o empaquetar el agente con `pkg`/usar el `start-agent.bat` bajo una Scheduled Task `ONSTART` como plan B. Token distinto: igualar `config.json` ↔ `nodes.json` y reiniciar ambos (servicio y pm2).
- **Consecuencias posteriores:** sin este movimiento, aulamedios queda "offline" en el panel y el Mov. 5 solo cubre los 3 nodos Proxmox. NO degradar el aula: el agente debe correr con prioridad normal y sin tocar IIS/SQL/ASPEL.

### Movimiento 5: Prueba de aprovisionamiento unificado (1 VPS por nodo desde el panel)
- **Acción:** en el frontend (`https://207.248.113.8:8091`, pestaña "Crear VPS"): crear `test-pve` (en pve), `test-pvececyte`, `test-pvedell` (2 vCPU, 2048 MB, 20 GB) y, si el Mov. 4 pasó, una VM `test-aula` en aulamedios. Para cada uno: esperar que la pestaña "Credenciales" muestre la credencial, y verificar desde el shell del nodo correspondiente:
  ```bash
  qm guest exec <VMID> -- ping -c2 8.8.8.8 | grep exitcode      # 0 = internet
  qm guest exec <VMID> -- ping -c1 -W2 192.168.1.1 | grep exitcode  # !=0 = aislado
  sshpass -p '<pass-del-panel>' ssh -o StrictHostKeyChecking=no devops@<IP> 'echo OK'
  ```
- **Observación esperada si funcionó:** 3 (o 4) VPS creados sin `ERR_BAD_RESPONSE`, con credenciales visibles, internet OK, LAN bloqueada, SSH OK.
- **Observación si falló:** pvedell vuelve a dar error (templateVmid mal aplicado o socat caído: `systemctl status socat-pvedell` en pve); pvececyte crea pero sin IP (gateway vmbr7/dnsmasq caído: `systemctl status vps-gw dnsmasq` en pvececyte); aulamedios falla al crear VM (agente sin permisos Hyper-V o plantilla inexistente — recordar PENDIENTE: aulamedios aún no tiene template cloud-init clonable).
- **Causa más probable de fallo:** servicios de soporte caídos tras algún reinicio (socat/gateway/dnsmasq) — son la fontanería invisible del panel.
- **Contramovimiento:** por servicio: `systemctl restart socat-pvedell socat-pvececyte` (pve), `systemctl restart vps-gw dnsmasq` (nodo afectado), y reintentar desde el panel. Si aulamedios no tiene template todavía, la prueba válida ahí es solo start/stop de la VM demo `vps-hv-demo` — anotar la creación real como pendiente del proyecto Hyper-V (war-game `hvagent-aulamedios.md`).
- **Consecuencias posteriores:** los VPS `test-*` se destruyen al final del movimiento (`qm stop <VMID> && qm destroy <VMID> --purge`) para no dejar basura; si se quedan, restan VMIDs y RAM. Este movimiento es el criterio (b) del objetivo.

### Movimiento 6: Sacar los secretos del repo y blindar git
- **Acción:** en `C:\vpsserver`:
  1. Crear `C:\vpsserver\SECRETS\` FUERA de git o usar un gestor: mover ahí el contenido útil de `token.txt` y `nuevo frontend.txt`; borrar ambos del working tree.
  2. Crear/completar `.gitignore`: `SECRETS/`, `token.txt`, `*.env`, `panel/backend/config/nodes.json`, `panel/hyperv-agent/config.json`, `node_modules/`.
  3. Auditar historial: `git log --all --oneline -- token.txt "nuevo frontend.txt"` y `git grep -I -E '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' $(git rev-list --all)` para saber si algún secreto fue comiteado.
  4. Revisar que `panel/hyperv-agent/config.json` (¡existe en el repo!) no esté trackeado con el token real: `git ls-files panel/hyperv-agent/config.json`.
- **Observación esperada si funcionó:** `git status` limpio de archivos de secretos; `git grep` del UUID de token no devuelve nada en commits; los .txt ya no existen en el tree.
- **Observación si falló:** el grep encuentra el token en el historial de commits.
- **Causa más probable de fallo:** los .txt o config.json fueron comiteados en el pasado.
- **Consecuencia y contramovimiento:** si están en historial, NO reescribir historia por cuenta propia (destructivo) — la mitigación correcta y suficiente es la **rotación de tokens del Mov. 7** (un secreto rotado en historial es inerte). Anotar en el reporte qué secretos aparecieron en historial para confirmarlos rotados.
- **Consecuencias posteriores:** después de esto, el Mov. 7 es OBLIGATORIO para cualquier secreto que haya estado expuesto.

### Movimiento 7: Rotación de tokens y contraseñas expuestas (REQUIERE OK — invalida credenciales en uso)
- **Acción:** pedir OK explícito listando lo que se va a rotar y su impacto:
  1. **Tokens API Proxmox** (en pve, pvececyte y pvedell): `pveum user token remove panel@pve panel && pveum user token add panel@pve panel --privsep=0` → pegar cada secret nuevo en `nodes.json` del panel → `pm2 restart vps-panel-api`. (En cluster, el token de pve vale también para pvedell vía su API local — rotar en cada endpoint que el panel usa.)
  2. **agentToken de aulamedios**: generar uno nuevo (`openssl rand -hex 24`), actualizarlo en `config.json` del agente Y en `nodes.json`, reiniciar servicio y pm2.
  3. **PANEL_PASSWORD** (`[REDACTED - token panel]` está en memoria/manuales): nueva password fuerte en `.env` del backend + `pm2 restart`. 
  4. **Passwords de VPS demo** (`VpsDemo-2026!`, `VpsDemo2-2026!` publicadas en MANUAL-2): `qm set 202 --cipassword '<nueva>'` + dentro `sudo passwd devops`; ídem VPS 210. ⚠️ El VPS 202 hostea el panel: NO romper el acceso del deploy key.
  5. **Considerar** (solo proponer al operador, no ejecutar sin OK): cambiar `Michoacan1` de root en los 3 Proxmox y `[REDACTED - password Windows]` de aulamedios; instalar la llave `pve_panel_admin` en `authorized_keys` de pve/pvececyte/pvedell y luego `PasswordAuthentication no` para root.
- **Observación esperada si funcionó:** el panel sigue online tras cada rotación (dashboard 4 nodos online, crear/listar VMs funciona); SSH a los VPS demo con las passwords nuevas OK; las viejas rechazadas.
- **Observación si falló:** nodos "offline" en el panel tras rotar (secret mal pegado — espacios/saltos de línea), o lockout de un VPS.
- **Causa más probable de fallo:** pegar el secret con salto de línea o rotar el token ANTES de tener a mano dónde va (ventana de panel caído).
- **Contramovimiento:** rotar UN nodo a la vez y verificar `/api/nodes` entre cada uno. Si un nodo queda offline: re-crear el token de nuevo y re-pegar. Lockout de VPS: `qm terminal <VMID>` desde el nodo (consola serie, siempre funciona) y `passwd devops`.
- **Consecuencias posteriores:** MANUAL-2 y la memoria del proyecto quedan desactualizados → el Mov. 9 los reescribe SIN contraseñas en claro (referencia "ver gestor de secretos"). Cualquier cliente real con la password vieja pierde acceso — por eso el OK es obligatorio.

### Movimiento 8: Endurecimiento perimetral y backups
- **Acción (cada sub-punto con OK del operador donde toque pfSense):**
  1. **pfSense WAN**: en las reglas de forward expuestas (8091, 2202, 2210, 8090), pestaña Advanced: `Max src conn rate` 15/5s, `Max states per host` 500, TCP `State type = synproxy`. Save+Apply.
  2. **fail2ban en el VPS del panel** (202): `sudo apt-get install -y fail2ban` con jail sshd default (protege el 2202) y, opcional, un jail nginx para el login del panel.
  3. **Backups Proxmox**: en pve (cubre el cluster con pvedell) y en pvececyte: Datacenter → Backup → Add: schedule diario 02:00, storage `local`, modo snapshot, retención 3. Incluir los VPS de producción (202) y templates NO (son reconstruibles).
  4. **Backup de configs**: guardar en `SECRETS/` (o storage designado): `config.xml` de pfSense (Diagnostics → Backup & Restore), `nodes.json` + `.env` del panel, `/root/*.sh` de cada nodo, `/etc/dnsmasq.d/*` y las unidades systemd. Un tar por nodo: `tar czf /root/node-config-backup.tgz /root/*.sh /etc/dnsmasq.d /etc/systemd/system/vps-gw* /etc/systemd/system/socat-*` y copiarlo fuera del nodo.
- **Observación esperada si funcionó:** las reglas WAN muestran los límites en la GUI; `fail2ban-client status sshd` lista el jail activo; el job de backup aparece en Datacenter→Backup y la primera corrida (`Run now` de prueba con 1 VM) termina OK; existen los .tgz.
- **Observación si falló:** synproxy rompe un forward (síntoma: la conexión abre pero no fluye — raro con SSH, posible con WebSocket del panel 8091).
- **Causa más probable de fallo:** synproxy + el proxy nginx/WebSocket del panel no se llevan bien.
- **Contramovimiento:** si 8091 se degrada tras synproxy, quitar synproxy SOLO de esa regla (dejar límites de rate/states) — decisión ya tomada, no consultar. Verificar el panel de nuevo.
- **Consecuencias posteriores:** los backups consumen espacio en `local` — vigilar `pvesm status` tras la primera corrida; si `local` es chico, retención 2.

### Movimiento 9: Escribir los 3 manuales paso a paso
- **Acción:** crear en `C:\vpsserver`, en español, con capturas de comandos reales de esta misma misión (no teoría):
  1. **MANUAL-4-uso-del-panel.md** (FRONTEND — para el operador del negocio): URL y login; tour de pestañas (Dashboard/nodos, Crear VPS con cada campo y sus límites — hostname `^[a-z0-9][a-z0-9-]{2,29}$`, cores 1-8, RAM 512-16384, disco 20-200 —, Credenciales, Historial, Servicios con el catálogo OpenClaw/Hermes/Coolify/Supabase); flujo completo "vender un VPS": crear → copiar credencial → pedir port-forward → entregar tarjeta de acceso; qué hacer si un nodo sale offline (tabla síntoma→servicio→comando del Mov. 5); errores comunes del formulario.
  2. **MANUAL-5-backend-operacion.md** (BACKEND — para el administrador técnico): arquitectura (nginx→Express→Proxmox API/agente Hyper-V, socat 8007/8008); estructura `/opt/vps-panel/`; `.env` y sus 3 secretos (sin valores); anatomía de `nodes.json` campo por campo (con la regla templateVmid-en-cluster); endpoints de la API (`/api/auth/login`, `/api/nodes`, `/api/vms`, `/api/credentials`, `/api/history`, `/api/services/*`) con ejemplos curl; operación PM2 (logs, restart, resurrect tras reboot); procedimiento de rotación de tokens (el del Mov. 7, ya probado); cómo agregar un nodo nuevo (remite a `wargames/replicar-nodo-nuevo.md` + añadir entrada en nodes.json); troubleshooting (tabla error→causa→fix: ERR_BAD_RESPONSE, nodo offline, credencial no aparece).
  3. **MANUAL-6-usuario-final.md** (CLIENTE que compró un VPS): qué recibe (host, puerto, usuario, password temporal); primer login SSH desde Windows/Mac/Linux; cambiar password (`passwd`) y poner su llave SSH; el stack preinstalado con ejemplos copy-paste (Node+PM2 con app demo, Python venv+Flask, Docker nginx, `sudo install-supabase` y dónde quedan sus claves); cómo pedir que le abran un puerto para su web; límites y buenas prácticas (no escanear la red, backups de su lado); soporte.
  Actualizar además README.md (índice con los 6 manuales) y MANUAL-2 (sin passwords en claro post-rotación).
- **Observación esperada si funcionó:** los 3 archivos existen; cada comando copy-paste de los manuales fue ejecutado al menos una vez durante los Movimientos 1-8 (los manuales documentan lo VERIFICADO, no lo supuesto).
- **Observación si falló:** N/A (redacción local); el riesgo es documentar pasos no probados.
- **Causa más probable de fallo:** escribir de memoria valores que cambiaron en el Mov. 7 (passwords/URLs viejas).
- **Contramovimiento:** regla fija: los manuales NUNCA incluyen secretos vivos — usan `<PASSWORD-DEL-GESTOR>` con nota de dónde obtenerla.
- **Consecuencias posteriores:** criterio (d) del objetivo cumplido.

### Movimiento 10: Verificación final integral y cierre
- **Acción:** pasada completa: (1) dashboard con 4 nodos online; (2) `git status` limpio y sin secretos (`git grep -iE 'VpsDemo-2026|PanelVPS-D99F05A1|d43685fa|fa8195bd|Michoacan1|[REDACTED - password Windows]' -- ':!wargames'` vacío en el tree actual); (3) desde fuera: puertos 8091/2202/2210 responden y el login del panel funciona con la password NUEVA; (4) `reboot` controlado de UN nodo secundario (pvedell, con OK) y confirmar que socat/gateway/panel se recuperan solos; (5) actualizar la memoria del proyecto (`infra-vps-cecytem.md`) con: tokens rotados (sin valores), aulamedios como nodo activo, manuales 4-6, fecha.
- **Observación esperada si funcionó:** todo verde; el reboot de pvedell vuelve a online en el panel sin intervención (~3 min).
- **Observación si falló:** algo no se recupera tras reboot (unidad systemd no enabled).
- **Causa más probable de fallo:** `systemctl enable` olvidado en algún servicio (socat, vps-gw, dnsmasq).
- **Contramovimiento:** `systemctl is-enabled socat-pvedell socat-pvececyte pve-vlan6-gw` (pve) / `vps-gw dnsmasq` (nodos) — habilitar el que falte y re-probar.
- **Consecuencias posteriores:** misión cerrada; reportar al operador el resumen + pendientes que quedaron sin OK.

## Suposiciones sin resolver
- **Password actual del panel** (`PANEL_PASSWORD`): se asume `[REDACTED - token panel]` (memoria del proyecto); si ya fue rotada, la aporta el operador — necesaria en el Mov. 1.
- **Estado real del `nodes.json` deployado**: el ejemplo del repo tiene 3 nodos (sin pvedell); el deployado puede diferir. Se resuelve en vivo en el Mov. 1.
- **¿Existen clientes reales activos** usando las passwords/puertos actuales? Determina el impacto de la rotación (Mov. 7). Lo confirma el operador ANTES de rotar.
- **¿aulamedios tiene Node.js instalado?** Se descubre en el Mov. 4; su contramovimiento lo cubre.
- **Endpoint exacto de salud del agente Hyper-V** (`/health` u otro): leer `agent.js` en el Mov. 4 antes de probar.
- **Dónde guardará el operador los secretos** (carpeta `SECRETS/` local, KeePass, etc.): decisión del operador en el Mov. 6; el brief solo exige "fuera de git".
- **VMID range definitivo para aulamedios** (600-699 propuesto): confirmar con el operador si el ejemplo del repo (500-599) choca con pvedell.

## Condiciones de aborto (PARA y reporta al operador)
- **El panel queda caído** tras una edición y el `.bak` restaurado NO lo recupera: no seguir editando a ciegas; reportar con `pm2 logs`.
- **pfSense**: cualquier cambio que provoque pérdida de conectividad del sitio (GUI inalcanzable tras Apply) → NO seguir tocando reglas; usar la consola de la VM 100 en pvececyte para restaurar `config.xml.bak` y reportar. pfSense es el router de TODO el plantel.
- **aulamedios**: si el aula está en horario de clase o el operador no da OK a la persistencia, saltar el Mov. 4 completo (dejar aulamedios offline en el panel) y reportar. Jamás reiniciar aulamedios sin OK.
- **Rotación (Mov. 7) sin OK del operador** o con clientes reales sin avisar: no ejecutar; documentar como pendiente.
- **Evidencia de compromiso** (logins SSH desconocidos en `last`/`journalctl`, reglas nft/iptables que nadie puso, procesos raros): congelar cambios, no rotar nada todavía (preservar evidencia) y reportar de inmediato.
- El reboot de prueba (Mov. 10) SOLO en pvedell y SOLO con OK; nunca reiniciar pve (hostea panel+socat+gateway 6) ni pvececyte (hostea pfSense).
