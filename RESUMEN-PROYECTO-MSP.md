# RESUMEN COMPLETO DEL PROYECTO — MSP (Meeting Scheduler Pro) y Cuentas v2

_Actualizado: 23-ago-2026 (cierre) · Resumen de toda la sesión desde el inicio_

---

## 1. INFRAESTRUCTURA Y ACCESO

### Acceso desde Windows (PowerShell)
| Destino | Comando |
|---|---|
| Bastión Proxmox | `ssh root@192.168.1.4` |
| VPS app (interno, vía bastión) | `sshpass -p 'uljTQZj_MKCuayAQ' ssh devops@192.168.6.136` |

- ⚠️ PowerShell no tiene `sshpass` ni `<`: los scripts `.sh` se escriben localmente, se suben con cadena `scp` doble (Windows→bastión→VPS) y se ejecutan con `bash`. Evitar comillas anidadas complejas en una sola línea ssh.
- WAN pública: **207.248.113.8** · Dominio de producción: **congregaciontj.duckdns.org**
- El dominio entra por **443 → nginx del Panel (192.168.6.152)** que rutea por hostname al MSP. Ruta directa alternativa: `http://207.248.113.8:8211` (NAT→6.136:80).

### Topología de red
- **192.168.1.4** = nodo Proxmox ("pve") + router/NAT principal (iptables). VMs: 100–104, 202, 210–213, 250, 500, 9000; LXC 200 "panel".
  - DNAT: `443 y 8091→6.152:443`, `22211→6.136:22`, `8211→6.136:80`, `22212→6.196:22`, `8212→6.196:80`, `22213→6.148:22`; nft table `vpsgw`: `2202→6.152:22`, `2203/8446→6.191`.
  - Cadena FORWARD: ACCEPT explícito por servicio. **Se agregó la regla faltante `-d 192.168.6.136 --dport 80 -j ACCEPT`** (persistida en `/etc/iptables/rules.v4`, backup previo creado).
- **192.168.6.136** = VM 211 "micongre" → **MSP**: PM2 `meeting-scheduler-pro` :3000 (script `/opt/msp/server.js`, cwd `/opt/msp`), docker `app-web-1` (nginx :80→3000) y `app-db-1` (mysql :3306).
- **192.168.6.152** = sirve el **"Panel VPS — Proxmox"** en 443 (nginx Ubuntu; NO está caído — solo bloquea ping). Por ahí entra el dominio duckdns.
- **192.168.6.191** = VM "misfinz" = app **"Mis finazas"** (proyecto DISTINTO, dineroorganizado.duckdns.org).

---

## 2. APLICACIONES Y REPOS

### MSP (producción)
- Repo: **`oreyes100/meeting-scheduler-pro`**, rama **`vps-selfhosted`**.
- ⚠️ **HALLAZGO CLAVE de la sesión**: `/opt/msp` estaba clonado del repo EQUIVOCADO (`oreyes100/congregaciontj.git @ main`) — un linaje viejo SIN cuentas-v2. Un build in-place (23-ago ~03:00) pisó el deploy bueno con código antiguo. **Corregido**: el repo interno apunta a meeting-scheduler-pro@vps-selfhosted.
- Deploy alternativo: `/opt/deploy-msp.sh` (clona GitHub → npm ci → build → swap artefactos → PM2 delete/start).
- Layout runtime: `/opt/msp/{server.js (standalone), .next/, public/, src/lib/pdf-templates/, ecosystem.config.cjs, data/msp.db}`.
- Env clave (`ecosystem.config.cjs`): `CUENTAS_INTERNAL_URL=https://cuentas-congregacion-bay.vercel.app`, `CUENTAS_MASTER_SECRET=e9da...1303`.
- BD SQLite `/opt/msp/data/msp.db`: tablas cuentas_* (`config` 1, `saldo_inicial` 1, `codes` 14, `transactions` 80).
- Menú: `MODULES` en `src/lib/modules.ts`; renderiza `IconSidebar.tsx` con `canAccess(...)`. Entradas: línea 46 `cuentas` (iframe a Vercel) y 47 `cuentas-v2` (**adminOnly**, UI integrada completa).

### Git — estado final SINCRONIZADO ✅
- GitHub `vps-selfhosted` = **`aac69d8`** = idéntico al HEAD del VPS (sin adelanto ni retraso).
- Historial relevante: `aac69d8` (etiqueta Cuentas v2 + nombres por sección) ← `61663b0` (export CSV + sección backup) ← `682ef28` (fix export XLSX/DOCX, base previa).
- **Método de push sin credenciales en el VPS**: `git bundle create /tmp/x.bundle origin/vps-selfhosted..vps-selfhosted` → scp doble a Windows → en repo temporal Windows (`git init` + `fetch origin` + `fetch bundle`) → `git push origin vps-selfhosted:vps-selfhosted` usando las credenciales del **Git Credential Manager de Windows (usuario oreyes100)**. No hay `gh` CLI instalado.

### Cuentas — dos versiones
| Versión | Dónde | Estado |
|---|---|---|
| **v2 standalone (legacy)** | https://cuentas-congregacion-bay.vercel.app/ | Viva; embebida como iframe en `/cuentas` |
| **Integrada nativa ("Cuentas v2")** | Repo MSP: `src/app/cuentas-v2/page.tsx` + `src/app/api/cuentas/*` (cierre-mes, codes, config, forms, import, ocr, reports, saldo-inicial, telegram, transactions) | Desplegada y operativa |

---

## 3. TRABAJOS REALIZADOS (cronológico)

### 3.1 ✅ Fix auto-asignación de reuniones
Corregido `src/services/auto-assign-service.js`, desplegado y verificado. Re-aplicado como cambio local tras cada rebuild (⚠️ sigue sin commit específico en la rama actual — ver pendientes).

### 3.2 ✅ Localización de las dos versiones de Cuentas
Rastreo completo de red (6.152 parecía caído pero es el Panel; 6.191 = Mis Finazas). Resultado: v2 legacy viva en Vercel; versión integrada nativa en el repo MSP con API local y datos reales.

### 3.3 ✅ Ambas versiones en el menú del web UI
El repo ya traía ambas entradas en modules.ts; el VPS corría build viejo. Rebuild desde GitHub preservando fix auto-assign → menú muestra **Cuentas** (iframe Vercel) y **Cuentas v2 ⚗️** (integrada).

### 3.4 ✅ "Producción no responde" — doble causa raíz resuelta
1. **Firewall**: faltaba ACCEPT en FORWARD para 6.136:80 → regla agregada + persistida.
2. **Repo equivocado en /opt/msp**: re-apuntado al correcto, configs locales preservadas (guardadas antes del reset, restauradas después), build in-place + swap + PM2.
- Nota: VPS se reinició el 23-ago 21:04. Hairpin NAT hacia la IP pública desde LAN interna da timeout (normal); externamente el mapeo 8211 funciona.

### 3.5 ✅ Exportación de Cuentas (commits `61663b0` + `aac69d8`)
- **`/backup` (respaldo general)**: sección **"Cuentas v2 (Contabilidad)"** con las 4 tablas (`cuentas_config`, `cuentas_saldo_inicial`, `cuentas_codes`, `cuentas_transactions`). JSON (dump completo) y CSV (ZIP con un CSV por tabla). También en **Restaurar** (JSON restaura las 4 tablas juntas; dropdown CSV individual incluye cuentas_*).
- **`/cuentas-v2`**: botón verde **"Exportar respaldo CSV"** junto a "Importar respaldo CSV" → descarga TODAS las transacciones (`?format=csv`, límite 200k filas, ordenadas por fecha), round-trip compatible con el importador.
- **Nombres de archivo**: una sola sección → `respaldo-cuentas-YYYY-MM-DD.zip/.json`.
- Verificado end-to-end por puerto público (chunks servidos, health OK, endpoints 401 sin sesión = correcto).

### 3.6 ✅ Push a GitHub completado
Ambos commits subidos a `vps-selfhosted` vía bundle+push desde Windows (credenciales GCM de oreyes100). VPS y GitHub 100% sincronizados — los deploys futuros desde GitHub incluyen todo.

---

## 4. ESTADO ACTUAL

| Componente | Estado |
|---|---|
| App MSP (PM2 :3000, nginx :80) | ✅ Online, health OK |
| Menú: Cuentas + Cuentas v2 ⚗️ | ✅ Visibles (la v2 requiere rol admin) |
| FORWARD 8211→6.136:80 | ✅ Regla activa + persistida |
| Repo interno /opt/msp | ✅ Correcto y sincronizado con GitHub |
| Sección "Cuentas v2" en /backup | ✅ JSON + CSV(ZIP), en producción |
| Botón Exportar CSV en /cuentas-v2 | ✅ Operativo, en producción |
| Push a GitHub | ✅ Completado (aac69d8) |

## 5. PENDIENTES / RIESGOS
1. **Seguridad**: el CSV de `cuentas_config` exporta `ai_api_key` de Google en texto plano → rotar si el archivo sale del entorno; opcionalmente enmascarar en exports.
2. **Fix fino de auto-assign-service.js**: vive como cambio local sin commit en /opt/msp. Si se quiere blindar: commitearlo y pushear con el mismo método bundle.
3. `backup.sh` y `healthcheck.py` referenciados por cron **no existen** (errores diarios en `/opt/msp/backups/backup.log`) — recrearlos o quitar las entradas del crontab de devops.
4. (Menor) limpiar temporales de Windows: `%TEMP%\opencode\msppush`, `msp-push.bundle`.

## 6. LECCIONES / CONVENCIONES DE LA SESIÓN
- Verificar SIEMPRE `git remote -v` del checkout in-place antes de asumir qué código compila (dos repos peleándose por /opt/msp).
- Los rebuilds deben re-aplicar fixes locales no pusheados ANTES de compilar.
- Cadena de acceso a validar en orden: DNS/dominio → router ISP → DNAT bastión → FORWARD → servicio :80 → app :3000 → auth → contenido del chunk.
- PowerShell: scripts `.sh` vía scp doble; nunca comillas anidadas complejas en una sola línea ssh.
- Push desde VPS sin credenciales → patrón bundle+Windows-GCM (reutilizable).

## 7. ARCHIVOS/SCRIPTS GENERADOS
- `fixdefinitivo.sh` — re-apuntado de repo + build + deploy completo
- `exportfeat.sh` — parches de export (sección backup + botón CSV)
- `labelv2b.sh` — etiqueta "Cuentas v2" + nombres de archivo por sección (idempotente)
- `rebuild.sh`, `verify.sh`, `findv2.sh`, `final.sh`, `prodcheck.sh`, `cap.sh`, `diag*.sh`, `repochk.sh` — diagnóstico/deploy
- Backups de seguridad en VPS: `/tmp/msp-local-guard/`, `/tmp/msp-export-guard/`
- Este resumen: `C:\vpsserver\RESUMEN-PROYECTO-MSP.md`
