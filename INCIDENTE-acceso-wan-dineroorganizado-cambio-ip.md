# Incidente: Acceso WAN roto a `https://dineroorganizado.duckdns.org/`

- **Fecha:** 2026-08-19
- **Servicio afectado:** Mis Finazas — `https://dineroorganizado.duckdns.org/`
- **Síntoma reportado por el usuario:** el acceso por WAN a `https://dineroorganizado.duckdns.org/` dejó de funcionar ("502"). El usuario informa que **el VPS cambió de IP: antes `192.168.0.198`, ahora `192.168.1.250`**.
- **Estado final:** RESUELTO — HTTP **200** con TLS válido (`ssl_verify_result=0`) desde internet.

---

## 1. Causa raíz

El backend de Mis Finazas se **migró de IP** (`192.168.0.198` → `192.168.1.250`), pero el vhost nginx del **edge** (`192.168.1.34`) seguía apuntando al backend con la **IP vieja**:

```nginx
# /etc/nginx/sites-available/dineroorganizado.duckdns.org  (ANTES)
location / {
    proxy_pass http://192.168.0.198;   # ← IP vieja, ya no existe
    ...
}
```

Resultado: nginx resolvía el upstream a `192.168.0.198`, que ya no respondía → **502 Bad Gateway** desde WAN.

**No** fue causa del problema: DNS (resolvía bien a la WAN `207.248.113.8`), pfSense NAT :80/:443 → edge, ni los certificados TLS.

---

## 2. Diagnóstico realizado

### 2.1 Síntoma público
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://dineroorganizado.duckdns.org/
# → 502  (upstream caído)
```

### 2.2 DNS correcto
```bash
nslookup dineroorganizado.duckdns.org
# Address: 207.248.113.8   (WAN de pfSense) ✓
```

### 2.3 Estado del nuevo backend (192.168.1.250)
- `ping 192.168.1.250` → OK (responde desde la LAN).
- Puertos abiertos en `192.168.1.250`: **22 (SSH)** y **80 (HTTP)** → OK.
- `curl http://192.168.1.250/` → **200**, sirve el HTML de "Mis finazas".
- Puertos **443 / 3000 / 8446**: cerrados (no son necesarios; el tramo edge→backend va en HTTP por LAN).

### 2.4 Confusión detectada: había DOS vhosts
En `/etc/nginx/sites-available/` existían dos configuraciones para el dominio:
1. `dineroorganizado.duckdns.org` → `proxy_pass http://192.168.0.198` **(la habilitada, con la IP vieja → causa del 502)**.
2. `dineroorganizado.duckdns.org.bak-502fix` → `proxy_pass https://192.168.1.4:8446` (respaldo de un fix previo, no habilitada).

La configuración habilitada era la del punto 1, por eso el dominio caía.

### 2.5 Ruta /32 del edge también apuntaba a la IP vieja
```bash
# ANTES en el edge (192.168.1.34)
ip route | grep 0.198
# 192.168.0.198 dev eth0 scope link src 192.168.1.34   ← ruta obsoleta

cat /etc/systemd/system/route-to-misfinanzas.service
# ExecStart=/usr/sbin/ip route replace 192.168.0.198/32 dev eth0 src 192.168.1.34
```
La ruta `/32` directa existe para evitar el problema de ruta asimétrica (edge `/24` ↔ backend `/22` por gateway) documentado en `mis-finanzas/Wiki/Hallazgos-Fixes-Sync-Cloud.md`. También apuntaba a la IP vieja.

---

## 3. Solución aplicada (en el edge `192.168.1.34`, acceso `root` con llave `id_ed25519`)

### 3.1 Actualizar el vhost a la nueva IP
```bash
cp /etc/nginx/sites-available/dineroorganizado.duckdns.org \
   /etc/nginx/sites-available/dineroorganizado.duckdns.org.bak-250
sed -i 's|proxy_pass.*http://192.168.0.198|proxy_pass              http://192.168.1.250|' \
   /etc/nginx/sites-available/dineroorganizado.duckdns.org
nginx -t            # → syntax is ok / test is successful
systemctl reload nginx
```

Vhost resultante:
```nginx
location / {
    proxy_pass http://192.168.1.250;   # ← nueva IP del backend
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_read_timeout 60s;
}
```

### 3.2 Actualizar la ruta `/32` y su servicio systemd
```bash
sed -i 's|192.168.0.198|192.168.1.250|g' /etc/systemd/system/route-to-misfinanzas.service
ip route replace 192.168.1.250/32 dev eth0 src 192.168.1.34
systemctl daemon-reload
systemctl restart route-to-misfinanzas.service
ip route del 192.168.0.198/32 dev eth0 src 192.168.1.34 2>/dev/null   # limpieza ruta vieja
```

Estado final de rutas en el edge:
```
192.168.1.250 dev eth0 scope link src 192.168.1.34
```

---

## 4. Verificación end-to-end

| Prueba | Comando | Resultado |
|---|---|---|
| Edge → backend | `curl http://192.168.1.250/` | **200** |
| Edge → vhost (SNI local) | `curl -k https://127.0.0.1/ -H "Host: dineroorganizado.duckdns.org"` | **200** |
| **WAN (público)** | `curl https://dineroorganizado.duckdns.org/` | **200, `ssl_verify_result=0`** |
| Contenido servido | `curl -sk https://dineroorganizado.duckdns.org/ | grep <title>` | `<title>Mis finazas</title>` ✓ |

---

## 5. Lecciones aprendidas

1. **Tras migrar/cambiar la IP de un VPS, actualizar los vhosts nginx del edge** (y cualquier ruta `/32` y servicio systemd asociado). Es el punto de falla típico: el DNS y pfSense quedan bien, pero el edge sigue apuntando al upstream viejo → 502.
2. El patrón de servicio es: **WAN:80/443 → pfSense → edge 192.168.1.34 → `proxy_pass` → backend** (ahora `http://192.168.1.250`, HTTP plano por LAN; TLS solo en el edge).
3. Al diagnosticar un 502, verificar **primero el `proxy_pass` del vhost** en el edge, no solo DNS/NAT/certificados.
4. Existen respaldos `.bak-*` en el edge que pueden confundir (dos configs del mismo dominio); la **habilitada** es la de `/etc/nginx/sites-enabled/`.

---

## 6. Archivos/documentos actualizados

- `C:\vpsserver\procedures\acceso-dominio-https.md` → caso real ahora refiere a `192.168.1.250`.
- `C:\vpsserver\mis-finanzas\Wiki\Hallazgos-Fixes-Sync-Cloud.md` → rutas `/32` y ejemplos actualizados a `192.168.1.250`.
- Este archivo: `C:\vpsserver\INCIDENTE-acceso-wan-dineroorganizado-cambio-ip.md`.