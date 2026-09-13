# Cambios realizados y causas

Sesión de diagnóstico del incidente: **`/territories` vacío solo en el iPad**.

---

## 1. Problema reportado

- Página `https://congregaciontj.duckdns.org/territories` se ve **vacía** (sin la lista de territorios) **únicamente en el iPad** del usuario.
- En la MacBook (Safari de escritorio) y en Windows (Edge) se ve correctamente.
- Otros módulos de la app sí funcionan en ese mismo iPad.
- Borrar la caché del iPad no resolvió el problema.

---

## 2. Causa raíz encontrada

### 2.1 No era caché — era un bug de layout responsive

Se descartó el diagnóstico inicial de "caché heurística de Safari": el servidor real es un **contenedor Docker `app-web-1`** (nginx:alpine) cuyo config fuente es `/opt/app/nginx-proxy.conf`. El nginx del host NO sirve el puerto 80.

Se modificó `/opt/app/nginx-proxy.conf` y se reinició el contenedor:
- `location /` → `proxy_hide_header Cache-Control` + `add_header Cache-Control "private, no-cache, no-store, must-revalidate" always` (HTML/SSR nunca en caché).
- `location /_next/static/` → passthrough (los chunks JS/CSS siguen `public, max-age=31536000, immutable`).

Verificado vía público (`207.248.113.8`): la página ya no manda `s-maxage`. **Aun así, el iPad seguía vacío** → el problema no era la caché.

### 2.2 Reproducción con el motor real de Safari

Se instaló Playwright + WebKit real en el servidor (`/tmp/wktest`, versión webkit-2123). Reproduciendo el iPad con WebKit se observó:

- Todas las APIs responden 200 (`/api/me`, `/api/territories`, `/api/users`, `/api/congregation/boundary`, `/api/my-assignments`) — **sin errores JS**.
- Los nombres de los 3 territorios (36. Oxo serrato, 37. manzanilla, 38. MANZANILLAL) existen en el DOM.
- PERO el `innerText` no los muestra: la lista está **recortada a altura 0**.

### 2.3 El bug exacto: colapso del panel en `flex-col`

Al inspeccionar el DOM/computed styles se encontró que **Chromium y WebKit colapsan de forma idéntica** (es un bug de la app, no de Safari):

- La página territories usa: `<div class="flex h-screen ... flex-col">` con el `IconSidebar` como **hijo en flujo** (`md:static`, sidebar vertical de escritorio que no se muestra como barra inferior).
- En ≥768px (`md:`), `IconSidebar` pasa a `md:static md:h-auto md:flex-col` → se convierte en un **ítem flex de altura natural 1388px** (11 botones verticales) con `flex-shrink:0`.
- Contenedor `h-screen` = 1024px. El sidebar (1388px, no puede encoger) consume todo el espacio → el panel lista (`flex-1 min-h-0 flex-grow:1 basis:0`) recibe **espacio negativo → altura 0px** → la lista se oculta.

En desktop (≥1280px) `useDevice()` devuelve `'desktop'` → `splitView = true` → el layout es `flex-row` con columna fija `w-80` → funciona. En iPad portrait (~768-834px de CSS) `device = 'tablet'` → `splitView = false` → `flex-col` → se rompe. Eso explica por qué **solo** falla en el iPad.

Fuentes: `/opt/msp/src/app/territories/page.tsx` (líneas 589-594, 820-831) y `/opt/msp/src/components/IconSidebar.tsx` (líneas 82-86).

### 2.4 Arreglo validado

Inyectando en la página el CSS:
```css
@media (min-width:768px) and (max-width:1023.98px) {
  body > main > div.flex.flex-col { flex-direction: row !important; }
  body > main > div.flex.flex-col > div.bg-sky-500 { width: 52px !important; height:auto !important; flex:none !important; }
  body > main > div.flex.flex-col > div.flex-shrink-0 { flex: 1 1 0 !important; min-width:0 !important; }
}
```
Resultado validado con WebKit en anchos 768/834/1023 → el panel pasa de `panelH:0` a `panelH:1024` (lista visible). En ≥1280 desktop ya funcionaba por `splitView`.

---

## 3. Corregido/descubierto durante la sesión (antes de esta causa)

- `libasound2t64` instalado → Chrome headless (puppeteer `151.0.7922.34`) funciona en el servidor.
- Playwright + WebKit instalado en `/tmp/wktest` (deps visuales apt: libegl1, libgles2, x264, gstreamer, etc.).
- El login real por API (`POST /api/auth/login` con `identifier`+`password`) funciona; usa **bcryptjs** (no bcrypt nativo). Solo existe el usuario `oreyes100@gmail.com` (Jorge Reyes, superadmin, congregación "La Estación" con los 3 territorios). La cuenta "oreyes101" **no existe** en SQLite ni Supabase.
- Se confirmó nginx real = contenedor `app-web-1`, no el host.
- No hay service worker. No hay CDN/proxy intermedio (respuesta única nginx/1.24.0 Ubuntu).

---

## 4. Estado actual y siguiente paso

- **Diagnóstico cerrado**: bug responsive en `territories/page.tsx` + `IconSidebar` (colapso del panel `flex-1` a 0px cuando el sidebar estático de 1388px entra en un contenedor `flex-col h-screen` de 1024px).
- **Fix validado** por CSS inyectado en WebKit (lista visible en 768-1023px).
- Archivos relevantes:
  - `/opt/app/nginx-proxy.conf` (fix de cabeceras caché; ya activo)
  - `/opt/msp/src/app/territories/page.tsx`
  - `/opt/msp/src/components/IconSidebar.tsx`
  - Probes: `/tmp/pw_websky*.js`, `/tmp/pw_cmp.js`, `/tmp/pw_rwd.js` (WebKit), logs de layout en `/tmp/kids.json`.
- **Pendiente de decisión**: aplicar el fix (editar `page.tsx`/`IconSidebar.tsx` y rebuild no es viable porque `react-dom` está truncado y el source de algunos módulos incompleto → se propone parche CSS en el contenedor nginx/Next, o editar el chunk compilado) y probar en el iPad real.