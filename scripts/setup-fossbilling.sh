#!/bin/bash
# Instala FOSSBilling (panel de clientes/facturacion) en Debian 12.
# Ejecutar como root DENTRO del contenedor LXC del panel.
set -euo pipefail

DB_PASS=$(openssl rand -hex 12)

echo "[1/5] Instalando nginx, PHP 8.2 y MariaDB..."
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  nginx mariadb-server unzip curl openssl \
  php-fpm php-cli php-mysql php-curl php-zip \
  php-xml php-mbstring php-intl php-gd php-opcache

echo "[2/5] Creando base de datos..."
mariadb -e "CREATE DATABASE IF NOT EXISTS fossbilling CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mariadb -e "CREATE USER IF NOT EXISTS 'fossbilling'@'localhost' IDENTIFIED BY '$DB_PASS';"
mariadb -e "GRANT ALL PRIVILEGES ON fossbilling.* TO 'fossbilling'@'localhost'; FLUSH PRIVILEGES;"

echo "[3/5] Descargando FOSSBilling (release estable)..."
mkdir -p /var/www/fossbilling
FB_URL=$(curl -fsSL https://api.github.com/repos/FOSSBilling/FOSSBilling/releases/latest | grep -oP '"browser_download_url":\s*"\K[^"]+\.zip' | head -1)
curl -fsSL -o /tmp/fossbilling.zip "$FB_URL"
unzip -qo /tmp/fossbilling.zip -d /var/www/fossbilling
chown -R www-data:www-data /var/www/fossbilling

echo "[4/5] Configurando nginx..."
cat > /etc/nginx/sites-available/fossbilling <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    root /var/www/fossbilling;
    index index.php;

    client_max_body_size 32m;

    location ~* \.(ini|sh|inc|bak|twig|sql)$ { return 404; }
    location ~* /\. { return 404; }

    location / {
        try_files $uri $uri/ /index.php?_url=$uri&$query_string;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:PHP_SOCK_PLACEHOLDER;
    }
}
NGINX
PHP_SOCK=$(ls /run/php/php*-fpm.sock | head -1)
sed -i "s|PHP_SOCK_PLACEHOLDER|$PHP_SOCK|" /etc/nginx/sites-available/fossbilling
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/fossbilling /etc/nginx/sites-enabled/fossbilling
systemctl reload nginx

echo "[5/5] Listo."
IP=$(hostname -I | awk '{print $1}')
echo "=============================================="
echo " FOSSBilling preparado."
echo " Completa el instalador web en: http://$IP/"
echo " Base de datos: fossbilling"
echo " Usuario DB:    fossbilling"
echo " Password DB:   $DB_PASS"
echo " (guardado tambien en /root/fossbilling-db.txt)"
echo "=============================================="
echo "DB=fossbilling USER=fossbilling PASS=$DB_PASS" > /root/fossbilling-db.txt
chmod 600 /root/fossbilling-db.txt
