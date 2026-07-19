# War-game: Portal de cliente con auto-deploy (tipo Vercel + Supabase)
> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.
> **PRERREQUISITO OBLIGATORIO:** este brief construye SOBRE `wargames/deploy-estandarizado-webapps.md`. Sus Moves 1-8 (helper agentExec, pipeline deploy.js, panel-vhost, systemd) deben estar ejecutados y su prueba E2E (Move 9) en verde ANTES de empezar aquí. Si no lo están, ejecutar ese brief primero.

## Mission objective

Añadir al panel un **portal de cliente autoservicio**: un cliente se registra (con código de invitación), llena un formulario de requisitos (qué tipo de página/app quiere, si necesita base de datos, nombre de su proyecto) y el backend ejecuta todo el aprovisionamiento invisiblemente — crea el VPS, genera o despliega el código, levanta la base de datos con credenciales, publica en `https://<proyecto>.<dominio-plataforma>.duckdns.org/` — sin que el cliente vea nunca nodos, VMIDs, IPs internas ni el panel de administración. Éxito medible: un cliente de prueba registrado desde WAN crea un proyecto "sin código" (plantilla) con PostgreSQL y obtiene URL HTTPS funcionando + credenciales de su DB visibles en su dashboard, todo en <10 min y sin intervención del operador; el admin sigue viendo todo en su vista actual; `capuvps.duckdns.org` y `pachucacv.duckdns.org` siguen en 200.

## Recon summary

**Estado del panel (verificado 2026-07-19):**
- Backend Express en el edge 192.168.1.34 (`/opt/vps-panel/backend/`), usuario `admin`, puerto 127.0.0.1:3001. Fuente TAMBIÉN en el repo local `C:\vpsserver\panel\backend\` — los cambios se editan local, se suben por scp y se reinicia el servicio (tras el brief prerrequisito existe `systemctl restart vps-panel`).
- Auth actual: UNA contraseña (`config.panelPassword`) → JWT `{sub:'panel-user'}` sin roles. `express-rate-limit` y `jsonwebtoken` ya son dependencias; **bcrypt NO está instalado** (hará falta para passwords de clientes).
- Persistencia: archivos JSON en `config.dataDir` (`data/`): `service-installs.json`, `history.json`, credenciales. Mismo patrón para clientes/proyectos.
- Frontend React+Vite en `C:\vpsserver\panel\frontend\` (local), deploy = `npm run build` + scp de `dist/` a `/opt/vps-panel/frontend/dist`. Navegación por estado en `App.tsx` (`useState<Page>`), sin react-router. Componentes por página en `src/components/` (Login.tsx, ProvisioningForm.tsx, Services.tsx…). `src/api/client.ts` maneja el token.
- FossBilling está instalado y configurado en `/var/www/fossbilling/` (ruta `/fossbilling/` del nginx) — NO integrarlo en v1 (proyecto aparte; ver assumptions).

**Capacidad real (medida 2026-07-19) — LA restricción dura:**
- pve (192.168.1.4): ~12 GB RAM disponibles, 396 GB storage libre.
- pvececyte (192.168.1.254): ~5 GB RAM disponibles, 245 GB libre. (Corre pfSense: no saturarlo.)
- `checkCapacity()` ya exige 2 GB de headroom. Con planes de 1-2 GB caben ~6-8 proyectos en total HOY. El portal DEBE tener cupo por cliente y mensaje de "sin capacidad".

**El truco que simplifica DNS/TLS para el portal (validado en el deploy de pachuca):**
- DuckDNS resuelve wildcards: `cualquiercosa.<dominio>.duckdns.org` responde con la misma IP que `<dominio>.duckdns.org`, sin configurar nada.
- acme.sh con `dns_duckdns` puede emitir un cert **wildcard** `*.<dominio>.duckdns.org` (el TXT del challenge se pone a nivel de cuenta; ya comprobado que el plugin escribe/borra TXT bien).
- Consecuencia: registrando UN dominio de plataforma (p. ej. `<apps>.duckdns.org`, el 3.º de los 5 del límite DuckDNS) + UN cert wildcard en el edge, cada proyecto de cliente obtiene `https://<proyecto>.<apps>.duckdns.org/` con **cero trabajo de DNS y cero certs por proyecto** — solo un vhost nginx que usa el cert compartido. Los pasos `dns` y `tls` del pipeline desaparecen para proyectos del portal.

**Del pipeline prerrequisito se reutiliza tal cual:** provisionVm, agentExecWait, detect_stack/build/run/UFW en guest, DNAT `8000+VMID` en nodo, y `panel-vhost` (extendido con modo wildcard, Move 1).

**Puntos de fricción conocidos (lecciones previas, no repetir):**
- El guest solo alcanza al panel vía `https://capuvps.duckdns.org/` (NAT reflection), nunca por 192.168.1.34 — las descargas de zips/plantillas al guest van por URL firmada pública.
- dnsmasq muere con dhcp-host duplicado; iptables se persisten con `iptables-save > /etc/iptables/rules.v4`; UFW del guest bloquea todo salvo SSH por defecto.
- El backend es UN proceso node: cualquier promesa sin catch en pipelines async tumba el panel entero.

## Moves

### Move 1: Dominio de plataforma + cert wildcard + modo wildcard en panel-vhost
- **Action:**
  1. El operador registra en duckdns.org un dominio para apps de clientes (nombre lo decide el dueño — ver assumptions; ejemplo aquí: `pachucaapps`), apuntando a `207.248.113.8`.
  2. En el edge (root): `DuckDNS_Token=<token-plataforma> /root/.acme.sh/acme.sh --issue --dns dns_duckdns -d pachucaapps.duckdns.org -d '*.pachucaapps.duckdns.org'` y luego `--install-cert` a `/etc/nginx/ssl/wildcard-apps/` con `--reloadcmd "systemctl reload nginx"`.
  3. Extender `/usr/local/sbin/panel-vhost` con `add-app <proyecto> <nodoIP> <puerto>`: igual que `add` pero `server_name <proyecto>.pachucaapps.duckdns.org;` y rutas de cert fijas a `/etc/nginx/ssl/wildcard-apps/`. Mantener la lista negra (capuvps, pachucacv) y añadir validación `^[a-z0-9-]{3,30}$` al nombre de proyecto.
  4. Probar: `panel-vhost add-app prueba1 192.168.1.254 8443` (apunta temporalmente a la landing existente), `curl -s https://prueba1.pachucaapps.duckdns.org/ -o /dev/null -w '%{http_code} %{ssl_verify_result}'` → `200 0`, luego `panel-vhost remove prueba1.pachucaapps.duckdns.org`.
- **Expected observation if it worked:** el curl externo da `200 0` (TLS wildcard válido) sin haber tocado DuckDNS para `prueba1`.
- **Expected observation if it failed:** `SSL: no alternative certificate subject name matches` (el wildcard no se emitió o el vhost apunta al cert equivocado) o NXDOMAIN (el dominio de plataforma no se registró).
- **Most likely cause of failure:** intentar el wildcard con HTTP-01 (imposible — wildcard exige DNS-01) o cuenta DuckDNS ya en su límite de 5 dominios.
- **Countermove:** verificar `acme.sh --list` muestra el cert con ambos SANs; si el límite de 5 bloquea, borrar dominios sin uso en duckdns.org (decisión del dueño) o usar una segunda cuenta DuckDNS exclusiva de la plataforma.
- **Downstream consequences:** TODOS los proyectos del portal dependen de este cert; su renovación ya queda automática (cron acme.sh + reloadcmd). Sin este move, cada proyecto pagaría 90-150 s de DNS-01 y un slot del límite DuckDNS — no escala.

### Move 2: Cuentas de cliente y roles en el backend
- **Action:** En el repo local `C:\vpsserver\panel\backend\`:
  1. `npm install bcryptjs` (puro JS, sin compilación nativa — evita problemas de node-gyp en el edge).
  2. Nuevo `src/services/clients.js`: store en `data/clients.json` (`{id, email, passwordHash, name, quota: 1, createdAt}`) y `data/invites.json` (`{code, createdAt, usedBy|null}`). Funciones: `createInvite()`, `registerClient(email, password, code)` (valida código no usado, email único, password ≥8), `verifyClient(email, password)`.
  3. JWT con roles: al firmar, payload `{sub, role: 'admin'|'client', clientId?}`. El login admin actual (`POST /api/auth/login`) firma `role:'admin'`. Nuevo `POST /api/portal/login` y `POST /api/portal/register` firman `role:'client'` (con rate-limit igual al loginLimiter existente).
  4. Middlewares en `src/routes/auth.js`: `adminOnly` (role admin) y `clientOnly` (role client, inyecta `req.clientId`). **Aplicar `adminOnly` a TODAS las rutas existentes** (vms, nodes, services, credentials, history, proxmox-ui) — hoy cualquier JWT ve todo; tras este move un token de cliente NO puede llamar rutas admin (verificarlo con curl: token cliente contra `/api/vms` → 403).
  5. Ruta admin `POST /api/invites` → genera código (visible en el panel admin, Move 6).
- **Expected observation if it worked:** registro + login de un cliente de prueba por curl devuelve JWT; ese JWT contra `/api/vms` → 403; contra `/api/portal/*` → 200. El login admin sigue funcionando igual.
- **Expected observation if it failed:** 401 en rutas admin con token admin (rompiste el middleware al encadenar) o registro acepta códigos ya usados.
- **Most likely cause of failure:** olvidar montar `adminOnly` en alguna ruta (queda expuesta a clientes) — auditar `server.js` ruta por ruta.
- **Countermove:** test rápido scripted: con token cliente, curl a las 7 familias de rutas admin esperando 403 en todas; cualquier 200 delata la ruta sin proteger.
- **Downstream consequences:** el aislamiento cliente/admin de aquí en adelante descansa SOLO en estos middlewares; si el Move falla, el portal expondría credenciales de todos los VPS (abort si no se logra el 403 completo).

### Move 3: API de proyectos del portal (la fachada sanitizada)
- **Action:** Nuevo `src/routes/portal.js` montado en `/api/portal` (tras `clientOnly` salvo register/login):
  - `POST /projects` body: `{ nombre (regex ^[a-z0-9-]{3,30}$), tipo: 'plantilla'|'git'|'zip', gitUrl?, uploadId?, db: 'ninguna'|'postgres'|'mongo'|'mysql', plan: 'basico'|'estandar' }`. Valida cupo (`quota` vs proyectos activos del cliente), valida nombre único global (es el subdominio), traduce plan→recursos (`basico: 1 core/1024 MB/20 GB`, `estandar: 2/2048/25`) y lanza el pipeline del brief prerrequisito con dos cambios: (a) VM con tag `client:<clientId>`; (b) pasos `dns` y `tls` se saltan (wildcard, Move 1) y `edge_vhost` usa `panel-vhost add-app`.
  - `GET /projects` → solo los del `req.clientId`, con campos SANITIZADOS: `{id, nombre, url, estado, pasos: [{etiqueta, status}], db: {tipo, host:'interno', usuario, password, puerto} | null, plan, creadoEl}`. **Nunca** exponer: node, vmid, IPs internas, puertos DNAT, credenciales del VPS (devops), logs crudos. Las etiquetas de pasos en español de cliente: `provision→"Creando tu servidor"`, `build→"Construyendo tu aplicación"`, `run→"Arrancando"`, `nat_node/edge_vhost→"Publicando"`, `verify→"Verificación final"`.
  - `POST /projects/:id/redeploy` (re-fetch source + build + run; mismo VM), `DELETE /projects/:id` (destruye VM + regla DNAT + vhost; libera cupo).
  - Mapeo cliente→proyecto en `data/projects.json` (`{id, clientId, nombre, deployId, node, vmid, dbInfo}`) — este archivo es interno; la sanitización ocurre al responder.
- **Expected observation if it worked:** con token de cliente A: crear proyecto → 201; listar → aparece con pasos avanzando; con token de cliente B: `GET /projects` NO muestra el proyecto de A; `GET /projects/<idDeA>` → 404.
- **Expected observation if it failed:** respuesta del portal contiene `vmid`/`192.168.` (fuga de datos internos — grep la respuesta JSON) o un cliente ve proyectos ajenos.
- **Most likely cause of failure:** pasar el objeto de deploy interno directo a `res.json` sin proyección de campos.
- **Countermove:** función única `toPortalView(project)` como ÚNICO punto de salida; test: `JSON.stringify(respuesta)` no debe matchear `/vmid|192\.168\.|node"|panel/`.
- **Downstream consequences:** el frontend del portal (Move 7) consume exactamente este contrato; congelarlo antes.

### Move 4: Base de datos automática (el "Supabase" del combo)
- **Action:** Extender la generación de compose del pipeline: si `db ≠ 'ninguna'`, el compose del guest incluye el servicio de DB con credenciales generadas (`generatePassword()` ya existe) y las inyecta al app como env vars estándar:
  - `postgres`: imagen `postgres:16-alpine`, env `POSTGRES_USER=app POSTGRES_PASSWORD=<gen> POSTGRES_DB=app`, volumen `db-data:/var/lib/postgresql/data`. Inyectar al app: `DATABASE_URL=postgres://app:<gen>@db:5432/app` (+ `PG*` sueltas).
  - `mongo`: imagen `mongo:7`, volumen; inyectar `MONGO_URI=mongodb://db:27017/app` (sin auth en red interna del compose, como el deploy de pachuca que ya corre así).
  - `mysql`: imagen `mysql:8`, env `MYSQL_USER/PASSWORD/DATABASE/RANDOM_ROOT_PASSWORD=yes`; inyectar `DATABASE_URL=mysql://...` (+ `MYSQL_*`).
  - El servicio SIEMPRE se llama `db` (hostname estable dentro del compose), SIN mapeo de puertos al host (solo red interna del compose — la DB nunca queda expuesta ni al LAN).
  - Guardar `{tipo, usuario, password, dbName, urlInterna}` en `projects.json`; el portal la muestra en "Datos de conexión" con la advertencia "accesible solo desde tu aplicación".
  - Ajustar recursos: plan con `db ≠ ninguna` suma +512 MB RAM (postgres/mysql la necesitan; mongo ya demostró correr junto al app de pachuca en 2 GB, apretado).
- **Expected observation if it worked:** deploy de prueba con postgres: `agentExecWait(... 'docker compose exec -T db pg_isready')` → `accepting connections`; el app recibe `DATABASE_URL` (verificable con `docker compose exec -T web env | grep DATABASE_URL`).
- **Expected observation if it failed:** contenedor `db` en crash-loop (`docker compose ps` → Restarting) — típicamente OOM en el guest de 1 GB.
- **Most likely cause of failure:** plan básico (1 GB) + postgres + build de node simultáneos = OOM killer.
- **Countermove:** ya codificado: +512 MB cuando hay DB; además ordenar el pipeline para que el build ocurra ANTES de levantar la DB (`docker compose build` primero, luego `up -d` de todo). Si aun así OOM: el paso marca error con `dmesg | tail -5` en el detail.
- **Downstream consequences:** el redeploy NUNCA debe recrear el volumen (`docker compose up -d` sin `down -v`) o el cliente pierde sus datos; prohibir `down -v` en todo el pipeline salvo en DELETE del proyecto.

### Move 5: Generador de página por requisitos (la ruta "no tengo código")
- **Action:** Para `tipo:'plantilla'`, el formulario del portal pide: nombre del negocio, giro/descripción (texto libre), color primario (picker), teléfono/WhatsApp, email de contacto, y hasta 3 secciones de texto (título+párrafo). El backend:
  1. `templates/landing/index.html.tpl` en el backend: página estática única, responsive, con placeholders `{{NEGOCIO}} {{DESCRIPCION}} {{COLOR}} {{WHATSAPP}} {{EMAIL}} {{SECCIONES}}` — escribirla una vez, sobria (hero + secciones + footer con botón de WhatsApp `https://wa.me/<num>`), CSS inline, sin dependencias externas.
  2. `src/services/sitegen.js`: escapa HTML de todos los campos del cliente (¡son entrada no confiable que se publicará en un dominio de la plataforma!), rellena placeholders, produce `index.html`, lo empaqueta como zip en `data/uploads/<uploadId>.zip` y encola el pipeline como si fuera `tipo:'zip'` (ruta estática ya soportada: nginx:alpine sirviendo `/opt/app`).
  3. El portal permite "editar y volver a publicar": guarda los campos del formulario en `projects.json`, re-genera y redeploy (el redeploy estático tarda <1 min).
- **Expected observation if it worked:** proyecto plantilla end-to-end: la URL del cliente muestra su negocio con su color y botón de WhatsApp funcional; `<script>alert(1)</script>` en el campo descripción aparece como TEXTO literal (escapado), no ejecuta.
- **Expected observation if it failed:** placeholders sin sustituir visibles (`{{NEGOCIO}}` en la página) o el alert ejecuta (XSS — parar y arreglar el escape antes de seguir).
- **Most likely cause of failure:** olvido de escapar uno de los campos (el de secciones múltiples es el típico).
- **Countermove:** una sola función `esc()` aplicada en el punto de render de CADA campo; test con payload XSS en TODOS los campos del formulario, no solo uno.
- **Downstream consequences:** esta es la ruta que usará el cliente menos técnico — si falla, el pitch "sin conocimientos" muere. Es también la ruta de demo comercial (Move 8).

### Move 6: Panel admin — invitaciones y visibilidad de clientes
- **Action:** En el frontend admin existente (`C:\vpsserver\panel\frontend\`): añadir a la página actual de dashboard (o una pestaña "Clientes" nueva en `App.tsx` + `DashboardLayout`): botón "Generar código de invitación" (`POST /api/invites`, muestra el código para copiar), tabla de clientes (`GET /api/clients` — nueva ruta adminOnly: email, proyectos, fecha) y en `VpsList` mostrar el tag `client:<id>` que ya viene en los tags de la VM.
- **Expected observation if it worked:** el admin genera un código, lo ve, y tras el registro del cliente el código aparece como usado; las VMs de clientes se distinguen en la lista.
- **Expected observation if it failed:** build de Vite falla (imports) o la tabla queda vacía con clientes existentes (ruta sin montar).
- **Most likely cause of failure:** trivial de frontend; nada estructural.
- **Countermove:** `npm run build` local antes de subir; probar contra el backend real con `VITE_API=` apuntando... (el frontend usa rutas relativas `/api` — probar ya desplegado).
- **Downstream consequences:** sin generador de códigos el registro (Move 2) no es usable por humanos.

### Move 7: Frontend del portal de cliente
- **Action:** En la misma SPA (sin react-router, siguiendo el patrón `useState<Page>`):
  1. `Login.tsx`: dos pestañas — "Administrador" (password, flujo actual) y "Clientes" (email+password + link "¿Tienes un código? Regístrate"). Registro: email, password, código de invitación.
  2. Si el JWT decodificado trae `role:'client'`, `App.tsx` renderiza `<PortalLayout>` en lugar de `<DashboardLayout>` — el cliente JAMÁS ve las páginas admin (y aunque las viera, el backend ya da 403 desde Move 2).
  3. `PortalLayout` + componentes: `MisProyectos.tsx` (cards con nombre, URL clickeable, estado, botones Redeploy/Eliminar/Datos de DB), `NuevoProyecto.tsx` (wizard: 1-nombre y plan → 2-tipo [plantilla con su formulario de negocio / URL de git / subir zip] y DB sí/no+motor → 3-confirmación con resumen en lenguaje llano), `ProgresoDeploy.tsx` (polling 3 s a `GET /projects/:id`, lista de pasos con las etiquetas en español, al final URL grande + datos de DB si aplica).
  4. Textos sin jerga: "base de datos" sí, "PostgreSQL vs MongoDB" con descripción de una línea ("recomendada para la mayoría" / "para datos flexibles"), nunca "DNAT/VMID/nodo".
  5. Build + deploy: `npm run build` local, scp `dist/` al edge, sin tocar nginx.
- **Expected observation if it worked:** flujo completo en el navegador desde WAN: registro → wizard → progreso → URL funcionando; refresh mantiene sesión (token en localStorage, patrón existente); un cliente no puede navegar a vistas admin ni por URL ni por estado.
- **Expected observation if it failed:** pantalla blanca (error de build/undefined en runtime — ver consola), o el polling se queda en un paso para siempre (backend marcó error pero el front no lo mapea).
- **Most likely cause of failure:** desincronización con el contrato del Move 3 (nombres de campos).
- **Countermove:** tipar el contrato en `src/api/types.ts` copiando EXACTAMENTE las respuestas reales de la API (curl primero, tipos después).
- **Downstream consequences:** este es el producto que ve el cliente; los Moves 2-5 son invisibles si esto no cierra.

### Move 8: E2E comercial + regresión + documentación
- **Action:** Desde red externa (o browser normal): (1) admin genera invitación; (2) cliente de prueba se registra; (3) crea proyecto plantilla "tacos-dona-mari" con postgres, plan básico; (4) cronometrar hasta URL viva; (5) verificar `https://tacos-dona-mari.<apps>.duckdns.org/` → 200 TLS válido, botón WhatsApp correcto; (6) segundo proyecto del mismo cliente → debe rechazar por cupo (quota 1); (7) DELETE del proyecto → la URL deja de resolver a contenido (404/502 esperado en el edge), la VM desaparece de Proxmox, la regla DNAT del nodo se eliminó (`iptables -t nat -L PREROUTING -n | grep <puerto>` vacío) y el cupo se libera; (8) regresión: capuvps, pachucacv y el login admin en 200/funcionando; (9) reboot-test del edge NO (prohibido reiniciar infra compartida — en su lugar `systemctl restart vps-panel` y verificar que el portal revive).
  Documentar en `wargames/MANUAL-portal-clientes.md`: flujo del cliente con capturas, límites (cupo, planes, tamaño zip, ~6-8 proyectos con el hardware actual), cómo generar invitaciones, cómo borrar/liberar capacidad, y el mapa interno proyecto→VM para soporte.
- **Expected observation if it worked:** los 9 puntos en verde; tiempo total del deploy plantilla < 10 min (el clon del template son ~2-4 min, el resto es corto).
- **Expected observation if it failed:** cualquier punto rojo con su señal concreta (cupo no rechaza = bug de Move 3; URL sigue viva tras DELETE = fuga de vhost/DNAT).
- **Most likely cause of failure:** la limpieza del DELETE (es el camino menos ejercitado: vhost + DNAT + VM + JSONs deben limpiarse en orden y con idempotencia).
- **Countermove:** implementar DELETE como los pasos del pipeline (lista de sub-pasos con retry), no como un one-shot; si un sub-paso falla, el proyecto queda en estado `eliminando` visible para el admin con el detalle.
- **Downstream consequences:** con esto en verde, el sistema queda listo para clientes reales; la venta/cobro sigue siendo manual (FossBilling, fuera de alcance).

## Unresolved assumptions

- **Nombre del dominio de plataforma para apps** (`<apps>.duckdns.org`): lo decide el dueño; consume el 3.º de los 5 slots DuckDNS de la cuenta (o una cuenta DuckDNS nueva dedicada — también decisión del dueño). Sin este nombre el Move 1 no puede ejecutarse.
- **Slots DuckDNS realmente libres**: solo visibles logueado en duckdns.org.
- **Política de invitaciones/cobro**: v1 asume registro solo con código (el admin controla quién entra). FossBilling está instalado y configurado — la integración (orden pagada → invitación automática) es un proyecto aparte y NO se asume aquí.
- **Cupo por cliente**: v1 fija `quota: 1` (editable a mano en `clients.json`). Confirmar con el dueño si algún cliente amerita más — el hardware limita ~6-8 proyectos totales.
- **Email transaccional**: no hay SMTP en la plataforma; el registro no verifica email y el "olvidé mi contraseña" queda como reset manual por el admin (editar hash en `clients.json`). Si se quiere self-service, hace falta un proveedor SMTP (decisión/costo del dueño).
- **Contraseña del panel admin y token DuckDNS de plataforma**: en poder del dueño; el executor los pide al arrancar (no están en el repo).
- **Repos git privados**: v1 solo repos públicos (igual que el brief prerrequisito). Deploy keys por proyecto = v2.

## Abort conditions

- Tras el Move 2, si CUALQUIER ruta admin responde ≠403 a un token de cliente → detener el rollout del portal (no publicar el frontend del Move 7) hasta cerrar la fuga; el portal sin ese aislamiento expone credenciales de todos los VPS.
- El payload XSS del Move 5 ejecuta en la página generada → no publicar la ruta plantilla hasta corregir el escape (las páginas viven bajo el dominio de la plataforma; un XSS ahí contamina a todos los clientes).
- `https://capuvps.duckdns.org/` o `https://pachucacv.duckdns.org/` dejan de dar 200 en cualquier verificación → revertir el último cambio de nginx/backend, confirmar recuperación, reportar.
- `systemctl status vps-panel` cae y no revive con restart → restaurar el código anterior del backend (mantener SIEMPRE un `cp -r /opt/vps-panel/backend/src /opt/vps-panel/backend/src.bak-<fecha>` antes de cada subida) y reportar.
- Capacidad: si `checkCapacity` empieza a rechazar en ambos nodos con <3 proyectos creados, los números de plan están mal — parar y recalcular con el dueño en vez de bajar el headroom de 2 GB (ese margen protege a pfSense en pvececyte).
- PROHIBIDO SIEMPRE: reiniciar pfSense o los nodos Proxmox; escribir tokens/contraseñas en texto plano en commits (convención REDACTED del repo).
