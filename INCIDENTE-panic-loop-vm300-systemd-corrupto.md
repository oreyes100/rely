# Incidente: VPS misfinanzas (VMID 300) sin salida a la web — kernel panic por systemd corrupto

> Fecha: 2026-08-19 (noche, hora local México UTC-6)
> Estado: **RESUELTO** — HTTP 200 público verificado
> Afectación: `https://pachucacv.duckdns.org:8443/` (landing Pachuca CV / misfinanzas) sin respuesta web.
> VM: `pachucacv`, VMID 300, nodo Proxmox `pvececyte` (192.168.1.254), IP interna 192.168.7.186.

---

## 1. Síntoma reportado

- El VM 300 aparece **`running`** en Proxmox (CPU ~50%, 6 GiB, 2 vCPU) pero **no sale a la web**:
  - Sin respuesta en `https://pachucacv.duckdns.org:8443/` (502 / timeout).
  - `ping 192.168.7.186` falla desde el nodo.
  - Sin lease en dnsmasq, ARP `FAILED`, guest agent caído (`QEMU guest agent is not running`).
- El usuario descartó rápidamente el cambio de IP como causa y pidió revisar lo ocurrido en la última hora.

## 2. Línea de tiempo (UTC-6)

| Hora | Evento |
|---|---|
| 21:51:54 | `qmshutdown:300` → **falla por timeout** ("VM quit/powerdown failed") — el guest ya estaba colgado. |
| 21:52:23 | `qmreset:300` → **falla por lock** ("can't lock file ... got timeout"). |
| 21:53:56 | `qmstop:300` → OK (**stop forzado / kill en frío**). |
| 21:54:03 | `qmstart:300` → OK. A partir de aquí el VM entra en **panic loop**. |
| ~22:00 | Reporte del usuario: VM running pero sin salida web. |
| 22:0x–22:3x | Diagnóstico y reparación (abajo). |

> Fuente: `/var/log/pve/tasks/index` del nodo `pvececyte`.

## 3. Diagnóstico

### 3.1 Verificación de red y estado desde el nodo

```bash
qm list                          # VM 300 "pachucacv" running
cat /var/lib/misc/dnsmasq.leases # VACÍO: 192.168.7.186 sin lease
iptables -t nat -L PREROUTING -n # DNAT intactos: 2300->.186:22 y 8443->.186:443
ip neigh show dev vmbr7          # 192.168.7.186 FAILED
qm guest cmd 300 ping            # "QEMU guest agent is not running"
```

Conclusión parcial: el host/nodo/pfSense están bien; el problema es **interno del guest**.

### 3.2 Captura de la consola serial (clave del hallazgo)

Conectar a la serial **antes** de resetear, para no perder la salida de arranque:

```bash
# En el nodo: python3 + socket AF_UNIX sobre /var/run/qemu-server/300.serial0,
# emitir QMP system_reset y capturar la salida durante ~90s.
```

Resultado del arranque:

- Kernel `6.8.0-137-generic` carga correctamente.
- `fsck.ext4` del root: `clean, 290170/5111808 files`.
- Root montado OK (`EXT4-fs (sda1): mounted ... ro`).
- **`systemd[1]: segfault at 12 ip ... in libsystemd-shared-255.so`**
- **`Kernel panic - not syncing: Attempted to kill init! exitcode=0x0000000b`**

El PID 1 (systemd) muere por segfault → el kernel hace panic → QEMU reinicia → loop infinito.

### 3.3 Verificación de integridad de binarios (causa raíz confirmada)

Deteniendo el VM y montando su disco en el host:

```bash
qm stop 300
kpartx -av /dev/pve/vm-300-disk-1
mount -o ro /dev/mapper/pve-vm--300--disk--1p1 /mnt/vm300
mount -o ro /dev/mapper/pve-vm--300--disk--1p16 /mnt/boot300   # /boot

# Comparar md5 del disco vs el registrado por dpkg:
md5sum /mnt/vm300/usr/lib/x86_64-linux-gnu/systemd/libsystemd-shared-255.so
# disco:  18caf192b6cce7873fc96dfdf544e9b9   <-- CORRUPTO
# dpkg:   5a42b9ace38ede7df33db5bd48a8447b   (esperado)
```

Otros binarios verificados:
- `/usr/lib/systemd/systemd` → OK (md5 coincide).
- `dpkg -V systemd libsystemd-shared libsystemd0 libc6 libc-bin` → sin diferencias tras la reparación.

## 4. Causa raíz

El binario **`libsystemd-shared-255.so`** (paquete `libsystemd-shared` 255.4-1ubuntu8.17) estaba **corrompido en disco** (mismo tamaño, contenido dañado). Al arrancar, `systemd` no puede ejecutarse → segfault → `Kernel panic: Attempted to kill init` → el VM queda en **panic loop**:

- VM "running" pero sin red (la NIC nunca se configura).
- Sin SSH interno ni externo (WAN:2300).
- Sin guest agent (nunca llega a systemd).
- Sin web (nginx/containers nunca arrancan).

**Origen de la corrupción:** el `qmstop` forzado (kill en frío) sobre un sistema ext4 con `commit=30` pudo dejar el bloque del archivo a medio escribir. El guest ya estaba colgado antes del stop (por eso el `qmshutdown` falló por timeout); el stop en frío + arranque posterior expuso/consolidó la corrupción.

> **No** fue un problema de IP, de pfSense, ni de las reglas NAT (esas estaban correctas apuntando a `192.168.1.254`). La web caída era consecuencia del guest en panic loop.

## 5. Solución aplicada

1. Detener el VM (`qm stop 300`).
2. Montar el disco del VM en el nodo (read-only para diagnóstico, read-write para reparar).
3. Descargar el paquete correcto desde el repo oficial de Ubuntu:

   ```bash
   curl -s -o /tmp/libsys_test.deb \
     "http://archive.ubuntu.com/ubuntu/pool/main/s/systemd/libsystemd-shared_255.4-1ubuntu8.17_amd64.deb"
   dpkg-deb -x /tmp/libsys_test.deb /tmp/libsys_deb/
   ```

4. Respaldar el binario corrupto y reemplazarlo por el correcto:

   ```bash
   cp -a .../libsystemd-shared-255.so /tmp/libsystemd-shared-255.so.CORRUPT
   cp -a /tmp/libsys_deb/usr/lib/x86_64-linux-gnu/systemd/libsystemd-shared-255.so \
         /mnt/vm300/usr/lib/x86_64-linux-gnu/systemd/libsystemd-shared-255.so
   sync
   ```

   - md5 tras el reemplazo: `5a42b9ace38ede7df33db5bd48a8447b` ✓
5. Desmontar, `kpartx -dv`, y arrancar el VM (`qm start 300`).
6. Verificar boot completo hasta `login:` en consola serial.

## 6. Verificación final (todo OK)

| Check | Resultado |
|---|---|
| Boot del guest | Ubuntu 24.04.4 LTS `pachucacv`, login prompt en ~25s |
| `ping 192.168.7.186` | OK |
| nginx | active, escuchando 80/443 |
| docker | active, containers `pachuca-landing-web` (:4321) y `mongo:7` arriba |
| Backend Astro | `http://127.0.0.1:4321/` → **200** |
| nginx 443 interno | `curl -k https://127.0.0.1/ -H 'Host: ...'` → **200** |
| Reflection vía pfSense | `https://207.248.113.8:8443/` → **200** |
| Web pública | `https://pachucacv.duckdns.org:8443/` → **200** (desde internet) |
| SSH WAN | puerto 2300 en 207.248.113.8 → abierto |
| Integridad | `dpkg -V` de systemd/libs → sin diferencias |

## 7. Lecciones / recomendaciones

- **Nunca** hacer `qmstop`/reset en frío como primera opción si el guest está colgado: primero `qmshutdown` con espera amplia; si falla, `qm reset` (warm) antes que `qm stop`.
- Tras un stop forzado, verificar la integridad con `dpkg --verify` en el guest o `md5sum` contra `dpkg/info/*.md5sums` antes de dar por bueno el arranque.
- El `qemu-guest-agent` es la vía de administración preferida (`qm guest exec`); mantenerlo activo evita depender de contraseñas de `devops`.
- Monitorear el panel Proxmox por VMs `running` sin tráfico de red (posible panic loop silencioso).
- La reparación se hizo sin tocar pfSense ni las reglas NAT (correctas: WAN:8443/2300 → 192.168.1.254 → DNAT → 192.168.7.186).

## 8. Referencias

- Topología y accesos: `C:\vpsserver\wargames\MANUAL-acceso-misfinanzas-VPS.md`
- Deploy original: `C:\vpsserver\wargames\deploy-pachuca-cv.md`
- Stack del VPS: Astro 5 SSR (`pachuca-landing`), nginx 1.24, Docker (web :4321 + mongo:7), certs acme.sh/ZeroSSL, DuckDNS `pachucacv.duckdns.org`.