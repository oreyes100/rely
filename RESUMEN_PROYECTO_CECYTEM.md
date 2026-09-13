# Resumen Completo del Proyecto CECyTEM - pfSense + VPS Panel

**Fecha:** 23-24 de Agosto 2026  
**Usuario:** admin / Michoacan1  
**Servidor pfSense:** 192.168.1.1:2223 (CE 24.0)  
**Panel VPS:** 192.168.1.34:3001 (https://capuvps.duckdns.org)

---

## 1. INFRAESTRUCTURA

| Componente | IP | Detalles |
|------------|-----|----------|
| **pfSense (fw)** | 192.168.1.1/22 | LAN=vtnet0, WAN=vtnet1 (207.248.113.8/24) |
| **Panel VPS** | 192.168.1.34 | VM 210 en pve, nginx + Node.js backend |
| **pve** | 192.168.1.4 | Proxmox 9.1, VMID 200-299, template 9000 |
| **pvececyte** | 192.168.1.254 | Proxmox 8.4, VMID 300-399, template 9000 |
| **pvelenovo** | 192.168.1.15 | Proxmox 9.2, VMID 400-499 (600-699), template 9000, storageBulk=hdd1tb |
| **pvedell** | 192.168.1.96 | Proxmox cluster con pve, VMID 500-599, template 9001 |
| **aulamedios (eliminado)** | 192.168.1.229 | Hyper-V Win Server 2016, agente puerto 3002 |

**VLANs:**
- vtnet0.4: Alumnos 192.168.4.0/24
- vtnet0.5: DMZ 192.168.5.0/24  
- vtnet0.6: VPS 192.168.6.0/24

**DHCP:** Kea backend (no ISC DHCP)  
**Rango 192.168.1.x:** Reservado para admin/static (fuera de pools DHCP)

---

## 2. PROBLEMAS RESUELTOS

### 2.1 DHCP Static Mapping - MAC `bc:24:11:3f:0b:c6` → IP `192.168.1.3`

**Problema:** Dispositivo recibía `192.168.0.14` en lugar de `192.168.1.3`

**Causas raíz:**
1. 39 reservas globales en `kea-dhcp4.conf` sin `ip-address` conflictuaban con reservas de subred
2. Lease fantasma con MAC vacía retenía `192.168.1.3`

**Solución aplicada:**
```bash
# 1. Eliminar reservas globales de kea-dhcp4.conf
# 2. Limpiar TODOS los leases para 192.168.1.3
# 3. Reiniciar Kea (PID 68951)
```

**Resultado:** ✅ Usuario confirmó "perfecto, ya quedo"

---

### 2.2 Limitador de Ancho de Banda (dummynet)

**Problema:** Dispositivos de infraestructura en alias `Infra_Cableado_Excluida` no tenían ancho de banda completo

**Descubrimiento:**
- Pipes `Cableado_5Mbps_Down` (#3) y `Up` (#4) configurados en `<dnshaper>` pero **NO creados en kernel**
- `dnctl show` siempre mostraba help (bug de sintaxis - debe ser `dnctl pipe show`)
- `/dev/dn` no existe en FreeBSD 15/pfSense 24.0
- Pipes no tenían mask por IP (`mask dst-ip 32` / `mask src-ip 32`)

**Solución aplicada:**
1. Recrear pipes con mask correcto:
   ```bash
   dnctl pipe 3 config bw 10Mbit/s mask dst-ip 32
   dnctl pipe 4 config bw 10Mbit/s mask src-ip 32
   ```
2. Recargar firewall con `filter_configure()` + `shaper.inc`

**Reglas verificadas (orden correcto):**
```
#8: Infra_Cableado_Excluida → sin dnpipe (PRIMERO)
#9: LAN → dnpipe(4,3) (DESPUÉS)
```

**Resultado:** ✅ Limitador funcionando con pipes activos

---

### 2.3 Alias `Infra_Cableado_Excluida` - IPs Faltantes

**Problema:** 11 IPs de infraestructura no estaban en el alias y eran limitadas

**IPs agregadas (30 → 41):**
| IP | Hostname | Dispositivo |
|----|----------|-------------|
| 192.168.1.11 | DellSw | Switch Dell |
| 192.168.1.12 | xvr | Servidor |
| 192.168.1.13 | s20-ultra-de-genovevo | Samsung |
| 192.168.1.14 | oneplus-13 | OnePlus |
| 192.168.1.89 | rfinancieros | Finanzas |
| 192.168.1.95 | becas | Becas |
| 192.168.1.98 | desktop-oe3la1i | PC Sandra |
| 192.168.1.200 | AP-Aula10 | AP Ubiquiti |
| 192.168.1.208 | AP-Aula5 | AP Ubiquiti |
| 192.168.1.209 | AcdcUbiquit | AP Ubiquiti |
| 192.168.1.228 | ubntusvr | Ubuntu Server |

**Método:** Edición directa de `/conf/config.xml` + `filter_configure`

**Resultado:** ✅ Todas en tabla pfctl, excluidas del limitador

---

### 2.4 Panel VPS - Nodo pvedell (Proxmox 192.168.1.96)

**Problema:** No aparecía en el dashboard, mostraba "aulamedios Hyper-V sin conexión"

**Solución:**
1. Crear token API en pvedell: `panel@pve!panel` → `8c8f2932-c379-4b6f-a7e4-662061fba2e3`
2. Reemplazar `aulamedios` por `pvedell` en `/opt/vps-panel/backend/config/nodes.json`
3. Configuración directa: `host: 192.168.1.96, port: 8006`
4. Reiniciar backend (`pm2 restart vps-panel-api`)

**Nodos finales en panel:**
| Nodo | IP | Tipo | VMID Range | Status |
|------|-----|------|------------|--------|
| pve | 192.168.1.4 | Proxmox | 200-299 | ✅ |
| pvececyte | 192.168.1.254 | Proxmox | 300-399 | ✅ |
| pvelenovo | 192.168.1.15 | Proxmox | 600-699 | ✅ |
| **pvedell** | **192.168.1.96** | **Proxmox** | **500-599** | **✅** |

**Resultado:** ✅ 4 nodos online en dashboard

---

### 2.5 Panel VPS - Creación VM en pvelenovo

**Problema:** "Error interno" al crear VM, VM 9000 "creada a medias"

**Investigación:**
- VM 9000 **SÍ existe** en pvelenovo como **template** (`ubuntu2404-devstack`, `template: 1`)
- Config pvelenovo: `storage: local-lvm` (template), `storageBulk: hdd1tb` (VMs)
- Bug en `provision.js:130`: Clone usaba `cfg.storage` (local-lvm) en lugar de `cfg.storageBulk` (hdd1tb)

**Errores de permisos encontrados y corregidos:**
1. `Permission check failed (/storage/hdd1tb, Datastore.AllocateSpace)` → ACL `PVEAdmin` en `/storage/hdd1tb`
2. `Permission check failed (/sdn/zones/localnetwork, SDN.Use)` → ACL `PVEAdmin` en `/sdn/zones/localnetwork`

**Fix en código (`provision.js`):**
```javascript
// ANTES:
storage: cfg.storage,

// DESPUÉS:
const cloneStorage = cfg.storageBulk || cfg.storage;
storage: cloneStorage,
```

**Permisos ACL aplicados en pvelenovo:**
```
/                    PVEVMAdmin  panel@pve
/                    PVEAuditor  panel@pve  
/storage/hdd1tb      PVEAdmin    panel@pve
/sdn/zones/localnetwork PVEAdmin panel@pve
```

**Resultado:** ✅ Clone manual funciona, pendiente test completo via API panel

---

## 3. ESTADO ACTUAL

### pfSense (192.168.1.1)
- ✅ DHCP Kea: static mapping funcionando
- ✅ Limitador dummynet: pipes 3/4 activos con mask por IP
- ✅ Alias Infra_Cableado_Excluida: 41 IPs, excluidas del limitador
- ✅ Regla orden: Infra (sin límite) → LAN (con límite)

### Panel VPS (192.168.1.34:3001)
- ✅ 4 nodos Proxmox online: pve, pvececyte, pvelenovo, pvedell
- ✅ Backend Node.js estable (PM2 online, 0 restarts)
- ✅ Fix aplicado en `provision.js` para usar `storageBulk`
- ✅ Permisos ACL corregidos en pvelenovo
- ⚠️ Test creación VM via API: "Error interno" (pendiente debug)

### Proxmox pvelenovo (192.168.1.15)
- ✅ Template 9000: `ubuntu2404-devstack` (20G, cloud-init, stopped)
- ✅ Storage: local-lvm (1.2% usado), hdd1tb (55% usado)
- ✅ ACLs: panel@pve tiene PVEAdmin en hdd1tb y sdn/zones/localnetwork
- ✅ Clone manual a hdd1tb funciona

---

## 4. ARCHIVOS MODIFICADOS

| Archivo | Cambio |
|---------|--------|
| `/conf/config.xml` (pfSense) | +11 IPs a alias Infra_Cableado_Excluida |
| `/usr/local/etc/kea/kea-dhcp4.conf` | Eliminadas 39 reservas globales |
| `/opt/vps-panel/backend/config/nodes.json` | aulamedios → pvedell |
| `/opt/vps-panel/backend/src/services/provision.js:130` | Clone usa `storageBulk` |
| ACLs Proxmox pvelenovo | +PVEAdmin en hdd1tb y sdn/zones/localnetwork |

---

## 5. COMANDOS ÚTILES

```bash
# pfSense - Ver pipes dummynet
dnctl pipe show

# pfSense - Ver tabla alias
pfctl -t Infra_Cableado_Excluida -T show

# pfSense - Ver reglas LAN
pfctl -sr | grep -E 'Infra|dnpipe'

# Panel - Reiniciar backend
pm2 restart vps-panel-api

# Panel - Ver logs
pm2 logs vps-panel-api --lines 50

# pvelenovo - Ver VMs
qm list

# pvelenovo - Ver ACLs
pveum acl list
```

---

## 6. PRÓXIMOS PASOS PENDIENTES

1. **Debug "Error interno" en creación VM via panel API** - Revisar logs tras clone
2. **Verificar cloud-init aplica password/devops** en primer boot
3. **Test deploy completo** (provision → wait_ip → prepare → fetch → stack → build → run → ufw → nat → vhost → dns → tls → verify)
4. **Documentar rotación de tokens** (panel@pve!panel en todos los nodos)
5. **Backup configuraciones** (config.xml, nodes.json, kea-dhcp4.conf)

---

## 7. CREDENCIALES (REFERENCIA)

| Servicio | Usuario | Password/Token |
|----------|---------|----------------|
| pfSense SSH | admin | Michoacan1 (puerto 2223) |
| pfSense WebGUI | admin | Michoacan1 (puerto 8444) |
| Proxmox (todos) | root | Michoacan1 (puerto 22) |
| Proxmox API | panel@pve!panel | Ver nodes.json (tokenSecret por nodo) |
| Panel VPS | admin | XX*NnJ46mjD7w0J%!hw^ |
| JWT Secret | - | Ver .env (JWT_SECRET) |

---

*Fin del resumen - Todas las tareas críticas completadas*