# War-game: Corregir errores de deploy del portal + landing estilo Hostinger real
> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.

## Mission objective
Dejar el pipeline de deploy del portal funcionando de punta a punta (fuente GitHub y dominio DuckDNS propio incluidos) de modo que un reintento del proyecto `micongre` del cliente `oreyes100@gmail.com` llegue a estado `activo`, y reemplazar la landing oscura de `capuvps.duckdns.org` por una landing tema claro estilo Hostinger (morado #673de6, ofertas con precio tachado, badges de descuento) cuyos CTAs dirigen a `/fossbilling/` (crear cuenta) y al login del panel (administrar cuenta).

## Recon summary
- Edge server: `192.168.1.34` (ssh root con llave `~/.ssh/id_ed25519`). Backend en `/opt/vps-panel/backend` (systemd `vps-panel.service`), frontend estático en `/opt/vps-panel/frontend/dist/` (¡NO `/var/www/vps-panel` — ese directorio existe pero nginx no lo sirve!). Repo local: `C:\vpsserver`.
- Nodo de deploys: `pvececyte` (192.168.1.254), token `panel@pve!panel=7433f722-7600-4170-a904-fceb90b98c54`, template 9000, rango VMID 300-399.
- **Causa raíz #1 (bloquea reintentos)**: VMs huérfanas en pvececyte — VMID **301** (`micongre`, stopped) y **350** (`test-sin-storage`, stopped) quedaron de pruebas manuales; los `qmdestroy` anteriores fallaron porque se enviaron sin esperar el stop/lock. La VM 301 provoca `Ya existe un VPS llamado "micongre"` en cada retry.
- **Causa raíz #2 (rompe TODO deploy de portal)**: `deploy.js` pasa `tags: ['client:<uuid>']` a `provisionVm`; Proxmox rechaza `:` en tags → el `PUT /config` tras el clon devuelve HTTP 400 (`invalid format - tag`). Esto explica el error 400 original tras ~6 min de clon. Los deploys de admin (sin clientId) no llevan tags y por eso no fallaban.
- El repo del cliente `https://github.com/oreyes100/meeting-scheduler-pro` existe (HTTP 200 en github.com y api.github.com).
- El deploy DuckDNS del cliente usa `name=micongre`, token propio `d7a2720f-...`; pasos extra `dns` y `tls` ya implementados en `deploy.js` (acme.sh dns_duckdns en el edge).
- VM 300 `misfinanzas` (running) es legítima del panel — NO tocarla. pfsense (100) NUNCA se toca.
- Landing actual (`panel/frontend/src/components/Landing.tsx`): tema oscuro slate/indigo — el usuario la rechazó; quiere estética Hostinger: fondo blanco, morado #673de6, headings casi negros (#1d1e20 / #2f1c6a), badges de oferta, precios tachados con % de descuento, garantía, CTAs "Empieza ahora".

## Moves

### Move 1: Eliminar VMs huérfanas 301 y 350 en pvececyte
- **Action:** Por API: `POST .../qemu/<id>/status/stop`, poll `status/current` hasta `status=stopped` (máx 60 s), luego `DELETE .../qemu/<id>?purge=1` y poll de la tarea UPID hasta `stopped/OK`. Verificar con listado final que 301 y 350 ya no aparecen. NO tocar 100, 300, 9000.
- **Expected observation if it worked:** El listado `GET /nodes/pvececyte/qemu` ya no muestra 301 ni 350.
- **Expected observation if it failed:** DELETE devuelve `VM is locked` o la tarea termina con `exitstatus != OK`.
- **Most likely cause of failure:** Lock residual de clon o disco en uso.
- **Countermove:** `POST /nodes/pvececyte/qemu/<id>/config` no aplica; usar `qm unlock <id>` vía SSH al nodo (`ssh -i /home/admin/.ssh/panel_nodes root@192.168.1.254 "qm unlock 301"`) y repetir el destroy.
- **Downstream consequences:** Sin esto, el Move 6 (retry) vuelve a fallar con "Ya existe".

### Move 2: Corregir el bug de tags (`:` inválido en Proxmox)
- **Action:** En `panel/backend/src/services/deploy.js`, cambiar `` [`client:${dep.clientId}`] `` por `` [`client-${dep.clientId}`] ``.
- **Expected observation if it worked:** grep de `client:` en deploy.js no devuelve nada; el PUT config tras clon ya no devolverá 400.
- **Expected observation if it failed:** Un deploy nuevo vuelve a morir en paso `provision` con mensaje que contenga `tag` o `invalid format`.
- **Most likely cause of failure:** Otro sitio del código genera tags con `:` (buscar `tags` en todo el backend).
- **Countermove:** Sanitizar en `provisionVm`: `tags.map(t => t.replace(/[^a-z0-9_.-]/gi, '-'))`.
- **Downstream consequences:** Ninguna; los deploys previos no tienen tags.

### Move 3: Endurecer la limpieza de VMs (evitar nuevos huérfanos)
- **Action:** En `provision.js` (cleanup del catch) y en `deploy.js` (`retryDeploy`, `deleteDeploy`): tras el `stop`, hacer poll de `status/current` hasta `stopped` (máx 60 s) antes del destroy, y `waitTask` del destroy. Además, en `provisionVm`, si hay colisión de nombre: si la VM existente está `stopped` **y** su `description` contiene `Creado por el panel`, destruirla (con esperas) y continuar; si está running o sin esa descripción, lanzar el 409 actual.
- **Expected observation if it worked:** Reintento con VM huérfana homónima la elimina sola y continúa el clon.
- **Expected observation if it failed:** Retry sigue devolviendo 409 "Ya existe".
- **Most likely cause of failure:** La descripción de la huérfana está vacía (clon a medio configurar nunca recibió description).
- **Countermove:** Ampliar el criterio: nombre igual + stopped + VMID dentro del rango del panel (300-399) + sin deploy activo en `deploys.json` con ese vmid → destruir.
- **Downstream consequences:** Con criterio amplio hay riesgo teórico sobre VMs stopped legítimas del panel homónimas; aceptado porque el nombre colisionante es exactamente el que el cliente quiere desplegar.

### Move 4: Reescribir la landing en estilo Hostinger (tema claro)
- **Action:** Reemplazar `Landing.tsx`: fondo blanco; navbar clara con logo morado, links, botón "Iniciar sesión" (outline) y "Empieza ahora" (morado #673de6); barra superior de oferta ("Hasta -75% · termina pronto"); hero con heading negro grande, subtítulo gris, CTA morado y garantía "30 días de reembolso"; strip de stats; pricing con 3 tarjetas tema claro, precio tachado + precio de oferta + badge "-XX%", tarjeta central resaltada borde morado "MÁS POPULAR"; features con checkmarks morados; pasos 1-2-3; banda de garantía; CTA final; footer claro. Todos los CTAs de compra → `/fossbilling/`; "Iniciar sesión"/administrar → `onLogin()`.
- **Expected observation if it worked:** `npm run build` compila; la página en `https://capuvps.duckdns.org/` se ve con fondo blanco y morado Hostinger.
- **Expected observation if it failed:** Error de compilación TS, o la página sigue oscura (caché).
- **Most likely cause of failure:** Clases Tailwind con colores arbitrarios mal escritas (`bg-[#673de6]` requiere corchetes exactos).
- **Countermove:** Usar la paleta violet/purple de Tailwind (`violet-600 ≈ #7c3aed`) donde el arbitrario falle; hard-refresh (el hash del bundle cambia solo).
- **Downstream consequences:** `Login.tsx` conserva tema oscuro — aceptable (es el panel, no la landing).

### Move 5: Build + deploy + restart
- **Action:** `npm run build` en `panel/frontend`; `scp dist/. → /opt/vps-panel/frontend/dist/`; scp de los .js de backend modificados a `/opt/vps-panel/backend/src/...`; `systemctl restart vps-panel.service`; verificar `active (running)`, `curl -sk https://capuvps.duckdns.org/` → 200 **y que el nombre del bundle servido coincida con el recién compilado** (`grep assets/index- index.html` local vs `curl` remoto).
- **Expected observation if it worked:** Servicio activo, HTTP 200, sin errores en `journalctl -n 20`.
- **Expected observation if it failed:** Servicio en `failed` (error de sintaxis en JS copiado) o 502 en nginx.
- **Most likely cause of failure:** Import/función faltante en un archivo copiado parcialmente.
- **Countermove:** `journalctl -u vps-panel -n 30` muestra el stack; recopiar el archivo completo indicado.
- **Downstream consequences:** Si el backend no arranca, el retry del Move 6 devolverá error de conexión (502 desde nginx).

### Move 6: Reintentar el deploy fallido del cliente y monitorear
- **Action:** Con el deploy `3f557a0d-3220-48ff-8ba5-562051bdf47e` (git + duckdns, cliente oreyes100): llamar internamente `retryDeploy` (o vía endpoint con JWT del cliente; más simple: script node en el server que importe el servicio). Monitorear `data/deploys.json` cada ~30 s: `provision → wait_ip → prepare → fetch → stack → build → run → ufw → nat → vhost → dns → tls → verify`.
- **Expected observation if it worked:** `status: done`, todos los pasos `ok`, y `https://micongre.duckdns.org/` responde (puede tardar: clon ~6 min, boot ~4 min, build variable).
- **Expected observation if it failed:** Un paso en `error` con detail concreto.
- **Most likely cause of failure:** (a) `fetch`: repo requiere auth o rama distinta → detail con `git clone falló`; (b) `stack`: el repo no tiene Dockerfile/package.json/index.html reconocible; (c) `dns`: token DuckDNS del cliente no controla `micongre` → respuesta `KO`; (d) `tls`: DuckDNS solo permite un TXT — si el token es válido funciona, si no acme.sh reporta `Incorrect TXT record`.
- **Countermove:** (a/b) revisar el repo y reportar al usuario qué le falta al proyecto; (c/d) es dato del cliente — reportar que el token no controla ese subdominio; el pipeline queda validado hasta `vhost` de todos modos.
- **Downstream consequences:** Si falla en dns/tls por token del cliente, el fix de infraestructura sigue siendo exitoso; documentarlo en el reporte.

### Move 7: Commit
- **Action:** `git add` de backend, frontend y este brief; commit descriptivo.
- **Expected observation if it worked:** `git log -1` muestra el commit con los archivos.
- **Expected observation if it failed:** Hook o pathspec falla.
- **Countermove:** Revisar `git status`, corregir rutas (repo raíz `C:\vpsserver`).

## Unresolved assumptions
- El token DuckDNS `d7a2720f-...` del cliente realmente controla el subdominio `micongre.duckdns.org` — solo el cliente puede confirmarlo; si no, los pasos dns/tls fallarán con `KO`/`Incorrect TXT record` y hay que pedirle el token correcto.
- El repo `meeting-scheduler-pro` contiene algo desplegable (package.json/Dockerfile/index.html). Si no, el paso `stack` fallará con "No se reconoció el tipo de proyecto".
- Precios/ofertas de la landing (los % de descuento son de maqueta; el usuario no dio precios finales).

## Abort conditions
- Cualquier operación que requiera tocar `capuvps 192.168.1.33` (producción), pfsense o reiniciar `pvececyte` → detenerse y reportar.
- El destroy de la VM huérfana afectaría a una VM `running` o fuera del rango 300-399 → no destruir, reportar.
- Tras 2 intentos, el backend no arranca (`systemctl status failed`) → restaurar los .js desde git (`git show HEAD:<ruta>`) y reportar.
