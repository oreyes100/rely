#!/bin/bash
# ─────────────────────────────────────────────
#  RELY POS – Lanzador para macOS
#  Doble clic en este archivo para iniciar
# ─────────────────────────────────────────────

# Cambiar al directorio donde está este script
cd "$(dirname "$0")"

# Cerrar cualquier instancia previa de server.py o run.py de esta aplicación
echo "🧹 Cerrando instancias previas de RELY POS..."
pkill -9 -f "server\.py" 2>/dev/null || true
pkill -9 -f "run\.py.*Restaurantes" 2>/dev/null || true

# Buscar procesos en puertos 8000-8010 que sean de esta aplicación o de python y liberarlos
for p in $(seq 8000 8010); do
  PIDS=$(lsof -ti :$p -sTCP:LISTEN 2>/dev/null)
  for pid in $PIDS; do
    if [ -n "$pid" ]; then
      CMD=$(ps -p $pid -o command= 2>/dev/null)
      if echo "$CMD" | grep -qE "server\.py|Restaurantes"; then
        echo "Terminando proceso previo en puerto $p (PID $pid)..."
        kill -9 $pid 2>/dev/null || true
      fi
    fi
  done
done
sleep 1

# Buscar un puerto libre comenzando en 8000
PORT=8000
while lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; do
  echo "⚠️  Puerto $PORT está en uso por otra aplicación, probando el siguiente..."
  ((PORT++))
done

echo ""
echo "┌────────────────────────────────────┐"
echo "│         RELY POS – Iniciando       │"
echo "└────────────────────────────────────┘"
echo ""

# Verificar que Python 3 esté disponible
if ! command -v python3 &>/dev/null; then
    echo "❌ ERROR: Python 3 no está instalado."
    echo "   Descárgalo desde https://www.python.org/downloads/"
    read -p "Presiona Enter para salir..."
    exit 1
fi

echo "🚀 Iniciando servidor en http://localhost:$PORT ..."
echo ""
# Exportar la variable para que el servidor la lea si usa env
export PORT
# Iniciar el servidor en segundo plano con el puerto detectado
python3 server.py $PORT &
SERVER_PID=$!

# Esperar a que el servidor esté listo
sleep 1

# Abrir el navegador automáticamente
echo "🌐 Abriendo navegador..."
open "http://localhost:$PORT"

echo ""
echo "✅ RELY POS está corriendo."
echo "   URL local:    http://localhost:$PORT"
echo "   URL en red:   http://$(ipconfig getifaddr en0 2>/dev/null || echo 'desconocida'):$PORT"
echo ""
echo "   Presiona Ctrl+C para detener el servidor."
echo ""

# Mantener la terminal abierta y capturar Ctrl+C
trap "echo ''; echo '🛑 Deteniendo servidor...'; kill $SERVER_PID 2>/dev/null; exit 0" INT TERM

# Esperar a que el proceso del servidor termine
wait $SERVER_PID
