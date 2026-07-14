# Instala el Hyper-V agent como servicio de Windows usando NSSM o Scheduled Task
# Ejecutar como Administrador: powershell -ExecutionPolicy Bypass -File install-service.ps1

$ErrorActionPreference = "Stop"
$agentDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeExe = (Get-Command node).Source
$agentJs = Join-Path $agentDir "agent.js"

Write-Host "[hyperv-agent] Instalando en $agentDir" -ForegroundColor Cyan

# 1. Firewall - abrir puerto 3002
$ruleName = "Hyper-V Agent (3002)"
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort 3002 -Action Allow | Out-Null
  Write-Host "  ✓ Regla de firewall creada: $ruleName" -ForegroundColor Green
} else {
  Write-Host "  ✓ Regla de firewall ya existe: $ruleName" -ForegroundColor Yellow
}

# 2. Instalar módulo node-windows (para servicio)
if (-not (Get-Module -ListAvailable -Name node-windows)) {
  Write-Host "  Instalando node-windows..." -ForegroundColor Yellow
  & "$nodeExe" (Join-Path $agentDir "node_modules\.bin\npm.cmd") install node-windows --save
}

# 3. Crear script de servicio
$svcScript = @"
const { Service } = require('node-windows');
const svc = new Service({
  name: 'HyperVAgent',
  description: 'Agente REST para el Panel VPS - gestión de Hyper-V',
  script: '$($agentJs.Replace("\","\\"))',
  nodeOptions: ['--es-module-specifier-resolution=node'],
  env: { NODE_ENV: 'production' },
});
svc.on('install', () => {
  svc.start();
  console.log('HyperVAgent instalado e iniciado.');
});
svc.on('alreadyinstalled', () => {
  console.log('HyperVAgent ya está instalado.');
});
svc.install();
"@

$svcFile = Join-Path $agentDir "install-svc.js"
Set-Content -Path $svcFile -Value $svcScript

try {
  & "$nodeExe" $svcFile
  Write-Host "  ✓ Servicio HyperVAgent instalado" -ForegroundColor Green
} catch {
  Write-Host "  ⚠ Falló instalación como servicio: $_" -ForegroundColor Red
  Write-Host "  Iniciando como proceso foreground en su lugar..." -ForegroundColor Yellow
  Start-Process -WindowStyle Hidden -FilePath "$nodeExe" -ArgumentList "$agentJs"
}

Remove-Item $svcFile -Force -ErrorAction SilentlyContinue
Write-Host "[hyperv-agent] Instalación completada." -ForegroundColor Cyan
