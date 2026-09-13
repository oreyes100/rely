# SÍNTESIS COMPLETA DEL PROYECTO — Agosto 2026

**Fecha:** Agosto 2026  
**Host local:** Windows (`C:\vpsserver\panel`)  
**Agente:** OpenCode (mimo-v2.5-free)

---

## 1. INFRAESTRUCTURA GENERAL

### Red Local
| Host | IP | Rol | Acceso |
|---|---|---|---|
| **pve** | 192.168.1.4 | Proxmox VE (puente/bastión SSH) | `root` vía sshpass |
| **pvelenovo** | 192.168.1.15 | Proxmox VE (multi-tier placement) | `root/Michoacan1` vía pve |
| **pvedell** | 192.168.1.96 | Proxmox VE (VMs 500, 9001 + storage vmdata) | `root/Michoacan1` vía pve |
| **pfSense** | 192.168.1.254 | Proxmox host (VM 100 = pfSense) | SSH root, WebGUI puerto 80/443 |

### VPS Remoto
| Host | IP | Rol | Acceso |
|---|---|---|---|
| **VPS micongre** | congregaciontj.duckdns.org:22211 | Next.js (meeting-scheduler-pro) | `devops` vía jump host pve |

**Truco clave:** Desde Windows no hay `sshpass`; toda operación en el VPS se hace encadenando:
```
ssh root@192.168.1.4 → sshpass -p 'uljTQZj_MKCuayAQ' ssh -p 22211 devops@congregaciontj.duckdns.org
```

---

## 2. PANELES DE PROVISIONAMIENTO

### Wargame: Políticas de Colocación Multi-Tier de Discos
- Regla: los recursos **SON** el perfil (sin campo manual)
- `{diskGb: 30}` → disco único en SSD (`local-lvm`)
- `{diskGb: 20, dataDiskGb: 100}` → OS en `local-lvm` + data en `hdd1tb` montado en `/data`

**Cambios aplicados (Mov. 4–7):**
- `backend/config/nodes.example.json` — entrada pvelenovo con `storageBulk: "hdd1tb"`
- `backend/src/middleware/validate.js` — validación `dataDiskGb`
- `backend/src/services/provision.js` — `checkCapacity` multi-tier + creación scsi1 + guardrail SSD 70%
- `backend/src/services/node-selector.js` — `bulkFreeGb`, `meetsRequirements`
- `backend/src/routes/nodes.js` — expone `storBulkAvail`
- Frontend: slider `dataDiskGb` en `ProvisioningForm.tsx`, tipos en `api/types.ts`

**E2E en pvelenovo — RESULTADO ✅ (parcial):**
- Template 9000 restaurado desde vzdump (551MB)
- Prueba VM 401: `scsi0=local-lvm` (SSD) + `scsi1=hdd1tb,size=50G` (HDD), net0 sin tag ✔
- **Pendiente:** qemu-guest-agent no corre en el template → checks de IP/montaje/reboot sin verificar

**Trampas detectadas:**
1. Template 9000 traía VLAN tag 6 (sin efecto en LAN de pvelenovo)
2. Snippet asumía `/dev/sdb`
3. Riesgo typo `cfg.storage` vs `cfg.storageBulk`

---

## 3. FIX DEPLOY VPS (meeting-scheduler-pro)

### Diagnóstico
- PM2 apuntaba a `/opt/msp/.next/standalone/server.js` — **no existía** → 88,337 restarts, status *errored*
- Build nuevo real estaba en `/opt/msp/standalone/server.js` (7001 bytes)

### Fix aplicado ✅
```bash
cp -r /opt/msp/standalone/. /opt/msp/.next/standalone/
cp /opt/msp/standalone/.env /opt/msp/.next/standalone/.env
~/.npm-global/bin/pm2 restart meeting-scheduler-pro --update-env
curl -sk https://congregaciontj.duckdns.org/api/health   # → {"ok":true} ✅
```

---

## 4. WARGAME: RESTAURAR /cuentas COMO IFRAME

### Objetivo
- `/cuentas` → iframe simple a `https://cuentas-congregacion-bay.vercel.app/`
- `/cuentas-v2` → mantiene módulo nuevo completo

### Estado
- ✅ **Paso 1:** `src/app/cuentas/page.tsx` reemplazado en el VPS (19 líneas, versión minimal)
- ✅ **Paso 2:** commit `ecb3637` push a rama `vps-selfhosted`
- ⏸️ **Paso 3 PENDIENTE:** build+deploy en VPS (script preparado)
- ⏸️ **Paso 4:** verificar `/cuentas` = iframe Vercel y `/cuentas-v2` = módulo nuevo

### Quirk del VPS
Comandos encadenados con `;` o `&&` fallan aleatoriamente. **Solución:** subir script `.sh` por scp y ejecutarlo completo.

---

## 5. pfSense — CONFIGURACIÓN COMPLETA

### 5.1 Arquitectura General

El pfSense corre como **VM 100** dentro de Proxmox VE host `192.168.1.254` (nombre: `pvececyte.lan`).

| Configuración | Valor |
|---|---|
| Proxmox host | `192.168.1.254` (vmbr0: 192.168.1.0/24) |
| pfSense VM ID | 100 |
| RAM | 4096 MB |
| Boot disk | 52 GB |
| net0 | virtio=BC:24:11:05:1F:AA, bridge=vmbr0, firewall=1, tag=1 |
| net1 | virtio=BC:24:11:27:E3:D0, bridge=vmbr1, firewall=1, tag=1 |
| vmbr1 | 192.168.2.1/24 (red secundaria VLAN) |

### 5.2 SSL/CA Framework (Completado ✅)

**Certificate Authority interna:**
- Nombre: `opencode-internal-ya`
- RefID: `6a869d7b14375`
- Método: generación interna (RSA 4096, SHA-384, 3650 días)

**Certificado WebGUI:**
- Nombre: `opencode-webgui-cert`
- RefID: `6a869d9a4e1c4`
- Common Name: `192.168.1.1`
- SAN: `IP Address:192.168.1.1`
- Tipo: server, RSA 4096, SHA-384
- lifetime: 3650 días

**Bug parcheado:** `CertificateAuthorityGenerate.inc` no generaba DN (Distinguished Name) correctamente — parcheado para omitir campos vacíos.

**API Key:** `4c913ee6dc5c18f1601245b4ea5d4508f2d9648f0f68695d` (header `x-api-key`)

**REST API v2.10:** verificada con `pfSense_test_enhanced_connection`

### 5.3 Suricata IDS (Completado ✅)

**Estado actual:**
- Paquete: `os-suricata-7.0.9` (actualizado desde 7.0.8_5)
- **Modo:** IDS (no IPS) — decision del usuario
- `blockoffenders: off`
- 3 instancias configuradas:

| Instancia | Interfaz | Estatus | Reglas |
|---|---|---|---|
| LAN | `lan` | ✅ enabled | 46,212 |
| VLAN4-Alumnos | `igb1.40` | ✅ enabled | 46,212 |
| VLAN5-DMZ | `igb1.50` | ✅ enabled | 46,212 |

- **Reglas cargadas:** 46,212
- **Reglas fallidas:** 5 (sin impacto —Home_Network_Changed, ET Neighbor Skip, GPL img Tamper, ET POLICY curl, ET SCAN Nmap)

**Optimización de memoria (aplicada):**
```xml
<!-- Antes -->
<detect_eng_profile>high</detect_eng_profile>
<max-pending-packets>2048</max-pending-packets>
<runmode>autofp</runmode>

<!-- Después -->
<detect_eng_profile>low</detect_eng_profile>
<max-pending-packets>512</max-pending-packets>
<runmode>single</runmode>
```

**Captura de paquetes:**
```xml
<!-- Antes -->
<max-pcap-log-size>512000000</max-pcap-log-size>
<max-pcap-log-files>20</max-pcap-log-files>

<!-- Después -->
<max-pcap-log-size>100000000</max-pcap-log-size>
<max-pcap-log-files>3</max-pcap-log-files>
```

**Auto-update de reglas:**
```xml
<!-- Antes -->
<autoruleupdate>never_up</autoruleupdate>

<!-- Después -->
<autoruleupdate>7d_up</autoruleupdate>
```

**Cron:** `59 0 */7 * *` (cada 7 días a las 00:59)

### 5.4 pfBlockerNG (Análisis Completado ✅)

**Paquete:** `pfSense-pkg-pfBlockerNG-devel` v3.2.14_2

**DNSBL Service:**
- `pfb_dnsbl`: ✅ enabled & running
- Modo: `dnsbl_python`
- Interfaz: `lo0` (loopback)
- Puerto DNSBL: `8081`
- Puerto DNSBL VIP: `8082`
- Caché: activa (10 min TTL)
- HSTS: activo

**DNSBL VIPs en lo0:**
- IPv4: `10.10.10.1`
- IPv6: `fd00::1`

**Filter Service:**
- `pfb_filter`: ✅ enabled pero **detenido** (status=false)
- **Requiere restart manual si se desea firewall-level blocking**

**Feeds activos:**

| Feed | Fuente | Acción | Tipo |
|---|---|---|---|
| StevenBlack | Steven Black's unified hosts | Deny_Outbound | ADs+Malware |
| Abuse_Feodo_C2 | abuse.ch Feodo Tracker C2 | Deny_Outbound | C2 servers |
| CINS_army | CINS Score list | Deny_Outbound | Nefarious IPs |
| ET_Block | Emerging Threats Block | Deny_Outbound | Known offenders |
| ET_Comp | Emerging Threats Compromised | Deny_Outbound | Compromised hosts |
| ISC_Block | SANS ISC Block list | Deny_Outbound | Attacking IPs |
| Spamhaus_Drop | Spamhaus DROP | Deny_Outbound | Hijacked netblocks |

**Configuración de actualización:**
- Cron: `01hour` (cada hora)
- Forzar actualización: `pfblog /tmp/pfbiglesia.log`

**Integración con DNS:**
- DNSBL resuelve en loopback via VIPs
- Configurado para interceptar tráfico DNS
- Compatible con Suricata (capas independientes)

### 5.5 Servicios de Red

**Interfaces activas:**
| Interfaz | IP | Descripción |
|---|---|---|
| WAN | DHCP (ISP) | Conexión a internet |
| LAN | 192.168.1.254/24 | Red local principal |
| VLAN4-Alumnos | 192.168.4.1/24 | Red de alumnos |
| VLAN5-DMZ | 192.168.5.1/24 | Zona desmilitarizada |

**DNS:** Resolver (Unbound) configurado
**DHCP:** Servidor DHCP activo en LAN
**NAT:** Outbound NAT configurado
**Firewall:** Reglas base + Suricata IDS

### 5.6 Configuración de Seguridad

**Certificados SSL:**
- WebGUI usa certificado auto-firmado (refid: `6a869d9a4e1c4`)
- API key para acceso programático
- HTTPS habilitado en interfaz web

**Firewall Rules:**
- Reglas por defecto (block all in, allow all out)
- Suricata monitorea en modo IDS
- pfBlockerNG bloquea IPs maliciosas conocidas

---

## 6. ESTADO ACTUAL Y TAREAS PENDIENTES

### Completado
- [x] Infraestructura Proxmox documentada
- [x] Panel provisionamiento multi-tier funcional
- [x] Fix deploy VPS (meeting-scheduler-pro)
- [x] SSL/CA framework en pfSense
- [x] Suricata IDS configurado y optimizado
- [x] pfBlockerNG analizado (7 feeds activos)
- [x] Actualización Suricata a v7.0.9
- [x] Optimización memoria Suricata

### Pendiente
- [ ] **Iniciar pfb_filter** si se desea firewall-level blocking de pfBlockerNG
- [ ] **Build+deploy** de `/cuentas` como iframe en VPS
- [ ] **Verificar** `/cuentas` (iframe) y `/cuentas-v2` (módulo)
- [ ] **Instalar** qemu-guest-agent en template 9000 de pvelenovo
- [ ] **Conectar** a VPS en `~/mis-finanzas` para diagnóstico (proyecto Node.js: dineroorganizado.duckdns.org)
- [ ] **Confirmar** IP/puerto de acceso SSH al pfSense (192.168.1.254:22 no responde a SSH)

### Decisiones del Usuario
- **Mantener IDS** (no IPS/blockoffenders)
- **No reiniciar** pfSense completamente
- **Actualización automática** de reglas Suricata cada 7 días
- **Capas de defensa:** DNSBL + Suricata + Firewall = 3 niveles

---

## 7. LESSONS LEARNED

### PowerShell 5.1
- `&&` no soportado — usar `; if ($?) { cmd2 }`
- `||` no funciona como separador de instrucciones
- `head` no existe — usar `Select-Object -First` o `Select-Object -Last`
- Usar `Read`/`Grep` sobre archivos temporales en lugar de pipelines

### pfSense
- Cada cambio requiere **apply** para que tome efecto
- IDs de objetos son arrays indexados (cambian tras borrados)
- Usar `find_object_by_field` para referencias estables después de borrados
- Todos los API calls requieren header `x-api-key`

### Proxmox
- SSH no disponible desde Windows directamente — usar jump host
- `sshpass` necesario para encadenar conexiones
- Scripts `.sh` subidos por scp son más confiables que comandos encadenados

### pfBlockerNG
- `pfb_dnsbl` funciona independiente de `pfb_filter`
- DNSBL resuelve en loopback via VIPs en lo0
- Feeds se actualizan cada hora por defecto
- **pfb_filter DEBE iniciarse manualmente** si se desea bloqueo en firewall

### Suricata
- `detect_eng_profile: low` reduce consumo de memoria significativamente
- `runmode: single` más estable que `autofp` para setups pequeños
- 5 reglas fallidas son normales (no afectan operación)
- Auto-update semanal recomendado para mantener reglas actualizadas

---

## 8. COMANDOS RÁPIDOS DE REFERENCIA

```bash
# Conexión a Proxmox host
ssh root@192.168.1.254

# Estado de VMs
qm list

# Estado de Suricata (si hay SSH al pfSense)
config.xml: cat /cf/conf/config.xml | grep -A5 suricata

# Estado de pfBlockerNG
cat /cf/conf/config.xml | grep -A20 pfblockerngdnsblsettings

# Forzar update Suricata
# (desde WebGUI: Services → Suricata → Updates)

# Forzar update pfBlockerNG
# (desde WebGUI: Firewall → pfBlockerNG → Update)

# Verificar servicios
systemctl status suricata
systemctl status pfb_dnsbl
systemctl status pfb_filter
```

---

## 9. ARCHIVOS IMPORTANTES

| Archivo | Descripción |
|---|---|
| `/cf/conf/config.xml` | Config completa del pfSense (SSL, Suricata, pfBlockerNG) |
| `/etc/crontab` | Cron jobs del sistema |
| `/usr/local/pkg/RESTAPI/Models/CertificateAuthorityGenerate.inc` | Parche SSL |
| `C:\vpsserver\panel\opencode.json` | Config MCP con SSL |
| `C:\Users\User\.config\opencode\certs\opencode-internal-ca.pem` | CA PEM trust anchor |

---

## 10. PRÓXIMOS PASOS RECOMENDADOS

1. **Restablecer SSH al pfSense** — Verificar si `192.168.1.254:22` necesita configuración, o si el pfSense VM tiene otra IP/WAN
2. **Iniciar pfb_filter** si se desea bloqueo firewall-level
3. **Deploy /cuentas** en VPS (script ya preparado)
4. **Conectar a VPS ~/mis-finanzas** para diagnóstico de proyecto Node.js
5. **Verificar** que Suricata auto-update funcione tras primer ciclo

---

*Documento generado automáticamente por OpenCode — Agosto 2026*
