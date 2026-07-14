@echo off
title Hyper-V Agent - Panel VPS
cd /d "%~dp0"
echo [hyperv-agent] Iniciando en http://0.0.0.0:3002
node agent.js
pause
