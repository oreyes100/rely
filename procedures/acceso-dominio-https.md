# Procedimiento: Acceso por nombre de dominio sin puerto + HTTPS

Aplica cuando un servicio (panel, webapp de cliente, landing) debe estar accesible
desde internet **solo por nombre de dominio** (`https://miproducto.duckdns.org/`)
sin anexar un puerto externo (`:8090`, `:8443`, `:8446`).

El método se resume en una frase: **el tráfico `80/443` termina en el edge
(192.168.1.34), y el edge publica el dominio con un vhost de solo-443 su proxy
al backend real** (que sigue viviendo en la VLAN interna). Lo verificamos de punta
a punta con `dineroorganizado.duckdns.org` (Mis Finazas, 2026-08-13).

---

## Arquitectura de referencia

```
Internet
   │  https://miproducto.duckdns.org        (80/443, sin puerto)
   ▼
pfSense WAN 207.248.113.8
   │  NAT :80  → 192.168.1.34:80
   │  NAT :443 → 192.168.1.34:443
   ▼
edge 192.168.1.34  (nginx 1.24, VM "vps-panel", panel VPS)
   │  SNI: capuvps / pachucacv / congregaciontj / dineroorganizado / ...
   ▼  proxy_pass https://<nodo>:<puertoDNAT>   (proxy_ssl_verify off)
nodo Proxmox (pve 192.168.1.4 / pvececyte 192.168.1.254)
   │  iptables/nft DNAT :<puerto> → guest:<puerto_servicio>
   ▼
guest VPS en VLAN 6/7 (ej. 192.168.6.191:443) ← aquí vive la app real
```

Reglas de oro:
- **El cert HTTPS siempre se emite en el edge** (Let's Encrypt HTTP-01 vía
  WAN:80→edge, ya verificado). El tramo edge→nodo→guest va cifrado con
  `proxy_ssl_verify off` porque no hace falta validar el cert interno.
- Un `server_name` específico gana al catch-all `server_name _;` — así conviven
  dominio propio y panel en el mismo `:443`.
- Nunca tocar pfSense para un deploy individual: `80/443` ya están nateados al edge.

---

## Paso 1 — Verificaciones previas (obligatorio)

Desde el edge (`ssh root@192.168.1.34`):

```bash
# 1. El dominio ya resuelve a la WAN pública
dig +short miproducto.duckdns.org A        # debe dar: 207.248.113.8

# 2. El backend real responde a través del nodo (DNAT) — si NO, primero
#    publica el servicio (ver "publicar-vm-cliente-https.md") o el gateway
curl -sk -o /dev/null -w '%{http_code}\n' \
  https://192.168.1.4:8446/ -H "Host: miproducto.duckdns.org"   # → 200

# 3. acme.sh instalado y webroot ACME listo
ls /root/.acme.sh/acme.sh && ls -d /var/www/acme
```

> Si el dominio aún no resuelve: registrarlo en duckdns.org apuntando a
> `207.248.113.8` (o crear el registro A del cliente en su proveedor DNS).

---

## Paso 2 — Detectar el puerto DNAT del backend

Convención de puertos por tipo de servicio:

| Servicio | Tramo edge→nodo→guest | Ejemplo real |
|---|---|---|
| Webapp HTTP (compose en guest :80) | `8000+VMID` → guest:80 | VM 211 → `192.168.1.4:8211` |
| SSR / app con nginx propio (guest :443) | `8446` (nft pve) o `8443` (pvececyte) | VM 501 → `192.168.1.4:8446` |
| SSH del client | `22000+VMID` → guest:22 | `22211` |

El valor clave para el vhost es **`<nodo_IP>:<puertoDNAT>`** y si el tramo es
HTTPS (`guest:443`) o HTTP (`guest:80`).

---

## Paso 3 — Crear el vhost en el edge

### 3a) Cert temporal (para que nginx levante antes de emitir el real)

```bash
FQDN=miproducto.duckdns.org
CERT=/etc/nginx/ssl/${FQDN}
mkdir -p "$CERT"
[ -f "$CERT/fullchain.pem" ] || openssl req -x509 -newkey rsa:2048 \
  -keyout "$CERT/key.pem" -out "$CERT/fullchain.pem" \
  -days 1 -nodes -subj "/CN=${FQDN}" 2>/dev/null
```

### 3b) Vhost de producción

Dos variantes según el tramo interno:

**Variante HTTP (tramo node→guest en :80, patrón `panel-vhost add`):**

```bash
panel-vhost add $FQDN <nodoIP> <puertoDNAT>
# ej: panel-vhost add congregaciontj.duckdns.org 192.168.1.4 8211
```

**Variante HTTPS (tramo node→guest en :443 — patrón pachucacv/dineroorganizado).**
`panel-vhost` no sirve esta variante; escribir el vhost a mano:

```nginx
# /etc/nginx/sites-available/miproducto.duckdns.org
server {
    listen 443 ssl http2;
    server_name miproducto.duckdns.org;

    ssl_certificate     /etc/nginx/ssl/miproducto.duckdns.org/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/miproducto.duckdns.org/key.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    location /.well-known/acme-challenge/ {
        root /var/www/acme;
    }

    location / {
        proxy_pass              https://192.168.1.4:8446;   # <nodo>:<puertoDNAT>
        proxy_ssl_verify        off;
        proxy_ssl_server_name   on;
        proxy_ssl_name          miproducto.duckdns.org;
        proxy_set_header        Host $host;
        proxy_set_header        X-Real-IP $remote_addr;
        proxy_set_header        X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto https;
        proxy_read_timeout      60s;
    }
}

server {
    listen 80;
    server_name miproducto.duckdns.org;
    location /.well-known/acme-challenge/ {
        root /var/www/acme;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
```

Activar y recargar:

```bash
ln -sf /etc/nginx/sites-available/miproducto.duckdns.org \
       /etc/nginx/sites-enabled/miproducto.duckdns.org
nginx -t && systemctl reload nginx
```

> **NUNCA** dejar nginx roto: si `nginx -t` falla, borrar el symlink y revisar el
> template (el error típico es escapar mal `$host` al generar con heredoc).

---

## Paso 4 — Emitir el certificado Let's Encrypt

El edge ya tiene WAN:80 → edge:80 (los challenges HTTP-01 pasan directo).

```bash
/root/.acme.sh/acme.sh --issue -w /var/www/acme -d $FQDN --server letsencrypt --force

/root/.acme.sh/acme.sh --install-cert -d $FQDN \
  --fullchain-file /etc/nginx/ssl/${FQDN}/fullchain.pem \
  --key-file      /etc/nginx/ssl/${FQDN}/key.pem \
  --reloadcmd "systemctl reload nginx"
```

- Con `--reloadcmd` la renovación (~60 días) queda automática vía cron de acme.sh.
- Si falla con "Could not get nonce": pasar `--server letsencrypt` explícito
  (acme.sh usa ZeroSSL por defecto en versiones recientes).

---

## Paso 5 — Verificación end-to-end

```bash
# Desde el edge (con SNI local):
curl -sk -o /dev/null -w '%{http_code}\n' https://127.0.0.1/ -H "Host: $FQDN"

# Desde cualquier máquina externa (WAN) — con verificación TLS ESTRICTA:
curl -s  -o /dev/null -w 'http=%{http_code} tls_verify=%{ssl_verify_result}\n' \
  https://$FQDN/
#    → http=200  tls_verify=0   (0 = cert válido, sin error de Chrome)

# Contenido real servido (evita que caiga en el catch-all del panel):
curl -sk https://$FQDN/ | grep '<title>'

# Regresión de sitios productivos:
curl -s -o /dev/null -w 'capuvps=%{http_code}\n' https://capuvps.duckdns.org/
curl -s -o /dev/null -w 'pachucacv=%{http_code}\n' https://pachucacv.duckdns.org/

# Cert emitido:
openssl x509 -in /etc/nginx/ssl/${FQDN}/fullchain.pem -noout -subject -dates
```

**En el navegador del cliente:** si el error `ERR_CERT_COMMON_NAME_INVALID` quedó
cacheado junto con HSTS, borrar el dominio en `chrome://net-internals/#hsts`
(→ *Delete domain*) o probar en ventana de incógnito.

---

## Referencia: caso real completado (2026-08-13)

| Item | Valor |
|---|---|
| Servicio | Mis Finazas (`dineroorganizado.duckdns.org`) |
| Backend | VM 501 `misfinz` en pvedell, `192.168.6.191:443` |
| Tramo DNAT | pve `192.168.1.4:8446` → `192.168.6.191:443` (nft `inet vpsgw`) |
| Vhost edge | variante HTTPS (`proxy_pass https://192.168.1.4:8446`, `proxy_ssl_verify off`) |
| Cert | Let's Encrypt HTTP-01, `CN = dineroorganizado.duckdns.org` |
| Resultado | `https://dineroorganizado.duckdns.org/` → 200, `ssl_verify_result=0` |

---

## Troubleshooting rápido

| Síntoma | Causa probable | Acción |
|---|---|---|
| `ERR_CERT_COMMON_NAME_INVALID` (sin puerto) | El dominio cae en el `default_server` del panel (wildcard capuvps) porque no hay vhost propio | Crear el vhost del Paso 3 |
| Chrome bloquea por HSTS tras el fix | HSTS cacheado del cert malo previo | Borrar dominio en `chrome://net-internals/#hsts` |
| Curl externo `000` con curl local `200` | UFW del guest bloquea el puerto, o tramo node→guest no aplica | `ufw allow 80/tcp` (o 443) en el guest, verificar DNAT del nodo |
| `acme.sh: Verify error` | El dominio aún no apunta a la WAN o se está en ZeroSSL | Esperar propagación DNS, pasar `--server letsencrypt` |
| `nginx -t` falla tras escribir vhost | `$host` mal escapado en heredoc o template roto | Revisar el archivo, comparar con vhost funcional (pachucacv) |
| Backend responde con cert del nodo (no del dominio) | Faltan `proxy_ssl_server_name on` + `proxy_ssl_name` | Añadirlos al `location /` (patrón HTTPS) |
| `408 Request Timeout` solo en POST grandes (~68KB+) vía dominio, GET igual tamaño OK | **Ruta asimétrica edge→guest**: el edge (subred `/24`) enruta al guest por el gateway, pero el guest (`/22`) responde directo; el gateway descarta el retorno directo → TCP FIN-WAIT-1 | Añadir ruta `/32` directa en el edge: `ip route replace <guest_ip>/32 dev eth0`; persistir con servicio systemd (ver `route-to-misfinanzas.service`). Caso real: `192.168.1.250` desde edge `192.168.1.34` (IP actual del VPS; antes `192.168.0.198`) |