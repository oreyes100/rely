# War-game: FossBilling 502 + Next.js build + ServerManager cliente
> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.

## Mission objective
Resolver cuatro problemas simultáneos:
1. **FossBilling 502** — `capuvps.duckdns.org/fossbilling/` responde Bad Gateway
2. **Next.js build falla** — `micongre` falla en paso `build` porque Supabase necesita vars en build-time + error display con chars corruptos (`â¨¯`)
3. **Supabase → DB propia** — Detectar cuando el cliente usa Supabase y ofrecer PostgreSQL+PostgREST en su VM
4. **Client ServerManager** — El cliente no tiene panel de administración de su propio servidor

## Recon summary
- `nginx.conf` en repo **no tiene** bloque `/fossbilling/` — fue añadido al servidor manualmente y probablemente apunta a IP incorrecta o el LXC de FossBilling está caído
- `ssh root@192.168.1.34` funciona sin contraseña; `ssh admin@` pide contraseña — usar root para deploy
- `scp` falló porque se ejecutó desde `C:\Users\User` en vez de `C:\vpsserver` — necesita ruta absoluta
- `nodeDockerfile()` en `deploy.js` ejecuta `npm run build` **sin** hacer source del `.env` — Next.js necesita `NEXT_PUBLIC_*` a tiempo de compilación Docker
- `â¨¯` = U+21AF (DOWNWARDS ZIGZAG ARROW) de Next.js, mal renderizado al pasar por UTF-8 → latin1 → UTF-8 en el log
- `agentExecWait()` disponible en `ProxmoxClient` — puede ejecutar comandos en la VM del cliente
- `PortalLayout` solo tiene 'proyectos'|'nuevo' — falta 'servidor' para el cliente
- FossBilling corre en LXC propio con PHP-FPM, puerto 80 en IP `192.168.1.X` (desconocida hasta diagnóstico)

## Moves

### Move 1: Diagnosticar y corregir FossBilling 502
- **Action:** SSH a 192.168.1.34 como root; verificar nginx config de fossbilling y estado del LXC
  ```bash
  ssh root@192.168.1.34 "grep -r fossbilling /etc/nginx/sites-enabled/ 2>/dev/null; \
  pct list 2>/dev/null | grep -i fossbill || echo 'no LXC encontrado'; \
  curl -sv http://127.0.0.1:8080/ 2>&1 | head -5"
  ```
- **Expected observation if it worked:** Muestra proxy_pass, IP del LXC y si responde en ese puerto
- **Expected observation if it failed:** No hay bloque nginx → el bloque no fue aplicado o fue al archivo equivocado
- **Most likely cause of failure:** LXC de FossBilling está detenido (`pct start <id>`) o la IP del upstream es incorrecta en el proxy_pass
- **Countermove:** 
  - Si LXC caído: `pct start <id>`
  - Si no hay bloque nginx: añadir el bloque con la IP correcta y `nginx -s reload`
  - Si IP incorrecta: `pct config <id>` para obtener IP, corregir proxy_pass
- **Downstream consequences:** El proxy correcto es necesario para que FossBilling funcione pero no afecta el deploy de clientes

### Move 2: Añadir bloque fossbilling al nginx.conf del repo
- **Action:** Agregar bloque `/fossbilling/` parametrizable con variable de entorno `FOSSBILLING_UPSTREAM` al template `panel/deploy/nginx.conf` y a la config real del servidor via script de corrección
- **Expected observation if it worked:** `curl https://capuvps.duckdns.org/fossbilling/` retorna HTTP 200/302
- **Expected observation if it failed:** Sigue 502 → el LXC está caído aunque el proxy apunte bien
- **Most likely cause of failure:** PHP-FPM caído dentro del LXC → `systemctl start php-fpm` dentro del LXC
- **Countermove:** `pct exec <id> -- systemctl restart nginx php8.2-fpm`

### Move 3: Corregir Dockerfile para Next.js (env en build-time)
- **Action:** En `nodeDockerfile()`, cambiar el paso RUN de build para que primero haga source del `.env`:
  ```dockerfile
  RUN sh -c 'if [ -f .env ]; then set -a; . ./.env; set +a; fi && \
      if ! grep -q "\"build\"" package.json; then echo "sin build"; \
      elif [ -f pnpm-lock.yaml ]; then pnpm run build; \
      elif [ -f yarn.lock ]; then yarn build; \
      else npm run build; fi'
  ```
  Agregar fallback Next.js al CMD: `node .next/standalone/server.js 2>/dev/null ||`
- **Expected observation if it worked:** `npm run build` de Next.js encuentra `NEXT_PUBLIC_SUPABASE_URL` como variable de entorno → build completa
- **Expected observation if it failed:** Sigue fallando → el cliente no proveyó las vars → necesita retry con vars en el campo de env
- **Most likely cause of failure:** Cliente no proveyó las vars de Supabase en el campo env → el `.env` está vacío y Next.js no puede construir páginas estáticas que llaman a Supabase
- **Countermove:** Mostrar mensaje claro al cliente indicando qué vars se necesitan; ofrecer la opción de DB propia como alternativa

### Move 4: Sanitizar output del build (fix encoding `â¨¯`)
- **Action:** En `deploy.js`, función que sanitiza la salida del build eliminando chars Unicode problemáticos antes de almacenar en `detail`
- **Expected observation if it worked:** El error muestra texto legible sin caracteres corruptos
- **Expected observation if it failed:** N/A — sanitización es sin falla
- **Downstream consequences:** Mejora la UX del cliente que ve el error

### Move 5: Detectar Supabase + ofrecer DB propia
- **Action:** En el paso `stack` del pipeline, detectar `@supabase/supabase-js` en package.json. Si detectado: (a) añadir al detail del step un aviso, (b) agregar `db: 'supabase-pg'` como opción en el compose builder que despliega PostgreSQL + PostgREST
- **Expected observation if it worked:** El deploy detecta Supabase, añade PostgREST al compose, el cliente recibe `DATABASE_URL` y `SUPABASE_URL=http://postgrest:3000`
- **Expected observation if it failed:** PostgREST no arranca → revisar config JWT o schema
- **Most likely cause of failure:** El schema `anon` no existe en PostgreSQL → hay que ejecutar migración SQL inicial
- **Countermove:** Ofrecer guía de migración en lugar de auto-provisión; dejar que el cliente siga usando Supabase externo con sus vars

### Move 6: Client ServerManager — rutas backend
- **Action:** Agregar a `portal.js` tres endpoints que usan `agentExecWait()` en la VM del cliente:
  - `GET /portal/projects/:id/server` → docker compose ps + df + free
  - `GET /portal/projects/:id/server/logs` → docker compose logs
  - `POST /portal/projects/:id/server/restart` → docker compose restart
- **Expected observation if it worked:** API retorna JSON con contenedores, métricas, logs
- **Expected observation if it failed:** Timeout de agentExecWait → VM caída o VMID erróneo
- **Most likely cause of failure:** El deploy no completó exitosamente o el VMID fue reasignado → verificar `dep.status === 'done'` antes de actuar
- **Countermove:** Retornar `{ available: false, reason: '...' }` cuando el servidor no está listo

### Move 7: MiServidor.tsx — componente frontend del cliente
- **Action:** Crear `MiServidor.tsx` con pestañas: Estado (contenedores + recursos), Logs (auto-refresh), Reiniciar. Agregar 'servidor' como página en PortalLayout y App.tsx
- **Expected observation if it worked:** El cliente ve el estado de su servidor en tiempo real
- **Expected observation if it failed:** Component retorna "Servidor no disponible" para deploys en error o sin VMID
- **Most likely cause of failure:** El deploy aún no terminó → mostrar mensaje apropiado, no error

### Move 8: Fix deploy commands — Windows PowerShell correcto
- **Action:** Proveer el comando scp correcto que funciona en Windows OpenSSH:
  ```powershell
  cd C:\vpsserver
  # scp no soporta glob en Windows — copiar la carpeta completa
  scp -r panel\frontend\dist root@192.168.1.34:/opt/vps-panel/frontend/
  ssh root@192.168.1.34 "systemctl restart vps-panel && nginx -s reload"
  ```
- **Expected observation if it worked:** La carpeta `dist` se copia al servidor, service reinicia
- **Expected observation if it failed:** Error de permisos en `/opt/vps-panel/frontend/` → usar rsync o ajustar permisos
- **Countermove:** `ssh root@192.168.1.34 "chown -R admin:admin /opt/vps-panel"` antes del scp

## Unresolved assumptions
- IP del LXC de FossBilling: desconocida — se determina en Move 1 con `pct list` + `pct config <id>`
- Puerto donde FossBilling está sirviendo (80 dentro del LXC, pero el proxy podría apuntar a 8080): verificar en nginx config del servidor
- Si el cliente micongre tiene Supabase URL real o está intentando migrar a DB propia: determina si el fix del Move 3 es suficiente o si hay que ofrecer migración

## Abort conditions
- Si FossBilling LXC no existe en el servidor (fue eliminado): crear nuevo LXC con `setup-fossbilling.sh` — no abortar, escalate al admin
- Si el VMID 301 de micongre fue destruido: se puede retry con nuevo VMID — el pipeline lo crea desde cero
- Si `agentExecWait` falla en Move 6 porque pvececyte no alcanza la VM 301 por red: el client ServerManager muestra "no disponible" — no bloquea el resto
