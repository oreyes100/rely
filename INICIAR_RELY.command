#!/bin/bash

# Cambiar al directorio del script
cd "$(dirname "$0")"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  RELY POS - Pozoleria, Tacos y Enchiladas${NC}"
echo -e "${BLUE}  Servidor Local (FastAPI + SQLite + Uvicorn)${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# Detectar Python
if command -v python3 &> /dev/null; then
    PYTHON_CMD="python3"
elif command -v python &> /dev/null; then
    PYTHON_CMD="python"
else
    echo -e "${RED}[!] Python no encontrado. Por favor instala Python 3.7+${NC}"
    echo "   Descárgalo en: https://www.python.org/downloads/"
    exit 1
fi

echo -e "${YELLOW}[1/3] Configurando entorno virtual e instalando dependencias...${NC}"

# Crear entorno virtual si no existe
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}       Creando entorno virtual (venv)...${NC}"
    $PYTHON_CMD -m venv venv > /dev/null 2>&1
    if [ $? -ne 0 ]; then
        echo -e "${YELLOW}       [!] No se pudo crear venv. Intentando instalación directa...${NC}"
        USE_VENV=false
    else
        echo -e "${GREEN}       ✓ Entorno virtual creado.${NC}"
        USE_VENV=true
    fi
else
    USE_VENV=true
    echo -e "${GREEN}       ✓ Entorno virtual existente encontrado.${NC}"
fi

# Activar venv o usar python del sistema
if [ "$USE_VENV" = true ] && [ -d "venv" ]; then
    # macOS/Linux
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
        PYTHON_CMD="python"
    else
        echo -e "${RED}[!] Error: No se pudo activar el entorno virtual.${NC}"
        exit 1
    fi
fi

# Verificar que pip esté disponible
echo -e "${YELLOW}       Verificando pip...${NC}"
$PYTHON_CMD -m pip --version > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo -e "${YELLOW}       [!] pip no encontrado. Instalando pip...${NC}"
    curl -sS https://bootstrap.pypa.io/get-pip.py -o get-pip.py
    $PYTHON_CMD get-pip.py --quiet 2>&1 | grep -v "WARNING"
    rm -f get-pip.py
fi

# Instalar dependencias
echo -e "${YELLOW}       Instalando FastAPI + Uvicorn (puede tomar 1-2 minutos)...${NC}"

# Intentar instalación con diferentes estrategias
INSTALL_SUCCESS=false

# Estrategia 1: Instalación normal
$PYTHON_CMD -m pip install --upgrade pip --quiet 2>&1 | grep -v "WARNING" || true
$PYTHON_CMD -m pip install -r requirements.txt --quiet 2>&1
if [ $? -eq 0 ]; then
    INSTALL_SUCCESS=true
    echo -e "${GREEN}       ✓ Dependencias instaladas.${NC}"
fi

# Estrategia 2: Si falla, intentar con --user (por restricciones PEP 668)
if [ "$INSTALL_SUCCESS" = false ]; then
    echo -e "${YELLOW}       [!] Instalación normal falló. Intentando con --user...${NC}"
    $PYTHON_CMD -m pip install -r requirements.txt --user --quiet 2>&1
    if [ $? -eq 0 ]; then
        INSTALL_SUCCESS=true
        echo -e "${GREEN}       ✓ Dependencias instaladas (modo usuario).${NC}"
    fi
fi

# Estrategia 3: Intentar con --break-system-packages (PEP 668)
if [ "$INSTALL_SUCCESS" = false ]; then
    echo -e "${YELLOW}       [!] Intentando con --break-system-packages...${NC}"
    $PYTHON_CMD -m pip install -r requirements.txt --break-system-packages --quiet 2>&1
    if [ $? -eq 0 ]; then
        INSTALL_SUCCESS=true
        echo -e "${GREEN}       ✓ Dependencias instaladas (break-system-packages).${NC}"
    fi
fi

# Estrategia 4: Si sigue fallando, mostrar error real
if [ "$INSTALL_SUCCESS" = false ]; then
    echo -e "${RED}[!] Error al instalar dependencias. Error detallado:${NC}"
    echo ""
    $PYTHON_CMD -m pip install -r requirements.txt 2>&1 | sed 's/^/    /'
    echo ""
    echo -e "${RED}Posibles soluciones:${NC}"
    echo "  1. Actualiza pip: $PYTHON_CMD -m pip install --upgrade pip"
    echo "  2. Instala manualmente: $PYTHON_CMD -m pip install fastapi uvicorn pydantic"
    echo "  3. Si usas Python del sistema, usa --user o crea un venv"
    echo "  4. Instala Python desde https://www.python.org/downloads/"
    exit 1
fi
echo ""

echo -e "${YELLOW}[2/3] Verificando base de datos SQLite...${NC}"
if [ ! -f "rely_pos.db" ]; then
    if [ -f "db.json" ]; then
        echo -e "${YELLOW}       Migrando desde db.json a SQLite...${NC}"
        $PYTHON_CMD migrate_to_sqlite.py
        if [ $? -ne 0 ]; then
            echo -e "${RED}[!] Error durante la migración.${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}       No se encontró db.json. Se creará una BD vacía.${NC}"
    fi
else
    echo -e "${GREEN}       ✓ Base de datos SQLite encontrada.${NC}"
fi
echo ""

echo -e "${YELLOW}[3/3] Iniciando servidor...${NC}"
echo ""

# Obtener IP local para mostrar
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "[IP-de-tu-PC]")

# Función para liberar el puerto 8000 si está en uso
liberar_puerto() {
    local PUERTO=$1
    echo -e "${YELLOW}       Verificando si el puerto $PUERTO está en uso...${NC}"
    
    # Buscar procesos usando el puerto
    PIDS=$(lsof -ti :$PUERTO 2>/dev/null)
    
    if [ ! -z "$PIDS" ]; then
        echo -e "${YELLOW}       ⚠️  Puerto $PUERTO ocupado por procesos: $PIDS${NC}"
        echo -e "${YELLOW}       🔪 Terminando procesos huérfanos...${NC}"
        
        for PID in $PIDS; do
            # No matar nuestro propio proceso de bash
            if [ "$PID" != "$$" ]; then
                kill -9 $PID 2>/dev/null
                echo -e "${GREEN}       ✓ Proceso $PID terminado.${NC}"
            fi
        done
        
        # Esperar a que se libere el puerto
        sleep 2
        
        # Verificar nuevamente
        PIDS_RESTANTES=$(lsof -ti :$PUERTO 2>/dev/null)
        if [ ! -z "$PIDS_RESTANTES" ]; then
            echo -e "${RED}       ⚠️  Puerto aún ocupado. El servidor intentará usar puerto alternativo.${NC}"
        else
            echo -e "${GREEN}       ✓ Puerto $PUERTO liberado.${NC}"
        fi
    else
        echo -e "${GREEN}       ✓ Puerto $PUERTO disponible.${NC}"
    fi
}

# Liberar puerto 8000 antes de iniciar
liberar_puerto 8000

echo -e "${BLUE}============================================================${NC}"
echo -e "${GREEN}  ✅ Servidor listo. Accede desde:${NC}"
echo -e "    ${GREEN}📱 Este dispositivo: http://localhost:8000${NC}"
if [ "$LOCAL_IP" != "[IP-de-tu-PC]" ]; then
    echo -e "    ${GREEN}📡 Red local: http://$LOCAL_IP:8000${NC}"
else
    echo -e "    ${GREEN}📡 Red local: http://[IP-de-tu-PC]:8000${NC}"
fi
echo -e "${BLUE}============================================================${NC}"
echo ""
echo -e "${YELLOW}Presiona Ctrl+C para detener el servidor.${NC}"
echo ""

# Ejecutar servidor con watchdog
exec $PYTHON_CMD run.py