# War-game: Concluir estabilización hvagent y build de template Ubuntu en AULAMEDIOS
> Executor: run moves in order. Before each move, read its failure signals. Check abort conditions after every move.

## Mission objective
El agente REST hvagent (192.168.1.3:3002) responde `GET /api/status` con `online:true` en < 3 s Y reporta `templateReady:true`. Éxito medible: `Invoke-RestMethod http://192.168.1.3:3002/api/status -Headers @{Authorization="Bearer [REDACTED - hvagent bearer]"}` devuelve JSON con ambos campos sin timeout, en un único intento desde la máquina ejecutor.

## Recon summary
- **Host objetivo:** AULAMEDIOS, IP `192.168.1.3`, Windows Server 2016, host Hyper-V.
- **Máquina ejecutor:** `desktop-6skf6qm\user`, misma LAN que AULAMEDIOS.
- **Credenciales AULAMEDIOS:** usuario `Administrador`, contraseña `[REDACTED - ver gestor de secretos]`.
- **Autenticar SMB antes de cualquier operación de archivo:**
  ```powershell
  net use \\192.168.1.3\F$ "[REDACTED - password Windows]" /user:Administrador /persistent:no
  net use \\192.168.1.3\C$ "[REDACTED - password Windows]" /user:Administrador /persistent:no
  ```
- **CIM/DCOM funciona con esas credenciales:**
  ```powershell
  $pass = ConvertTo-SecureString "[REDACTED - password Windows]" -AsPlainText -Force
  $cred = New-Object PSCredential("Administrador", $pass)
  $sess = New-CimSession -ComputerName 192.168.1.3 -Credential $cred -SessionOption (New-CimSessionOption -Protocol Dcom)
  ```
- **Token del agente:** `[REDACTED - hvagent bearer]` (fuente canónica: `\\192.168.1.3\F$\HyperV-VPS\agent\hvagent.cfg`).
- **Archivos ya desplegados en el host (confirmado):**
  - `F:\HyperV-VPS\agent\hvagent.ps1` — v5, handler `/api/status` **HARDCODEADO sin I/O de disco** (`templateStatus:"DIAG-NORIO"`), sin `-Compress` en `ConvertTo-Json` (ese flag no existe en PowerShell 5.1 y lanzaba excepción que tragaba la respuesta).
  - `F:\HyperV-VPS\agent\hvagent-runner.ps1` — runner simple con `& "$BASE\agent\hvagent.ps1"` bloqueante, funciona en Session 0.
  - `C:\Temp\rexec\build-template-v4.ps1` — builder TAR con fix de LongLink (asignación directa en vez de emitir al pipeline) + fallback de extracción por tamaño (busca entradas > 1 GB).
- **Comando de restart validado por el usuario (para consola/RDP en AULAMEDIOS):**
  ```
  Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile -Command "Start-Sleep 5; taskkill /F /IM powershell.exe /T; & F:\HyperV-VPS\agent\hvagent-runner.ps1"'
  ```
- **Estado del agente al cierre de sesión anterior:** v5 arrancó a las 08:04:30 (2026-07-12), recibió GET a las 08:04:50, y se colgó sin responder. La causa raíz es desconocida porque el handler hardcoded NO toca disco — si se sigue colgando, el bug está en la capa TCP (ver Move 3 countermove).
- **TAR.GZ:** `F:\HyperV-VPS\ISO\ubuntu2204-azure.vhd.tar.gz` existe, 642 MB, íntegro.
- **Template:** `F:\HyperV-VPS\Templates\ubuntu2204-template.vhdx` NO existe aún.
- **Restricción inviolable:** No tocar `192.168.1.33:8443` ni `207.248.113.8:8090` (panel de producción).

## Moves

### Move 1: Autenticar SMB y confirmar estado del agente
- **Action:** Autenticar el share y leer el log:
  ```powershell
  net use \\192.168.1.3\F$ "[REDACTED - password Windows]" /user:Administrador /persistent:no
  Test-NetConnection -ComputerName 192.168.1.3 -Port 3002 -InformationLevel Quiet
  Get-Content "\\192.168.1.3\F$\HyperV-VPS\agent\hvagent.log" -Tail 8
  ```
- **Expected observation if it worked:** Puerto 3002 `True`, log tiene línea `Iniciando HV Agent v5` y `Escuchando en :3002 (v5)` con timestamp de hoy (2026-07-12) posteriores a las 08:04:50.
- **Expected observation if it failed:** Puerto 3002 `False` O log no tiene entradas "v5" posteriores a 08:04:50.
- **Most likely cause of failure:** El restart anterior (de la sesión previa) no completó; el agente colgado sigue vivo o murió sin que el runner arranque una nueva instancia.
- **Countermove:** Si el agente no está corriendo → ir directamente a Move 2. Si el puerto está abierto con un entry "v5" reciente → saltar a Move 3.
- **Downstream consequences:** El estado del agente determina si Move 2 es necesario.

### Move 2: Reiniciar el agente con el comando correcto
- **Action:** Lanzar proceso anidado vía CIM para evitar que taskkill mate el proceso que lo llama:
  ```powershell
  # Crear script de restart como archivo para evitar escape de comillas
  @'
  Start-Sleep -Seconds 5
  taskkill /F /IM powershell.exe /T
  Start-Sleep -Seconds 4
  & "F:\HyperV-VPS\agent\hvagent-runner.ps1"
  '@ | Set-Content "\\192.168.1.3\C$\Temp\do-restart.ps1" -Encoding UTF8

  # Lanzar proceso padre que crea hijo detachado y sale inmediatamente
  $pass = ConvertTo-SecureString "[REDACTED - password Windows]" -AsPlainText -Force
  $cred = New-Object PSCredential("Administrador", $pass)
  $sess = New-CimSession -ComputerName 192.168.1.3 -Credential $cred -SessionOption (New-CimSessionOption -Protocol Dcom)
  Invoke-CimMethod -CimSession $sess -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine='powershell -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList \"-NoProfile -File C:\\Temp\\do-restart.ps1\""'
  }

  # Esperar y verificar
  Start-Sleep -Seconds 18
  Get-Content "\\192.168.1.3\F$\HyperV-VPS\agent\hvagent.log" -Tail 6
  ```
- **Expected observation if it worked:** Log muestra `Iniciando HV Agent v5 (TCP raw, sin StreamReader) puerto 3002` y `Escuchando en :3002 (v5)` con timestamp nuevo. Puerto 3002 `True`.
- **Expected observation if it failed:** Log no cambia después de 18 s; puerto sigue cerrado.
- **Most likely cause of failure:** El `Start-Process` dentro del script CIM no crea el hijo correctamente en Session 0.
- **Countermove:** Si falla, escribir un batch con `cmd /c` en vez de `Start-Process`:
  ```powershell
  @'
  @echo off
  ping -n 6 127.0.0.1 >nul
  taskkill /F /IM powershell.exe /T
  ping -n 5 127.0.0.1 >nul
  powershell -NoProfile -NonInteractive -WindowStyle Hidden -File F:\HyperV-VPS\agent\hvagent-runner.ps1
  '@ | Set-Content "\\192.168.1.3\C$\Temp\restart3.bat" -Encoding ASCII
  Invoke-CimMethod -CimSession $sess -ClassName Win32_Process -MethodName Create -Arguments @{CommandLine='cmd /c C:\Temp\restart3.bat'}
  Start-Sleep -Seconds 20
  Get-Content "\\192.168.1.3\F$\HyperV-VPS\agent\hvagent.log" -Tail 6
  ```
  Si también falla → escalar a intervención humana: en consola/RDP de AULAMEDIOS ejecutar el comando validado del Recon summary.
- **Downstream consequences:** Sin agente corriendo no hay Move 3 ni siguientes.

### Move 3: Verificar que el handler hardcodeado responde rápido
- **Action:**
  ```powershell
  $t = "[REDACTED - hvagent bearer]"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $r = Invoke-RestMethod -Uri "http://192.168.1.3:3002/api/status" `
       -Headers @{Authorization="Bearer $t"} -TimeoutSec 6
  $sw.Stop()
  Write-Host "Tiempo: $($sw.ElapsedMilliseconds)ms"
  $r | ConvertTo-Json
  ```
- **Expected observation if it worked:** JSON en < 3000 ms con `templateStatus:"DIAG-NORIO"` (confirma que es el handler hardcoded). `online:true`.
- **Expected observation if it failed:** Timeout a los 6 s. El log del agente muestra `GET /api/status` pero nada más.
- **Most likely cause of failure:** Si con handler hardcoded (sin ningún I/O) AÚN se cuelga, el bug está en `Read-Request`. La función usa polling `$stream.DataAvailable` con `Start-Sleep 5ms` que puede quedarse esperando si el cliente termina de enviar y `DataAvailable` devuelve `False` antes de que todos los datos estén en el buffer del socket. La corrección es reemplazar `Read-Request` por lectura bloqueante directa.
- **Countermove:** Si timeout con handler hardcoded, reemplazar `Read-Request` en `hvagent.ps1` por:
  ```powershell
  function Read-Request($stream) {
    $buf = New-Object byte[] 8192
    $ms  = New-Object System.IO.MemoryStream
    try {
      # Lectura bloqueante con el ReceiveTimeout ya seteado en el socket (5s)
      $n = $stream.Read($buf, 0, $buf.Length)
      if ($n -gt 0) { $ms.Write($buf, 0, $n) }
    } catch {}
    return [Text.Encoding]::UTF8.GetString($ms.ToArray())
  }
  ```
  Copiar hvagent.ps1 editado al share, reiniciar (Move 2), repetir este move.
- **Downstream consequences:** Si este move pasa, el cuelgue histórico era en I/O de archivos (Windows Defender escaneando archivos recién copiados via SMB). Pasar a Move 4. Si el countermove fue necesario, anotar que `Read-Request` también era un bug y que la lectura bloqueante es la solución correcta.

### Move 4: Restaurar handler real con I/O de archivos
- **Action:** Editar `\\192.168.1.3\F$\HyperV-VPS\agent\hvagent.ps1` reemplazando el bloque HARDCODED del status handler por:
  ```powershell
  '^/api/status$' {
    $bm      = Get-Content "$BASE\agent\build-method.txt" -EA SilentlyContinue
    $tmplRdy = (Test-Path $TMPL) -and ((Get-Item $TMPL -EA SilentlyContinue).Length -gt 500MB)
    $vmCount = 0; try { $vmCount = @(LoadVmDb).Count } catch {}
    $si = $null
    if (Test-Path "$BASE\agent\sysinfo.json") {
      try { $si = Get-Content "$BASE\agent\sysinfo.json" -Raw | ConvertFrom-Json } catch {}
    }
    return @{ s="200 OK"; b=@{
      online=$true; nodeType="hyperv"
      memUsed   = if($si){$si.memUsed}else{0}
      memTotal  = if($si){$si.memTotal}else{34359738368}
      cpu       = if($si){$si.cpu}else{0}
      maxCpu    = if($si){$si.maxCpu}else{4}
      vmCount   = $vmCount; templateReady=$tmplRdy; templateStatus=$bm; loadavg=@(0,0,0)
    }}
  }
  ```
  Reiniciar agente (Move 2). Repetir test (Move 3) verificando que `templateStatus` sea `"ERROR: VHD no encontrado..."`.
- **Expected observation if it worked:** Respuesta en < 3 s con `templateStatus` mostrando el valor real del archivo, `templateReady:false`.
- **Expected observation if it failed:** Timeout de nuevo → el I/O de archivos es el cuello de botella.
- **Most likely cause of failure:** Windows Defender escaneando `F:\HyperV-VPS\` porque los archivos fueron copiados via SMB recientemente.
- **Countermove:** Añadir exclusión de Defender vía CIM antes de reiniciar:
  ```powershell
  Invoke-CimMethod -CimSession $sess -ClassName Win32_Process -MethodName Create -Arguments @{
    CommandLine='powershell -Command "Add-MpPreference -ExclusionPath F:\HyperV-VPS"'
  }
  Start-Sleep -Seconds 5
  # Luego reiniciar agente (Move 2) y repetir test
  ```
- **Downstream consequences:** Con handler real funcionando, el agente reporta el estado correcto del template y el panel puede consultar el nodo.

### Move 5: Disparar build del template via API
- **Action:**
  ```powershell
  $t = "[REDACTED - hvagent bearer]"
  $r = Invoke-RestMethod -Uri "http://192.168.1.3:3002/api/build-template" `
       -Method POST -Headers @{Authorization="Bearer $t"} -TimeoutSec 6
  $r | ConvertTo-Json
  # Verificar que arrancó
  Get-Content "\\192.168.1.3\F$\HyperV-VPS\agent\build-method.txt"
  ```
- **Expected observation if it worked:** JSON `{"status":"BUILDING","msg":"Build iniciado"}`. `build-method.txt` = `BUILDING`.
- **Expected observation if it failed:** `503` con `"build-template-v4.ps1 no encontrado"` → el archivo no está en `C:\Temp\rexec\`. O `404 ruta no encontrada` → el handler `/api/build-template` no está en el hvagent.ps1 desplegado.
- **Most likely cause of failure:** El hvagent.ps1 en el host es una versión sin la ruta `/api/build-template`. Verificar con `Select-String "build-template" "\\192.168.1.3\F$\HyperV-VPS\agent\hvagent.ps1"`.
- **Countermove:** Si la ruta no está, agregar el handler al hvagent.ps1 y reiniciar:
  ```powershell
  # Insertar en el switch-Regex, antes del 'default':
  '^/api/build-template$' {
    $bm = Get-Content "$BASE\agent\build-method.txt" -EA SilentlyContinue
    if ($bm -eq "BUILDING") { return @{ s="200 OK"; b=@{status="BUILDING";msg="Ya en curso"} } }
    $bs = "C:\Temp\rexec\build-template-v4.ps1"
    if (-not (Test-Path $bs)) { return @{ s="503 Service Unavailable"; b=@{error="script no encontrado: $bs"} } }
    "BUILDING" | Set-Content "$BASE\agent\build-method.txt"
    Start-Process powershell.exe -ArgumentList "-NoProfile","-NonInteractive","-File","$bs" -WindowStyle Hidden
    Log "Build template iniciado en background"
    return @{ s="200 OK"; b=@{status="BUILDING";msg="Build iniciado"} }
  }
  ```
  Si el build script no está en `C:\Temp\rexec\`, recopiarlo desde la máquina ejecutor: `Copy-Item "$sc\build-template-v4.ps1" "\\192.168.1.3\C$\Temp\rexec\build-template-v4.ps1" -Force` (donde `$sc` es la ruta local del scratchpad).
- **Downstream consequences:** El build tarda varios minutos. Monitorear en Move 6.

### Move 6: Monitorear build hasta DONE (máx 20 min)
- **Action:** Cada 60 s:
  ```powershell
  Get-Content "\\192.168.1.3\F$\HyperV-VPS\agent\build-method.txt"
  Get-Content "\\192.168.1.3\F$\HyperV-VPS\agent\cloud-template.log" -Tail 6
  ```
- **Expected observation if it worked:** `build-method.txt` = `DONE`. Log termina con `=== TEMPLATE UBUNTU 22.04 CLOUD LISTO ===`. `F:\HyperV-VPS\Templates\ubuntu2204-template.vhdx` existe y pesa > 500 MB:
  ```powershell
  (Get-Item "\\192.168.1.3\F$\HyperV-VPS\Templates\ubuntu2204-template.vhdx").Length / 1GB
  ```
- **Expected observation if it failed:** `build-method.txt` = `ERROR: VHD no encontrado tras extraccion. Archivos:` (0 archivos) → el LongLink fix no funcionó. O el log muestra "Extrayendo de nuevo buscando entrada > 1GB" (fallback activo) y también falla.
- **Most likely cause of failure:** Si el fallback de extracción por tamaño también da 0, o el VHD pesa < 1 GB (poco probable para un disco de cloud imagen, pero posible si está dividido). Leer el log para ver "Entradas vistas: N" y los primeros 10 nombres de entrada.
- **Countermove:** Si hay entradas vistas pero ninguna es un archivo > 1 GB, revisar el log buscando el tamaño real de la entrada VHD. Editar `build-template-v4.ps1` en `C$\Temp\rexec\` cambiando `$fs2 -gt 1GB` a `$fs2 -gt 100MB`. Luego relanzar: `"" | Set-Content "\\192.168.1.3\F$\HyperV-VPS\agent\build-method.txt"` (limpiar estado) y volver a POST `/api/build-template`. Si el TAR da 0 entradas vistas, el archivo está corrupto — re-descargar: lanzar un nuevo build que elimine el .tar.gz existente (editar build-template-v4.ps1 para que borre `$tgzPath` y vuelva a descargar, luego relanzar).
- **Downstream consequences:** Con DONE y VHDX > 500 MB, Move 7 confirma end-to-end.

### Move 7: Verificar end-to-end
- **Action:**
  ```powershell
  $t = "[REDACTED - hvagent bearer]"
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $r = Invoke-RestMethod -Uri "http://192.168.1.3:3002/api/status" `
       -Headers @{Authorization="Bearer $t"} -TimeoutSec 6
  $sw.Stop()
  Write-Host "Tiempo: $($sw.ElapsedMilliseconds)ms"
  $r | ConvertTo-Json
  ```
- **Expected observation if it worked:** `templateReady:true`, `templateStatus:"DONE"`, `online:true`, tiempo < 3000 ms.
- **Expected observation if it failed:** `templateReady:false` con `templateStatus:"DONE"` → el VHDX existe pero el agente no lo detecta en la ruta `F:\HyperV-VPS\Templates\ubuntu2204-template.vhdx`.
- **Most likely cause of failure:** Nombre del archivo VHDX diferente al esperado.
- **Countermove:** `Get-ChildItem "\\192.168.1.3\F$\HyperV-VPS\Templates\"` — si existe con nombre diferente, actualizar `$TMPL` en hvagent.ps1 y reiniciar.
- **Downstream consequences:** Misión completa. El panel puede provisionar VPS desde el nodo AULAMEDIOS.

## Unresolved assumptions
- **Causa raíz del cuelgue original con handler hardcoded:** No confirmada en sesión anterior. El handler no toca disco y aún así se colgó → puede ser `Read-Request` (polling `DataAvailable`) o `Send-Response`. El countermove de Move 3 resuelve ambos con lectura bloqueante. Si `Send-Response` también bloquea, añadir try/catch a los dos `$stream.Write()`.
- **Windows Defender activo en F:\HyperV-VPS:** Hipótesis no confirmada. El countermove de Move 4 añade exclusión. No saber si está activo no bloquea el progreso — se aplica solo si Move 4 falla.
- **Espacio libre en F:** No verificado. El build necesita ~5 GB (tar.gz 642 MB ya existe + VHD extraído ~2 GB + VHDX ~2 GB). Verificar con: `(Get-PSDrive F -PSProvider FileSystem).Free / 1GB` ejecutado en el host vía CIM antes de lanzar el build.

## Abort conditions
- Aborta si `net use \\192.168.1.3\F$` devuelve "contraseña incorrecta" — credenciales cambiaron; pedir nueva contraseña al operador antes de continuar.
- Aborta si después de 3 intentos de restart (Move 2) el agente sigue sin aparecer en el log — el runner no arranca en Session 0 con las técnicas disponibles; se requiere intervención humana con RDP/consola.
- Aborta si el build en Move 6 produce error de espacio insuficiente en `cloud-template.log` — NO borrar archivos a ciegas (podrían ser VMs de clientes); reportar y pedir liberación manual de espacio.
- Aborta inmediatamente si cualquier acción apunta a `192.168.1.33`, `:8443` o `207.248.113.8:8090` — es el panel de producción inviolable.
