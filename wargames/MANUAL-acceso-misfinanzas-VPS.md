# Acceso VPS misfinanzas (VMID 300 / pvececyte)

> Estado: PRODUCCIÓN activa. Deploy completado 2026-07-19.

## Datos de acceso

| Dato | Valor |
|------|-------|
| VMID | 300 en pvececyte (192.168.1.254) |
| IP interna VPS | 192.168.7.186 (reserva DHCP) |
| Usuario | devops |
| SSH externo | `ssh -p 2300 devops@207.248.113.8` |
| SSH interno (ProxyJump) | `ssh -i ~/.ssh/id_ed25519 -o ProxyJump="root@192.168.1.254" devops@192.168.7.186` |
| URL pública | https://pachucacv.duckdns.org:8443/ |
| Contraseña devops | (ver gestor de contraseñas — REDACTADO) |

## Topología de red

```
Internet
  ↓
pfSense WAN (207.248.113.8)
  ↓  NAT: WAN:8443 → pvececyte:8443
      NAT: WAN:2300 → pvececyte:2300
pvececyte (192.168.1.254)
  ↓  iptables DNAT: :8443 → 192.168.7.186:443
      iptables DNAT: :2300 → 192.168.7.186:22
VPS misfinanzas (192.168.7.186)
  ↓  nginx :443 → 127.0.0.1:4321
Astro app (Docker)
```

## Stack en el VPS

```
~/pachuca-landing/
├── Dockerfile          # pnpm@10.6.1, node:lts, Astro SSR
├── compose.yaml        # web (puerto 4321) + mongo:7
└── ...                 # código fuente de la landing
```

- **App**: Astro 5 SSR con `@astrojs/node` standalone, React 19, Tailwind 4
- **DB**: MongoDB 7 en contenedor Docker (volumen `mongo-data`, base `pcv`)
- **Archivos**: Cloudflare R2 (deshabilitado; variables R2_* no configuradas)
- **TLS**: ZeroSSL vía acme.sh DNS-01 (auto-renew configurado en cron de root)
- **nginx**: 1.24, reverse proxy en 443, cert en `/etc/nginx/ssl/pachucacv.duckdns.org/`
- **DuckDNS**: pachucacv.duckdns.org → 207.248.113.8

## Comandos útiles en el VPS

```bash
# Ver estado contenedores
cd ~/pachuca-landing && sudo docker compose ps

# Ver logs de la app
sudo docker compose logs -f web

# Rebuild (tras cambios de código)
sudo docker compose build --no-cache
sudo docker compose up -d

# Renovar cert manualmente (acme.sh auto-renueva cada 60 días)
sudo /root/.acme.sh/acme.sh --renew -d pachucacv.duckdns.org

# Nginx
sudo nginx -t && sudo systemctl restart nginx
sudo systemctl status nginx
```

## Operaciones en pvececyte (gestión DHCP/NAT)

```bash
ssh -i ~/.ssh/id_ed25519 root@192.168.1.254

# Ver reglas iptables activas
iptables -t nat -L PREROUTING -n --line-numbers

# Verificar lease DHCP de la VPS
cat /var/lib/misc/dnsmasq.leases | grep 192.168.7.186
```

## Verificación rápida end-to-end

```bash
# Desde cualquier máquina con internet:
curl -s https://pachucacv.duckdns.org:8443/ | grep '<title>'
# Esperado: <title>Pachuca Central Valley</title>

# SSH externo:
ssh -p 2300 devops@207.248.113.8
```
