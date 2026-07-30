# War-game: creación de VMs con placement por recursos — dos tiers (SSD rendimiento / HDD datos)
> Ejecutor: corre los movimientos en orden. Antes de cada movimiento lee sus señales de fallo. Revisa las condiciones de aborto después de CADA movimiento. Los movimientos 1–3 son operaciones en pvelenovo (GUI/shell Proxmox); 4–7 son código en el repo `C:\vpsserver`; 8–9 son prueba y deploy. No mezclar: el código NO se despliega hasta que la prueba E2E del movimiento 8 pase.

## Objetivo de la misión
Que el panel VPS (y cualquier creación manual) coloque los discos de las VMs nuevas según el perfil de recursos solicitado, aprovechando el esquema de dos tiers ya construido en pvelenovo:

- **Perfil RENDIMIENTO** (alto desempeño, disco pequeño): disco único del OS en el SSD (`local-lvm`, /dev/sda). Límite: ≤ 60GB.
- **Perfil DATOS** (OS ágil + almacenamiento grande): OS pequeño (≤ 40GB) en SSD + segundo disco de datos en el HDD (`hdd1tb`, /dev/sdb), montado en `/data` dentro del guest.
- **Perfil MASIVO** (legacy/pesado, baja prioridad de IO): todo en `hdd1tb` (como quedó el VM 104).

**Éxito =** una petición al panel con `{diskGb: 20, dataDiskGb: 100}` produce en pvelenovo una VM con `scsi0` en `local-lvm` (20G, `discard=on,ssd=1`) y `scsi1` en `hdd1tb` (100G) montado en `/data`; una petición `{diskGb: 30}` produce disco único en `local-lvm`; el aprovisionamiento en el nodo `pve` sigue funcionando EXACTAMENTE igual que hoy (retrocompatibilidad total); el guardrail del SSD rechaza con 409 cuando el pool no tiene margen.

## Resumen de reconocimiento (2026-07-23, código en vivo + shell pvelenovo)

### Cómo aprovisiona el panel HOY (repo `C:\vpsserver`)
- `panel/backend/config/nodes.json`: un solo campo `storage` por nodo (mono-tier), más `templateVmid: 9000`, `vmidRange`, `subnetPrefix`. Nodos actuales: pve (192.168.1.4, rango 200-299), pvececyte (300-399), aulamedios hyperv (500-599). **pvelenovo NO está registrado.**
- `panel/backend/src/services/provision.js`: clon completo del template → `cfg.storage`; PUT config (cores/memory/cipassword/tags); si `diskGb > 20` hace resize de `scsi0`; start. **Modelo de un solo disco.** La limpieza en fallo usa `stopAndDestroy` (destroy con `purge: 1` — borra TODOS los discos de la VM, incluido un futuro scsi1: correcto sin cambios).
- `checkCapacity()` (mismo archivo): valida RAM del nodo + `avail` de UN storage.
- `panel/backend/src/services/node-selector.js`: `gatherNodeMetrics` lee solo `cfg.storage`; `meetsRequirements = memFree ≥ ram+2GB && diskFree ≥ diskGb`; scoring `0.6*disco + 0.3*ram + 0.1*cpu`; selector IA opcional con prompt JSON.
- `panel/backend/src/middleware/validate.js`: `validateProvision` construye `req.provision` — hay que extenderlo para `dataDiskGb`/`profile` (leerlo antes de tocarlo).
- `panel/backend/src/routes/services.js`: catálogo con recursos fijos (p.ej. `{cores:4, memoryMb:8192, diskGb:60}`) — consumidor del mismo `provisionVm`.

### Estado de pvelenovo (192.168.1.15, PVE 9.2.2)
- Storages en `/etc/pve/storage.cfg`: `local` (dir, content **iso,backup,vztmpl,import — SIN `snippets`**), `local-lvm` (lvmthin SSD, 144.85G, 0.18% usado), `hdd1tb` (lvmthin HDD, 927GB, 11.7% usado).
- **`/var/lib/vz/snippets/` NO EXISTE** → el cloud-init custom del template no funcionaría hoy en este nodo. Gap crítico #1.
- Backup del template restaurable localmente: `/var/lib/vz/dump/vzdump-qemu-9000-2026_07_17-10_50_17.vma.zst` (526M). VMID 9000 libre en el nodo (solo existe VM 104, running — NO TOCAR).
- Usuario **`panel@pve` ("Panel de gestion VPS") ya existe** en pvelenovo. Su token API NO está verificado (el listado fue bloqueado en la sesión de recon; verificarlo es parte del Movimiento 3).
- El snippet original vive en pve: `root@192.168.1.4:/var/lib/vz/snippets/vps-devstack.yaml` (SSH con llave `id_ed25519` desde Windows funciona; entre nodos root@pve acepta la misma llave si está en authorized_keys — si no, copiar vía la máquina Windows con scp en dos saltos).
- Reglas heredadas de los war-games anteriores: discos en SSD siempre con `discard=on,ssd=1`; el pool SSD NO puede autoextenderse (0 espacio libre en el VG); jamás tocar VM 104, VM 210, node pve, /dev/sda.

### Trampas conocidas del template (verificar tras restaurar, Movimiento 1)
- En pve el template puede tener `net0` con **tag VLAN 6** (red de clientes de pve). En pvelenovo esa VLAN no existe con DHCP — una VM clonada con tag=6 arranca SIN IP. Hay que quitar el tag en la copia local del template.
- Posición del drive cloud-init (¿ide2? ¿scsi1?): determina qué slot queda libre para el disco de datos y cómo se enumeran los devices en el guest (/dev/sdb vs /dev/sdc). No asumir: leer `qm config 9000` tras restaurar.

## Movimientos

### Movimiento 1: Restaurar el template 9000 en pvelenovo y adaptarlo al nodo
- **Acción:** en shell de pvelenovo:
  ```
  qmrestore /var/lib/vz/dump/vzdump-qemu-9000-2026_07_17-10_50_17.vma.zst 9000 --storage local-lvm
  qm config 9000
  ```
  Del config leído: (a) confirmar `template: 1` (un vzdump de template restaura como template; si no, `qm template 9000`); (b) anotar el slot del drive cloudinit y el bus del disco OS; (c) si `net0` trae `tag=6`, reescribir la línea sin tag apuntando al bridge local (verificar nombre con `ip link | grep vmbr`, normalmente `vmbr0`); (d) añadir a scsi0 `discard=on,ssd=1` reescribiendo su línea actual con esos parámetros extra.
- **Observación esperada si funcionó:** `qm config 9000` muestra template en local-lvm, scsi0 con `discard=on,ssd=1`, net0 sin tag, y `pvesm status` refleja ~3-4GB usados en local-lvm (el disco base del template).
- **Observación esperada si falló:** qmrestore aborta (checksum/espacio), o el 9000 queda como VM normal arrancable.
- **Causa más probable de fallo:** dump corrupto o VMID en uso.
- **Contramovimiento:** si el dump está corrupto, regenerarlo en pve (`vzdump 9000 --storage local --mode stop --compress zstd`) y copiarlo por SSH; si 9000 estuviera ocupado (no debería — recon dice libre), usar 9001 y ajustar `templateVmid` en la entrada de nodes.json del Movimiento 4.
- **Consecuencias posteriores:** sin este template local no hay clones en pvelenovo — todo lo demás depende de él. El tag VLAN mal puesto no falla el clon: falla SILENCIOSAMENTE en red (VM sin IP), por eso se corrige aquí y se re-verifica en el E2E del Movimiento 8.

### Movimiento 2: Snippets + cloud-init con formateo seguro del disco de datos
- **Acción:**
  1. `mkdir -p /var/lib/vz/snippets` en pvelenovo y habilitar el content type: `pvesm set local --content iso,backup,vztmpl,import,snippets`.
  2. Copiar `vps-devstack.yaml` desde pve al mismo path (scp directo entre nodos, o vía la máquina Windows).
  3. Confirmar que el `cicustom` del template referencia `local:snippets/vps-devstack.yaml` (mismo storage-id en ambos nodos → el mismo config de template funciona en los dos).
  4. Crear una VARIANTE `vps-devstack-data.yaml` (no tocar el original todavía) que añade al final un `runcmd` guardado para el disco de datos:
     ```yaml
     # formatea y monta el disco de datos SOLO si existe y está virgen
     - |
       DEV=/dev/sdb
       if [ -b "$DEV" ] && [ -z "$(blkid -o value -s TYPE $DEV 2>/dev/null)" ]; then
         mkfs.ext4 -L datos "$DEV" && mkdir -p /data && \
         echo "LABEL=datos /data ext4 defaults,nofail 0 2" >> /etc/fstab && mount /data
       fi
     ```
     La doble guarda (`-b` existe + `blkid` vacío) hace el snippet inocuo en VMs de un solo disco y en reinicios — nunca reformatea.
- **Observación esperada si funcionó:** `pvesm list local --content snippets` lista ambos yaml; `cat` de la variante muestra el runcmd.
- **Observación esperada si falló:** `pvesm set` rechaza el content type, o el clon del Movimiento 8 arranca sin aplicar cloud-init (password devops no funciona).
- **Causa más probable de fallo:** snippet no copiado exactamente al path que dice el `cicustom`, o content type sin aplicar.
- **Contramovimiento:** `qm cloudinit dump <vmid> user` sobre el clon de prueba muestra QUÉ user-data está sirviendo Proxmox — si sale el default en vez del snippet, el path/storage-id está mal.
- **Consecuencias posteriores:** define el contrato del Movimiento 5: las VMs con disco de datos usan `cicustom` → variante `-data`; el device asumido es `/dev/sdb` — el E2E del Movimiento 8 DEBE verificar que scsi1 enumera como sdb en el guest (si el drive cloudinit fuera scsi y desplazara la enumeración, cambiar DEV en la variante antes de desplegar).

### Movimiento 3: Token API del panel en pvelenovo
- **Acción:** el usuario `panel@pve` ya existe. Listar sus tokens (`pveum user token list panel@pve`); si no hay uno llamado `panel`:
  ```
  pveum user token add panel@pve panel --privsep 0
  pveum aclmod / -user panel@pve -role PVEVMAdmin
  pveum aclmod /storage -user panel@pve -role PVEDatastoreUser
  ```
  GUARDAR el secret mostrado (solo aparece una vez) para el nodes.json de producción del Movimiento 9. Replicar los ACLs que tiene el token equivalente en pve si difieren.
- **Observación esperada si funcionó:** `curl -sk -H "Authorization: PVEAPIToken=panel@pve!panel=<secret>" https://192.168.1.15:8006/api2/json/nodes` responde JSON con el nodo.
- **Observación esperada si falló:** 401 (secret/formato mal) o 403 (ACL insuficiente).
- **Causa más probable de fallo:** privilege separation activada (`--privsep 1` por defecto crea un token SIN los permisos del usuario).
- **Contramovimiento:** recrear el token con `--privsep 0`, o dar ACLs directamente al token (`-token 'panel@pve!panel'` en aclmod).
- **Consecuencias posteriores:** sin token válido el panel no puede ni listar pvelenovo — el Movimiento 9 quedaría bloqueado. Nota: la sesión de recon no pudo listar tokens (bloqueo del clasificador de automatización); si el ejecutor tampoco puede, pedirle al usuario que corra el listado a mano.

### Movimiento 4: Esquema nodes.json v2 — tier bulk opcional por nodo
- **Acción:** en el repo:
  1. `panel/backend/src/config.js`: `storageBulk` es campo OPCIONAL de nodos proxmox (no añadirlo a `required_proxmox`); ningún nodo existente cambia.
  2. `panel/backend/config/nodes.example.json`: añadir la entrada de ejemplo de pvelenovo:
     ```json
     {
       "name": "pvelenovo", "host": "192.168.1.15", "port": 8006,
       "tokenId": "panel@pve!panel", "tokenSecret": "PEGA-AQUI",
       "storage": "local-lvm", "storageBulk": "hdd1tb",
       "templateVmid": 9000, "vmidRange": [400, 499],
       "subnetPrefix": "192.168.1.", "verifyTls": false
     }
     ```
- **Observación esperada si funcionó:** backend arranca en local con un nodes.json que incluye la entrada (con secret dummy) sin errores de validación.
- **Observación esperada si falló:** `process.exit(1)` por campo faltante.
- **Causa más probable de fallo:** meter storageBulk como requerido y romper pve/pvececyte.
- **Contramovimiento:** mantenerlo opcional; la semántica es "sin storageBulk = nodo mono-tier, se comporta como hoy".
- **Consecuencias posteriores:** `cfg.storageBulk` es la señal que usan provision (Mov. 5) y selector (Mov. 6) para saber si un nodo admite perfil DATOS.

### Movimiento 5: provision.js + validate.js + checkCapacity con dos tiers
- **Acción:**
  1. `validate.js` → `validateProvision`: aceptar `dataDiskGb` opcional (entero 10–800; 0/ausente = sin disco de datos). Mantener `diskGb` con su semántica actual (disco OS). Rechazar `diskGb > 60` con mensaje "usa dataDiskGb para almacenamiento grande" SOLO cuando el nodo destino tenga storageBulk; en nodos mono-tier no cambiar reglas (retrocompatibilidad con services.js que pide 60G).
  2. `checkCapacity(nodeName, {memoryMb, diskGb, dataDiskGb})`: si hay `dataDiskGb`, exigir `cfg.storageBulk` (409 si el nodo no lo tiene) y validar avail de AMBOS storages. Guardrail SSD adicional: leer `/nodes/X/storage/<fast>/status` y rechazar si `used/total > 0.70` ("tier rápido saturado, libera espacio o usa otro nodo").
  3. `provisionVm`: tras el clone y el PUT de config, si `dataDiskGb > 0`: (a) PUT config `{ scsi1: \`${cfg.storageBulk}:${dataDiskGb}\` }` (la API crea el volumen); (b) usar `cicustom` apuntando a la variante `-data` del snippet (PUT config `{ cicustom: 'user=local:snippets/vps-devstack-data.yaml' }`) ANTES del start. El resize de scsi0 y el resto del flujo no cambian. El catch de limpieza ya purga scsi1 (destroy con purge).
- **Observación esperada si funcionó:** unit-smoke local: petición sin dataDiskGb genera exactamente las mismas llamadas API que hoy (revisar con log); con dataDiskGb añade solo el PUT de scsi1 y el cicustom.
- **Observación esperada si falló:** clones en pve (mono-tier) empiezan a fallar, o el scsi1 se crea en el storage rápido.
- **Causa más probable de fallo:** usar `cfg.storage` en lugar de `cfg.storageBulk` en la línea del scsi1 (typo de una palabra, coloca 100-800GB en el SSD y lo revienta).
- **Contramovimiento:** aserción explícita en el código: si `dataDiskGb > 0 && !cfg.storageBulk` lanzar 409 ANTES de clonar; y en el E2E verificar el volid del scsi1 empieza con `hdd1tb:`.
- **Consecuencias posteriores:** este es el corazón de la política. El orden importa: scsi1 + cicustom deben quedar ANTES del primer start (cloud-init solo corre completo en el primer boot).

### Movimiento 6: node-selector consciente de tiers
- **Acción:** en `node-selector.js`:
  1. `gatherNodeMetrics`: leer también `storageBulk` cuando exista (`bulkFreeGb`); `meetsRequirements` pasa a: RAM ok Y fast ≥ diskGb Y (si dataDiskGb>0 → tiene storageBulk Y bulk ≥ dataDiskGb).
  2. Scoring rule-based: cuando la petición trae dataDiskGb, el término de disco usa `bulkFreeGb` (el cuello real); si no, se queda como está.
  3. Prompt IA: incluir `bulkFreeGb` y la regla "OS→tier rápido, datos→tier bulk" en el texto; los nodos no elegibles ya quedan filtrados antes.
- **Observación esperada si funcionó:** con dataDiskGb=100, solo pvelenovo resulta elegible (único nodo con storageBulk) y el selector lo elige con razón coherente; sin dataDiskGb el ranking actual no cambia (regresión cero en pve/pvececyte).
- **Observación esperada si falló:** peticiones normales dejan de elegir pve, o un nodo mono-tier gana una petición con disco de datos y provision revienta después.
- **Causa más probable de fallo:** filtrar elegibilidad en el scoring pero no en `meetsRequirements` (la IA puede escoger un nodo inválido).
- **Contramovimiento:** la validación dura vive en `meetsRequirements` + la aserción del Movimiento 5; la IA solo ordena entre elegibles.
- **Consecuencias posteriores:** con esto el "de acuerdo a los recursos solicitados" es automático: el perfil lo infiere la forma de la petición (con/sin dataDiskGb) y el selector enruta al nodo correcto.

### Movimiento 7: Frontend — formulario con dos discos
- **Acción:** en el formulario de creación de VPS del frontend (`panel/frontend/src/` — localizar el componente de creación): añadir campo "Disco de datos (HDD)" opcional con ayuda contextual ("el OS va en SSD; usa esto para almacenamiento grande"), slider/select 0–800GB, y mostrar en el resumen el desglose `SSD: XGB + HDD: YGB`. Enviar `dataDiskGb` solo si > 0.
- **Observación esperada si funcionó:** build de producción sin errores; el flujo antiguo (solo diskGb) manda el mismo payload de siempre.
- **Observación esperada si falló:** el form manda `dataDiskGb: 0` y algún validador lo rechaza, o rompe el payload actual.
- **Causa más probable de fallo:** mandar el campo siempre en vez de condicionalmente.
- **Contramovimiento:** omitir la clave cuando sea 0; validate.js igualmente tolera 0/ausente.
- **Consecuencias posteriores:** los perfiles quedan expuestos al operador sin necesidad de conocer el esquema de tiers.

### Movimiento 8: Prueba E2E en pvelenovo (gate del deploy)
- **Acción:** con backend local (o curl directo a la API de Proxmox imitando las llamadas), crear en pvelenovo una VM de prueba perfil DATOS: `{hostname: test-tiers, cores: 2, memoryMb: 2048, diskGb: 20, dataDiskGb: 50}`. Verificar en orden:
  1. `qm config <vmid>`: scsi0 → `local-lvm:...,discard=on,ssd=1`; scsi1 → `hdd1tb:...,size=50G`; cicustom → variante `-data`; net0 sin tag.
  2. La VM obtiene IP en 192.168.1.x (Summary o consola) y el login `devops` con el password generado funciona (= snippet aplicado).
  3. Dentro del guest: `lsblk` — confirmar que el disco de 50G es `/dev/sdb` y está montado en `/data` (ext4, label datos). SI NO es sdb: corregir `DEV` en la variante del snippet (Movimiento 2) y repetir.
  4. Reiniciar la VM: `/data` sigue montado y NO se reformatea (la guarda blkid funciona).
  5. Destruir la VM de prueba vía el flujo del panel (o `qm stop && qm destroy <vmid> --purge`) y confirmar con `lvs` que AMBOS volúmenes desaparecieron de local-lvm y hdd1tb.
- **Observación esperada si funcionó:** los 5 checks pasan.
- **Observación esperada si falló:** cualquier check falla — cada uno apunta a su movimiento de origen (1: net0/template; 2: snippet/DEV; 5: placement).
- **Causa más probable de fallo:** enumeración de discos distinta a la asumida (check 3) o snippet no servido (check 2).
- **Contramovimiento:** los de cada movimiento origen; repetir el E2E completo tras cualquier corrección (barato: ~3 min por ciclo).
- **Consecuencias posteriores:** SOLO con los 5 checks verdes se procede al Movimiento 9. Este gate protege producción.

### Movimiento 9: Deploy a producción y registro
- **Acción:**
  1. Commit del código (branch desde master, mensaje descriptivo).
  2. Build del frontend y deploy a **`/opt/vps-panel/frontend/dist`** en 192.168.1.34 (⚠️ ruta correcta según memoria del proyecto: nginx sirve ESA ruta, no /var/www; verificar hash del bundle tras copiar).
  3. Backend: copiar código, editar `/opt/vps-panel/backend/config/nodes.json` en el servidor añadiendo la entrada pvelenovo con el token secret real del Movimiento 3, reiniciar el proceso (PM2/systemd según esté), y smoke: `GET /api/nodes` lista pvelenovo con métricas; crear+destruir un VPS de prueba en pve (perfil viejo) para confirmar regresión cero.
  4. Actualizar la memoria de infraestructura: pvelenovo como nodo del panel (rango 400-499), política de tiers, variante de snippet.
- **Observación esperada si funcionó:** panel en https://207.248.113.8:8091/ muestra pvelenovo; creación en pve intacta; creación perfil DATOS disponible.
- **Observación esperada si falló:** 502/errores en el panel, o pvelenovo aparece con error de auth.
- **Causa más probable de fallo:** token secret mal pegado en nodes.json, o frontend desplegado a la ruta equivocada.
- **Contramovimiento:** revertir nodes.json a la versión sin pvelenovo (el panel vuelve al estado actual en segundos); el bundle se verifica por hash antes de dar por bueno el deploy.
- **Consecuencias posteriores:** misión completa; los tres perfiles quedan operativos y documentados.

## Tabla de referencia rápida (política de placement, también para creación manual en GUI)
| Petición | Perfil | scsi0 (OS) | scsi1 (datos) | Nodo elegible |
|---|---|---|---|---|
| Disco ≤ 60GB, sin datos | RENDIMIENTO | `local-lvm`, `discard=on,ssd=1` | — | cualquiera |
| OS ≤ 40GB + datos 10–800GB | DATOS | `local-lvm`, `discard=on,ssd=1` | `hdd1tb` | solo nodos con storageBulk |
| VM pesada/legacy sin exigencia de IO | MASIVO (manual) | `hdd1tb` | opcional en `hdd1tb` | pvelenovo |
Guardrail SSD: no admitir OS nuevos si el pool rápido supera 70% de uso real. El pool de pvelenovo (144.85G) da para ~10-15 VPS de 10-40G gracias a thin provisioning, pero NO puede autoextenderse: monitorear.

## Supuestos sin resolver
- **Token API en pvelenovo** — el usuario `panel@pve` existe pero no se pudo verificar si ya tiene token (bloqueo del clasificador durante el recon). El Movimiento 3 lo resuelve; puede requerir que el usuario corra los comandos pveum a mano.
- **Modelo de red/venta para VPS en pvelenovo** — las VMs saldrían por DHCP en la LAN escolar 192.168.1.x (como el nodo hyperv), sin la cadena DNAT de pve. Funciona para uso interno/pruebas; ANTES de vender VPS en este nodo el usuario debe decidir el esquema de port-forwarding en pfSense hacia 192.168.1.x.
- **Slot del drive cloud-init y enumeración de discos del template** — se verifica tras restaurar (Mov. 1) y en el E2E (Mov. 8, check 3); el valor `DEV=/dev/sdb` de la variante del snippet depende de ello.
- **¿Dividir los recursos del catálogo de Servicios?** (p.ej. Coolify 60G → 30G SSD + 100G datos) — decisión de producto del usuario; el catálogo sigue mono-disco hasta que la tome.
- **Contenido real del nodes.json de producción** (en 192.168.1.34) — se lee por SSH durante el Movimiento 9; los tokens solo viven ahí.

## Condiciones de aborto
- **STOP si `qmrestore` pide sobrescribir un VMID existente** — 9000 debe estar libre; jamás forzar sobre VM 104.
- **STOP si cualquier volumen de datos (scsi1) resuelve a `local-lvm:`** — es el fallo de una palabra que llena el SSD; verificar el volid en cada prueba.
- **STOP si el guardrail detecta el pool SSD > 70%** — no aprovisionar más OS ahí hasta revisar con el usuario.
- **STOP si la prueba E2E (Mov. 8) no pasa los 5 checks** — el deploy a producción queda bloqueado; producción no recibe código sin gate verde.
- **STOP si el smoke de regresión en pve falla tras el deploy** — revertir nodes.json y el código del backend de inmediato (el panel de producción manda).
- **Nunca tocar:** VM 104 (aulamedios), VM 210 / panel de producción (más allá del deploy controlado del Mov. 9), node pve salvo el smoke de regresión, /dev/sda de pvelenovo.
