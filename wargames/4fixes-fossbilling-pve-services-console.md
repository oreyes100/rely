# War-game: 4 correcciones — FossBilling layout, pve 401, catálogo IA, consola Proxmox
> Executor: ejecuta los movimientos en orden. Lee las señales de fallo antes de cada movimiento. Revisa condiciones de abort tras cada movimiento.

## Mission objective
Corregir cuatro problemas en el panel en producción (`capuvps.duckdns.org`, servidor: `192.168.1.34`):

1. **FossBilling layout roto** — La página carga HTTP 200 pero CSS/JS/imágenes fallan; aparecen íconos mal renderizados y fondo negro incorrecto.
2. **Nodo `pve` (192.168.1.4) → 401** — El dashboard admin muestra "sin conexión · Request failed with status code 401"; pvececyte funciona bien.
3. **Catálogo de servicios incorrecto** — `openclaw` está configurado como servidor de juego Minecraft; `hermes` como Rocket.Chat. Ambos son servidores de IA y deben desplegarse automáticamente (sin que el admin tenga que conectarse por SSH).
4. **Consola Proxmox en iframe vacía** — El iframe de `/proxmox/pvececyte/` devuelve la página HTML de Proxmox pero el área se ve negra/en blanco.

Criterios de éxito:
- `https://capuvps.duckdns.org/fossbilling/` muestra la UI de FossBilling con estilos correctos
- El nodo `pve` muestra estado real (online/offline con error descriptivo, no 401)
- OpenClaw y Hermes muestran descripciones de IA correctas, setup script ejecuta en la VM automáticamente
- El iframe de la consola muestra la interfaz de login de Proxmox para `pvececyte`
- Los servicios de IA aparecen en la landing page pública

---

## Recon summary

**FossBilling — causa raíz confirmada:**
- Nginx proxea `/fossbilling/` → `127.0.0.1:8080/` (server block dedicado sirviendo `/var/www/fossbilling` con PHP-FPM). El HTTP 200 llega.
- El HTML de FossBilling contiene `<link href="/bb-themes/...">` y `<script src="/js/...">` como rutas absolutas sin el prefijo `/fossbilling/`.
- El navegador solicita `/bb-themes/...` al servidor del panel → nginx sirve `try_files $uri /index.html` → devuelve el SPA de React. El navegador intenta parsear el HTML de React como CSS/JS → falla silenciosamente → layout roto.
- Causa real: `bb_url` en `/var/www/fossbilling/bb-config.php` apunta a `http://localhost` o `http://127.0.0.1` en vez de `https://capuvps.duckdns.org/fossbilling`.

**PVE 401 — causa raíz confirmada:**
- Error HTTP 401 = autenticación fallida (la conexión TCP funciona, el nodo recibe y rechaza el token).
- La autenticación de pvececyte (mismo `tokenId` format en el ejemplo) funciona → el problema es específico del token del nodo `pve`.
- Posibles causas: token eliminado en la UI de Proxmox, token expirado, user `panel@pve` sin acceso al nodo pve.
- Esto es una corrección en servidor: `nodes.json` en `/opt/vps-panel/backend/config/nodes.json`.

**Catálogo de servicios — causa raíz confirmada:**
- `SERVICE_CATALOG` en `panel/backend/src/routes/services.js`:
  - `openclaw`: categoría `gaming`, setupScript despliega Minecraft/mc-router. INCORRECTO.
  - `hermes`: categoría `communication`, setupScript despliega Rocket.Chat + MongoDB. INCORRECTO.
- Ambos deben ser servidores de IA basados en Ollama:
  - OpenClaw → Ollama + Open WebUI (servidor de inferencia de IA, marca OpenClaw)
  - Hermes → Ollama + Open WebUI + modelo `nous-hermes2` (Nous Research Hermes Agent)
- Auto-deploy requiere ejecutar el setup script en la VM via `agentExecWait()` después de que el agente QEMU esté listo. Actualmente el endpoint devuelve el script para ejecución manual.

**Consola Proxmox vacía — causa raíz confirmada:**
- `proxmox-ui.js` inyecta un script JS que intercepta `fetch()` y `XMLHttpRequest.prototype.open` para reescribir rutas absolutas al prefijo del proxy.
- **El script JS se ejecuta DESPUÉS de que el HTML es parseado**. Los `<script src="/pve2/...">` y `<link href="/pve2/...">` estáticos en el HTML de Proxmox son procesados por el navegador ANTES de que el interceptor corra.
- El navegador solicita `/pve2/ext8/ext-all.js` al panel → nginx devuelve `index.html` (SPA fallback) → el navegador intenta ejecutar HTML como JS → SyntaxError → Proxmox JS no carga → iframe vacío.
- Fix: en `responseInterceptor`, adicionalmente reescribir atributos `src=`, `href=`, `action=` absolutos en el HTML antes de enviarlo al navegador.
- También: reescribir el header `Location` en redirects (Proxmox redirige `/` → `/api2/json/...` u otros paths).

---

## Moves

### Move 1: Diagnosticar y fijar FossBilling bb_url

**Action:**
```bash
ssh root@192.168.1.34
# Leer la config actual
grep -n "bb_url\|url\b" /var/www/fossbilling/bb-config.php | head -10
# Identificar el key exacto (puede ser 'bb_url', 'url', 'base_url')
```
Basado en la lectura, ejecutar la corrección (el formato varía según la versión):
```bash
# Si el formato es $config['bb_url'] = '...':
sed -i "s|'bb_url'[[:space:]]*=>[[:space:]]*'[^']*'|'bb_url' => 'https://capuvps.duckdns.org/fossbilling'|" /var/www/fossbilling/bb-config.php
# Verificar:
grep bb_url /var/www/fossbilling/bb-config.php
# Probar que responde correctamente:
curl -sI http://127.0.0.1:8080/ | head -5
curl -s http://127.0.0.1:8080/ | grep -o "href=\"[^\"]*bb-themes[^\"]*\"" | head -3
```
Se espera que los `href` ya incluyan `https://capuvps.duckdns.org/fossbilling/bb-themes/...`.

**Expected observation if it worked:** Los links en el HTML de FossBilling incluyen `https://capuvps.duckdns.org/fossbilling/` como prefijo. El navegador puede cargar los assets a través del proxy.

**Expected observation if it failed:** El grep de bb_url muestra el valor anterior sin cambios, o el sed no encontró el patrón.

**Most likely cause of failure:** El key en la config no se llama `bb_url` sino `url`, `base_url` o está en otro archivo de config. FossBilling v0.5+ usa `bb-config.php` con `return []` array, las versiones anteriores usan variables `$config[...]`.

**Countermove:** Leer el archivo completo (`cat /var/www/fossbilling/bb-config.php | head -40`) para identificar el formato real, luego ajustar el sed. Si no hay un campo de URL, el URL podría configurarse desde la UI admin de FossBilling en Configuración → General.

**Downstream consequences:** Si la corrección no funciona, los assets siguen fallando. El FossBilling puede seguir cargando parcialmente (el HTML responde pero sin estilos). Esto no bloquea los otros movimientos.

---

### Move 2: Investigar y fijar el token de pve (192.168.1.4)

**Action:**
```bash
ssh root@192.168.1.34
# Ver la config actual del nodo pve
cat /opt/vps-panel/backend/config/nodes.json | python3 -c "import json,sys; n=[x for x in json.load(sys.stdin) if x['name']=='pve'][0]; print('tokenId:', n['tokenId']); print('secret len:', len(n.get('tokenSecret','')))"
```
Luego verificar desde el panel mismo que la llamada falla con 401:
```bash
curl -sk "https://192.168.1.4:8006/api2/json/version" \
  -H "Authorization: PVEAPIToken=$(python3 -c "import json; n=[x for x in json.load(open('/opt/vps-panel/backend/config/nodes.json')) if x['name']=='pve'][0]; print(n['tokenId']+'='+n['tokenSecret'])")" \
  | python3 -m json.tool
```

**Expected observation if it worked (diagnosis):** `curl` devuelve `{"data":{"version":"7.x","..."}}`

**Expected observation if it failed (diagnosis):** `curl` devuelve `{"errors":{"permission":"..."},"status":"401 Permission check failed"}` o `"401 Unauthorized"`.

**Most likely cause of failure:** Token eliminado, UUID equivocado, o el user `panel@pve` no tiene permisos en el nodo. El nodo pvececyte funciona (mismo formato de tokenId), así que el formato en sí es correcto.

**Countermove:** Si el curl falla con 401:
1. Desde la UI de Proxmox de `192.168.1.4` (abrir en Chrome en nueva pestaña: `https://192.168.1.4:8006/`), ir a Datacenter → Permissions → API Tokens
2. Verificar que existe el token `panel` para el user `panel@pve`
3. Si no existe: crear el user `panel@pve` y el token `panel`, asignar rol `PVEAdmin` o `PVEAuditor` al path `/`
4. Copiar el UUID del token nuevo
5. Actualizar en el servidor:
```bash
# Editar nodes.json en el servidor:
python3 -c "
import json
with open('/opt/vps-panel/backend/config/nodes.json') as f: nodes = json.load(f)
for n in nodes:
    if n['name'] == 'pve':
        n['tokenSecret'] = 'NUEVO-UUID-AQUI'
with open('/opt/vps-panel/backend/config/nodes.json', 'w') as f: json.dump(nodes, f, indent=2)
print('ok')
"
systemctl restart vps-panel
```

**Downstream consequences:** Si el token no se puede renovar (pve apagado o inaccesible por red), marcar en la UI como `offline` con error descriptivo es el comportamiento correcto — no bloquea el resto del panel. Los cambios de código de los movimientos 3-6 no dependen del token de pve.

---

### Move 3: Corregir catálogo de servicios + auto-deploy (cambio de repo)

**Action:**
En `panel/backend/src/routes/services.js`:
- Reemplazar la entrada `openclaw`: categoría `ai`, descripción de servidor de IA, setupScript con Ollama + Open WebUI
- Reemplazar la entrada `hermes`: categoría `ai`, descripción de Nous Research Hermes Agent, setupScript con Ollama + nous-hermes2
- Cambiar `resources` a 4 vCPU / 8 GB RAM / 60 GB disco para los LLMs
- Modificar `POST /install` para lanzar auto-deploy async (igual que el pipeline de deploys de clientes):
  - Devolver inmediatamente el vmid y status `vm_running`
  - Lanzar en background: esperar IP via agentExecWait → ejecutar setupScript
  - Actualizar `setupStatus` a `running` → `done` o `error`

En `panel/frontend/src/components/Services.tsx`:
- Agregar `ai: 'Inteligencia Artificial'` al `CATEGORY_LABEL`

**Expected observation if it worked:** El catálogo muestra "OpenClaw AI Server" y "Hermes Agent (Nous Research)" con la categoría "Inteligencia Artificial". Al instalar, el backend crea el VM y luego ejecuta el setup en segundo plano. El setupStatus pasa de `running` a `done` (demora 10-20 min por descarga del modelo).

**Expected observation if it failed:** 
- Syntax error en JS → el backend no arranca (`systemctl status vps-panel` muestra error)
- Agente QEMU no disponible en la VM recién creada → timeout en wait_ip
- `agentExecWait` con setupScript de Ollama falla porque el script tarda >10 min y el timeout es muy corto

**Most likely cause of failure:** El `agentExecWait` para el pull del modelo Ollama (5-15 GB) puede exceder cualquier timeout razonable. El pull debe lanzarse en background dentro de la VM (`nohup ollama pull ... &`) en vez de esperar a que termine.

**Countermove:** Separar el setupScript en dos partes:
1. Instalar docker + arrancar contenedores (5-10 min, esperable via agentExec)
2. Pull del modelo se hace dentro del contenedor de Ollama en background (el contenedor arranca y descarga solo)

Verificar que `setupStatus` llega a `done` después de que docker-compose esté up, no después de que el modelo esté descargado (el modelo tarda demasiado).

**Downstream consequences:** Si el auto-deploy falla, la instancia queda en `setupStatus: 'error'`. El VM sigue aprovisionado. El admin puede descargar el setup script y ejecutarlo manualmente (comportamiento anterior). No hay pérdida de funcionalidad respecto al estado actual.

---

### Move 4: Corregir consola Proxmox — reescribir HTML estático (cambio de repo)

**Action:**
En `panel/backend/src/routes/proxmox-ui.js`, en la función `createNodeProxy(node)`, dentro de `responseInterceptor`:

1. Reescribir el header `Location` en redirects (antes de procesar el body):
```javascript
// Reescribir Location header si Proxmox redirige a ruta absoluta
if (proxyRes.headers['location']) {
  const loc = proxyRes.headers['location'];
  if (loc.startsWith('/') && !loc.startsWith(mountPath)) {
    proxyRes.headers['location'] = mountPath + loc;
    res.setHeader('location', mountPath + loc);
  }
}
```

2. En el bloque `if (ct.includes('text/html'))`, después de inyectar el script y ANTES de `return Buffer.from(html)`:
```javascript
// Reescribir src/href/action absolutos para que pasen por el proxy
html = html.replace(
  /((?:src|href|action|data-src)=["'])(\/[^"'\/][^"']*)(["'])/g,
  (match, attr, path, quote) => {
    if (path.startsWith(mountPath)) return match; // ya tiene el prefijo
    return `${attr}${mountPath}${path}${quote}`;
  }
);
```

**Expected observation if it worked:** El iframe del nodo pvececyte muestra la página de login de Proxmox con estilos cargando. El log del backend no muestra errores del proxy. Los recursos `/pve2/...` ahora se sirven correctamente a través de `/proxmox/pvececyte/pve2/...`.

**Expected observation if it failed:** El iframe sigue vacío, o muestra una página de error, o muestra el HTML de Proxmox sin estilos (CSS cargado pero JS fallando).

**Most likely cause of failure:**
- La regex no captura todos los patrones de URL (Proxmox puede usar comillas simples o patrones no estándar)
- Proxmox genera rutas en variables JS inline (`var Ext={...url:"/pve2/..."}`) que no son atributos HTML — el interceptor fetch/XHR del script inyectado debe manejar esos en runtime
- El `selfHandleResponse: true` de http-proxy-middleware puede tener incompatibilidad con la versión instalada

**Countermove:** Si la regex no captura suficiente, hacer el replace más agresivo:
```javascript
// Más agresivo: también reescribir urls en strings JS
html = html.replace(/(['"])(\/(pve2|novnc|pve-manager|xtermjs|static)\/)/g,
  `$1${mountPath}/$3/`);
```
Si el problema persiste, el fallback ya existe: botón "↗ Pestaña nueva" que abre Proxmox directamente en `https://192.168.1.254:8006/`.

**Downstream consequences:** Si el iframe sigue sin funcionar, el admin puede usar el botón de pestaña directa. No es un bloqueador crítico ya que la funcionalidad existe de otra forma.

---

### Move 5: Agregar servicios de IA a la landing page (cambio de repo)

**Action:**
En `panel/frontend/src/components/Landing.tsx`, agregar una sección `id="servicios-ia"` entre "Stats" y "Planes":
- Título: "Servidores de IA dedicados"
- Dos cards: OpenClaw AI Server y Hermes Agent by Nous Research
- Descripción de recursos y características
- Botón "Solicitar servicio" → FossBilling signup

También agregar `id="servicios-ia"` al enlace de navegación en el navbar.

**Expected observation if it worked:** La landing page muestra una sección de IA con cards de OpenClaw y Hermes antes de la sección de planes.

**Expected observation if it failed:** Error de TypeScript en compilación → el frontend no builda. O el layout se rompe en mobile.

**Most likely cause of failure:** Error de sintaxis JSX o props incorrectos. Fácil de detectar con `npm run build` local.

**Countermove:** Verificar el build localmente antes de hacer scp. Si falla, corregir el JSX.

**Downstream consequences:** La landing page se ve bien sin esta sección (estado actual). Es un añadido, no un fix de regresión.

---

### Move 6: Deploy, restart y verificación

**Action:**
```powershell
cd C:\vpsserver
npm run build --prefix panel/frontend  # verificar build local antes de scp
```
Si el build pasa:
```powershell
scp -r panel\frontend\dist root@192.168.1.34:/opt/vps-panel/frontend/
scp panel\backend\src\routes\services.js root@192.168.1.34:/opt/vps-panel/backend/src/routes/
scp panel\backend\src\routes\proxmox-ui.js root@192.168.1.34:/opt/vps-panel/backend/src/routes/
ssh root@192.168.1.34 "systemctl restart vps-panel && sleep 3 && systemctl is-active vps-panel"
```
Verificar:
```bash
# En el servidor
curl -sI https://capuvps.duckdns.org/fossbilling/ | grep -E "HTTP|Location"
curl -s https://capuvps.duckdns.org/api/services/catalog | python3 -m json.tool | grep '"name"\|"category"'
```

**Expected observation if it worked:** `vps-panel` is `active`. El catálogo devuelve OpenClaw y Hermes con `category: "ai"`. El iframe de consola carga HTML real de Proxmox.

**Expected observation if it failed:** 
- `systemctl is-active vps-panel` → `failed` (syntax error en JS nuevo)
- `journalctl -u vps-panel -n 20` muestra el error exacto

**Most likely cause of failure:** ESM import error o syntax error en el JS modificado.

**Countermove:**
```bash
ssh root@192.168.1.34 "journalctl -u vps-panel -n 30 --no-pager"
# Si hay error de syntax: revertir el archivo afectado y reinvestigar
```

---

## Unresolved assumptions

1. **Format exacto de bb-config.php en producción**: El archivo en el servidor puede tener el campo URL con un nombre diferente (`url`, `bb_url`, `base_url`). El Move 1 incluye un paso de lectura previa para resolverlo.

2. **Token de pve en producción**: No podemos saber el tokenSecret real. Si el token fue eliminado en Proxmox, se requiere acceso a `https://192.168.1.4:8006/` para crear uno nuevo (el user debe hacer eso desde Chrome o la red interna).

3. **OpenClaw AI — imagen Docker exacta**: "OpenClaw AI" no corresponde a un proyecto open-source conocido. Se implementa como Ollama + Open WebUI con posibilidad de cargar cualquier modelo. Si el usuario tiene una imagen Docker específica de OpenClaw, el setupScript deberá actualizarse.

4. **Tamaño del modelo nous-hermes2**: El modelo `nous-hermes2` en Ollama es ~4-7 GB. El pull puede tardar 15-30 min dependiendo del ancho de banda de la VM. El auto-deploy marca `done` cuando `docker compose up -d` corre exitosamente; el pull del modelo continúa en background dentro del contenedor.

5. **Conectividad panel → VM**: El agente QEMU funciona para los deploys de clientes (confirmado en historia). Asumir que también funciona para las VMs de servicios en pvececyte.

---

## Abort conditions

- **ABORT Move 1** si el servidor `/var/www/fossbilling/bb-config.php` no existe (FossBilling instalado en otra ruta — buscar con `find / -name "bb-config.php" 2>/dev/null`).
- **ABORT Move 2** si `192.168.1.4:8006` no es accesible (nodo pve apagado o sin ruta de red desde el panel). Dejar el nodo como `offline` y continuar. NO reiniciar pvececyte.
- **ABORT Move 6** si `systemctl is-active vps-panel` devuelve `failed` y no se puede identificar el error en 5 minutos — revertir los archivos modificados con git y reinvestigar.
- **NO tocar** `capuvps (192.168.1.33)` (producción), pfSense, ni pvececyte (reiniciar).
