@echo off
setlocal
cd /d "%~dp0"
echo.
echo    **********************************************
echo    *                                            *
echo    *           RELY POS - RESTAURANTE           *
echo    *          SISTEMA DE GESTION ACTIVO         *
echo    *                                            *
echo    **********************************************
echo.
echo Cerrando instancias previas en puertos 8000-8010...
for /L %%P in (8000,1,8010) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%%P') do (
        taskkill /f /pid %%a >nul 2>&1
    )
)
echo Iniciando servidor y sistema de vigilancia (Watchdog)...
echo Puerto: 8000
echo.
echo [!] NO CIERRES ESTA VENTANA SI QUIERES QUE EL POS FUNCIONE [!]
echo.
python run.py
pause
