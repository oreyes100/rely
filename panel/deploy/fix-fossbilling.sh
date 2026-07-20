#!/bin/bash
# Diagnóstico y corrección de FossBilling 502 Bad Gateway
# Ejecutar como root en 192.168.1.34
set -euo pipefail

echo "=== Diagnóstico FossBilling 502 ==="

echo "--- nginx config fossbilling ---"
grep -r fossbilling /etc/nginx/sites-enabled/ 2>/dev/null || echo "NO HAY bloque fossbilling en sites-enabled"

echo "--- LXC containers ---"
pct list 2>/dev/null | grep -i "fossbill\|billing\|php" || echo "Busca el VMID del LXC manualmente con: pct list"

echo "--- Probar upstream ---"
UPSTREAM=$(grep -oP 'proxy_pass\s+http://\K[^/;]+' /etc/nginx/sites-enabled/* 2>/dev/null | grep -v '127.0.0.1:3001' | head -1 || true)
if [ -n "$UPSTREAM" ]; then
  echo "Upstream detectado: $UPSTREAM"
  curl -sv --connect-timeout 3 "http://$UPSTREAM/" 2>&1 | head -20 || echo "No responde"
else
  echo "No se encontró upstream fossbilling en la config de nginx"
fi

echo ""
echo "=== Para reparar: ==="
echo ""
echo "1. Obtener IP del LXC de FossBilling:"
echo "   pct list"
echo "   pct config <VMID>   # buscar 'ip=' en la línea net0"
echo ""
echo "2. Verificar que el LXC está corriendo:"
echo "   pct status <VMID>"
echo "   pct start <VMID>  # si está detenido"
echo ""
echo "3. Verificar nginx y PHP dentro del LXC:"
echo "   pct exec <VMID> -- systemctl status nginx php8.2-fpm"
echo "   pct exec <VMID> -- systemctl restart nginx php8.2-fpm"
echo ""
echo "4. Actualizar nginx en el panel (si el bloque no existe o tiene IP incorrecta):"
cat <<'NGINX_BLOCK'
# Agregar DENTRO del server block de capuvps.duckdns.org en /etc/nginx/sites-enabled/vps-panel:

    location /fossbilling/ {
        proxy_pass http://<IP_LXC_FOSSBILLING>/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 60s;
    }
NGINX_BLOCK
echo ""
echo "5. Aplicar: nginx -t && nginx -s reload"
