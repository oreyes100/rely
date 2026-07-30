# Procedimiento: publicar VM de cliente con HTTPS

Aplica cada vez que se activa un nuevo VPS de cliente en la infraestructura CECyTEM
y se necesita exponerlo al internet con dominio propio y certificado válido.

---

## Variables del procedimiento

| Variable | Ejemplo | Descripción |
|---|---|---|
| `VMID` | `211` | ID de la VM en Proxmox |
| `VM_IP` | `192.168.6.136` | IP interna en VLAN 6 |
| `SSH_WAN_PORT` | `22211` | `22000 + VMID` |
| `WEB_WAN_PORT` | `8211` | `8000 + VMID` |
| `FQDN` | `congregaciontj.duckdns.org` | Dominio del cliente |
| `HOSTNAME` | `micongre` | Nombre del proyecto/hostname |
| `NODE_IP` | `192.168.1.4` | IP LAN del nodo Proxmox |
| `WAN_IP` | `207.248.113.8` | IP pública del enlace |

---

## Paso 1 — pfSense: reglas NAT WAN → pve

> Entrar a pfSense en `https://192.168.1.1` → **Firewall > NAT > Port Forward**

Agregar dos reglas (una para SSH, otra para web):

| Campo | Regla SSH | Regla web |
|---|---|---|
| Interface | WAN | WAN |
| Protocol | TCP | TCP |
| Dest. port range | `SSH_WAN_PORT` | `WEB_WAN_PORT` |
| Redirect target IP | `192.168.1.4` (pve) | `192.168.1.4` (pve) |
| Redirect target port | `SSH_WAN_PORT` | `WEB_WAN_PORT` |
| Description | `ssh-vmVMID` | `web-vmVMID` |

Guardar y aplicar. Verificar que aparecen en `pfctl -s nat | grep VMID` desde la consola de pfSense.

> **NUNCA reiniciar pfSense ni pvececyte.** Si el cambio no aplica, ejecutar desde la consola PHP:
> ```php
> require_once('filter.inc'); parse_config(true); filter_configure_sync();
> ```

---

## Paso 2 — pve: reglas iptables DNAT (persistentes)

Conectarse a pve (`ssh root@192.168.1.4`) y ejecutar:

```bash
# DNAT SSH
iptables -t nat -A PREROUTING -p tcp --dport 22211 -j DNAT --to 192.168.6.136:22
iptables -t nat -A POSTROUTING -p tcp -d 192.168.6.136 --dport 22 -j MASQUERADE

# DNAT web
iptables -t nat -A PREROUTING -p tcp --dport 8211 -j DNAT --to 192.168.6.136:80
iptables -t nat -A POSTROUTING -p tcp -d 192.168.6.136 --dport 80 -j MASQUERADE

# Persistir
netfilter-persistent save
```

Verificar:

```bash
iptables -t nat -L PREROUTING -n | grep 8211
iptables -t nat -L PREROUTING -n | grep 22211
```

---

## Paso 3 — pve: egreso VLAN 6 a internet (solo si no está aplicado)

Este paso es **global** — solo se hace una vez por nodo, no por VM.
Verificar primero si ya existe:

```bash
iptables -t nat -L PREROUTING -n --line-numbers | head -3
```

Si la línea 1 **no** es `RETURN all -- 192.168.6.0/24 0.0.0.0/0`, aplicar:

```bash
# Evitar que VLAN6 caiga en DNAT de otros servicios al salir
iptables -t nat -I PREROUTING 1 -s 192.168.6.0/24 -j RETURN

# MASQUERADE para salida a internet desde VLAN6
iptables -t nat -I POSTROUTING 1 -s 192.168.6.0/24 ! -d 192.168.6.0/24 -j MASQUERADE

netfilter-persistent save
```

Prueba desde dentro de la VM:

```bash
curl -s https://ifconfig.me   # debe devolver 207.248.113.8
```

---

## Paso 4 — VM: preparar el servidor

Conectarse via SSH al pve y usar el guest agent, o directamente si SSH ya funciona:

```bash
ssh -p 22211 devops@207.248.113.8
```

### 4a — Deshabilitar nginx del host si existe

El nginx del host compite con Docker en el puerto 80:

```bash
systemctl stop nginx
systemctl mask nginx   # mask, no disable: evita que arrange en cualquier circunstancia
```

### 4b — Subir y levantar la app con Docker Compose

```bash
mkdir -p /opt/app
# Copiar docker-compose.yml (scp o git clone)
cd /opt/app
docker compose up -d
docker ps   # verificar que los contenedores están Up
```

### 4c — Auto-start al reiniciar (systemd)

```bash
cat > /etc/systemd/system/app-compose.service <<'EOF'
[Unit]
Description=App Docker Compose
After=docker.service
Requires=docker.service

[Service]
WorkingDirectory=/opt/app
ExecStart=/usr/bin/docker compose up
ExecStop=/usr/bin/docker compose down
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable app-compose
```

---

## Paso 5 — Panel: registrar subdominio de plataforma

En el servidor del panel (`ssh root@192.168.1.34`):

```bash
panel-vhost add-app micongre 192.168.1.4 8211
```

Esto crea `micongre.capuvps.duckdns.org` con el wildcard cert compartido.
Verificar: `curl -I https://micongre.capuvps.duckdns.org/`

---

## Paso 6 — Dominio personalizado del cliente (opcional)

### 6a — El cliente apunta su DNS

El cliente debe crear un registro A en su proveedor DNS:

```
Tipo: A
Nombre: @ (o el subdominio)
Valor: 207.248.113.8
TTL: 300
```

Verificar propagación:

```bash
dig +short congregaciontj.duckdns.org A
# debe devolver: 207.248.113.8
```

### 6b — Agregar vhost en el panel

```bash
panel-vhost add congregaciontj.duckdns.org 192.168.1.4 8211
```

Esto crea el vhost con certificado autofirmado temporal y el bloque puerto 80 para ACME.

### 6c — Emitir certificado Let's Encrypt

Esperar a que el DNS propague (5–60 min), luego:

```bash
panel-vhost issue-cert congregaciontj.duckdns.org
```

El certificado es válido 90 días. acme.sh programa la renovación automática (~60 días).

Verificar:

```bash
curl -I https://congregaciontj.duckdns.org/
openssl x509 -in /etc/nginx/ssl/congregaciontj.duckdns.org/fullchain.pem -noout -dates
```

---

## Paso 7 — Verificación final

```bash
# Desde cualquier máquina exterior:

# 1. SSH al VPS del cliente
ssh -p 22211 devops@207.248.113.8

# 2. Subdominio de plataforma
curl -sI https://micongre.capuvps.duckdns.org/ | head -2

# 3. Dominio personalizado
curl -sI https://congregaciontj.duckdns.org/ | head -2

# 4. Docker dentro de la VM (via guest agent desde pve):
# qm guest exec VMID -- docker ps
```

> **Nota sobre ping:** pfSense descarta ICMP en el WAN por defecto.
> El ping a `207.248.113.8` siempre va a fallar — eso es correcto y no indica problema.

---

## Referencia rápida de puertos

| Puerto WAN | Destino | Uso |
|---|---|---|
| `22000 + VMID` | `VM_IP:22` | SSH del cliente |
| `8000 + VMID` | `VM_IP:80` | Web de la app |
| `80` | panel nginx | ACME challenges + redirect HTTPS |
| `443` | panel nginx | HTTPS de todos los dominios gestionados |

---

## Problemas frecuentes

### Docker no puede hacer pull (timeout en apt/pip/npm también)

La VLAN6 no llega a internet. Aplicar **Paso 3** (egreso VLAN6).
Síntoma diagnóstico: `conntrack -L | grep 192.168.6` muestra rutas inversas inesperadas.

### nginx del panel no recarga tras `panel-vhost add`

```bash
nginx -t && systemctl reload nginx
```

### acme.sh falla con "Could not get nonce"

acme.sh usa ZeroSSL por defecto desde v3. Pasar explícitamente:

```bash
/root/.acme.sh/acme.sh --issue -w /var/www/acme -d FQDN --server letsencrypt --force
```

### pfSense no aplica el NAT tras guardar

Ejecutar desde la consola PHP de pfSense (Diagnostics > Command Prompt):

```php
require_once('filter.inc'); parse_config(true); filter_configure_sync();
```

### Puerto WAN abierto pero SSH da "Connection refused"

El nginx del host está tomando el puerto 80 dentro de la VM — ver **Paso 4a**.
O los contenedores Docker no arrancaron — ver `docker ps` y `docker compose up -d`.
