@echo off
title RELY POS Server - Punto de Venta
color 0B

echo ============================================================
echo   RELY POS - Pozoleria, Tacos y Enchiladas
echo   Servidor Local (FastAPI + SQLite + Uvicorn)
echo ============================================================
echo.

echo [1/3] Instalando/Verificando dependencias...
python -m pip install -r requirements.txt --quiet >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Python no encontrado o error de pip. Asegurate de tener Python instalado.
    echo     Descargalo en: https://www.python.org/downloads/
    pause
    exit /b 1
)
echo       OK

echo.
echo [2/3] Verificando base de datos SQLite...
if not exist "rely_pos.db" (
    if exist "db.json" (
        echo       Migrando desde db.json a SQLite...
        python migrate_to_sqlite.py
    ) else (
        echo       No se encontro db.json. Se creara una BD vacia.
    )
)
echo       OK

echo.
echo [3/3] Iniciando servidor...
echo.
echo ============================================================
echo   Servidor listo. Accede desde:
echo     http://localhost:8000
echo   O desde tu red local:
echo     http://[IP-de-tu-PC]:8000
echo ============================================================
echo.

python run.py

pause