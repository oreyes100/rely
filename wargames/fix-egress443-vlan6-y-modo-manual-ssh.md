# War-game: Fix egress 443 VLAN 6 + modo manual SSH tras fallo de deploy

> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.

## Mission objective

Que un deploy con `docker compose` funcione en VLAN 6 (hoy el pull de imágenes muere con "no route to host" al puerto 443), y que cuando CUALQUIER deploy falle, el cliente vea igualmente su servidor en el portal con credenciales SSH para implementación manual. Éxito medible: (1) retry de `micongreerror` llega al menos al paso `ufw` (el pull de mysql:8/nginx:alpine ya no falla); (2) un proyecto en estado `error` con VM viva muestra botón "Implementación manual" en el portal y la pestaña SSH entrega usuario/contraseña válidos.

## Recon summary (hechos verificados en vivo, 2026-07-23)

- VM 211 (`micongre`, 192.168.6.114, nodo pve=192.168.1.4): `docker ps -a` VACÍO. `docker compose up -d` falla: `dial tcp …:443: connect: no route to host` al resolver `registry-1.docker.io`.
- Conectividad VM 211: ping gateway OK, ping 1.1.1.1 OK, DNS OK (respuestas reales de AWS, también vía 1.1.1.1 y 8.8.8.8 directos → puerto 53 abierto), HTTP:80 a archive.ubuntu.com → 200, HTTPS:443 a github.com y mirror.gcr.io → 000. Conclusión: **egress TCP/443 bloqueado**; el gateway de VLAN 6 es `192.168.6.1` = el nodo pve (él corre dnsmasq y el NAT iptables — el paso `nat` del pipeline ya escribe reglas ahí vía `sshNode()`).
- El paso `run` en `deploy.js` encadena `up -d && sleep 8 && curl || echo 000`: si compose falla, el error se pierde y queda "App no responde (HTTP 000). Logs: " (vacío porque no hay contenedores).
- `getDeployNode()` en `portal.js` exige `status === 'done'` → cliente con deploy fallido no ve el servidor aunque la VM corra.
- Los deploys normales nunca guardan sshUser/sshPassword (solo vps-only/db-only), PERO `provisionVm()` siempre persiste `devops:password` cifrado en `data/credentials.json` (verificado para VMID 211) → recuperable con `listCredentials()`.
- El sanitizador de `toPortalView` (`.replace(/\/[a-z/]+/g,'')`) destruye los mensajes de error con rutas.
- Frontend: `MisProyectos.tsx` solo muestra "Gestionar servidor" con `estado==='activo'`; `MiServidor.tsx` ya tiene SshTab/DbTab/CredRow.
- **Puerto 22 de la VM INALCANZABLE desde fuera de la VLAN** (verificado: panel→192.168.6.114:22 = timeout). Entregar la IP interna como sshHost es inútil: el acceso del cliente DEBE ir vía DNAT del nodo `22000+vmid → guestIP:22` (mismo patrón probado que las apps usan con 8000+vmid→80).
- Las imágenes cloud de Ubuntu traen `PasswordAuthentication no` en `/etc/ssh/sshd_config.d/60-cloudimg-settings.conf` — sin habilitarlo, el login por contraseña falla aunque el DNAT funcione.
- Restricciones: NO tocar capuvps (192.168.1.33), NO reiniciar pfSense/pvececyte, puertos WAN 80/443 son de producción. El fix de egress va en el NODO (192.168.1.4), no en pfSense.

## Moves

### Move 1: Regla de egress 443/22 en el nodo, aplicada desde el paso `prepare` del pipeline
- **Action:** En `deploy.js`, al inicio del paso `prepare` (ambos: normal y db-only), si `cfg.type !== 'hyperv'`, ejecutar vía `sshNode(cfg.host, …)` una cadena idempotente: crear/vaciar chain `VPS-EGRESS`; RETURN para 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12; ACCEPT tcp multiport 443,22; enganchar `-I FORWARD 1 -s ${cfg.subnetPrefix}0/24 -j VPS-EGRESS` (con guard `-C`); asegurar regla ESTABLISHED,RELATED de vuelta; `iptables-save > /etc/iptables/rules.v4`. Envolver en try/catch NO fatal (solo warn) para no romper deploys donde el egress ya funciona.
- **Expected observation if it worked:** En el retry, el paso `build`/`run` ya no arroja "no route to host"; `docker compose up -d` descarga imágenes.
- **Expected observation if it failed:** Mismo error 443 en el retry.
- **Most likely cause of failure:** El REJECT que mata el 443 vive en pfSense y no en el nodo (probabilidad baja: el nodo es el router NAT de la VLAN).
- **Countermove:** NO tocar pfSense sin el operador. Reportar al usuario: "el bloqueo 443 está aguas arriba (pfSense); hay que agregar regla en la UI de pfSense VLAN6: pass TCP 443 out" y mientras tanto los clientes usan modo manual SSH (Move 4-7 siguen valiendo).
- **Downstream consequences:** El RETURN para redes privadas preserva el aislamiento inter-VLAN (el test "VM→panel 192.168.1.34 = 000" debe seguir dando 000 tras el fix).

### Move 2: Override DNS público en la VM durante `prepare`
- **Action:** Prepend en el comando del agente del paso `prepare` (normal y db-only): `mkdir -p /etc/systemd/resolved.conf.d && printf '[Resolve]\nDNS=1.1.1.1 8.8.8.8\n' > /etc/systemd/resolved.conf.d/panel.conf && systemctl restart systemd-resolved || true`. Motivo: el A-record de registry-1.docker.io llegó envenenado (100.60.200.248, rango Telmex) por el DNS upstream; puerto 53 directo a 1.1.1.1 está abierto (verificado).
- **Expected observation if it worked:** `getent hosts registry-1.docker.io` en la VM devuelve IPs AWS reales (34.x/44.x/3.x o 2600:1f18…), nunca 100.60.x.
- **Expected observation if it failed:** Sigue apareciendo 100.60.x o resolución lenta.
- **Most likely cause of failure:** systemd-resolved no corre en el template (improbable en Ubuntu cloud-init).
- **Countermove:** Escribir `/etc/resolv.conf` directo (`rm -f` symlink + `nameserver 1.1.1.1`) como fallback en el mismo comando con `||`.

### Move 3: Paso `run` a prueba de fallas (separar up/curl + poll 90 s + diagnóstico rico)
- **Action:** Reescribir el paso `run` normal: (a) `docker compose up -d > /tmp/up.log 2>&1; echo UP_EXIT=$?; tail -c 600 /tmp/up.log` — si UP_EXIT≠0, lanzar error con el contenido del log (sanitizado); (b) si up OK, poll de `curl -s -w %{http_code} http://127.0.0.1:80/` cada 6 s hasta 90 s (MySQL 8 tarda 30-60 s en su primer init; apps Node 10-30 s); aceptar cualquier código que no sea 000/5xx; (c) si agota el poll, capturar `docker compose ps -a` + `docker compose logs --tail 15` y lanzarlo en el mensaje. Aplicar lo mismo (a) al `run` de db-only.
- **Expected observation if it worked:** Deploys con MySQL pasan el paso 7; si algo falla, el mensaje del portal muestra el error REAL de compose (p.ej. "failed to resolve reference…" o el estado de contenedores), nunca "Logs: " vacío.
- **Expected observation if it failed:** Timeout del agentExecWait en el poll.
- **Most likely cause of failure:** Timeouts demasiado cortos en agentExecWait para cada curl.
- **Countermove:** Cada curl usa su propio agentExecWait con timeout 20 s; el loop es del lado del backend, no un solo comando shell gigante.
- **Downstream consequences:** El paso `ufw`/`nat` no cambia; el detail de éxito reporta el HTTP code real.

### Move 4: Credenciales SSH SIEMPRE tras `wait_ip`
- **Action:** En `pipeline()`, inmediatamente después del paso `wait_ip`, hacer `patchDeploy(deployId, { sshUser: vmResult?.user ?? 'devops', sshPassword: vmResult?.password ?? '', sshHost: guestIP, sshPort: 22 })` para TODOS los modos (el bloque vps-only queda solo con status done). En `retryDeploy()`, resetear sshUser/sshPassword/sshHost a null junto con vmid/guestIP (la VM vieja se destruye).
- **Expected observation if it worked:** `deploys.json` muestra sshUser/sshHost pese a fallo en pasos posteriores.
- **Expected observation if it failed:** Campos null tras un deploy nuevo.
- **Most likely cause of failure:** `vmResult` fuera de scope (debe estar declarado en el scope de `pipeline`, ya lo está).
- **Countermove:** Fallback en portal (Move 5) cubre registros viejos de todos modos.

### Move 5: Portal `/server` disponible en estado `error` + fallback de credenciales
- **Action:** En `portal.js`: (a) `getDeployNode()` permite `status === 'done' || 'error'` (bloquea `running` con mensaje "despliegue en curso", `deleted`, o sin vmid/node); (b) en `/projects/:id/server`, si `dep.sshUser` está vacío, buscar en `listCredentials()` por node+vmid y usar ese user/password (cubre micongre VM 211 ya creado); (c) responder `deployFailed: dep.status === 'error'`; (d) cualquier excepción del agente → `{ available:false, reason }` genérico en vez de 500.
- **Expected observation if it worked:** GET `/portal/projects/19cd715a…/server` con sesión del cliente devuelve `available:true, deployFailed:true, sshUser:'devops', sshPassword:<real>`.
- **Expected observation if it failed:** `available:false` o creds null.
- **Most likely cause of failure:** decrypt de credentials.json falla si cambió CRED_SECRET.
- **Countermove:** El botón "Rotar contraseña SSH" (Move 6) regenera password vía chpasswd sin depender del store.

### Move 6: Rotación de contraseña SSH (`rotateSsh`) + acceso garantizado
- **Action:** Nuevo export en `deploy.js`: `rotateSsh(deployId)` — exige vmid+node y status ≠ deleted/running; genera password (crypto base64url 12+ chars); ANTES del chpasswd ejecuta SSH_PWAUTH_CMD (habilita PasswordAuthentication en sshd_config y sshd_config.d, reload ssh, ufw allow 22); `echo 'user:pass' | chpasswd && echo OK` vía guest agent; luego `ensureSshNat()` idempotente en el nodo (`22000+vmid → guestIP:22`) y devuelve sshHost=nodo, sshPort=22000+vmid; `upsertCredential()` + `patchDeploy()`. Nuevo endpoint `POST /portal/projects/:id/rotate-ssh` (rate-limit 5/h, clientOnly, dueño). Sirve también como "generar credenciales" cuando el password se perdió Y repara deploys viejos que guardaron la IP interna inalcanzable. El pipeline hace lo mismo tras wait_ip para deploys nuevos. deleteDeploy/retryDeploy limpian la regla 22000+vmid.
- **Expected observation if it worked:** Respuesta `{ok:true, ssh:{sshUser,sshPassword,…}}` y login SSH con la nueva contraseña funciona.
- **Expected observation if it failed:** exitcode ≠ 0 del chpasswd.
- **Most likely cause of failure:** Password con caracteres problemáticos en quoting (usar base64url: solo [A-Za-z0-9_-], seguro entre comillas simples).
- **Countermove:** Ya prevenido con base64url; si el agente no responde, el endpoint devuelve 502 con mensaje claro.

### Move 7: Frontend — modo manual visible
- **Action:** (a) `MisProyectos.tsx`: botón "Gestionar servidor" también cuando `estado==='error'` con etiqueta "🔑 Implementación manual"; (b) `MiServidor.tsx`: campo `deployFailed` en ServerStatus; banner ámbar "El despliegue automático falló — tu servidor sigue vivo, impleméntalo por SSH"; header muestra "Servidor en modo manual" (punto ámbar) y oculta "Abrir app"/"Reiniciar app" si deployFailed; tab inicial = 'ssh' cuando deployFailed o vpsOnly; (c) SshTab recibe `proyectoId` + `onRotate`: botón "Rotar contraseña SSH" y, si no hay credenciales, botón "Generar credenciales SSH" (ambos → POST rotate-ssh).
- **Expected observation if it worked:** `npm run build` limpio; en el portal, proyecto en error muestra el botón y la pestaña SSH con credenciales.
- **Expected observation if it failed:** Error TS por props faltantes.
- **Countermove:** Actualizar TODAS las instancias del fallback ServerStatus (incluye el setStatus de error en `cargar()`).

### Move 8: Sanitizador de errores del portal
- **Action:** En `toPortalView`, cambiar `.replace(/\/[a-z/]+/g,'')` por `.replace(/\/(opt|tmp|usr|var|home|root|etc)[\w./-]*/g,'…')` y subir slice a 400. Mantener el reemplazo de IPs 192.168.x.
- **Expected observation if it worked:** El mensaje de error del paso run muestra el texto real de compose legible.
- **Most likely cause of failure:** regex demasiado codiciosa come texto útil — probar con el mensaje real "failed to resolve reference \"docker.io/library/nginx:alpine\"" (no empieza con /opt|/tmp… → queda intacto).

### Move 9: Build, deploy y verificación E2E
- **Action:** `npm run build` en frontend; scp de `deploy.js`, `portal.js`, `proxmox.js` (sin cambios pero por consistencia) y `dist/*` a root@192.168.1.34; `systemctl restart vps-panel`; `systemctl is-active` = active. Después pedir al cliente (o admin) clic en "Reintentar despliegue" de micongreerror y observar los pasos.
- **Expected observation if it worked:** Retry pasa `build` y `run` (pull de imágenes OK gracias a Move 1-2); o si vuelve a fallar, el mensaje es descriptivo y el cliente tiene el botón de implementación manual con SSH funcional.
- **Expected observation if it failed:** `is-active` ≠ active → `journalctl -u vps-panel -n 30` para el error de sintaxis; revertir el archivo culpable.
- **Downstream consequences:** El retry destruye la VM 211 y crea una nueva — las credenciales del store se regeneran con la nueva VM (upsertCredential en provision). El cliente NO debe apegarse a la IP vieja.

## Unresolved assumptions

- Se asume que el REJECT de 443 está en el FORWARD del nodo pve (no pude inspeccionar iptables del nodo directamente en esta sesión; la evidencia — nodo=gateway/dnsmasq/NAT de la VLAN — lo hace muy probable). Si tras Move 1 el 443 sigue muerto, el bloqueo está en pfSense y lo debe tocar el operador humano (regla pass TCP 443 en la interfaz VLAN6, sin reiniciar nada).
- Se asume que el template Ubuntu usa systemd-resolved (estándar en cloud-init Ubuntu 22.04/24.04).
- CRED_SECRET no ha cambiado desde que se creó VM 211 (si cambió, el fallback de credenciales devuelve null y el cliente usa "Generar credenciales SSH").

## Abort conditions

- Si `systemctl is-active vps-panel` ≠ active tras el deploy → revisar journal, revertir el último archivo subido, NO seguir con más cambios encima de un servicio caído.
- Si el retry de micongreerror falla en `provision` o `wait_ip` (antes de donde fallaba) → problema nuevo no relacionado; parar y reportar el mensaje exacto.
- Si las reglas iptables del Move 1 producen pérdida de conectividad del propio nodo (el ssh del paso nat deja de responder) → ejecutar rollback inmediato vía el mismo sshNode: `iptables -D FORWARD -s <subnet> -j VPS-EGRESS && iptables -F VPS-EGRESS && iptables -X VPS-EGRESS`; NUNCA tocar reglas fuera de la chain VPS-EGRESS y el hook.
- Nunca operar sobre capuvps (192.168.1.33), pfSense o el nodo pvececyte más allá de las reglas idempotentes descritas.
