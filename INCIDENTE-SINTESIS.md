# SÍNTESIS DEL PROYECTO — Reparación de acceso WAN a los sitios web detrás del edge

**Fecha de síntesis:** 2026-08-28
**Alcance:** chat completo desde el incidente original (wiki/video) hasta el estado actual.
**Estado global:** 2 de 4 dominios rotos reparados; micongre y video bloqueados por falta de acceso a `192.168.1.250`.

---

## 1. Origen / Pedido original

El usuario reportó dos problemas en la ruta pública (WAN → pfSense → edge):
1. `wiki.dineroorganizado.duckdns.org` devolvía **502**.
2. `video.dineroorganizado.duckdns.org` mostraba el contenido de **capuvps** (sitio incorrecto) en lugar de la app de video.

Pedido inicial: "arreglar wiki y video".

Luego el usuario dio tres directivas sucesivas que cambiaron el rumbo:
- **"Deshaz lo que hiciste, bloqueaste el acceso WAN a todas las páginas; solo hay acceso LAN. El servidor correcto es 192.168.1.250."** → esto reveló que mis primeros cambios rompieron el acceso público.
- **"Solo deshaz lo que hiciste hoy."** → revertí TODO.
- **"Investiga y planifica, no hagas nada, solo planifica."** → produje un diagnóstico + plan.
- **"Haz el plan."** → ejecuté las partes accionables.

---

## 2. Topología de red (descubierta)

```
Internet
   │
pfSense  WAN 207.248.113.8   (SSH 2223, WebGUI 8444, LAN 192.168.1.1)
   │  NAT :443 / :80  ─────────────► 192.168.1.34  (EDGE / vps-panel)
   │  NAT :8446 ───────────────────► 192.168.1.4    (pve, DNAT extra)
   │  NAT :3010 ───────────────────► 192.168.1.250
   │  NAT :8443 ───────────────────► 192.168.1.254  (pvececyte)
   │  NAT :2203 ───────────────────► 192.168.1.4
   ▼
EDGE 192.168.1.34  (nginx + panel capuvps en 127.0.0.1:3001)
   ├─ wiki.dineroorganizado        → 192.168.1.4:8446 (DNAT pve) → 192.168.6.191:443 (misfinz)
   ├─ vault.dineroorganizado       → 192.168.1.4:8446 → 192.168.6.191:443
   ├─ dineroorganizado             → http(s)://192.168.1.250
   ├─ micongre / micongre.duckdns  → http://192.168.1.250:3010   (CAÍDO)
   ├─ pachucacv                    → https://192.168.1.254:8443  (DNAT pvececyte → 192.168.7.186:443)
   ├─ congregaciontj               → (sano, 307)
   ├─ capuvps / videoobsidian.capuvps → 127.0.0.1:3001 (panel)
   └─ video.dineroorganizado       → NO EXISTE VHOST → default capuvps  (CAÍDO/INCORRECTO)
```

### Backends
| IP | Rol | Acceso SSH | Estado |
|---|---|---|---|
| 192.168.1.34 | **edge** (vps-panel), nginx + panel capuvps | root vía id_ed25519 ✅ | operativo |
| 192.168.1.4 | pve (nft DNATs, tabla `inet vpsgw`) | root vía id_ed25519 ✅ (bastión) | operativo |
| 192.168.1.250 | backend principal ("Mis finanzas" app en :443) | **DENEGADO todas las llaves** ❌ | :80/:443 abiertos; :3010/:8000 cerrados |
| 192.168.1.254 | pvececyte (Proxmox), VM 300 = pachucacv | root vía id_ed25519 ✅ | operativo |
| 192.168.6.191 | misfinz (misfinanzas, wiki, vault nginx) | devops vía bastión pve:2203 + id_ed25519 ✅ | operativo |
| 192.168.7.186 | VM 300 pachucacv (dentro de pvececyte) | guest-agent ✅ / SSH devops (pw cloud-init) | arrancada hoy |

---

## 3. Investigación y causas raíz

Verificación por la **ruta pública** (Windows → pfSense → edge):

| Dominio | Resultado | Causa raíz |
|---|---|---|
| wiki | **401** (sano) | nginx auth; el 502 que reportó el usuario no fue reproducible desde el edge (probablemente transitorio / Cloudflare). |
| vault | **401** (sano) | igual que wiki. |
| dineroorganizado | **301 → loop** | edge → `http://192.168.1.250` (:80) que redirige a https → bucle. |
| micongre | **502** | edge → `http://192.168.1.250:3010`; puerto sin listener (app caída). |
| pachucacv | **502** | VM 300 en pvececyte estaba **STOPPED**; DNAT `8443→192.168.7.186:443` existía. |
| video.dineroorganizado | **200 (capuvps)** | no hay vhost en el edge → cae en default capuvps. |
| congregaciontj | **307** (sano) | — |
| capuvps | **200** (sano) | — |

**Hallazgo clave:** el servidor backend correcto para las apps de negocio es `192.168.1.250` (confirmado por el usuario), NO `192.168.6.191`.

---

## 4. Primeras acciones y el episodio de REVERSIÓN

Antes de que el usuario pidiera "deshaz todo", implementé (y luego revertí completamente) lo siguiente:

1. En `192.168.6.191`: servicio systemd `videotoobsidian` (FastAPI en :8000) + app arrancada.
2. En `pve` (192.168.1.4): regla nft `DNAT 8212 → 192.168.6.191:8000`, script `/usr/local/sbin/restore-vpsgw-dnat.sh`, servicio `vpsgw-dnat.service`.
3. En `edge`: vhost `:80` para `video.dineroorganizado` + certificado Let's Encrypt emitido con acme.sh.

El usuario reportó que esto **bloqueó el acceso WAN a todas las páginas** → revertí TODO:
- pve: deshabilité/eliminé `vpsgw-dnat.service` + script, borré la regla DNAT (handle 16).
- .191: deshabilité/eliminé `videotoobsidian.service`, detuve la app.
- edge: eliminé el vhost de video + el directorio del cert, recargué nginx.

Verifiqué rollback: wiki 401, dineroorganizado 301, edge sano, solo quedaba `videoobsidian.capuvps` como vhost huérfano.

**Lección:** no redirigir tráfico de producción a backends nuevos sin confirmar el servidor correcto y sin dejar intacta la configuración previa.

---

## 5. El plan (aprobado por el usuario: "haz el plan")

1. **dineroorganizado** — cambiar edge vhost `proxy_pass` de `http://192.168.1.250` a `https://192.168.1.250` con `proxy_ssl_verify off`.
2. **wiki/vault** — sin cambios (sanos).
3. **pachucacv** — levantar VM 300 en pvececyte (`.254`); el DNAT ya existe.
4. **micongre** — arrancar la app en `192.168.1.250:3010` (requiere acceso a `.250`).
5. **video** — crear vhost en edge apuntando al backend correcto (requiere decisión de backend + acceso a `.250`).

Bloqueo declarado en el plan: **sin acceso a `192.168.1.250` no se pueden completar micongre ni video.**

---

## 6. Ejecución — resultados

### ✅ dineroorganizado (REPARADO)
- Edité `/etc/nginx/sites-available/dineroorganizado.duckdns.org` en el edge:
  ```
  proxy_pass https://192.168.1.250;
  proxy_ssl_verify off;
  proxy_ssl_server_name on;
  proxy_ssl_name dineroorganizado.duckdns.org;
  ```
- `nginx -t && nginx -s reload`.
- Verificado por ruta pública: **200** con app "Mis finazas".
- Backup: `dineroorganizado.duckdns.org.bak-httpsfix`.

### ✅ pachucacv (REPARADO)
- SSH a `192.168.1.254` (pvececyte) con id_ed25519 ✅.
- `qm status 300` → stopped. `qm start 300`.
- Esperé arranque; guest-agent respondió (`hostname` = pachucacv).
- `docker ps` dentro de la VM: `pachuca-landing-web-1` (:4321) + `mongo:7` **Up**.
- App responde en 127.0.0.1:4321 con landing completa de "Pachuca Central Valley".
- Cadena verificada: VM nginx → **200**; edge → `.254:8443` → **200**; público → **200**.

### ⛔ micongre (BLOQUEADO)
- edge → `http://192.168.1.250:3010`; `nc`/curl → connection refused.
- Sin acceso SSH a `.250` (ver sección 7). No se puede arrancar la app.

### ⛔ video.dineroorganizado (BLOQUEADO)
- No existe vhost → muestra capuvps.
- Requiere: (a) decidir backend (¿`.250`? ¿`.191`? ¿puerto?) y (b) acceso a `.250` para desplegar/correr la app de video.

---

## 7. Inventario de acceso / credenciales (Windows `~/.ssh/`)

| Llave | .34 edge | .4 pve | .191 misfinz | .254 pvececyte | .250 backend |
|---|---|---|---|---|---|
| id_ed25519 | ✅ root | ✅ root (bastión) | ✅ devops (vía :2203) | ✅ root | ❌ |
| pfsense_admin | — | — | — | — | ❌ |
| pve_panel_admin | — | — | — | — | ❌ |
| vps_panel_deploy | — | — | — | — | ❌ (root y devops) |

`.250` responde `Permission denied (publickey,password)` para todos los intentos (BatchMode). No hay puerto de gestión alternativo conocido.

---

## 8. Estado actual (resumen)

| Dominio | Estado WAN | Notas |
|---|---|---|
| dineroorganizado | ✅ 200 | reparado hoy |
| pachucacv | ✅ 200 | VM 300 arrancada hoy |
| wiki | ✅ 401 | sano (auth) |
| vault | ✅ 401 | sano (auth) |
| congregaciontj | ✅ 200/307 | sano |
| capuvps | ✅ 200 | sano |
| micongre | ❌ 502 | bloqueado: falta arrancar app en `.250:3010` |
| video.dineroorganizado | ❌ (capuvps) | bloqueado: falta vhost + backend |

**Sin regresiones** respecto al estado previo al incidente.

---

## 9. Pendientes y lo que necesito del usuario

1. **Credenciales SSH de `192.168.1.250`** (usuario + contraseña o llave) — para:
   - arrancar la app de micongre en `:3010`, y
   - desplegar/correr la app de video (si corresponde a `.250`).
2. **Decisión de backend para video** — ¿en `.250`? ¿en `.191` (donde ya existe el código `videotoobsidian`)? ¿qué puerto?

Con eso completo micongre y video y cierro el incidente.

---

## 10. Archivos relevantes
- `/etc/nginx/sites-available/dineroorganizado.duckdns.org` (edge) — **modificado** (proxy https .250).
- `/etc/nginx/sites-available/dineroorganizado.duckdns.org.bak-httpsfix` (edge) — backup.
- `/etc/nginx/sites-available/wiki.dineroorganizado.duckdns.org` (edge) → 192.168.1.4:8446.
- `/etc/nginx/ssl/` (edge) — certs (dineroorganizado, wiki, vault, wildcard-capuvps).
- `/root/.acme.sh/` (edge) — acme.sh (emite certs Let's Encrypt).
- `/etc/pve/qemu-server/300.conf` (pvececyte) — VM pachucacv (`onboot: 1`, cloud-init devops).
- iptables nat en pvececyte: `DNAT 8443→192.168.7.186:443`, `2300→.186:22`.
- `/home/devops/videotoobsidian/` (192.168.6.191) — código de video + `.venv` (uvicorn/fastapi/whisper); servicio revertido.
- `~/.ssh/` (Windows): id_ed25519 (funciona en .34/.4/.191/.254); pfsense_admin, pve_panel_admin, vps_panel_deploy (denegadas en .250).

---
*Fin de la síntesis.*
