# PLAN DE RESILIENCIA ANTE FALLOS DE ENERGÍA — Implementado 2026-08-28

**Causa raíz del incidente previo:** Fallo de energía → corrupción EXT4 en VM 250 (`vps-demo-n2` / `192.168.1.250`) → geometry mismatch (superblock > tamaño real de partición) → VM no arranca red → todos los sitios caen.

---

## 1. NIVEL VM (Proxmox) — APLICADO A VMs 100, 210, 211, 250, 300

| Medida | Comando | Estado |
|---|---|---|
| **QEMU Guest Agent + fstrim** | `qm set <vmid> --agent enabled=1,fstrim_cloned_disks=1` | ✅ |
| **Protección contra borrado accidental** | `qm set <vmid> --protection 1` | ✅ |
| **Arranque ordenado (orden=1, 60s up/down)** | `qm set <vmid> --startup order=1,up=60,down=60` | ✅ |
| **Auto-arranque** | `qm set <vmid> --onboot 1` | ✅ |
| **Hardware watchdog (i6300esb, reset)** | `qm set <vmid> --watchdog model=i6300esb,action=reset` | ✅ (pendiente reboot) |
| **Cloud-init resilience snippet** | `cicustom: vendor=local:snippets/vps-resilience.yaml` | ✅ (pendiente reboot) |

**Próximo paso:** Reiniciar VMs en ventana de mantenimiento para activar watchdog y aplicar snippet.

---

## 2. NIVEL HOST (Proxmox pve 192.168.1.4)

### 2.1 Kernel / Sysctl hardening (`/etc/sysctl.d/99-pve-resilience.conf`)
```ini
vm.panic_on_oom = 1
kernel.panic = 10
kernel.panic_on_oops = 1
kernel.panic_on_unrecovered_nmi = 1
kernel.panic_on_io_nmi = 1
kernel.softlockup_panic = 1
kernel.hardlockup_panic = 1
vm.dirty_ratio = 15
vm.dirty_background_ratio = 5
vm.dirty_expire_centisecs = 3000
vm.dirty_writeback_centisecs = 1000
```
**Aplicado:** `sysctl --system` ✅

### 2.2 Snapshots automáticos diarios (`/etc/cron.d/pve-auto-snapshots`)
```cron
0 3 * * * root for vmid in 100 210 211 250 300; do
  qm listsnapshot $vmid | grep -q auto-daily && qm delsnapshot $vmid auto-daily
  qm snapshot $vmid auto-daily --description "Auto daily $(date +%F)"
done
```
Mantiene 1 snapshot diario por VM (rotación implícita al sobrescribir).

### 2.3 Monitor de salud host + VMs (`/usr/local/bin/pve-health-monitor.sh` + cron 5min)
Verifica: carga, memoria, disco /, LVM-thin pool, estado VMs, guest-agent ping, SMART /dev/sda, kernel errors.
Alertas via `logger -t pve-health` → `/var/log/pve-alerts.log` + syslog.

### 2.4 Monitor LVM-thin pool (`/etc/cron.d/lvm-thin-monitor`)
```cron
0 * * * * root lvs --noheadings -o vg_name,lv_name,data_percent pve/data | awk '{... > 80 ... logger -t lvm-thin ALERT}'
```

### 2.5 SMART monitoring
`smartmontools` (smartd) ya activo monitorizando `/dev/sda`.

---

## 3. NIVEL GUEST (cloud-init snippet: `/var/lib/vz/snippets/vps-resilience.yaml`)

Se aplica en **next boot** de cada VM (rebuild cloud-init).

### Contenido clave:
| Área | Medida |
|---|---|
| **Filesystem** | Mount options: `defaults,noatime,errors=remount-ro,data=ordered,commit=60` |
| **systemd watchdog** | `WatchdogSec=30`, `Restart=always` en servicios críticos |
| **journald** | Persistente, compresión lz4, max 500M, sync cada 30s |
| **Kernel params** | `fsck.mode=force fsck.repair=yes` en GRUB |
| **Sysctl VM** | dirty_ratio=15, dirty_bg=5, expire=30s, writeback=10s |
| **Health check** | Script `/usr/local/bin/health-check.sh` + timer systemd c/5min |
| **Paquetes** | smartmontools, hdparm, iotop, sysstat, cron |
| **Auto-fstrim** | `fstrim.timer` habilitado |

---

## 4. NIVEL EDGE (192.168.1.34) — Ya existente, reforzar

- nginx `proxy_next_upstream error timeout http_500 http_502 http_503 http_504;` en upstreams
- Health checks pasivos via `max_fails=3 fail_timeout=30s`
- Certificados Let's Encrypt auto-renovación (acme.sh cron)

---

## 5. NIVEL RED / FIREWALL (pfSense)

- Gateway monitoring (dpinger) con alertas
- CARP/HA si aplica (ver `pfsense_diagnose_high_availability`)
- Reglas anti-lockout en WebGUI

---

## 6. BACKUPS EXTERNOS (Pendiente / Recomendado)

| Acción | Herramienta | Frecuencia |
|---|---|---|
| Proxmox Backup Server (PBS) | `proxmox-backup-client` | Diario + retención 7d/4w/12m |
| Configuración pfSense | XML export auto | Diario |
| Scripts / snippets | Git repo | En cada cambio |

---

## 7. TESTING / VERIFICACIÓN POST-IMPLEMENTACIÓN

### 7.1 Simular fallo de energía (ventana mantenimiento)
1. `qm shutdown 250 --timeout 60` → verificar graceful shutdown via guest-agent
2. `qm start 250` → verificar: watchdog activo, snippet aplicado, health-check OK
3. `echo c > /proc/sysrq-trigger` (kernel panic test) → verificar panic=10 reboot

### 7.2 Verificar health checks
```bash
# Host
/usr/local/bin/pve-health-monitor.sh
cat /var/log/pve-health.log

# Guest (desde host)
qm guest cmd 250 exec -- /usr/local/bin/health-check.sh
```

### 7.3 Verificar watchdog
```bash
# En guest
systemctl status systemd-watchdog
cat /proc/sys/kernel/watchdog
```

---

## 8. COMANDOS DE EMERGENCIA (Cheat sheet)

```bash
# Forzar fsck en próximo boot (guest)
qm guest exec 250 -- touch /forcefsck

# Snapshot manual antes de cambios riesgosos
qm snapshot 250 pre-mantenimiento --description "Antes de X"

# Rollback rápido
qm rollback 250 pre-mantenimiento

# Ver logs de alertas
journalctl -t pve-health -t lvm-thin -f

# Estado LVM-thin
lvs -o +data_percent,metadata_percent pve/data

# SMART completo
smartctl -a /dev/sda
```

---

## 9. ESTADO ACTUAL (2026-08-28)

| Componente | Estado | Acción pendiente |
|---|---|---|
| VM 250 (192.168.1.250) | **REPARADO** (fsck + resize2fs) | Reboot para watchdog + snippet |
| VM 100, 210, 211, 300 | Configurado | Reboot para watchdog + snippet |
| Host sysctl | ✅ Aplicado | — |
| Auto-snapshots | ✅ Cron activo | — |
| Health monitor | ✅ Cron 5min activo | — |
| LVM-thin monitor | ✅ Cron hora activo | — |
| Guest resilience snippet | ✅ Adjuntado a 4 VMs | Reboot VMs |
| Backups externos (PBS) | ❌ No configurado | **Prioridad alta** |

---

## 10. PRÓXIMOS PASOS RECOMENDADOS

1. **Ventana de mantenimiento** (30 min): Reiniciar VMs 100, 210, 211, 250, 300 en orden de dependencia para activar watchdog y aplicar snippet.
2. **Desplegar Proxmox Backup Server** (PBS) en nodo separado o almacenamiento remoto.
3. **Configurar alertas externas** (email/Telegram/Slack) desde `logger` → syslog forward.
4. **Documentar runbooks** de recuperación por escenario (fallo disco, fallo host, fallo red, corrupción FS).
5. **Test de fallo de energía simulado** trimestral.

---
*Documento vivo — actualizar tras cada incidente o cambio de infraestructura.*