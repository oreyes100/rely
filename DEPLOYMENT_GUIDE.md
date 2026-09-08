# 📋 Guía Completa de Despliegue - RELY POS v2.1

> **Sistema:** Pozolería, Tacos y Enchiladas  
> **Versión:** 2.1 (FastAPI + SQLite + Seguridad Mejorada)  
> **Última actualización:** Septiembre 2026

---

## 📑 Tabla de Contenidos

1. [Resumen del Proyecto](#1-resumen-del-proyecto)
2. [Arquitectura Técnica](#2-arquitectura-técnica)
3. [Mejoras Implementadas en v2.1](#3-mejoras-implementadas-en-v21)
4. [Requisitos del Servidor VPS](#4-requisitos-del-servidor-vps)
5. [Preparación Local Antes del Despliegue](#5-preparación-local-antes-del-despliegue)
6. [Despliegue en VPS con Docker (Recomendado)](#6-despliegue-en-vps-con-docker-recomendado)
7. [Despliegue en VPS sin Docker](#7-despliegue-en-vps-sin-docker)
8. [Configuración de Nginx como Reverse Proxy](#8-configuración-de-nginx-como-reverse-proxy)
9. [Certificado SSL con Let's Encrypt](#9-certificado-ssl-con-lets-encrypt)
10. [Script Automatizado de Despliegue](#10-script-automatizado-de-despliegue)
11. [Comandos de Administración Post-Despliegue](#11-comandos-de-administración-post-despliegue)
12. [Backup y Recuperación](#12-backup-y-recuperación)
13. [Solución de Problemas](#13-solución-de-problemas)
14. [Checklist de Producción](#14-checklist-de-producción)

---

## 1. Resumen del Proyecto

RELY POS es un sistema de Punto de Venta web diseñado para restaurantes de comida mexicana. Funciona como una PWA (Progressive Web App) accesible desde cualquier dispositivo en la red local o internet.

### Características Principales
- ✅ Multi-rol: Administrador, Cajera, Mesero, Cocinero
- ✅ Pantalla KDS (Kitchen Display System) con notificaciones en tiempo real
- ✅ Gestión de mesas, comandas y menú complejo (mezclador de rellenos)
- ✅ Impresión térmica 80mm nativa
- ✅ Contabilidad con abonos parciales y reportes por fecha
- ✅ Base de datos de clientes para pedidos a domicilio
- ✅ PIN Maestro de respaldo (`1234`)

---

## 2. Arquitectura Técnica

```
┌─────────────────────────────────────────────────────┐
│                   DISPOSITIVOS                       │
│  Tablet (Mesero) │ PC (Caja) │ Teléfono │ Cocina    │
└────────┬────────────────┬──────────────┬────────────┘
         │                │              │
         ▼                ▼              ▼
┌─────────────────────────────────────────────────────┐
│              NGINX (Reverse Proxy)                    │
│         Puerto 80/443 + SSL/TLS                      │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│           FASTAPI + UVICORN (Backend)                 │
│              Puerto 8000 (interno)                    │
│                                                       │
│  • API REST (/api/state, /api/login, /api/users/*)   │
│  • Archivos estáticos (HTML/CSS/JS/PWA)              │
│  • Autenticación con hash PBKDF2                     │
│  • CORS configurado                                  │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│              SQLITE (Base de Datos)                   │
│         /app/data/rely_pos.db                         │
│                                                       │
│  • Modo WAL (Write-Ahead Logging)                    │
│  • Transacciones atómicas                            │
│  • Volumen persistente (Docker)                      │
└─────────────────────────────────────────────────────┘
```

### Stack Tecnológico
| Componente | Tecnología | Versión |
|------------|-----------|---------|
| Backend | FastAPI + Uvicorn | Python 3.12 |
| Base de Datos | SQLite3 | Nativo |
| Frontend | HTML5 + CSS3 + Vanilla JS | ES6+ |
| Servidor Web | Nginx | 1.24+ |
| Contenedorización | Docker + Docker Compose | 24+ |
| SSL | Let's Encrypt / Certbot | Automático |
| OS Servidor | Ubuntu 22.04/24.04 LTS | Recomendado |

---

## 3. Mejoras Implementadas en v2.1

### 3.1 Base de Datos SQLite (Transaccional)
**Antes:** Archivo `db.json` propenso a corrupción por cortes de luz.  
**Ahora:** SQLite con modo WAL y transacciones atómicas.

- Ruta configurable vía variable de entorno `DB_PATH`
- Migración automática desde `db.json` existente
- Backups automáticos durante la migración

### 3.2 Seguridad de Contraseñas (Hashing)
**Antes:** PINs en texto plano visibles en la red.  
**Ahora:** Hash PBKDF2-HMAC-SHA256 con sal única por usuario.

- Los PINs nunca se almacenan ni transmiten en texto plano
- Endpoint `/api/login` verifica credenciales en el servidor
- Interfaz muestra `**** (Encriptado)` en lugar de PINs reales
- PIN Maestro `1234` sigue funcionando como respaldo

### 3.3 Servidor Web Profesional
**Antes:** `http.server` de Python (experimental, no apto para producción).  
**Ahora:** FastAPI + Uvicorn (ASGI de alto rendimiento).

- Soporte para concurrencia real
- Manejo robusto de errores y logging
- Watchdog con auto-reinicio y detección de puertos ocupados
- Documentación automática en `/docs`

### 3.4 Infraestructura de Despliegue
- `Dockerfile` optimizado con healthcheck
- `docker-compose.yml` con volumen persistente
- `.dockerignore` para imágenes limpias
- `deploy.sh` para despliegue automatizado vía SSH

---

## 4. Requisitos del Servidor VPS

### Mínimos
| Recurso | Valor | Nota |
|---------|-------|------|
| CPU | 1 vCPU | Suficiente para <50 usuarios simultáneos |
| RAM | 1 GB | El sistema consume ~100-200 MB |
| Disco | 10 GB SSD | La BD crece lentamente (~1-5 MB/mes) |
| OS | Ubuntu 22.04/24.04 LTS | O Debian 12 |
| Red | Puerto 80 y 443 abiertos | Para HTTP/HTTPS |

### Recomendados
| Recurso | Valor | Nota |
|---------|-------|------|
| CPU | 2 vCPU | Mejor rendimiento en horas pico |
| RAM | 2 GB | Margen para Nginx + Docker + backups |
| Disco | 20 GB SSD | Espacio para logs y backups |
| Ancho de banda | 1 TB/mes | Más que suficiente para POS |

### Proveedores Recomendados
- **Hetzner Cloud** (CX22: €3.79/mes) — Mejor precio/rendimiento
- **DigitalOcean** (Basic $6/mes) — Fácil de usar
- **Vultr** (Cloud Compute $6/mes) — Buena latencia LATAM
- **Contabo** (Cloud S €4.99/mes) — Más recursos por precio

---

## 5. Preparación Local Antes del Despliegue

### 5.1 Verificar que todo funcione localmente
```bash
cd "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2"

# Ejecutar localmente
./INICIAR_RELY.command

# Probar en navegador: http://localhost:8000
# Verificar login, pedidos, cocina, impresión
```

### 5.2 Configurar CORS para producción
Edita `server.py` y cambia la línea de CORS:

```python
# ANTES (desarrollo local):
allow_origins=["*"]

# DESPUÉS (producción con dominio):
allow_origins=["https://rely.tudominio.com"]

# O si usas IP directa sin dominio:
allow_origins=["http://TU_IP_PUBLICA"]
```

> ⚠️ **Importante:** Si planeas acceder tanto por dominio como por IP, agrega ambos orígenes.

### 5.3 Verificar archivos necesarios
Asegúrate de tener estos archivos en tu carpeta local:

```
Restaurantes v2/
├── server.py              ✅ Backend FastAPI
├── app.js                 ✅ Frontend
├── index.html             ✅ Página principal
├── manifest.json          ✅ PWA manifest
├── migrate_to_sqlite.py   ✅ Script de migración
├── run.py                 ✅ Watchdog local
├── requirements.txt       ✅ Dependencias Python
├── Dockerfile             ✅ Imagen Docker
├── docker-compose.yml     ✅ Orquestación
├── .dockerignore          ✅ Exclusiones Docker
├── deploy.sh              ✅ Script de despliegue
├── db.json                ✅ Datos actuales (opcional subir)
└── rely_pos.db            ✅ BD SQLite (opcional subir)
```

### 5.4 Generar clave SSH (si no tienes)
```bash
ssh-keygen -t ed25519 -C "rely-pos-deploy"
ssh-copy-id root@TU_IP_VPS
```

---

## 6. Despliegue en VPS con Docker (Recomendado)

### Paso 1: Preparar el servidor VPS

Conéctate a tu VPS e instala Docker:

```bash
ssh root@TU_IP_VPS

# Actualizar sistema
apt update && apt upgrade -y

# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Instalar Docker Compose plugin
apt install docker-compose-plugin -y

# Verificar instalación
docker --version
docker compose version

# Crear directorio del proyecto
mkdir -p /opt/rely-pos/data
```

### Paso 2: Subir archivos al servidor

**Opción A: Con rsync (recomendado)**
```bash
# Desde tu Mac local
rsync -avz --progress \
  --exclude='venv' \
  --exclude='.git' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='.DS_Store' \
  --exclude='rely_pos.db' \
  --exclude='db.json' \
  --exclude='INICIAR_RELY.command' \
  --exclude='EJECUTAR_POS.bat' \
  --exclude='TROUBLESHOOTING.md' \
  "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2/" \
  root@TU_IP_VPS:/opt/rely-pos/
```

**Opción B: Con scp**
```bash
scp -r "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2/"* \
  root@TU_IP_VPS:/opt/rely-pos/
```

### Paso 3: Subir base de datos (opcional)

Si quieres conservar tus datos actuales:

```bash
# Subir db.json (se migrará automáticamente en el contenedor)
scp "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2/db.json" \
  root@TU_IP_VPS:/opt/rely-pos/data/

# O subir rely_pos.db directamente si ya migraste
scp "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2/rely_pos.db" \
  root@TU_IP_VPS:/opt/rely-pos/data/
```

### Paso 4: Construir y levantar el contenedor

```bash
ssh root@TU_IP_VPS
cd /opt/rely-pos

# Construir imagen
docker compose build

# Levantar en segundo plano
docker compose up -d

# Verificar estado
docker compose ps

# Ver logs
docker compose logs -f
```

### Paso 5: Verificar acceso

```bash
# Desde el servidor
curl http://localhost:8000

# Desde tu navegador
# http://TU_IP_VPS:8000
```

---

## 7. Despliegue en VPS sin Docker

### Paso 1: Preparar el servidor

```bash
ssh root@TU_IP_VPS

# Instalar Python 3.12 y dependencias
apt update && apt upgrade -y
apt install python3 python3-pip python3-venv nginx -y

# Crear directorio
mkdir -p /opt/rely-pos/data
```

### Paso 2: Subir archivos

```bash
# Igual que en la sección 6, Paso 2
rsync -avz --exclude='venv' --exclude='.git' ... \
  root@TU_IP_VPS:/opt/rely-pos/
```

### Paso 3: Configurar entorno virtual

```bash
ssh root@TU_IP_VPS
cd /opt/rely-pos

# Crear venv
python3 -m venv venv
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Migrar base de datos (si subiste db.json)
if [ -f data/db.json ]; then
  cp data/db.json .
  python3 migrate_to_sqlite.py
  mv rely_pos.db data/
  rm db.json
fi
```

### Paso 4: Crear servicio systemd

```bash
cat > /etc/systemd/system/rely-pos.service << 'EOF'
[Unit]
Description=RELY POS Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/rely-pos
Environment=DB_PATH=/opt/rely-pos/data/rely_pos.db
Environment=PORT=8000
ExecStart=/opt/rely-pos/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8000 --workers 1
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# Habilitar y arrancar
systemctl daemon-reload
systemctl enable rely-pos
systemctl start rely-pos

# Verificar estado
systemctl status rely-pos
```

---

## 8. Configuración de Nginx como Reverse Proxy

### Paso 1: Crear configuración

```bash
ssh root@TU_IP_VPS

cat > /etc/nginx/sites-available/rely-pos << 'EOF'
server {
    listen 80;
    server_name rely.tudominio.com TU_IP_VPS;

    # Seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 256;

    # Static files cache
    location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        root /opt/rely-pos;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # PWA manifest
    location = /manifest.json {
        root /opt/rely-pos;
        add_header Cache-Control "no-cache";
    }

    # API and app proxy
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support (para futuras mejoras)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Logs
    access_log /var/log/nginx/rely-pos-access.log;
    error_log /var/log/nginx/rely-pos-error.log;
}
EOF
```

### Paso 2: Activar sitio

```bash
ln -sf /etc/nginx/sites-available/rely-pos /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Verificar configuración
nginx -t

# Reiniciar Nginx
systemctl restart nginx
```

---

## 9. Certificado SSL con Let's Encrypt

### Paso 1: Instalar Certbot

```bash
apt install certbot python3-certbot-nginx -y
```

### Paso 2: Obtener certificado

```bash
# Reemplaza con tu dominio real
certbot --nginx -d rely.tudominio.com

# Seguir las instrucciones interactivas
# - Ingresa email
# - Acepta términos
# - Redirección HTTP→HTTPS automática
```

### Paso 3: Verificar renovación automática

```bash
# Probar renovación
certbot renew --dry-run

# El cron se configura automáticamente:
# /etc/cron.d/certbot → renueva cada 12 horas
```

### Paso 4: Verificar HTTPS

Abre en tu navegador: `https://rely.tudominio.com`

Deberías ver el candado 🔒 y el sistema funcionando.

---

## 10. Script Automatizado de Despliegue

El archivo `deploy.sh` incluido en el proyecto automatiza todo el proceso:

```bash
cd "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2"

# Dar permisos
chmod +x deploy.sh

# Ejecutar
./deploy.sh root@TU_IP_VPS /opt/rely-pos
```

### Lo que hace el script:
1. ✅ Verifica conexión SSH
2. ✅ Verifica archivos locales necesarios
3. ✅ Crea directorios en el servidor
4. ✅ Sube archivos con rsync (excluye venv, .git, etc.)
5. ✅ Pregunta si quieres subir db.json/rely_pos.db
6. ✅ Instala Docker si no está presente
7. ✅ Construye imagen Docker
8. ✅ Levanta contenedor con reinicio automático
9. ✅ Muestra URL de acceso y comandos útiles

---

## 11. Comandos de Administración Post-Despliegue

### Con Docker

| Acción | Comando |
|--------|---------|
| Ver estado | `docker compose ps` |
| Ver logs en tiempo real | `docker compose logs -f` |
| Ver últimos 100 logs | `docker compose logs --tail=100` |
| Reiniciar servicio | `docker compose restart` |
| Detener servicio | `docker compose down` |
| Arrancar servicio | `docker compose up -d` |
| Reconstruir imagen | `docker compose up -d --build` |
| Entrar al contenedor | `docker compose exec rely-pos bash` |
| Ver uso de recursos | `docker stats rely-pos` |

### Sin Docker (systemd)

| Acción | Comando |
|--------|---------|
| Ver estado | `systemctl status rely-pos` |
| Ver logs | `journalctl -u rely-pos -f` |
| Reiniciar | `systemctl restart rely-pos` |
| Detener | `systemctl stop rely-pos` |
| Arrancar | `systemctl start rely-pos` |
| Habilitar auto-inicio | `systemctl enable rely-pos` |

### Actualización del Sistema

```bash
# 1. Subir nuevos archivos
rsync -avz --exclude='venv' --exclude='.git' --exclude='data' \
  "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2/" \
  root@TU_IP_VPS:/opt/rely-pos/

# 2. Reconstruir (Docker)
ssh root@TU_IP_VPS 'cd /opt/rely-pos && docker compose up -d --build'

# O reiniciar (systemd)
ssh root@TU_IP_VPS 'systemctl restart rely-pos'
```

---

## 12. Backup y Recuperación

### Backup Automático (cron)

```bash
ssh root@TU_IP_VPS

# Crear script de backup
cat > /opt/rely-pos/backup.sh << 'SCRIPT'
#!/bin/bash
BACKUP_DIR="/opt/rely-pos/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Copia de seguridad de SQLite
cp /opt/rely-pos/data/rely_pos.db "$BACKUP_DIR/rely_pos_$DATE.db"

# Mantener solo los últimos 30 backups
ls -t "$BACKUP_DIR"/rely_pos_*.db | tail -n +31 | xargs rm -f

echo "Backup creado: rely_pos_$DATE.db"
SCRIPT

chmod +x /opt/rely-pos/backup.sh

# Programar backup diario a las 3 AM
echo "0 3 * * * /opt/rely-pos/backup.sh >> /var/log/rely-backup.log 2>&1" | crontab -
```

### Backup Manual

```bash
# Desde el servidor
cp /opt/rely-pos/data/rely_pos.db /opt/rely-pos/data/backup_manual_$(date +%Y%m%d).db

# Descargar a tu Mac
scp root@TU_IP_VPS:/opt/rely-pos/data/rely_pos.db ~/Desktop/rely_backup_$(date +%Y%m%d).db
```

### Restaurar Backup

```bash
# Detener servicio
docker compose down  # o systemctl stop rely-pos

# Restaurar
cp /opt/rely-pos/backups/rely_pos_20260906_030000.db /opt/rely-pos/data/rely_pos.db

# Arrancar
docker compose up -d  # o systemctl start rely-pos
```

---

## 13. Solución de Problemas

### El servidor no responde

```bash
# Verificar si el contenedor/servicio está corriendo
docker compose ps          # Docker
systemctl status rely-pos  # systemd

# Verificar puerto
ss -tlnp | grep 8000

# Ver logs
docker compose logs --tail=50
journalctl -u rely-pos -n 50
```

### Error de base de datos

```bash
# Verificar integridad
sqlite3 /opt/rely-pos/data/rely_pos.db "PRAGMA integrity_check;"

# Si está corrupta, restaurar desde backup
cp /opt/rely-pos/backups/rely_pos_ULTIMO.db /opt/rely-pos/data/rely_pos.db
```

### Puerto 8000 en uso

```bash
# Ver qué usa el puerto
lsof -i :8000
ss -tlnp | grep 8000

# Matar proceso
kill -9 $(lsof -ti :8000)

# Reiniciar
docker compose restart
```

### No puedo acceder desde fuera

```bash
# Verificar firewall
ufw status
ufw allow 80/tcp
ufw allow 443/tcp

# Verificar que Nginx corre
systemctl status nginx

# Verificar DNS (si usas dominio)
dig rely.tudominio.com
```

### El sistema va lento

```bash
# Ver recursos
docker stats rely-pos
htop

# Limpiar espacio
docker system prune -f
journalctl --vacuum-size=50M
```

---

## 14. Checklist de Producción

### Antes de ir en vivo
- [ ] Sistema probado localmente con todos los roles
- [ ] CORS configurado para el dominio/IP de producción
- [ ] Base de datos migrada y verificada
- [ ] Backup automático configurado
- [ ] SSL/HTTPS activo (si es internet)
- [ ] Firewall configurado (solo puertos 80, 443, 22)
- [ ] Contraseña root del VPS cambiada
- [ ] Acceso SSH con clave (no contraseña)
- [ ] PIN Maestro (`1234`) conocido por el administrador
- [ ] Impresora térmica probada desde el navegador

### Seguridad
- [ ] Cambiar PINs de usuarios después del despliegue
- [ ] Restringir CORS a dominios específicos
- [ ] No exponer puerto 8000 directamente a internet
- [ ] Mantener el sistema operativo actualizado
- [ ] Revisar logs periódicamente

### Monitoreo
- [ ] Configurar alertas de disco lleno (>80%)
- [ ] Verificar backups semanalmente
- [ ] Revisar logs de errores mensualmente
- [ ] Actualizar dependencias trimestralmente

---

## 📞 Soporte

Para problemas técnicos:
1. Revisa esta guía en la sección [Solución de Problemas](#13-solución-de-problemas)
2. Consulta los logs: `docker compose logs -f`
3. Verifica el healthcheck: `curl http://localhost:8000/`
4. Revisa la documentación de FastAPI: `http://TU_IP:8000/docs`

---

**© 2026 RELY POS - Pozolería, Tacos y Enchiladas**  
*Sistema desarrollado para operación local y en la nube*
