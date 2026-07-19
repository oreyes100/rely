# War-game: Replicar la plataforma VPS en un nodo Proxmox nuevo (Opción A)
> Ejecutor: corre los movimientos en orden. Antes de cada movimiento lee sus señales de fallo. Revisa las condiciones de aborto DESPUÉS de cada movimiento. No inventes IPs, contraseñas ni VMIDs: los que faltan están en "Suposiciones sin resolver".

## Objetivo de la misión
Dejar un servidor Proxmox nuevo (llamémoslo `nodoX`) sirviendo VPS de cliente con el mismo stack y aislamiento que `pve`/`pvececyte`: un template `ubuntu2404-devstack` que al primer arranque trae Node 22+PM2, Python3, Docker y `install-supabase`; un gateway local (bridge interno, DHCP, NAT a internet, aislamiento nftables); y `provision-vps.sh` funcionando. **Éxito medible:** un VPS de prueba clonado en `nodoX` (a) toma IP por DHCP en su subred propia, (b) `ping -c2 8.8.8.8` da exitcode 0, (c) `ping 192.168.1.1` (LAN escolar) da exitcode ≠ 0 (bloqueado), (d) acepta SSH por contraseña (`echo OK`), y (e) opcionalmente responde por un port-forward WAN. Todo persiste tras `reboot`.

## Resumen de reconocimiento (del MANUAL-3, memoria del proyecto y scripts del repo — NO re-descubrir)
- **Arquitectura elegida: Opción A (bridge interno por nodo).** Los VPS viven en un bridge SIN puerto físico (`vmbrN`); su tráfico nunca sale etiquetado por la NIC, así que **el bug tg3 es irrelevante y NO se tocan los switches**. El nodo es el router: IP `.1`, dnsmasq DHCP, NAT vía pfSense, aislamiento nftables. Esta es la razón por la que NO se usa VLAN tagged: la NIC Broadcom `tg3` tiene `rx-vlan-offload: on [fixed]` y rompe el paso de VLANs por bridge vlan-aware (clasifica la trama en VLAN 1). Diagnóstico de ese bug: `bridge fdb show | grep <MAC>` (NO tcpdump: el offload oculta el tag). Con Opción A ese problema no aparece.
- **Subredes ya usadas (NO reutilizar):** `pve`=192.168.6.0/24 (gw .1, bridge `vmbr0` tag 6); `pvececyte`=192.168.7.0/24 (gw .1, bridge interno `vmbr7`); `pvedell` reusa la 6 vía tag 6 apuntando al gateway de `pve`. **El nodo nuevo debe usar una subred libre, sugerida `192.168.8.0/24` con bridge interno `vmbr8` y tabla nft `vpsgw8`.** Verificar que .8 no esté tomada antes de comprometerla.
- **Salida a internet:** el default route del nodo va a pfSense (`192.168.1.1`, GUI `https://192.168.1.1:8443`, también publicada en `https://207.248.113.8:8444`). La WAN pública del sitio es `207.248.113.8`. Con Opción A pfSense NO necesita saber de la subred de VPS para la salida (llega ya "nateada" como IP del nodo en la LAN 192.168.1.x).
- **Archivos base en `C:\vpsserver` (fuente de verdad):**
  - `templates/vps-devstack.yaml` → snippet cloud-init (stack + `ssh_pwauth: true`). Va a `/var/lib/vz/snippets/vps-devstack.yaml`.
  - `templates/build-template-pvececyte.sh` → build del template con **bridge interno** (base para nodo nuevo; cambiar `vmbr7`→`vmbr8` y `--nameserver`).
  - `scripts/pvececyte-vps-gateway.sh` → gateway con bridge interno (BASE para nodos nuevos; ajustar GWIP/NET/BR/tabla nft).
  - `scripts/provision-vps.sh` → clona template 9000, espera IP, imprime credenciales. Regex de IP: `192\.168\.[67]\.` → hay que **añadir `8`** → `192\.168\.[678]\.`.
- **GOTCHA de cluster (crítico):** si `nodoX` se une a un cluster corosync con `pve`, los VMID son únicos a nivel cluster y el template **no podrá ser 9000** (ya existe en pve). En `pvedell` esto pasó: su template real es **9001**. Verificar con `qm list` / `pvecm status` ANTES de fijar el VMID del template.
- **Repos sin suscripción:** `apt-get update` falla con 401 en `enterprise.proxmox.com`. No importa: `dnsmasq`, `sshpass` y `wget` vienen de repos Debian; instálalos directo con `apt-get install -y <pkg>` (ignora el error del repo enterprise).
- **SSH por contraseña en el cloud image:** el image de Ubuntu trae `PasswordAuthentication no` en `50-cloud-init.conf`. El snippet lo arregla con `ssh_pwauth: true` (cloud-init escribe un drop-in que gana). Si un VPS no acepta password, ese es el punto a revisar (ver Movimiento 8).
- **Credenciales de nodos conocidas** (por si `nodoX` es uno ya visto): `pve`/`pvedell` = root/`Michoacan1`. Para un nodo genuinamente nuevo, la credencial root la da el operador (ver Suposiciones).

## Movimientos

### Movimiento 1: Reconocer el nodo y decidir subred/bridge/VMID
- **Acción:** SSH `root@<IP_nodoX>`. Ejecutar:
  ```bash
  pveversion; pvecm status 2>/dev/null | grep -i name || echo "NO-CLUSTER"
  qm list; pvesm status
  ip route | awk '/default/{print "DEFAULT_IF="$5" GW="$3}'
  DEFIF=$(ip route | awk '/default/{print $5; exit}')
  ethtool -k "$DEFIF" | grep rx-vlan-offload
  ip -br addr | grep -E '192\.168\.(6|7|8)\.' || echo "SUBREDES 6/7/8 LIBRES EN ESTE NODO"
  ```
- **Observación esperada si funcionó:** responde versión Proxmox 8/9; `qm list` NO tiene un VMID que planees usar; `pvesm status` muestra `local` y `local-lvm` activos con espacio (>25 GB); hay un default route hacia 192.168.1.1.
- **Observación si falló:** sin default route (no hay salida a internet), o `local-lvm` ausente/lleno, o el nodo está en cluster con pve (`pvecm status` muestra nombre de cluster y varios nodos).
- **Causa más probable de fallo:** nodo recién instalado sin red configurada, o storage por defecto distinto (ZFS `local-zfs` en vez de `local-lvm`).
- **Contramovimiento:** si el storage es ZFS, usa `STORAGE=local-zfs` en todos los `qm` posteriores. Si NO hay internet, PARA (condición de aborto). **Si está en cluster con pve → el template NO puede ser 9000; usa 9002 (9000 y 9001 ya tomados por pve/pvedell) y anótalo.** Si no está en cluster, el template puede ser 9000.
- **Consecuencias posteriores:** fija aquí y anota para el resto del brief: `TVMID` (template: 9000 si standalone, 9002 si en cluster), `STORAGE` (local-lvm o local-zfs), `SUBNET` (192.168.8.0/24 salvo colisión), `BR=vmbr8`, `GWIP=192.168.8.1`.

### Movimiento 2: Habilitar snippets y colocar el cloud-init
- **Acción:**
  ```bash
  pvesm set local --content iso,backup,vztmpl,snippets
  ```
  Transferir `C:\vpsserver\templates\vps-devstack.yaml` a `/var/lib/vz/snippets/vps-devstack.yaml`. Si no hay copia de archivos, usar base64:
  `echo '<BASE64_DEL_YAML>' | base64 -d > /var/lib/vz/snippets/vps-devstack.yaml`.
  Verificar: `head -1 /var/lib/vz/snippets/vps-devstack.yaml` debe imprimir `#cloud-config` y `grep ssh_pwauth` debe aparecer `ssh_pwauth: true`.
- **Observación esperada si funcionó:** `pvesm status`/config de `local` incluye `snippets`; el archivo existe, empieza en `#cloud-config`, contiene `ssh_pwauth: true` e `install-supabase`.
- **Observación si falló:** `pvesm set` da "storage 'local' does not support content type 'snippets'" (storage equivocado), o el `head -1` NO es `#cloud-config` (base64 corrupto/truncado).
- **Causa más probable de fallo:** base64 pegado con saltos de línea o incompleto; o `local` no es de tipo dir.
- **Contramovimiento:** re-transferir con `base64 -w0` en origen (una sola línea) o `sha256sum` en ambos lados para confirmar integridad. Si `local` no soporta snippets, crear un storage dir: `pvesm add dir localsnip --path /var/lib/vz --content snippets` y usar `localsnip:snippets/...` en el `cicustom`.
- **Consecuencias posteriores:** si el snippet está corrupto, el template arranca pero NO instala el stack ni habilita password → los movimientos 7-8 fallan silenciosamente. Vale la pena verificar bien aquí.

### Movimiento 3: Descargar la cloud image y crear la VM base del template
- **Acción:**
  ```bash
  TVMID=<del Mov.1>; STORAGE=<del Mov.1>; BR=vmbr8
  IMG=/var/lib/vz/template/iso/noble-server-cloudimg-amd64.img
  [ -f "$IMG" ] || wget -O "$IMG" https://cloud-images.ubuntu.com/noble/current/noble-server-cloudimg-amd64.img
  qm destroy $TVMID --purge 2>/dev/null || true
  qm create $TVMID --name ubuntu2404-devstack --memory 2048 --cores 2 --cpu host \
    --net0 virtio,bridge=$BR --scsihw virtio-scsi-pci --ostype l26 \
    --agent enabled=1 --serial0 socket --vga serial0
  qm importdisk $TVMID "$IMG" $STORAGE
  ```
  > Nota: el bridge `vmbr8` puede no existir todavía; para CREAR la VM basta que exista el bridge. Si `qm create` se queja de que `vmbr8` no existe, salta al Movimiento 5 (crear el bridge) y vuelve — o crea el bridge mínimo ahora: `ip link add vmbr8 type bridge; ip link set vmbr8 up`.
- **Observación esperada si funcionó:** `wget` baja ~600 MB sin error; `qm create` retorna sin error; `qm importdisk` termina con "Successfully imported disk" y `test -f /etc/pve/qemu-server/$TVMID.conf` existe.
- **Observación si falló:** `wget` 404/timeout (sin DNS o sin internet); `importdisk` parece colgado o "termina" pero NO existe el `.conf`.
- **Causa más probable de fallo:** almacenamiento lento → `importdisk` tarda varios minutos y parece terminar sin crear la VM (bug conocido); o sin resolución DNS en el nodo.
- **Contramovimiento:** para DNS, `echo 'nameserver 8.8.8.8' >> /etc/resolv.conf` y reintentar `wget`. Para el importdisk fantasma: **verificar SIEMPRE** `test -f /etc/pve/qemu-server/$TVMID.conf && qm config $TVMID | grep unused` — el disco importado aparece como `unused0`. Si no existe, re-correr `qm importdisk`.
- **Consecuencias posteriores:** el disco queda como `unused0`; el Movimiento 4 lo engancha como `scsi0`.

### Movimiento 4: Cablear disco, cloud-init y convertir en template
- **Acción:**
  ```bash
  qm set $TVMID --scsi0 $STORAGE:vm-$TVMID-disk-0,discard=on
  qm set $TVMID --ide2 $STORAGE:cloudinit
  qm set $TVMID --boot order=scsi0
  qm set $TVMID --ciuser devops --ciupgrade 1
  qm set $TVMID --ipconfig0 ip=dhcp
  qm set $TVMID --nameserver 192.168.8.1
  qm set $TVMID --cicustom vendor=local:snippets/vps-devstack.yaml
  qm disk resize $TVMID scsi0 20G
  qm template $TVMID
  ```
- **Observación esperada si funcionó:** cada `qm set` sin error; `qm config $TVMID` muestra `scsi0`, `ide2: ...cloudinit`, `cicustom: vendor=local:snippets/vps-devstack.yaml`, `template: 1`.
- **Observación si falló:** `--scsi0` falla porque el nombre real del disco no es `vm-$TVMID-disk-0` (en ZFS puede diferir), o `cicustom` rechaza la ruta del snippet.
- **Causa más probable de fallo:** nombre de disco distinto según storage; o el snippet quedó en `localsnip` (Mov.2 contramovimiento) y aquí se referencia `local`.
- **Contramovimiento:** obtener el nombre real: `qm config $TVMID | grep unused` (muestra `unused0: STORAGE:<nombre-real>`), y usar ESE nombre en `--scsi0`. Ajustar `--cicustom` al storage donde de verdad quedó el snippet.
- **Consecuencias posteriores:** con `template: 1`, el Movimiento 7 clona de aquí. Si olvidaste `qm template`, `provision-vps.sh` clona igual pero deja el "template" arrancable y editable (menos limpio) — conviértelo.

### Movimiento 5: Montar el gateway del nodo (bridge interno + NAT + DHCP + aislamiento)
- **Acción:** copiar `scripts/pvececyte-vps-gateway.sh` al nodo como `/root/vps-gateway.sh`. Editar SOLO la cabecera:
  ```bash
  GWIP=192.168.8.1
  NET=192.168.8.0/24
  UPLINK=vmbr0          # el bridge/NIC con el default route (confirmado en Mov.1: $DEFIF)
  BR=vmbr8              # bridge interno nuevo, sin puerto físico
  ```
  Además, **renombrar la tabla nft** dentro del script de `vpsgw7`→`vpsgw8` (para no chocar con otra en el mismo nodo — normalmente no aplica en nodo nuevo, pero hazlo por convención) y **añadir las reglas de aislamiento de las OTRAS subredes**: que dropee hacia `192.168.6.0/24` y `192.168.7.0/24` además de la LAN `192.168.0.0/22`. Luego:
  ```bash
  chmod +x /root/vps-gateway.sh
  apt-get install -y dnsmasq         # ignora el 401 del repo enterprise
  bash /root/vps-gateway.sh
  # verificación inmediata:
  ip -br addr show $BR                                  # debe tener 192.168.8.1/24, state UP
  nft list table inet vpsgw8 | grep -E 'masquerade|drop'
  systemctl is-active dnsmasq
  sysctl net.ipv4.ip_forward                            # = 1
  ```
- **Observación esperada si funcionó:** `vmbr8` UP con `192.168.8.1/24`; la tabla `inet vpsgw8` tiene `masquerade` (postrouting) y varios `drop`; `dnsmasq` active; `ip_forward = 1`.
- **Observación si falló:** dnsmasq no arranca (`Address already in use` :53 si hay `systemd-resolved` o `pdns`); o `vmbr8` sin IP; o `nft` error de sintaxis por edición.
- **Causa más probable de fallo:** el puerto 53 ya está ocupado por otro resolvedor en el nodo; o edición manual rompió el heredoc `NFT`.
- **Contramovimiento:** para :53 ocupado, en `/etc/dnsmasq.d/vps.conf` limitar a DHCP-only con `port=0` NO (necesitamos DNS para los VPS) → mejor `bind-interfaces` + `interface=vmbr8` + `except-interface=lo` (ya está en el script) y, si aun choca, `systemctl stop systemd-resolved` o mover su listener. Para el nft roto: `nft -c -f /root/vps-gateway.sh`... no aplica (es bash); en su lugar `nft list ruleset | grep vpsgw8` y re-editar. Re-correr el script (es idempotente).
- **Consecuencias posteriores:** este servicio es el gateway de TODOS los VPS del nodo. Si no persiste, tras un reboot los VPS quedan sin red. El Movimiento 6 lo persiste.

### Movimiento 6: Persistir gateway (systemd) y colocar provision-vps.sh
- **Acción:**
  ```bash
  printf 'net.ipv4.ip_forward=1\n' > /etc/sysctl.d/99-vps-forward.conf
  cat > /etc/systemd/system/vps-gw.service <<'UNIT'
  [Unit]
  Description=VPS gateway
  After=network-online.target
  Wants=network-online.target
  [Service]
  Type=oneshot
  ExecStart=/root/vps-gateway.sh
  RemainAfterExit=yes
  [Install]
  WantedBy=multi-user.target
  UNIT
  systemctl daemon-reload && systemctl enable vps-gw.service
  ```
  Copiar `scripts/provision-vps.sh` a `/root/provision-vps.sh`, `chmod +x`, y **editar el regex de detección de IP** para incluir la subred nueva: cambiar `192\.168\.[67]\.\d+` por `192\.168\.[678]\.\d+`. Si `TVMID` no es 9000, cambiar también `TEMPLATE=9000` a `TEMPLATE=$TVMID` en el script.
- **Observación esperada si funcionó:** `systemctl is-enabled vps-gw.service` = `enabled`; `grep -n '\[678\]' /root/provision-vps.sh` encuentra el regex corregido; `grep TEMPLATE= /root/provision-vps.sh` muestra el VMID correcto.
- **Observación si falló:** el regex sigue en `[67]` (los VPS de la subred 8 nunca reportarán IP → provision "cuelga" 10 min y termina con "IP: pendiente"); o `TEMPLATE=9000` cuando el template es 9002 (clona un VMID inexistente → error).
- **Causa más probable de fallo:** olvidar una de las dos ediciones del script.
- **Contramovimiento:** re-editar. Ambos son cambios de una línea; confirmarlos con `grep` antes de seguir.
- **Consecuencias posteriores:** con esto el nodo queda listo para producir VPS. Sin la edición del regex, TODOS los provisioning parecerán fallar aunque el VPS esté sano.

### Movimiento 7: Clonar un VPS de prueba y esperar IP por DHCP
- **Acción:**
  ```bash
  /root/provision-vps.sh <VMID_PRUEBA> vps-test-nodoX 2 2048 20 'TestNodoX-2026!'
  ```
  (VMID_PRUEBA en el rango libre del nodo, ej. 220 si standalone.)
- **Observación esperada si funcionó:** el script imprime al final `IP: 192.168.8.1xx`, usuario `devops`, la password dada. Confirmar: `grep vps-test /var/lib/misc/dnsmasq.leases`.
- **Observación si falló:** termina con `IP: pendiente (revisa consola)`; `dnsmasq.leases` vacío para ese host.
- **Causa más probable de fallo:** (a) regex no corregido (Mov.6) → la IP existe pero no se detecta; (b) el guest-agent aún no sube (primer arranque instala todo el stack, 2-4 min); (c) el snippet no corrió (cloud-init sin internet dentro del VPS → NAT del gateway mal).
- **Contramovimiento:** primero `qm guest cmd <VMID_PRUEBA> network-get-interfaces | grep -o '192\.168\.8\.[0-9]*'` para ver la IP real (descarta el bug del regex). Si no hay IP: `qm terminal <VMID_PRUEBA>` (Ctrl+O para salir) y mirar si cloud-init corre; revisar en el nodo `journalctl -u dnsmasq | tail` para ver si se pidió DHCP. Si el VPS pide pero no recibe, revisar que `vmbr8` esté UP y el VPS colgado de `vmbr8` (`qm config <VMID> | grep net0`).
- **Consecuencias posteriores:** anotar la IP y MAC del VPS de prueba; se usan en el Movimiento 8 y 9.

### Movimiento 8: Verificación end-to-end (internet, aislamiento, SSH)
- **Acción:** desde el shell del nodo (sustituye `<IP>` y `<VMID>`):
  ```bash
  qm agent <VMID> ping && echo AGENT_OK
  qm guest exec <VMID> -- ping -c2 8.8.8.8 | grep exitcode        # espera 0
  qm guest exec <VMID> -- ping -c1 -W2 192.168.1.1 | grep exitcode # espera !=0 (bloqueado)
  qm guest exec <VMID> -- ping -c1 -W2 192.168.6.1 | grep exitcode # espera !=0 (aislado de otros nodos)
  apt-get install -y sshpass 2>/dev/null
  sshpass -p 'TestNodoX-2026!' ssh -o StrictHostKeyChecking=no devops@<IP> 'echo LOGINOK $(hostname); node -v; python3 -V; docker --version'
  ```
- **Observación esperada si funcionó:** `AGENT_OK`; internet `exitcode: 0`; LAN escolar y subred 6 con `exitcode:` distinto de 0; SSH imprime `LOGINOK`, versión de Node (v22), Python 3.12 y Docker.
- **Observación si falló:** internet exitcode ≠ 0 (NAT roto); LAN exitcode 0 (aislamiento NO funciona — grave); SSH pide password infinitamente o `Permission denied` (password auth deshabilitado).
- **Causa más probable de fallo:** NAT: falta `masquerade` o `ip_forward=0`. Aislamiento roto: reglas `drop` mal ordenadas (el `established,related accept` debe ir ANTES de los drops, pero un `ip saddr $NET accept` general NO debe preceder a los drops). SSH: el snippet no aplicó `ssh_pwauth` (drop-in `50-cloud-init.conf` ganó).
- **Contramovimiento:**
  - NAT: `sysctl -w net.ipv4.ip_forward=1; bash /root/vps-gateway.sh` y reintentar.
  - Aislamiento: `nft list table inet vpsgw8` y confirmar orden: `ct state established,related accept` → los `drop` de 192.168.0.0/22, .6, .7 → `ip saddr $NET accept` al final. Reordenar en el script y re-correr.
  - SSH password: dentro del VPS (por `qm terminal` o SSH con llave si la hay) crear `/etc/ssh/sshd_config.d/00-pwauth.conf` con `PasswordAuthentication yes` (el prefijo `00-` gana porque sshd toma el primer valor) y `systemctl restart ssh`. Para futuros VPS ya está cubierto por `ssh_pwauth: true` en el snippet.
- **Consecuencias posteriores:** si el aislamiento falla, NO entregues VPS de este nodo hasta arreglarlo (fuga hacia la LAN escolar es la condición de aborto principal). Si todo pasa, el nodo está en producción.

### Movimiento 9: (Opcional) Port-forward de entrada para un VPS
- **Acción:** fijar la IP del VPS por reserva DHCP y abrir el puerto WAN.
  ```bash
  # en el nodo: reserva la IP del VPS de prueba
  MAC=$(qm config <VMID> | grep -oP 'virtio=\K[0-9A-F:]+')
  echo "dhcp-host=$MAC,192.168.8.150" >> /etc/dnsmasq.d/vps-static.conf
  systemctl restart dnsmasq
  # añadir al array PORTFWD de /root/vps-gateway.sh:  "2203:192.168.8.150:22"
  bash /root/vps-gateway.sh
  ```
  En pfSense (GUI `https://192.168.1.1:8443` → Firewall → NAT → Port Forward → Add):
  Interface **WAN**, TCP, Destination **WAN address**, puerto **2203**, Redirect target IP = **IP del nodoX en la LAN (192.168.1.x)**, Redirect target port **2203**, marcar "Add associated filter rule", Save + Apply.
- **Observación esperada si funcionó:** desde un host externo `ssh -p 2203 devops@207.248.113.8` muestra el banner/login del VPS.
- **Observación si falló:** conexión rechazada o timeout.
- **Causa más probable de fallo:** falta la regla pfSense (o cayó FUERA del bloque `<nat>` del config.xml — pasó antes); o el DNAT del nodo apunta a una IP que el VPS aún no fijó (reserva DHCP no aplicada hasta que el VPS renueve lease).
- **Contramovimiento:** forzar renovación en el VPS (`qm guest exec <VMID> -- dhclient -r; ... dhclient`) o reiniciarlo para que tome la IP reservada. En pfSense verificar la regla con `grep -n "<nat>\|</nat>" /cf/conf/config.xml` y que la regla esté DENTRO; si no aparece en `pfctl`, correr `/etc/rc.filter_configure_sync` dos veces. **Advertir al operador** de que el port-forward expone el VPS a internet — pedir OK explícito antes de aplicarlo en pfSense (acción externa/irreversible-ish).
- **Consecuencias posteriores:** documentar el puerto WAN asignado para no reusarlo. Convención: SSH=`2000+id`, HTTP=`8000+id`.

### Movimiento 10: Documentar el nodo nuevo
- **Acción:** actualizar `C:\vpsserver\MANUAL-2-acceso-VPS.md` (agregar VPS del nodo con IP/puerto/credencial) y la memoria del proyecto `infra-vps-cecytem.md` (nodo, subred 192.168.8.0/24, bridge vmbr8, tabla vpsgw8, VMID template). Registrar la subred como "usada".
- **Observación esperada si funcionó:** el MANUAL-2 lista el VPS nuevo; la memoria refleja el nodo.
- **Observación si falló:** N/A (edición de docs local).
- **Causa más probable de fallo:** N/A.
- **Contramovimiento:** N/A.
- **Consecuencias posteriores:** el siguiente nodo elegirá la subred 192.168.9.0/24 mirando este registro.

## Suposiciones sin resolver
- **Identidad y credencial del `nodoX`**: IP de gestión y root password del servidor nuevo. Si es `pvedell` (192.168.1.96) o un nodo ya visto, root=`Michoacan1`. Para uno genuinamente nuevo, lo aporta el operador. NO inventar.
- **¿El nodo se unirá al cluster corosync `vps-cluster`?** Determina si el template puede ser 9000 (standalone) o debe ser ≥9002 (cluster). Resuelto en vivo en el Movimiento 1 con `pvecm status`; si el operador planea unirlo DESPUÉS, usar VMID de cluster desde ya.
- **Subred asignada**: se asume `192.168.8.0/24`/`vmbr8`. Si el operador ya la reservó para otra cosa, pedir cuál usar (9, 10, …). Verificado parcialmente en Mov.1.
- **Storage**: se asume `local-lvm`. Si el nodo usa ZFS (`local-zfs`) el nombre del disco importado difiere (Mov.4 lo maneja).
- **Rango de VMID para VPS de cliente en este nodo**: convención sugerida por nodo (pve 2xx, etc.); confirmar con el operador para no chocar en cluster.

## Condiciones de aborto (PARA y reporta al operador)
- El nodo **no tiene salida a internet** (sin default route o `wget` de la cloud image falla tras arreglar DNS): sin internet no se puede construir el template ni correr cloud-init. Reportar.
- **El aislamiento falla** (Movimiento 8: el VPS alcanza `192.168.1.1` con exitcode 0) y re-correr el gateway no lo corrige: NO entregar VPS; hay fuga hacia la LAN escolar. Reportar con `nft list ruleset`.
- `local-lvm`/`local-zfs` con **menos de ~25 GB libres**: no cabe el template + un VPS. Reportar espacio.
- Cualquier acción sobre **pfSense o los switches** más allá de leer estado: son infraestructura compartida en producción. El port-forward (Mov.9) requiere **OK explícito del operador** antes de aplicar la regla WAN. No tocar switches en Opción A.
- Si `pvecm status` revela que el nodo está en cluster y **no está claro qué VMID/subred son seguros**, PARA y pide al operador el rango asignado antes de clonar nada.
