# RESUMEN COMPLETO DEL PROYECTO — Sesión de Trabajo

**Fecha:** Agosto 2026 · **Host local:** Windows (`C:\vpsserver\panel`)

---

## 1. INFRAESTRUCTURA CONOCIDA

| Equipo | Acceso | Notas |
|---|---|---|
| **pve** (192.168.1.4) | `root` vía sshpass — jump host | Ubuntu, tiene git + sshpass |
| **pvelenovo** (192.168.1.15) | `root/Michoacan1` vía jump host | Proxmox nodo para placement multi-tier |
| **pfSense** | Web GUI puerto 8444 · SSH puerto **2223** (IP 207.248.113.8) | Password SSH = password web |
| **VPS micongre** (`congregaciontj.duckdns.org:22211`) | usuario devops, password `uljTQZj_MKCuayAQ` | Solo accesible vía jump host pve; sesión entra como **root** |

**Truco clave:** desde Windows no hay `sshpass`; toda operación en el VPS se hace encadenando:
```
ssh root@192.168.1.4 → sshpass -p 'uljTQZj_MKCuayAQ' ssh -p 22211 devops@congregaciontj.duckdns.org
```

---

## 2. PANEL DE PROVISIONAMIENTO — POLÍTICA MULTI-TIER DE DISCOS

### Wargame: colocación de discos según perfil de recursos
- Regla: los recursos **SON** el perfil (sin campo manual).
  - `{diskGb: 30}` → disco único en SSD (`local-lvm`)
  - `{diskGb: 20, dataDiskGb: 100}` → OS en `local-lvm` + data en `hdd1tb` montado en `/data`
- Documento del wargame: `creacion-vms-placement-tiers.md`

### Cambios aplicados (Mov. 4–7)
- `backend/config/nodes.example.json` — entrada pvelenovo con `storageBulk: "hdd1tb"`
- `backend/src/middleware/validate.js` — validación `dataDiskGb`
- `backend/src/services/provision.js` — `checkCapacity` multi-tier + creación scsi1 + guardrail SSD 70%
- `backend/src/services/node-selector.js` — `bulkFreeGb`, `meetsRequirements`
- `backend/src/routes/nodes.js` — expone `storBulkAvail`
- Frontend: slider `dataDiskGb` en `ProvisioningForm.tsx`, tipos en `api/types.ts`

### E2E en pvelenovo — RESULTADO ✅ (parcial)
- Template 9000 restaurado desde vzdump (551MB), snippets dir creado, token verificado
- Fixes al template: quitado VLAN tag 6, borrado `cicustom`, nameserver → 192.168.1.1
- Prueba VM 401: `scsi0=local-lvm` (SSD) + `scsi1=hdd1tb,size=50G` (HDD), net0 sin tag ✔
- Destroy limpió volúmenes de ambos tiers ✔
- **Pendiente:** qemu-guest-agent no corre en el template → checks de IP/montaje/reboot sin verificar

### Trampas detectadas
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

### Estado actual
- ✅ **Paso 1:** `src/app/cuentas/page.tsx` reemplazado en el VPS (19 líneas, versión minimal con IconSidebar + SyncStatus + iframe). Subido vía script scp por jump host.
- ✅ **Paso 2:** commit `ecb3637` push a rama `vps-selfhosted` (hecho por usuario desde Mac)
- ⏸️ **Paso 3 PENDIENTE:** build+deploy en VPS. Script preparado en `C:\Users\User\AppData\Local\Temp\opencode\deploy_cuentas.sh`:
  ```bash
  cd /tmp && rm -rf msp-build
  /usr/bin/git clone https://github.com/oreyes100/meeting-scheduler-pro.git -b vps-selfhosted msp-build
  cd msp-build && cp /opt/msp/.next/standalone/.env .
  npm ci && npm run build
  cp -r .next/standalone/. /opt/msp/.next/standalone/
  cp -r .next/static /opt/msp/.next/standalone/.next/static
  cp -r public /opt/msp/.next/standalone/public
  ~/.npm-global/bin/pm2 restart meeting-scheduler-pro --update-env
  curl -sk https://congregaciontj.duckdns.org/api/health
  ```
- ⏸️ **Paso 4:** verificar `/cuentas` = iframe Vercel y `/cuentas-v2` = módulo nuevo

### Quirk del VPS (importante)
Comandos encadenados con `;` o `&&` fallan aleatoriamente con *"No such file or directory"* sobre binarios existentes (git, node). Comandos únicos funcionan. **Solución:** subir script `.sh` por scp y ejecutarlo completo.

Otros datos VPS: repo `/opt/msp` NO tiene `.git` · `git` solo con ruta completa `/usr/bin/git` · `pm2` en `/home/devops/.npm-global/bin/pm2` · hostname `micongre`.

---

## 5. OPENCODE LOCAL — CONFIG MODELS

- Config global: `C:\Users\User\.config\opencode\opencode.jsonc`
- Problema: solo tenía `"shell": "powershell"` → no aparecían modelos OpenCode Go en menú
- Fix aplicado:
  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "shell": "powershell",
    "provider": { "opencode-go": {} },
    "model": "opencode-go/nemotron-3-ultra"
  }
  ```
- Pendiente: usuario debe correr `/connect` → OpenCode Go → API key de opencode.ai/auth, luego `/models`

---

## 6. PRÓXIMOS PASOS (orden sugerido)

1. Ejecutar Paso 3 (build+deploy) con el script ya preparado → verificar health
2. Verificar en browser `/cuentas` (iframe) y `/cuentas-v2` (módulo)
3. Instalar qemu-guest-agent en template 9000 de pvelenovo → cerrar checks E2E 2–4
4. Autenticar opencode con OpenCode Go (`/connect`) para ver todos los modelos
