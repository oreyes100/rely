import express from 'express';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const dataDir = path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const configFile = path.join(root, 'config.json');
if (!existsSync(configFile)) {
  console.error('[hyperv-agent] Falta config.json');
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(configFile, 'utf8'));
const TOKEN = cfg.agentToken;
if (!TOKEN) {
  console.error('[hyperv-agent] Falta agentToken en config.json');
  process.exit(1);
}

const PORT = cfg.port || 3002;

function pwsh(script) {
  try {
    const tmpFile = path.join(dataDir, `_ps_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
    writeFileSync(tmpFile, script, 'utf8');
    const out = execSync(
      `powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`,
      { encoding: 'utf8', timeout: 15000 }
    );
    try { execSync(`del "${tmpFile}"`, { encoding: 'utf8', timeout: 3000 }); } catch {}
    return out.trim();
  } catch (e) {
    return null;
  }
}

function checkHyperV() {
  const out = pwsh(`Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Hyper-V | Select-Object -ExpandProperty State`);
  if (!out) return false;
  if (out.toLowerCase().includes('enabled')) return true;
  const svc = pwsh(`Get-Service vmms -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Status`);
  return svc !== null && svc !== '';
}

function getDiskInfo() {
  const out = pwsh(`Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'" | Select-Object Size, FreeSpace | ConvertTo-Json`);
  if (!out) return { size: 0, free: 0 };
  try {
    const d = JSON.parse(out);
    return { size: Number(d.Size) || 0, free: Number(d.FreeSpace) || 0 };
  } catch { return { size: 0, free: 0 }; }
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token || token !== TOKEN) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

const app = express();
app.use(express.json({ limit: '50kb' }));
app.disable('x-powered-by');

app.get('/api/status', auth, (_req, res) => {
  const cpus = os.cpus();
  const totalCores = cpus.length;
  const cpuAvg = os.loadavg()[0] / totalCores;
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const disk = getDiskInfo();
  const hv = checkHyperV();

  res.json({
    cpu: Math.min(cpuAvg, 1),
    maxCpu: totalCores,
    loadavg: os.loadavg(),
    memUsed: memTotal - memFree,
    memTotal,
    storUsed: disk.size - disk.free,
    storTotal: disk.size,
    storAvail: disk.free,
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: Math.floor(os.uptime()),
    templateReady: hv,
  });
});

app.post('/api/vms', auth, (req, res) => {
  if (!checkHyperV()) {
    return res.status(501).json({ error: 'Hyper-V no está disponible en este equipo' });
  }
  const { name, hostname, cores, memoryMb, diskGb, sshKey } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name requerido' });

  const memBytes = (memoryMb || 2048) * 1024 * 1024;
  const diskSize = (diskGb || 20) * 1024 * 1024 * 1024;
  const vCores = cores || 2;
  const vhdDir = 'C:\\Hyper-V\\VHDs';

  const script = `
    $ErrorActionPreference = "Stop"
    $vhdDir = "${vhdDir}"
    if (-not (Test-Path $vhdDir)) { New-Item -ItemType Directory -Path $vhdDir -Force | Out-Null }

    $vmName = "${name}"
    $vhdPath = Join-Path $vhdDir "$vmName.vhdx"

    # Crear VM de 2da generación
    $vm = New-VM -Name $vmName -MemoryStartupBytes ${memBytes} -Generation 2 -Path $vhdDir
    Set-VMProcessor -VM $vm -Count ${vCores}
    Set-VMMemory -VM $vm -DynamicMemoryEnabled $false

    # Crear y conectar VHDX
    $vhd = New-VHD -Path $vhdPath -SizeBytes ${diskSize} -Dynamic
    Add-VMHardDiskDrive -VM $vm -Path $vhdPath

    # Agregar adapter de red (switch por defecto)
    $sw = Get-VMSwitch | Select-Object -First 1
    if ($sw) { Connect-VMNetworkAdapter -VM $vm -SwitchName $sw.Name }

    # Habilitar servicios de integración
    Enable-VMIntegrationService -VM $vm -Name "Guest Service Interface"

    # Generar password
    Add-Type -AssemblyName System.Web
    $password = [System.Web.Security.Membership]::GeneratePassword(16, 3)

    # Iniciar VM
    Start-VM $vm

    Write-Output "devops|$password"
  `;

  try {
    const out = pwsh(script);
    if (!out) throw new Error('Falló la creación de la VM');
    const parts = out.split('|');
    const user = parts[0] || 'devops';
    const password = parts[1] || '';
    res.status(201).json({ user, password, status: 'created' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/vms/:name', auth, (req, res) => {
  if (!checkHyperV()) return res.status(501).json({ error: 'Hyper-V no está instalado' });
  try {
    pwsh(`
      $vm = Get-VM -Name "${req.params.name}" -ErrorAction SilentlyContinue
      if ($vm) {
        Stop-VM -VM $vm -Force -ErrorAction SilentlyContinue
        Remove-VM -VM $vm -Force
      }
    `);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.use((err, _req, res, _next) => {
  console.error('[hyperv-agent]', err.message);
  res.status(500).json({ error: 'Error interno' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[hyperv-agent] Escuchando en http://0.0.0.0:${PORT}`);
  console.log(`[hyperv-agent] Hyper-V disponible: ${checkHyperV()}`);
});
