# War-game: optimización del SSD en pvelenovo (post-migración a hdd1tb)
> Ejecutor: corre los movimientos en orden. Antes de cada movimiento lee sus señales de fallo. Revisa las condiciones de aborto después de CADA movimiento. Esta misión es de LIMPIEZA E HIGIENE — no reestructura particiones. Cualquier comando destructivo fuera de las listas explícitas de este brief está prohibido.

## Objetivo de la misión
Dejar el SSD de 240GB de pvelenovo (192.168.1.15) en su estado óptimo como **tier FAST** del esquema de dos niveles ya adoptado, tras la migración del VM 104 a `hdd1tb`. 

**Insight central que el ejecutor debe entender:** el SSD NO está lleno. Los "221.13GB usados de 222GB" son **asignación LVM**, no datos: el thin pool `pve/data` (144.85GB) está asignado por diseño como reserva para discos OS de futuras VMs y su uso real es 0.18% (~273MB). Un pool asignado y vacío ES el estado deseado. La optimización real consiste en: (1) borrar los 6 discos `unused` del VM 104 que aún viven en local-lvm, (2) purgar ~11.7GB de ISOs de rescate obsoletas del filesystem root, (3) activar higiene TRIM/discard para la salud del SSD, y (4) NO hacer las cosas tentadoras-pero-peligrosas (encoger root, borrar el pool).

**Éxito =** `local-lvm` en 0.00% de uso; `qm config 104` sin ninguna línea `unused`; uso del root fs baja de ~24GB a ~12GB; pool `pve/data` intacto (144.85GB listos para OS de VPS futuros); VM 104 sigue corriendo sin interrupciones; `issue_discards=1` activo.

## Resumen de reconocimiento (en vivo, 2026-07-23)
- **Nodo:** pvelenovo, Proxmox VE 9.2.2. Única VM: **104 "aulamedios"** (Win Server 2016), **running**, arranque verificado (pantalla de bloqueo visible en consola). Boot `order=sata1;sata0;ide0` intacto.
- **SSD** `/dev/sda` ADATA_SU630 240GB: sda1 BIOS boot 1MB, sda2 EFI 1.07GB, sda3 LVM 238.37GB. VG `pve`: swap 8G (uso: 8KiB — sin presión), root 65.5G, thin pool `data` 144.85G (+1.32G tmeta, +1.32G pmspare), libre en VG ~884MB. **El pool NO puede autoextenderse** (no hay espacio libre en el VG) — irrelevante hoy, pero cuando lleguen VPS al pool hay que monitorear su % de uso.
- **`pvesm status`:** `local-lvm` 151.9GB total / **0.18% usado**; `local` (dir, root fs) 67GB total / 23.9GB usados (35.6%); `hdd1tb` 927.7GB / 11.7% usado.
- **Los 6 `unused` del VM 104 — todos en local-lvm** (son el 0.18%):
  ```
  unused0: local-lvm:vm-104-disk-efivars
  unused1: local-lvm:vm-104-disk-1
  unused2: local-lvm:vm-104-disk-3
  unused3: local-lvm:vm-104-disk-usb
  unused5: local-lvm:vm-104-disk-2
  unused8: local-lvm:vm-104-disk-5
  ```
- **⚠️ TRAMPA DE COLISIÓN DE NOMBRES (leer dos veces):** los discos VIVOS del VM 104 en `hdd1tb` se llaman IGUAL que varios unused de local-lvm:
  | Volumen | En `local-lvm` (BASURA, borrar) | En `hdd1tb` (VIVO, jamás tocar) |
  |---|---|---|
  | vm-104-disk-1 | copia vieja (unused1) | **System Reserved 64M — disco de arranque (sata1)** |
  | vm-104-disk-2 | copia vieja (unused5) | disco recovery 512M (sata2) |
  | vm-104-disk-3 | copia vieja (unused2) | **F: nuevo de 400G (sata3)** |
  | vm-104-disk-5 | copia vieja (unused8) | (verificar si existe en hdd1tb) |
  Por esto TODA eliminación se hace por **clave de config (`unusedN`)**, NUNCA por nombre de volumen ni con `lvremove` manual. Un `lvremove hdd1tb/vm-104-disk-1` por confusión destruye el arranque del VM.
- **ISOs en `/var/lib/vz/template/iso/` (18GB total en el root del SSD):** restos de la saga de reparación de arranque de julio: `Win2016_BOOTREC.iso` 6.5G, `win-auto-repair.iso`/`-v2`/`-v3` 906M c/u, `win-uefi-repair.iso` 903M, `winpe_disk.img` 512M, `auto_final.img`/`autounattend2.img`/`auto_v2.img` 10M c/u, `systemrescue-11.02.iso` **0 bytes** (descarga rota). También: `virtio-win.iso` 754M (**EN USO** como ide0 del VM 104), `Win2016_EN_US.iso` 6.5G (media de instalación original — única copia), `alpine.iso` 61M. En `/var/lib/vz/dump/`: `vzdump-qemu-9000-...vma.zst` 526M (backup del template VPS).
- **TRIM:** `fstrim.timer` = enabled (cubre el root fs ✅). `issue_discards` en `/etc/lvm/lvm.conf` no está activado (grep sin coincidencias = valor por defecto 0) — al hacer `lvremove` los bloques NO se descartan hacia el SSD.
- **Guardas de alcance:** nada de esto toca node pve (192.168.1.4), VM 210, el panel de producción, ni las particiones de /dev/sda. `hdd1tb` solo se LEE para verificar.

## Movimientos

### Movimiento 1: Línea base y verificación de salud
- **Acción:** en node pvelenovo → Shell:
  ```
  qm list && qm config 104 | grep -E 'unused|sata|boot'
  lvs pve && lvs hdd1tb
  pvesm status && df -h /
  ```
  Confirmar en consola noVNC del VM 104 que Windows sigue en pantalla de bloqueo/sesión (no pantallazo azul).
- **Observación esperada si funcionó:** VM 104 `running`; los 6 unused listados arriba presentes; `lvs hdd1tb` muestra vm-104-disk-0 (137G), disk-1 (64M), disk-2 (512M), disk-3 (400G); `lvs pve` muestra los LVs basura (disk-efivars, disk-usb, disk-1/2/3/5).
- **Observación esperada si falló:** VM stopped o sin arrancar; unused ya no existen; nombres distintos a los listados.
- **Causa más probable de fallo:** alguien ya limpió, o el VM se apagó entre sesiones.
- **Contramovimiento:** si el VM no está `running`, arrancarlo (`qm start 104`) y verificar arranque ANTES de seguir — la condición que autoriza borrar los unused es "arranque bueno confirmado". Si los unused ya no están, saltar al Movimiento 3.
- **Consecuencias posteriores:** este snapshot es la referencia contra la que se validan los Movimientos 2 y 7.

### Movimiento 2: Eliminar los 6 discos `unused` (la parte delicada)
- **Acción:** de uno en uno, SIEMPRE por clave de config. GUI (preferida, pide confirmación): VM 104 → Hardware → seleccionar "Unused Disk N" → Remove. CLI equivalente:
  ```
  qm disk unlink 104 --idlist unused0 --force
  ```
  Repetir para unused1, unused2, unused3, unused5, unused8. Tras CADA uno: `qm config 104 | grep -E 'unused|sata'` — las líneas sata0-3 deben seguir idénticas.
- **Observación esperada si funcionó:** cada línea unused desaparece del config; al final `lvs pve` ya no muestra ningún `vm-104-*`; `pvesm status` → local-lvm **0.00%**; sata0-3 intactos en hdd1tb; VM 104 sigue `running` (borrar unused no afecta a la VM encendida).
- **Observación esperada si falló:** "volume ... does not exist" (inofensivo: la referencia estaba huérfana — la línea igual desaparece), o un `vm-104-*` sobrevive en `lvs pve`.
- **Causa más probable de fallo:** LV huérfano sin referencia en config (quedó de la saga de copias).
- **Contramovimiento:** para un LV huérfano en `pve` SIN línea en ningún config: verificar tres veces que `lvs` lo muestra en VG **pve** (no hdd1tb) y borrarlo con `lvremove pve/<nombre>` — es el ÚNICO caso donde se permite lvremove manual, y solo sobre VG pve con nombre vm-104-*. Si aparece "contains a filesystem in use": `lvchange -an pve/<nombre>` primero (mismo fix que se usó con vm-104-disk-esp).
- **Consecuencias posteriores:** si por error se borrara algo de hdd1tb (no debe pasar siguiendo las claves unusedN), ABORTAR TODO: no apagar el VM 104, reportar al usuario de inmediato — con el VM encendido los datos aún están en memoria/cache y hay margen de rescate.

### Movimiento 3: Purgar las ISOs de rescate del root (recupera ~11.7GB)
- **Acción:** borrar SOLO esta lista exacta (herramientas de la reparación de julio, ya innecesarias — el VM arranca bien):
  ```
  cd /var/lib/vz/template/iso
  rm -f Win2016_BOOTREC.iso win-auto-repair.iso win-auto-repair-v2.iso win-auto-repair-v3.iso win-uefi-repair.iso winpe_disk.img auto_final.img autounattend2.img auto_v2.img systemrescue-11.02.iso
  ```
  **CONSERVAR (no tocar):** `virtio-win.iso` (montada como ide0 del VM 104), `Win2016_EN_US.iso` (única media de instalación original), `alpine.iso` (61M, útil), y `/var/lib/vz/dump/vzdump-qemu-9000-*.vma.zst` (único backup del template VPS en este nodo).
- **Observación esperada si funcionó:** `df -h /` baja de ~24GB a ~12GB usados; `ls` del directorio muestra solo las 3 ISOs conservadas.
- **Observación esperada si falló:** "No such file" en algún nombre (inofensivo — ya no estaba), o el espacio no baja.
- **Causa más probable de fallo:** error tipográfico en nombres.
- **Contramovimiento:** listar primero (`ls -lh`), copiar los nombres exactos del listado. Jamás usar comodines tipo `rm win*` (matarían virtio-win.iso... no está en Win* pero `rm Win*` sí mataría Win2016_EN_US.iso).
- **Consecuencias posteriores:** el root queda con ~53GB libres — margen sano para logs, actualizaciones y alguna ISO futura.

### Movimiento 4: Higiene TRIM/discard del SSD
- **Acción:**
  1. Editar `/etc/lvm/lvm.conf`: buscar `issue_discards` y dejarlo `issue_discards = 1` (descomentar/cambiar el 0).
  2. Verificar passdown de los pools: `lvs -o name,discards pve/data hdd1tb/data` — ambos deben decir `passdown`.
  3. `systemctl status fstrim.timer` — confirmar que sigue enabled/active (ya lo estaba).
- **Observación esperada si funcionó:** `grep issue_discards /etc/lvm/lvm.conf` muestra la línea activa con valor 1; ambos pools en `passdown`.
- **Observación esperada si falló:** un pool reporta `nopassdown` / `ignore`.
- **Causa más probable de fallo:** configuración heredada del pool.
- **Contramovimiento:** `lvchange --discards passdown <vg>/data` (operación online, segura).
- **Consecuencias posteriores:** a partir de aquí, cada `lvremove` en el SSD devuelve los bloques con TRIM (mantiene el rendimiento de escritura del ADATA a largo plazo). Regla permanente para VMs nuevas con OS en `local-lvm`: crear el disco con **`discard=on,ssd=1`** para que el TRIM del guest llegue al pool.

### Movimiento 5 (OPCIONAL — requiere ventana de reinicio del VM 104): discard en los discos sata del 104
- **Acción:** los discos del 104 en hdd1tb no tienen `discard=on`, así que Windows nunca libera espacio del thin pool (el F: de 400G irá "engordando" en el pool aunque se borren archivos). En una ventana acordada con el usuario:
  ```
  qm set 104 --sata0 hdd1tb:vm-104-disk-0,cache=writeback,size=137G,ssd=1,discard=on
  qm set 104 --sata3 hdd1tb:vm-104-disk-3,size=400G,discard=on
  qm shutdown 104 && qm start 104
  ```
  (sata1/sata2 son diminutos — no vale la pena.) Dentro de Windows, "Optimizar unidades" hace el retrim semanal automático.
- **Observación esperada si funcionó:** config muestra `discard=on`; el VM arranca igual que siempre; con el tiempo `lvs hdd1tb` muestra Data% del disk-3 estable en vez de solo crecer.
- **Observación esperada si falló:** VM no arranca tras el ciclo.
- **Causa más probable de fallo:** error al reescribir la línea sata (perder `cache=writeback` o el tamaño).
- **Contramovimiento:** las líneas de arriba copian los parámetros actuales exactos + discard. Si el arranque falla, quitar `discard=on` revirtiendo a la línea original y reintentar; el boot order `sata1;sata0` no se toca.
- **Consecuencias posteriores:** ninguna para el SSD; es higiene del tier BULK. Si el usuario no da ventana, saltarlo sin más.

### Movimiento 6: Decisiones explícitas de NO-acción (encodificadas, no re-litigar)
- **Acción:** ninguna. Este movimiento documenta lo que NO se hace y por qué, para que ningún ejecutor futuro lo "optimice":
  1. **NO encoger root (65.5G → ~30G) para agrandar el pool.** Requiere shrink offline de ext4 en el disco de arranque (live USB, riesgo alto) para ganar ~35GB en un pool que está VACÍO. Beneficio nulo hoy. Reevaluar solo si el pool supera 70% con VPS reales.
  2. **NO borrar ni encoger el pool `pve/data`** aunque esté al 0.18%. Es el tier FAST del esquema adoptado; vacío = disponible, no desperdiciado.
  3. **NO tocar swap** (8G, uso 8KiB). Tamaño estándar, coste cero.
  4. **NO mover `Win2016_EN_US.iso` ni el vzdump del template a hdd1tb**: `hdd1tb` es lvmthin (solo images/rootdir, no admite ISOs/backups). Crear un dir-storage sobre hdd1tb es posible (LV thin + ext4 + mount) pero añade complejidad por 7GB que sí caben en root — diferido salvo que el usuario lo pida.
- **Consecuencias posteriores:** el layout del SSD queda declarado FINAL: swap 8G + root 65.5G + pool 144.85G.

### Movimiento 7: Estado final y registro
- **Acción:** capturar `pvesm status`, `lvs`, `df -h /` finales. Actualizar la memoria de infraestructura: local-lvm limpio al 0%, config 104 sin unused, ISOs purgadas, issue_discards activo, regla `discard=on,ssd=1` para futuros discos en local-lvm.
- **Observación esperada si funcionó:** `local-lvm` 0.00%; `local` ~12GB usados / ~53GB libres; `hdd1tb` ~11.7%; VM 104 `running`.
- **Observación esperada si falló:** cualquier desviación de esos tres números.
- **Causa más probable de fallo:** un movimiento anterior se saltó o quedó a medias.
- **Contramovimiento:** volver al movimiento incompleto; no improvisar limpiezas extra fuera de las listas de este brief.
- **Consecuencias posteriores:** misión cerrada; el SSD queda como tier FAST limpio y listo para los OS de los VPS vendibles.

## Supuestos sin resolver
- **Ventana de reinicio para el Movimiento 5** — el VM 104 es el servidor del aula; solo el usuario sabe cuándo se puede apagar/encender (~2 min). Sin ventana, el movimiento se salta.
- **Valor residual de `Win2016_BOOTREC.iso`** — se clasificó como herramienta de rescate desechable (el VM ya arranca y existe la media original `Win2016_EN_US.iso`). Si el usuario la considera valiosa, sacarla de la lista de borrado del Movimiento 3 (coste de conservarla: 6.5GB).
- **`hdd1tb:vm-104-disk-5`** — no confirmado si existe un disco vivo con ese nombre en hdd1tb; la verificación del Movimiento 1 (`lvs hdd1tb`) lo resuelve antes de borrar unused8.
- **Restauración de los datos del F: respaldados** — fuera del alcance de esta misión (es tarea del usuario dentro de Windows).

## Condiciones de aborto
- **STOP si VM 104 no está `running` con arranque verificado** antes del Movimiento 2 — los unused solo se borran con arranque bueno confirmado (regla heredada del war-game anterior).
- **STOP si cualquier comando de borrado resuelve a un volumen `hdd1tb:*`** — ahí viven el OS, el System Reserved y el F: del 104. La colisión de nombres (tabla del recon) es la trampa #1 de esta misión.
- **STOP si tras borrar un unused desaparece cualquier línea sata0-3 del config** — restaurar la línea a mano desde el snapshot del Movimiento 1 antes de continuar.
- **STOP si `rm` va a ejecutarse con comodín** — solo nombres exactos de la lista del Movimiento 3.
- **Nunca tocar:** node pve (192.168.1.4), VM 210 / panel de producción, particiones de /dev/sda, el pool `pve/data` en sí, `virtio-win.iso`, `Win2016_EN_US.iso`, el vzdump del template 9000.
