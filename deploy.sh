#!/bin/bash
# ============================================================
# RELY POS - Script de Despliegue a Servidor
# Pozolería, Tacos y Enchiladas
# ============================================================
#
# USO:
#   ./deploy.sh [usuario@servidor] [ruta_remota]
#
# EJEMPLOS:
#   ./deploy.sh                          # Usa valores por defecto
#   ./deploy.sh root@192.168.1.100       # Especifica servidor
#   ./deploy.sh user@server /opt/rely    # Especifica ruta
#
# REQUISITOS EN EL SERVIDOR:
#   - Docker y Docker Compose instalados
#   - Acceso SSH sin contraseña (recomendado)
#   - Puerto 8000 abierto en firewall
#
# ============================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuración por defecto
DEFAULT_USER="root"
DEFAULT_HOST="localhost"
DEFAULT_REMOTE_PATH="/opt/rely-pos"

# Parsear argumentos
REMOTE="${1:-${DEFAULT_USER}@${DEFAULT_HOST}}"
REMOTE_PATH="${2:-${DEFAULT_REMOTE_PATH}}"

# Directorio local del proyecto
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  RELY POS - Despliegue a Servidor${NC}"
echo -e "${BLUE}  Pozolería, Tacos y Enchiladas${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "📍 Servidor destino: ${GREEN}${REMOTE}${NC}"
echo -e "📁 Ruta remota:      ${GREEN}${REMOTE_PATH}${NC}"
echo -e "📂 Proyecto local:   ${GREEN}${LOCAL_DIR}${NC}"
echo ""

# Verificar que estamos en el directorio correcto
if [ ! -f "${LOCAL_DIR}/server.py" ]; then
    echo -e "${RED}❌ Error: No se encontró server.py en ${LOCAL_DIR}${NC}"
    echo -e "${YELLOW}   Ejecuta este script desde la raíz del proyecto.${NC}"
    exit 1
fi

# Verificar archivos necesarios
REQUIRED_FILES=("server.py" "app.js" "index.html" "style.css" "manifest.json" "requirements.txt" "Dockerfile" "docker-compose.yml" "migrate_to_sqlite.py")
MISSING=()

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "${LOCAL_DIR}/${file}" ]; then
        MISSING+=("$file")
    fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
    echo -e "${RED}❌ Archivos faltantes:${NC}"
    for f in "${MISSING[@]}"; do
        echo -e "   - $f"
    done
    exit 1
fi

echo -e "${GREEN}✅ Todos los archivos necesarios presentes.${NC}"
echo ""

# Paso 1: Crear directorio remoto
echo -e "${YELLOW}[1/5] Creando directorio en servidor...${NC}"
ssh "${REMOTE}" "mkdir -p ${REMOTE_PATH}/data" 2>/dev/null || {
    echo -e "${RED}❌ No se pudo conectar al servidor.${NC}"
    echo -e "${YELLOW}   Verifica:${NC}"
    echo -e "   1. Que el servidor esté encendido y accesible"
    echo -e "   2. Que tengas acceso SSH: ssh ${REMOTE}"
    echo -e "   3. Que Docker esté instalado en el servidor"
    exit 1
}
echo -e "${GREEN}   ✓ Directorio creado: ${REMOTE_PATH}${NC}"

# Paso 2: Subir archivos del proyecto
echo -e "${YELLOW}[2/5] Subiendo archivos al servidor...${NC}"

# Excluir archivos innecesarios
EXCLUDE=(
    "--exclude=.git"
    "--exclude=__pycache__"
    "--exclude=venv"
    "--exclude=*.pyc"
    "--exclude=.DS_Store"
    "--exclude=rely_pos.db"
    "--exclude=rely_pos.db-journal"
    "--exclude=rely_pos.db-wal"
    "--exclude=db.json"
    "--exclude=*.backup.*"
    "--exclude=EJECUTAR_POS.bat"
    "--exclude=INICIAR_RELY.command"
    "--exclude=run.py"
    "--exclude=TROUBLESHOOTING.md"
    "--exclude=deploy.sh"
)

rsync -avz --progress "${EXCLUDE[@]}" "${LOCAL_DIR}/" "${REMOTE}:${REMOTE_PATH}/" || {
    echo -e "${RED}❌ Error al subir archivos.${NC}"
    echo -e "${YELLOW}   Si rsync no está disponible, intenta con scp:${NC}"
    echo -e "   scp -r ${LOCAL_DIR}/* ${REMOTE}:${REMOTE_PATH}/"
    exit 1
}
echo -e "${GREEN}   ✓ Archivos subidos correctamente.${NC}"

# Paso 3: Migrar base de datos (si existe db.json local)
if [ -f "${LOCAL_DIR}/db.json" ] && [ ! -f "${LOCAL_DIR}/rely_pos.db" ]; then
    echo -e "${YELLOW}[3/5] Detectado db.json. ¿Migrar a SQLite antes de subir?${NC}"
    read -p "   Migrar ahora? (s/n): " MIGRATE
    if [[ "$MIGRATE" =~ ^[Ss]$ ]]; then
        echo "   Ejecutando migración local..."
        cd "${LOCAL_DIR}"
        python3 migrate_to_sqlite.py
        echo -e "${GREEN}   ✓ Base de datos migrada.${NC}"
        
        # Subir la BD migrada
        echo "   Subiendo rely_pos.db al servidor..."
        scp "${LOCAL_DIR}/rely_pos.db" "${REMOTE}:${REMOTE_PATH}/data/rely_pos.db"
        echo -e "${GREEN}   ✓ Base de datos subida.${NC}"
    else
        echo -e "${YELLOW}   ⚠️  Saltando migración. El servidor creará una BD vacía.${NC}"
    fi
elif [ -f "${LOCAL_DIR}/rely_pos.db" ]; then
    echo -e "${YELLOW}[3/5] Subiendo base de datos existente...${NC}"
    read -p "   ¿Subir rely_pos.db actual al servidor? (s/n): " UPLOAD_DB
    if [[ "$UPLOAD_DB" =~ ^[Ss]$ ]]; then
        scp "${LOCAL_DIR}/rely_pos.db" "${REMOTE}:${REMOTE_PATH}/data/rely_pos.db"
        echo -e "${GREEN}   ✓ Base de datos subida.${NC}"
    else
        echo -e "${YELLOW}   ⚠️  El servidor creará una BD vacía.${NC}"
    fi
else
    echo -e "${YELLOW}[3/5] No se encontró base de datos. El servidor creará una nueva.${NC}"
fi

# Paso 4: Construir y levantar contenedor
echo -e "${YELLOW}[4/5] Construyendo imagen Docker en servidor...${NC}"
ssh "${REMOTE}" "cd ${REMOTE_PATH} && docker compose build --no-cache" || {
    echo -e "${RED}❌ Error al construir imagen Docker.${NC}"
    echo -e "${YELLOW}   Verifica que Docker esté instalado:${NC}"
    echo -e "   ssh ${REMOTE} 'docker --version'"
    exit 1
}
echo -e "${GREEN}   ✓ Imagen construida.${NC}"

echo -e "${YELLOW}[5/5] Iniciando servicio...${NC}"
ssh "${REMOTE}" "cd ${REMOTE_PATH} && docker compose up -d" || {
    echo -e "${RED}❌ Error al iniciar contenedor.${NC}"
    exit 1
}
echo -e "${GREEN}   ✓ Servicio iniciado.${NC}"

# Esperar a que el servicio esté listo
echo ""
echo -e "${BLUE}⏳ Esperando a que el servicio esté listo...${NC}"
sleep 5

# Verificar estado
STATUS=$(ssh "${REMOTE}" "cd ${REMOTE_PATH} && docker compose ps --format json" 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('State','unknown'))" 2>/dev/null || echo "unknown")

echo ""
echo -e "${BLUE}============================================================${NC}"
if [[ "$STATUS" == *"running"* ]] || [[ "$STATUS" == *"Up"* ]]; then
    echo -e "${GREEN}  ✅ DESPLIEGUE EXITOSO${NC}"
else
    echo -e "${YELLOW}  ⚠️  Despliegue completado (verificar estado manualmente)${NC}"
fi
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "📍 Accede al sistema desde:"
echo -e "   ${GREEN}http://$(echo ${REMOTE} | cut -d@ -f2):8000${NC}"
echo ""
echo -e "🔧 Comandos útiles en el servidor:"
echo -e "   ${YELLOW}Ver logs:       ${NC}ssh ${REMOTE} 'cd ${REMOTE_PATH} && docker compose logs -f'"
echo -e "   ${YELLOW}Reiniciar:      ${NC}ssh ${REMOTE} 'cd ${REMOTE_PATH} && docker compose restart'"
echo -e "   ${YELLOW}Detener:        ${NC}ssh ${REMOTE} 'cd ${REMOTE_PATH} && docker compose down'"
echo -e "   ${YELLOW}Estado:         ${NC}ssh ${REMOTE} 'cd ${REMOTE_PATH} && docker compose ps'"
echo -e "   ${YELLOW}Backup BD:      ${NC}ssh ${REMOTE} 'cp ${REMOTE_PATH}/data/rely_pos.db ${REMOTE_PATH}/data/backup_\$(date +%Y%m%d).db'"
echo ""
echo -e "${BLUE}============================================================${NC}"
