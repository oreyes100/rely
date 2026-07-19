# War-game: Reparar aprovisionamiento de VPS en pvedell desde el Panel VPS
> Ejecutor: corre los movimientos en orden. Antes de cada movimiento lee sus señales de fallo. Revisa las condiciones de aborto después de cada movimiento.

## Objetivo de la misión
El Panel VPS (`https://207.248.113.8:8091`, contraseña `[REDACTED - token panel]`) falla con `Error comunicando con Proxmox (ERR_BAD_RESPONSE)` al crear un VPS en el nodo `pvedell`. Estado final exitoso: desde la pestaña "Crear VPS" del panel se crea el VPS `davovps` (2 vCPU, 4 GB, 40 GB) en `pvedell`, obtiene IP `192.168.6.x` por DHCP, la credencial aparece en la pestaña "Credenciales", y el cliente puede entrar por SSH desde internet (`ssh -p <puertoWAN> devops@207.248.113.8`).

## Resumen de reconocimiento (verificado en vivo — NO re-descubrir)
- **Causa raíz confirmada:** el panel tiene configurado `templateVmid: 9000` para `pvedell`, pero en `pvedell` el template real es **VMID 9001** (`ubuntu2404-devstack`, `qm list` lo confirma). `pve` y `pvedell` forman el cluster corosync `vps-cluster`; los VMID son únicos a nivel cluster, por eso el template de pvedell es 9001 y no puede llamarse 9000. El POST de clonación `/nodes/pvedell/qemu/9000/clone` revienta con 500 en Proxmox → el backend lo enmascara como `ERR_BAD_RESPONSE`.
- **pvedell:** `192.168.1.96`, root / `Michoacan1`, Proxmox (kernel 7.0.14-5-pve). Storage `local-lvm` con ~758 GB libres, ~12 GB RAM libre. Snippet `/var/lib/vz/snippets/vps-devstack.yaml` ya presente. Template 9001 correcto: `net0: virtio,bridge=vmbr0,tag=6`, `nameserver 192.168.6.1`, `cicustom vendor=local:snippets/vps-devstack.yaml`, `ciuser devops`.
- **Red de pvedell:** `vmbr0` (puerto físico `nic0`, MAC `64:00:6a:94:2d:e5`) con IPs `192.168.1.96/22` y `192.168.6.96/24`. NO tiene dnsmasq ni nftables propios: los VPS de pvedell usan tag 6 y dependen del **gateway VLAN 6 que corre en pve** (`192.168.6.1`, dnsmasq DHCP .100-.199, NAT, servicio `pve-vlan6-gw.service`). El tráfico tagged-6 viaja pvedell→switch→pve; los 5 switches TP-Link ya tienen VLAN 6 tagged en todos los trunks (verificado en sesiones previas).
- **pve:** `192.168.1.4`, root / `Michoacan1` (misma contraseña, verificado). Backend del panel: proceso `node /opt/vps-panel/backend/src/server.js`. **OJO:** `/opt/vps-panel/backend/config/nodes.json` NO existe (cat devolvió "No such file or directory") y no hay unidad systemd con "panel" en el nombre — el backend corre de otra forma (pm2/nohup/tmux) y lee su config de nodos desde otra ruta. Localizarla es el Movimiento 1.
- **El panel llega a los nodos vía socat en pve:** `socat-pvedell.service` = `TCP-LISTEN:8007 → 192.168.1.96:8006`; `socat-pvececyte.service` = `8008 → 192.168.1.254:8006`. Por eso `/api/nodes` reporta `host: 192.168.1.4` para todos. En la config de nodos, pvedell será `host 192.168.1.4, port 8007` (o similar) — NO cambiar host/port, SOLO `templateVmid`.
- **Config de nodos esperada (formato del repo local `C:\vpsserver\panel\backend\config\nodes.example.json`):** array JSON con campos `name, host, port, tokenId, tokenSecret, storage, templateVmid, vmidRange, subnetPrefix`. pvedell: `vmidRange [500,599]`, `subnetPrefix "192.168.6."`.
- **Port-forward de entrada para VPS de pvedell:** igual que los de pve, porque sus IPs viven en 192.168.6.x detrás del gateway de pve: DNAT en el array `PORTFWD` de `/root/pve-vlan6-gateway.sh` **en pve** + regla pfSense WAN→`192.168.1.4`. pfSense: GUI `https://192.168.1.1:8443` (sesión ya logueada en Chrome del operador).
- **Validación del backend** (`validateProvision`): hostname `^[a-z0-9][a-z0-9-]{2,29}$`, cores 1-8, RAM 512-16384 MB, disco 20-200 GB. `davovps` es válido.
- El panel guarda las credenciales cifradas al crear (pestaña Credenciales las muestra descifradas).

## Movimientos

### Movimiento 1: Localizar la configuración de nodos del backend en pve
- **Acción:** SSH `root@192.168.1.4` (pass `Michoacan1`). Ejecutar:
  ```bash
  ls -la /opt/vps-panel/backend/ /opt/vps-panel/backend/config/ 2>&1
  find /opt/vps-panel -maxdepth 3 -name "*.json" | grep -v node_modules
  grep -rn "nodes" /opt/vps-panel/backend/src/config.js
  cat /opt/vps-panel/backend/.env 2>/dev/null | grep -v SECRET
  ```
- **Observación esperada si funcionó:** aparece un archivo JSON con el array de nodos (probable `/opt/vps-panel/backend/config/nodes.json` con otro nombre, o ruta indicada en `config.js`/`.env`). Dentro, la entrada `"name": "pvedell"` con `"templateVmid": 9000`.
- **Observación si falló:** ningún JSON contiene `pvedell`.
- **Causa más probable de fallo:** la config se movió a `/etc/` o el código deployado difiere del repo local.
- **Contramovimiento:** `PID=$(pgrep -f "node /opt/vps-panel"); ls -l /proc/$PID/cwd; strace -e openat -p $PID -f 2>&1 | head -50` mientras recargas el dashboard del panel; o `lsof -p $PID | grep json`. La ruta abierta con `nodes` es la config.
- **Consecuencias posteriores:** todos los movimientos siguientes editan ese archivo; anota la ruta exacta.

### Movimiento 2: Corregir templateVmid de pvedell → 9001
- **Acción:** respaldo y edición quirúrgica:
  ```bash
  cp <ruta>/nodes.json <ruta>/nodes.json.bak.$(date +%s)
  python3 - <<'EOF'
  import json,sys
  p="<ruta>/nodes.json"
  d=json.load(open(p))
  for n in d:
      if n["name"]=="pvedell": n["templateVmid"]=9001
  json.dump(d,open(p,"w"),indent=2)
  print([ (n["name"],n["templateVmid"]) for n in d if "templateVmid" in n ])
  EOF
  ```
- **Observación esperada si funcionó:** imprime `('pvedell', 9001)` y el resto de nodos intactos (pve→9000, pvececyte→9000).
- **Observación si falló:** JSONDecodeError o el archivo no cambia.
- **Causa más probable de fallo:** el archivo tiene comentarios (no es JSON puro) o permisos.
- **Contramovimiento:** editar a mano con `sed -i` SOLO dentro del bloque de pvedell; verificar con `python3 -m json.tool <ruta>`.
- **Consecuencias posteriores:** el backend NO relee config en caliente (la importa al arrancar) → obliga el Movimiento 3.

### Movimiento 3: Reiniciar el backend del panel sin tumbar nada más
- **Acción:** identificar cómo corre: `pgrep -af "node /opt/vps-panel"`, luego `pm2 list` (si existe pm2), `systemctl list-units | grep -i node`. 
  - Si pm2: `pm2 restart <nombre> && pm2 save`.
  - Si systemd (nombre no evidente): `systemctl status $(systemctl list-units --type=service --state=running | awk '/node|panel/{print $1}')` y `systemctl restart <unidad>`.
  - Si nohup/desnudo: `kill <PID>` y relanzar exactamente con el mismo comando y CWD que mostró `/proc/<PID>/cwd` + `nohup node src/server.js >/var/log/vps-panel.log 2>&1 &` desde ese CWD.
- **Observación esperada si funcionó:** `curl -sk https://207.248.113.8:8091/ | head -3` devuelve el HTML del panel; login funciona; los 4 nodos aparecen online en el dashboard.
- **Observación si falló:** puerto 8091 no responde (`curl: (7)`), o el proceso muere al arrancar.
- **Causa más probable de fallo:** relanzarlo desde CWD equivocado (config.js resuelve rutas relativas al árbol del backend) o variables de entorno (.env) no cargadas.
- **Contramovimiento:** arrancar desde `/opt/vps-panel/backend` con `node src/server.js`; el error de consola dice exactamente qué falta (`[config] Falta la variable...`). Restaurar el `.bak` de nodes.json si el error es de parseo, rehacer Movimiento 2.
- **Consecuencias posteriores:** si el backend queda caído, el panel público muere — prioridad máxima restaurarlo antes de seguir (ver Aborto).

### Movimiento 4: Crear `davovps` en pvedell desde el panel
- **Acción:** en el panel (`https://207.248.113.8:8091`, pass `[REDACTED - token panel]`): Crear VPS → plan Startup → nodo `pvedell` → hostname `davovps` → 2 vCPU / 4 GB / 40 GB → etiquetas del cliente → "Crear VPS". Alternativa API:
  ```bash
  TOKEN=$(curl -sk -X POST https://207.248.113.8:8091/api/auth/login -H 'Content-Type: application/json' -d '{"password":"[REDACTED - token panel]"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
  curl -sk -X POST https://207.248.113.8:8091/api/vms -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"node":"pvedell","hostname":"davovps","cores":2,"memoryMb":4096,"diskGb":40,"tags":["davovps"]}'
  ```
- **Observación esperada si funcionó:** HTTP 201 con JSON `{node:"pvedell", vmid:500, hostname:"davovps", user:"devops", password:"<generada>"}` (tarda 2-8 min: clon completo). **GUARDA ese password.** En pvedell, `qm list` muestra VMID 500 `running`.
- **Observación si falló:** de nuevo `ERR_BAD_RESPONSE` u otro error.
- **Causa más probable de fallo:** (a) el backend no tomó la config nueva → verificar que el proceso reinició (uptime del PID); (b) el token API de Proxmox del panel no tiene permisos sobre pvedell → probar `curl -sk -H "Authorization: PVEAPIToken=<tokenId>=<tokenSecret>" https://192.168.1.4:8007/api2/json/nodes/pvedell/qemu` desde pve (tokenId/tokenSecret están en la config de nodos); un 401/403 confirma permisos.
- **Contramovimiento:** si es (b): en pvedell `pveum aclmod / -user panel@pve -role PVEVMAdmin` (cluster comparte usuarios; ejecutar en cualquier nodo del cluster). Si el error menciona `full clone` o storage: probar clon manual en pvedell `qm clone 9001 500 --name davovps --full` para ver el error crudo de Proxmox y reportarlo.
- **Consecuencias posteriores:** si usaste la API directa, la credencial también queda en la pestaña Credenciales (mismo flujo). El VMID asignado (500-599) determina el puerto WAN del Movimiento 7 (convención: 2000+últimos 3 dígitos → p.ej. VMID 500 → puerto 2500).

### Movimiento 5: Verificar arranque, DHCP e internet del VPS
- **Acción:** esperar ~5 min (cloud-init instala stack). En pvedell:
  ```bash
  qm agent 500 ping && echo AGENT_OK
  qm guest cmd 500 network-get-interfaces | grep -oE '192\.168\.6\.[0-9]+'
  qm guest exec 500 -- ping -c2 8.8.8.8 | grep exitcode
  ```
  (También visible en el panel: columna IP de la tabla VPS.)
- **Observación esperada si funcionó:** `AGENT_OK`, una IP `192.168.6.1xx`, `"exitcode": 0`.
- **Observación si falló:** el agente responde pero no hay IP 192.168.6.x (solo link-local 169.254.x), o no hay respuesta del agente tras 10 min.
- **Causa más probable de fallo:** el tráfico tagged VLAN 6 de pvedell no llega al dnsmasq de pve — o el trunk del puerto de switch donde cuelga pvedell no lleva VLAN 6 tagged, o la NIC de pvedell sufre el bug Broadcom tg3 (`rx-vlan-offload [fixed]` reclasifica tramas al PVID).
- **Contramovimiento (en orden):**
  1. En pvedell: `ethtool -i nic0` y `ethtool -k nic0 | grep rx-vlan-offload`. Si driver `tg3` y `[fixed] on` → **plan B obligatorio** (abajo).
  2. En pve: `bridge fdb show | grep <MAC del VPS>` (MAC: `qm config 500 | grep net0` en pvedell). Si la MAC no aparece en vlan 6, el tag se pierde en el camino → revisar por telnet el switch donde cuelga pvedell (`show mac address-table address <MAC>`; user admin, pass `Administrator.`, `enable`); poner VLAN 6 tagged en ese puerto y `copy running-config startup-config`.
  3. **Plan B (bug tg3 o switch inarreglable):** replicar en pvedell el patrón de pvececyte: bridge interno `vmbr8` sin puertos físicos, subred `192.168.8.0/24`, copia de `C:\vpsserver\scripts\pvececyte-vps-gateway.sh` adaptada (GWIP=192.168.8.1, BR=vmbr8, dropear también 192.168.6.0/24 y 192.168.7.0/24), servicio systemd, y en el template 9001: `qm set 9001 --net0 virtio,bridge=vmbr8 --nameserver 192.168.8.1`; actualizar `subnetPrefix` de pvedell a `"192.168.8."` en la config del panel y reiniciar backend (repetir Mov. 3). Destruir y recrear davovps.
- **Consecuencias posteriores:** si se activa el plan B, el port-forward del Movimiento 7 cambia: el DNAT vive en pvedell (no en pve) y la regla pfSense apunta a `192.168.1.96`.

### Movimiento 6: Verificar stack y SSH interno con la credencial del panel
- **Acción:** en pvedell:
  ```bash
  qm guest exec 500 -- bash -c "node --version; python3 --version; docker --version" 
  ```
  y desde pve (misma L2 del gateway): `ssh devops@<IP_del_VPS>` con el password del Movimiento 4.
- **Observación esperada si funcionó:** versiones de Node 22/Python 3.12/Docker; el SSH pide password y entra.
- **Observación si falló:** `docker: command not found` (cloud-init aún corriendo — esperar 5 min más y reintentar una vez) o SSH rechaza el password.
- **Causa más probable de fallo (SSH):** cloud-init aún no aplicó `cipassword`, o el VPS arrancó antes de que el password se seteara.
- **Contramovimiento:** en pvedell `qm set 500 --cipassword '<password del panel>'` y `qm reboot 500`; reintentar a los 2 min. Si persiste, dentro por consola serie (`qm terminal 500`, salir Ctrl+O): `sudo passwd devops`.
- **Consecuencias posteriores:** ninguna.

### Movimiento 7: Exponer SSH del VPS a internet (DNAT en pve + regla pfSense)
- **Acción (lado pve, porque la IP del VPS vive en 192.168.6.x):** editar `/root/pve-vlan6-gateway.sh` en pve, agregar al array `PORTFWD`: `"2500:192.168.6.NNN:22"` (NNN = IP real del Mov. 5; puerto WAN = 2000+VMID, VMID 500 → 2500). Fijar la IP: `echo 'dhcp-host=<MAC>,192.168.6.NNN' >> /etc/dnsmasq.d/vps-static.conf && systemctl restart dnsmasq`. Re-correr `bash /root/pve-vlan6-gateway.sh`.
  **(lado pfSense, GUI `https://192.168.1.1:8443`):** Firewall → NAT → Port Forward → Add: WAN, TCP, Destination WAN address puerto **2500**, Redirect `192.168.1.4:2500`, "Add associated filter rule", Save + Apply.
- **Observación esperada si funcionó:** desde pve: `bash -c 'exec 3<>/dev/tcp/192.168.1.4/2500; head -1 <&3'` → `SSH-2.0-OpenSSH...`; desde fuera de la LAN: `ssh -p 2500 devops@207.248.113.8` entra.
- **Observación si falló:** timeout en el test externo pero el interno OK.
- **Causa más probable de fallo:** regla pfSense no aplicada (falta Apply) o probaste desde dentro de la LAN (sin NAT reflection, el WAN IP no responde desde adentro — probar desde datos móviles o pedir al cliente).
- **Contramovimiento:** re-verificar la regla en pfSense (debe listar 2500→192.168.1.4), Apply Changes; confirmar DNAT en pve: `nft list chain inet vpsgw prerouting 2>/dev/null | grep 2500` (el nombre exacto de la tabla lo imprime el script).
- **Consecuencias posteriores:** si el plan B del Mov. 5 se activó, aquí el PORTFWD va en el script de gateway de pvedell y pfSense redirige a `192.168.1.96:2500`.

### Movimiento 8: Entrega al cliente y registro
- **Acción:** verificar que la pestaña Credenciales del panel muestra `davovps` (nodo pvedell, VMID, usuario devops, password). Preparar tarjeta de entrega:
  ```
  VPS davovps → ssh -p 2500 devops@207.248.113.8   pass: <del panel>
  Usuario devops (sudo) | Stack: Node 22 + PM2, Python 3.12, Docker
  BaaS 1-click: sudo install-supabase | Cambiar password: passwd
  ```
  Documentar en `C:\vpsserver\MANUAL-2-acceso-VPS.md`: nueva sección VPS #3 con nodo pvedell, VMID, IP interna, puerto WAN. Anotar en el manual que pvedell usa template **9001**.
- **Observación esperada si funcionó:** el cliente confirma acceso; credencial visible en el panel.
- **Observación si falló:** credencial ausente en la pestaña (solo pasa si el VPS se creó por fuera del panel).
- **Contramovimiento:** `POST /api/credentials/pvedell/<vmid>/regenerate` con el JWT (regenera y guarda; aplica al siguiente reinicio: `qm reboot <vmid>`).
- **Consecuencias posteriores:** ninguna; misión cumplida.

## Supuestos no resueltos
1. **Ruta exacta de la config de nodos en pve** — `/opt/vps-panel/backend/config/nodes.json` NO existe pese a que el código del repo la espera ahí; el backend deployado difiere del repo local `C:\vpsserver\panel`. El Movimiento 1 la localiza; si no aparece, abortar y reportar.
2. **Cómo corre el backend** (pm2 / systemd / nohup) — no hay unidad systemd evidente. El Movimiento 3 lo descubre; el riesgo real es relanzarlo mal.
3. **Permisos del token API del panel sobre pvedell** — el token funciona para listar (dashboard lo muestra online), pero clonar exige `VM.Clone/VM.Allocate`; no verificado. Countermove en Mov. 4.
4. **¿La NIC `nic0` de pvedell es Broadcom tg3 con `rx-vlan-offload [fixed]`?** — es un Dell (MAC 64:00:6a). Si lo es, ningún VPS de pvedell obtendrá DHCP vía VLAN 6 y el plan B (bridge interno + subred 192.168.8.0/24) es obligatorio. Se resuelve en el Mov. 5 con `ethtool`.
5. **Puerto de switch donde cuelga pvedell** — no mapeado; solo relevante si el Mov. 5 falla sin bug tg3.

## Condiciones de aborto
- **El panel queda caído tras el Movimiento 3 y no revive en 10 minutos** de intentos (restaurar `.bak`, relanzar desde el CWD correcto): restaurar el backup de nodes.json, relanzar con el comando original, reportar al usuario. El panel en producción vale más que el fix.
- **No se encuentra ninguna config con `pvedell` (Mov. 1 + contramovimiento agotados):** detenerse y reportar las rutas exploradas.
- **`qm clone 9001 ... --full` manual falla en pvedell** con error de storage/permiso no cubierto aquí: capturar el error crudo completo y reportar sin improvisar.
- **El plan B del Movimiento 5 se vuelve necesario** pero implica tocar el template 9001 mientras existen VPS de clientes ya corriendo en pvedell (hoy no los hay; verificar con `qm list`): si aparecieron, reportar antes de cambiar el bridge del template.
- Cualquier acción destructiva sobre VMIDs que no sean `davovps`/500-599 o el template 9001: prohibida; reportar.
