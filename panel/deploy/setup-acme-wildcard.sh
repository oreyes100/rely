#!/bin/bash
# setup-acme-wildcard.sh
# Ejecutar en el servidor de borde (192.168.1.34) como root.
# Configura acme.sh con DNS-01 DuckDNS para emitir:
#   - capuvps.duckdns.org         (landing + panel)
#   - *.capuvps.duckdns.org       (apps de clientes)
#   - pachucacv.duckdns.org       (si aplica)
#
# Uso:
#   export DUCKDNS_TOKEN="tu-token-aqui"
#   bash setup-acme-wildcard.sh

set -euo pipefail

: "${DUCKDNS_TOKEN:?Falta DUCKDNS_TOKEN}"

ACME="$HOME/.acme.sh/acme.sh"
NGINX_SSL="/etc/nginx/ssl"
EMAIL="admin@capuvps.local"

# ── 1. Instalar/actualizar acme.sh ────────────────────────────────────────────
if [ ! -f "$ACME" ]; then
  echo "==> Instalando acme.sh..."
  curl -fsSL https://get.acme.sh | sh -s email="$EMAIL"
  source "$HOME/.bashrc" 2>/dev/null || true
fi

echo "==> acme.sh version: $($ACME --version 2>&1 | head -1)"

# ── 2. Registrar cuenta con Let's Encrypt (ACME v2) ──────────────────────────
"$ACME" --register-account -m "$EMAIL" 2>/dev/null || true

# ── 3. Configurar credencial DuckDNS ─────────────────────────────────────────
export DuckDNS_Token="$DUCKDNS_TOKEN"

# Guardar en el entorno de acme.sh para renovaciones automáticas
"$ACME" --set-default-ca --server letsencrypt

# ── 4a. Emitir cert wildcard *.capuvps.duckdns.org ───────────────────────────
# NOTA: DuckDNS solo soporta UN registro TXT por dominio; NO emitir apex+wildcard juntos.
# El cert wildcard cubre todos los subdominios (apps de clientes).
# El apex capuvps.duckdns.org necesita un cert separado (paso 4b).
echo ""
echo "==> Emitiendo cert wildcard *.capuvps.duckdns.org ..."
"$ACME" --issue \
  --dns dns_duckdns \
  -d '*.capuvps.duckdns.org' \
  --force 2>&1

mkdir -p "${NGINX_SSL}/wildcard-capuvps"
"$ACME" --install-cert \
  -d capuvps.duckdns.org \
  --fullchain-file "${NGINX_SSL}/wildcard-capuvps/fullchain.pem" \
  --key-file       "${NGINX_SSL}/wildcard-capuvps/key.pem" \
  --reloadcmd      "systemctl reload nginx"

echo "==> Wildcard cert instalado en ${NGINX_SSL}/wildcard-capuvps/"

# ── 4b. Emitir cert para el apex capuvps.duckdns.org ─────────────────────────
# El apex necesita un cert separado porque el wildcard no lo cubre.
echo ""
echo "==> Emitiendo cert para el apex capuvps.duckdns.org ..."
"$ACME" --issue \
  --dns dns_duckdns \
  -d capuvps.duckdns.org \
  --force 2>&1

mkdir -p "${NGINX_SSL}/capuvps.duckdns.org"
"$ACME" --install-cert \
  -d capuvps.duckdns.org \
  --fullchain-file "${NGINX_SSL}/capuvps.duckdns.org/fullchain.pem" \
  --key-file       "${NGINX_SSL}/capuvps.duckdns.org/key.pem" \
  --reloadcmd      "systemctl reload nginx"

echo "==> Cert apex instalado en ${NGINX_SSL}/capuvps.duckdns.org/"

# ── 6. Verificar que el vhost del panel usa el cert correcto ─────────────────
if grep -q "wildcard-capuvps" /etc/nginx/sites-available/capuvps.duckdns.org 2>/dev/null; then
  echo "==> Vhost del panel ya usa el cert wildcard."
else
  echo "==> Actualizando vhost del panel para usar cert wildcard..."
  # El panel-vhost ya gestiona esto; solo recargar nginx
  nginx -t && systemctl reload nginx
fi

# ── 7. Cron automático (acme.sh lo agrega solo al instalar, verificar) ───────
echo ""
echo "==> Cron de renovación automática:"
crontab -l 2>/dev/null | grep acme || echo "  (no encontrado — acme.sh debería haberlo agregado al instalar)"
echo ""
echo "==> Para forzar renovación manual:"
echo "    DuckDNS_Token=\$DUCKDNS_TOKEN $ACME --renew -d capuvps.duckdns.org --force"
echo ""
echo "==> Verificar cert con:"
echo "    openssl x509 -in ${NGINX_SSL}/wildcard-capuvps/fullchain.pem -noout -text | grep -E 'DNS:|Not After'"
echo ""
echo "Done ✓"
