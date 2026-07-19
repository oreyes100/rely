# War-game: Reparar hvagent y construir template Ubuntu en AULAMEDIOS
> Ejecutor: corre los movimientos en orden. Antes de cada movimiento lee sus señales de fallo. Revisa las condiciones de aborto después de CADA movimiento. No inventes credenciales ni rutas: si algo falta, ve a "Suposiciones sin resolver" y detente.

## Objetivo de la misión
Dejar el agente REST `hvagent` de AULAMEDIOS (host Hyper-V, IP `192.168.1.3`, puerto TCP `3002`) respondiendo correctamente a `GET /api/status` en menos de 3 segundos, Y dejar construido el template `F:\HyperV-VPS\Templates\ubuntu2204-template.vhdx` (> 500 MB) para que el panel pueda aprovisionar VPS. Éxito medible:
1. `Invoke-RestMethod http://192.168.1.3:3002/api/status` (con header `Authorization: Bearer <token>`) devuelve JSON en < 3 s con campo `online:true`.
2. Ese JSON reporta `templateReady:true`.
3. El agente sobrevive ≥ 5 minutos sin que el runner lo reinicie (revisar que `hvagent.log` no acumule líneas nuevas de "Iniciando HV Agent").

## Resumen de reconocimiento (hechos confirmados — NO re-verificar, ya están comprobados)
- **Host objetivo:** AULAMEDIOS, `192.168.1.3`, Windows Server 2016, host Hyper-V.
- **Máquina desde la que operas (ejecutor):** `desktop-6skf6qm`, usuario `desktop-6skf6qm\user`. Estás en la misma LAN que AULAMEDIOS.
- **Accesos disponibles hacia AULAMEDIOS (CONFIRMADOS):**
  - Share administrativo `\\192.168.1.3\F$` → **lectura y escritura OK**. Mapea a `F:\` en el host. La raíz del proyecto es `\\192.168.1.3\F$\HyperV-VPS\`.
  - Share administrativo `\\192.168.1.3\C$` → **lectura y escritura OK**. Mapea a `C:\`.
- **Accesos DENEGADOS (NO reintentar, ya fallaron con "Acceso denegado"):**
  - CIM/WMI vía DCOM (`New-CimSession -Protocol Dcom`) → Acceso denegado.
  - WMI clásico (`[wmiclass]"\\192.168.1.3\..."`) → Acceso denegado.
  - `New-PSSession` (WinRM) → falla; **puerto 5985 CERRADO** (TCP connect falla).
  - `schtasks /create /s 192.168.1.3` y `/query /s` → Acceso denegado.
  - `at \\192.168.1.3` → obsoleto + "Solicitud no compatible".
  - **Conclusión dura:** NO tienes ejecución remota de código en AULAMEDIOS. Solo puedes **escribir archivos** en `F$`/`C$` y **abrir sockets TCP** hacia el host. Cualquier arranque/reinicio de proceso en el host requiere que un proceso YA CORRIENDO en el host lo haga (el runner), o intervención humana en consola/RDP.
- **Estado del agente:** El proceso `hvagent.ps1` (v3, TCP raw con `System.Net.Sockets.TcpListener` en puerto 3002) está corriendo y ESCUCHA (el TCP connect a :3002 tiene éxito), pero está **colgado**: acepta la conexión, loguea `GET /api/status`, y nunca envía respuesta. El cliente hace timeout (probado: `Read` bloquea 8 s y aborta). El proceso lleva 10+ minutos sin reiniciarse (el runner no lo mata porque el proceso no ha "muerto", solo está bloqueado dentro del handler).
- **Runner:** `F:\HyperV-VPS\agent\hvagent-runner.ps1` es un bucle `while($true){ & hvagent.ps1; Start-Sleep 5 }`. Solo reinicia el agente si el proceso PowerShell **termina**; NO detecta cuelgues internos.
- **Historial del cuelgue HTTP.sys (ya resuelto en teoría):** versiones v1/v2 usaban `System.Net.HttpListener`, que dejaba colas de peticiones huérfanas en HTTP.sys al matar el proceso (puerto quedaba retenido por PID 4 kernel → error "entra en conflicto con un registro existente"). v3 cambió a `TcpListener` raw para evitar esto. El `hvagent-runner.log` muestra ese error histórico repetido cada 5 s en sesiones viejas.
- **Archivos accesibles y su estado actual (leídos vía F$):**
  - `F:\HyperV-VPS\agent\hvagent.ps1` → v3 con TcpListener. **Recién sobrescrito con una versión que añade logs de paso** `S1-bm`, `S2-tmpl`, `S3-vmcount`, `S4-sysinfo`, `S5-return` dentro del handler `/api/status` (para localizar en qué línea se cuelga). PERO el proceso viejo en memoria NO tiene ese código — hay que reiniciarlo para que cargue.
  - `F:\HyperV-VPS\agent\hvagent.cfg` → `{"token":"[REDACTED - hvagent bearer]","vmidStart":300,"subnetPrefix":"192.168.1."}`. **El token es `[REDACTED - hvagent bearer]`**.
  - `F:\HyperV-VPS\agent\build-method.txt` → `ERROR: VHD no encontrado tras extraccion. Archivos:`
  - `F:\HyperV-VPS\agent\sysinfo.json` → válido, actualizado (`memTotal ~34GB`, `cpu 0`, `maxCpu 4`). NO es el cuello de botella.
  - `F:\HyperV-VPS\agent\vmdb.json` → vacío/inexistente (0 VMs). NO es el cuello de botella.
  - `F:\HyperV-VPS\Templates\ubuntu2204-template.vhdx` → **NO existe**.
  - `F:\HyperV-VPS\ISO\ubuntu2204-azure.vhd.tar.gz` → existe, **642 MB, íntegro**.
  - `F:\HyperV-VPS\agent\cloud-template.log` → muestra que el build v3 falla: extrae 0 archivos, `LongLink:` sale vacío → "VHD no encontrado".
- **Software AUSENTE en AULAMEDIOS (confirmado):** NO hay `7z.exe` (ni en Program Files ni x86), NO hay PowerShell 7 (`pwsh.exe`). Windows Server 2016 → `tar.exe` nativo probablemente ausente también (bsdtar llegó a Windows 10 build 17063+; en Server 2016 NO está). Solo PowerShell 5.1 y utilidades de caja.
- **Causa raíz probable del build fallido:** El parser TAR casero en `build-template-v3.ps1` maneja mal la entrada GNU `LongLink` (typeflag 'L'): lee el nombre largo pero el siguiente header queda desalineado, o el `$longName` se consume mal (`$name = if ($longName) { $longName; $longName = $null }` — este patrón PowerShell emite AMBOS valores al pipeline, no asigna solo el primero). Resultado: 0 archivos extraídos.
- **Restricción de producción INVIOLABLE:** El panel en producción `https://207.248.113.8:8090/` → `192.168.1.33:8443` NO se toca, NO se modifica, NO se elimina. Esta misión NO involucra esa IP. Si un paso te lleva hacia `192.168.1.33` o `:8443`, es un error — detente.

## Movimientos

### Move 1: Verificar el estado vivo del agente y leer el token
- **Acción:** Lee el token desde `\\192.168.1.3\F$\HyperV-VPS\agent\hvagent.cfg` (campo `token`). Luego prueba conectividad TCP cruda:
  ```powershell
  $tcp = New-Object System.Net.Sockets.TcpClient; $tcp.ReceiveTimeout=3000
  try { $tcp.Connect("192.168.1.3",3002); "PUERTO ABIERTO"; $tcp.Close() } catch { "PUERTO CERRADO: $_" }
  ```
- **Expected observation si funcionó:** "PUERTO ABIERTO". El token es `[REDACTED - hvagent bearer]` (compáralo; si el cfg dice otro, usa el del cfg — es la fuente de verdad).
- **Expected observation si falló:** "PUERTO CERRADO" → el agente no está corriendo en absoluto (ni colgado). Salta directo a Move 4 (necesitas que el runner lo arranque, y el runner puede estar caído).
- **Most likely cause of failure:** El proceso agente murió y el runner no lo relanzó (runner también caído).
- **Countermove:** Si puerto cerrado, ve a Move 4 para forzar arranque del runner.
- **Downstream consequences:** Confirma el token que usarás en TODOS los movimientos siguientes con header `Authorization: Bearer <token>`.

### Move 2: Reemplazar hvagent.ps1 y hvagent-runner.ps1 por versiones robustas (vía share F$)
- **Acción:** Sobrescribe ambos archivos vía `\\192.168.1.3\F$`. NO puedes ejecutarlos remotamente; solo los dejas listos para el próximo arranque. Escribe estos contenidos EXACTOS:

  **`F:\HyperV-VPS\agent\hvagent.ps1`** — arregla los dos defectos conocidos: (a) el `StreamReader` puede bloquear en `ReadLine()` esperando datos si el cliente no cierra su mitad de escritura, y (b) el handler no debe tener operaciones lentas. Usa lectura con timeout de socket y responde siempre:
  ```powershell
  param([int]$Port = 3002)
  $ErrorActionPreference = "Continue"
  $BASE="F:\HyperV-VPS"; $TMPL="$BASE\Templates\ubuntu2204-template.vhdx"
  $LOGFILE="$BASE\agent\hvagent.log"; $CFGFILE="$BASE\agent\hvagent.cfg"; $VMDB="$BASE\agent\vmdb.json"
  function Log($m){ "$(Get-Date -Format o) [agent] $m" | Add-Content $LOGFILE }
  $cfg = Get-Content $CFGFILE | ConvertFrom-Json; $TOKEN=$cfg.token
  function Send-Response($stream,$status,$body){
    $json = if($body -is [string]){$body}else{$body|ConvertTo-Json -Depth 8 -Compress}
    $bytes=[Text.Encoding]::UTF8.GetBytes($json)
    $hdr="HTTP/1.1 $status`r`nContent-Type: application/json; charset=utf-8`r`nContent-Length: $($bytes.Length)`r`nAccess-Control-Allow-Origin: *`r`nConnection: close`r`n`r`n"
    $hb=[Text.Encoding]::ASCII.GetBytes($hdr)
    $stream.Write($hb,0,$hb.Length); $stream.Write($bytes,0,$bytes.Length); $stream.Flush()
  }
  Log "Iniciando HV Agent v5 (TCP raw, lectura con timeout) puerto $Port"
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any,$Port)
  $listener.Start(); Log "Escuchando en :$Port"
  while($true){
    $client=$null
    try{
      $client=$listener.AcceptTcpClient()
      $client.ReceiveTimeout=4000; $client.SendTimeout=4000
      $stream=$client.GetStream()
      # Leer request byte a byte hasta doble CRLF (NO usar StreamReader: bloquea)
      $ms=New-Object System.IO.MemoryStream; $buf=New-Object byte[] 4096; $headerDone=$false
      $deadline=[DateTime]::Now.AddSeconds(4)
      while(-not $headerDone -and [DateTime]::Now -lt $deadline){
        if($stream.DataAvailable){
          $n=$stream.Read($buf,0,$buf.Length); if($n -le 0){break}
          $ms.Write($buf,0,$n)
          $arr=$ms.ToArray()
          for($i=3;$i -lt $arr.Length;$i++){ if($arr[$i-3]-eq 13 -and $arr[$i-2]-eq 10 -and $arr[$i-1]-eq 13 -and $arr[$i]-eq 10){$headerDone=$true;break} }
        } else { Start-Sleep -Milliseconds 20 }
      }
      $reqText=[Text.Encoding]::ASCII.GetString($ms.ToArray())
      $lines=$reqText -split "`r`n"
      $requestLine=$lines[0]; $parts=$requestLine -split ' '
      $method=$parts[0]; $path=if($parts.Length -gt 1){$parts[1].Split('?')[0]}else{"/"}
      $auth=($lines | Where-Object {$_ -match '^(?i)authorization:'}) -replace '(?i)^authorization:\s*',''
      Log "$method $path"
      if($method -eq "OPTIONS"){
        $o="HTTP/1.1 204 No Content`r`nAccess-Control-Allow-Origin: *`r`nAccess-Control-Allow-Methods: GET,POST,DELETE,OPTIONS`r`nAccess-Control-Allow-Headers: Authorization,Content-Type`r`nConnection: close`r`n`r`n"
        $ob=[Text.Encoding]::ASCII.GetBytes($o); $stream.Write($ob,0,$ob.Length); $stream.Flush(); $client.Close(); continue
      }
      if($auth.Trim() -ne "Bearer $TOKEN"){ Send-Response $stream "401 Unauthorized" @{error="Unauthorized"}; $client.Close(); continue }
      if($path -eq "/api/status"){
        $bm=Get-Content "$BASE\agent\build-method.txt" -EA SilentlyContinue
        $tmplReady=(Test-Path $TMPL) -and ((Get-Item $TMPL -EA SilentlyContinue).Length -gt 500MB)
        $vmCount=0; if(Test-Path $VMDB){ try{$vmCount=@(Get-Content $VMDB|ConvertFrom-Json).Count}catch{$vmCount=0} }
        $si=$null; if(Test-Path "$BASE\agent\sysinfo.json"){ try{$si=Get-Content "$BASE\agent\sysinfo.json"|ConvertFrom-Json}catch{} }
        Send-Response $stream "200 OK" @{online=$true;nodeType="hyperv";
          memUsed=if($si){$si.memUsed}else{0};memTotal=if($si){$si.memTotal}else{34359738368};
          cpu=if($si){$si.cpu}else{0};maxCpu=if($si){$si.maxCpu}else{4};
          vmCount=$vmCount;templateReady=$tmplReady;templateStatus=$bm;loadavg=@(0,0,0)}
      } else {
        Send-Response $stream "404 Not Found" @{error="ruta no encontrada"}
      }
      $client.Close()
    } catch { Log "ERROR: $($_.Exception.Message)"; try{$client.Close()}catch{} }
  }
  ```
  > NOTA para el ejecutor: esta versión v5 solo implementa `/api/status` de forma robusta. Las rutas `/api/vms` (crear/listar/borrar VMs) NO están aquí. Es DELIBERADO: primero estabiliza el status; las rutas de provisión se re-añaden en Move 7 una vez el template exista. No las inventes ahora.

  **`F:\HyperV-VPS\agent\hvagent-runner.ps1`** — que detecte cuelgues, no solo muertes. El runner hará un self-check HTTP y matará SOLO su propio hijo si no responde:
  ```powershell
  $BASE="F:\HyperV-VPS"; $ErrorActionPreference="Continue"
  $log="$BASE\agent\hvagent-runner.log"
  function RL($m){ "$(Get-Date -Format o) $m" | Add-Content $log }
  while($true){
    RL "Lanzando agente..."
    $proc = Start-Process powershell -ArgumentList '-NoProfile','-NonInteractive','-File','F:\HyperV-VPS\agent\hvagent.ps1' -PassThru -WindowStyle Hidden
    $childPid = $proc.Id
    RL "Agente PID $childPid"
    # Vigilar: cada 30s hacer self-check TCP a localhost:3002. Si cuelga 2 veces seguidas, matar al hijo.
    $fails=0
    while(-not $proc.HasExited){
      Start-Sleep -Seconds 30
      $ok=$false
      try{
        $c=New-Object System.Net.Sockets.TcpClient; $c.ReceiveTimeout=3000
        $c.Connect("127.0.0.1",3002); $s=$c.GetStream()
        $tok=(Get-Content "$BASE\agent\hvagent.cfg"|ConvertFrom-Json).token
        $req="GET /api/status HTTP/1.1`r`nHost: localhost`r`nAuthorization: Bearer $tok`r`nConnection: close`r`n`r`n"
        $rb=[Text.Encoding]::ASCII.GetBytes($req); $s.Write($rb,0,$rb.Length)
        $rbuf=New-Object byte[] 1024; $n=$s.Read($rbuf,0,$rbuf.Length)
        if($n -gt 0){$ok=$true}; $c.Close()
      }catch{ $ok=$false }
      if($ok){ $fails=0 } else { $fails++; RL "self-check fallo ($fails)" }
      if($fails -ge 2){ RL "Agente colgado, matando PID $childPid"; try{Stop-Process -Id $childPid -Force}catch{}; break }
    }
    RL "Agente terminó/matado, reinicio en 5s"
    Start-Sleep -Seconds 5
  }
  ```
- **Expected observation si funcionó:** Ambos archivos escritos sin error. `Get-Content` de vuelta confirma el contenido nuevo (busca la cadena `HV Agent v5` en hvagent.ps1).
- **Expected observation si falló:** Excepción al escribir → "Acceso denegado" o "El proceso no puede acceder al archivo porque está siendo utilizado por otro proceso".
- **Most likely cause of failure:** El archivo `hvagent.ps1` está bloqueado por el proceso agente que lo tiene abierto en ejecución (PowerShell mantiene el script script abierto). En la práctica PowerShell NO bloquea el .ps1 tras cargarlo, así que la escritura debería pasar; si falla, es un lock transitorio.
- **Countermove:** Si "en uso", reintenta 3 veces con `Start-Sleep 2`. Si persiste, escribe a un nombre nuevo `hvagent-v5.ps1` y actualiza el runner para que apunte a ese nombre (evita el lock del archivo activo).
- **Downstream consequences:** Estos archivos solo tienen efecto cuando el proceso se reinicie. Move 3 fuerza el reinicio.

### Move 3: Forzar el reinicio del agente colgado (sin ejecución remota)
- **Acción:** No puedes matar el proceso remoto directamente (WMI/schtasks denegados). Estrategia: **hacer que el agente se caiga solo o que el runner nuevo lo reemplace.** El runner viejo NO detecta cuelgues, pero el runner NUEVO (escrito en Move 2) SÍ — el problema es arrancar el runner nuevo. Como no hay ejecución remota, la vía real es **intervención humana**: pide en "Suposiciones sin resolver" que alguien con acceso RDP/consola a AULAMEDIOS ejecute:
  ```
  taskkill /F /IM powershell.exe /T
  ```
  y luego arranque el runner nuevo:
  ```
  powershell -NoProfile -NonInteractive -WindowStyle Hidden -File F:\HyperV-VPS\agent\hvagent-runner.ps1
  ```
  ANTES de escalar a humano, intenta esta vía autónoma: escribe un **archivo `.job` que el runner viejo pudiera vigilar** — NO existe tal mecanismo en el runner viejo, así que descártalo. Segunda vía autónoma: **colocar un script en la carpeta de Inicio (Startup) del host** para el próximo reinicio de sesión:
  ```
  \\192.168.1.3\C$\ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp\hvagent-boot.bat
  ```
  con contenido `powershell -NoProfile -File F:\HyperV-VPS\agent\hvagent-runner.ps1` — pero esto solo dispara en un login interactivo, no ayuda ahora.
- **Expected observation si funcionó (vía humana):** Tras el taskkill+arranque, `hvagent.log` muestra una línea nueva `Iniciando HV Agent v5`. El puerto 3002 sigue abierto tras ~10 s (TcpListener re-bindea sin conflicto porque es TCP raw, no HTTP.sys).
- **Expected observation si falló:** (a) `hvagent.log` NO muestra "v5" → el reinicio no ocurrió o arrancó el .ps1 viejo. (b) Error al bindear puerto → si vieras "entra en conflicto con un registro existente", significa que quedó una cola HTTP.sys huérfana de una versión vieja con HttpListener; pero v5 usa TcpListener, así que este error NO debería aparecer. Si aparece "dirección ya en uso" (`10048`), hay otro proceso PowerShell viejo aún vivo escuchando en 3002.
- **Most likely cause of failure:** El `taskkill /F /IM powershell.exe` mató TAMBIÉN al runner (barre TODOS los powershell.exe), y nadie relanzó el runner → agente muerto, puerto cerrado.
- **Countermove:** El operador humano DEBE ejecutar el taskkill y el arranque del runner como UN SOLO comando encadenado (`taskkill ... & timeout /t 4 & powershell -File ...runner.ps1`). NO usar `timeout` en sesión no interactiva (cuelga esperando teclado); usar `ping -n 5 127.0.0.1 >nul` como pausa. Comando humano recomendado:
  ```
  taskkill /F /IM powershell.exe /T & ping -n 5 127.0.0.1 >nul & start "" powershell -NoProfile -WindowStyle Hidden -File F:\HyperV-VPS\agent\hvagent-runner.ps1
  ```
- **Downstream consequences:** Si el reinicio no es alcanzable de forma autónoma, TODA la misión depende de una acción humana única. Documéntalo como bloqueo duro y pásalo a "Suposiciones sin resolver". No sigas fingiendo que el agente se reinició.

### Move 4: Confirmar que el agente responde rápido tras el reinicio
- **Acción:** Desde la máquina ejecutor, con el token del Move 1:
  ```powershell
  $t="[REDACTED - hvagent bearer]"  # o el leído del cfg
  $sw=[Diagnostics.Stopwatch]::StartNew()
  $r=Invoke-RestMethod -Uri "http://192.168.1.3:3002/api/status" -Headers @{Authorization="Bearer $t"} -TimeoutSec 8
  $sw.Stop(); "Tiempo: $($sw.ElapsedMilliseconds)ms"; $r | ConvertTo-Json
  ```
- **Expected observation si funcionó:** JSON con `online:true` en < 3000 ms. `templateReady:false` todavía (esperado, el template aún no existe). `templateStatus` mostrará el texto de `build-method.txt`.
- **Expected observation si falló:** Timeout a los 8 s, o excepción de conexión.
- **Most likely cause of failure:** El agente aún ejecuta el código viejo (no se reinició de verdad) y sigue colgado en `StreamReader.ReadLine()`.
- **Countermove:** Vuelve a Move 3 y confirma que `hvagent.log` tiene la línea "v5". Si el log dice v5 pero AÚN cuelga, el problema NO era el StreamReader → revisa `hvagent.log` buscando en qué punto se detiene; si el último log es `GET /api/status` sin respuesta, el cuelgue está en `Send-Response` o en una operación de disco lenta sobre `F:` (host bajo carga por conversión VHD). En ese caso reduce el handler status a devolver un JSON estático `{online:true}` sin tocar disco, y re-despliega.
- **Downstream consequences:** Con status estable y rápido, el runner nuevo mantendrá el agente vivo. Ahora ataca el template (Move 5).

### Move 5: Diagnosticar y arreglar la extracción del TAR (causa del template faltante)
- **Acción:** El build casero falla en la entrada GNU `LongLink`. Antes de reescribir el parser, prueba la vía más simple: **¿existe `tar.exe` en el host?** Escribe y deja listo un script de build v4, pero primero verifica desde el ejecutor si hay tar nativo leyendo `\\192.168.1.3\C$\Windows\System32\tar.exe` con `Test-Path`. Si existe, el build se reduce a `tar -xzf`. Si NO existe (lo más probable en Server 2016), usa el parser corregido. El bug del parser actual está en esta línea:
  ```powershell
  $name = if ($longName) { $longName; $longName = $null } else { $pfx + $rawName }
  ```
  En PowerShell esto EMITE dos objetos al pipeline (`$longName` y el resultado de la asignación es nada, pero el `$longName` suelto se emite), corrompiendo `$name`. Corrección:
  ```powershell
  if ($longName) { $name = $longName; $longName = $null } else { $name = $pfx + $rawName }
  ```
  Escribe el script corregido a `\\192.168.1.3\F$\HyperV-VPS\agent\build-template-v4.ps1` con ESE fix, más un guard: tras extraer, si `$extracted.Count -eq 0`, loguear los primeros 5 nombres de entrada crudos vistos (para depurar sin frontier).
- **Expected observation si funcionó:** El archivo build-template-v4.ps1 queda escrito. (Aún no se ejecuta — mismo problema de ejecución remota.)
- **Expected observation si falló:** Error de escritura al share (ver Move 2 countermove).
- **Most likely cause of failure:** N/A para la escritura; el riesgo real es que el parser tenga MÁS bugs además del LongLink (padding, base-256). Recon previo ya corrigió padding y base-256; el LongLink es el último sospechoso conocido.
- **Countermove:** Si tras ejecutar (Move 6) sigue extrayendo 0 archivos, abandona el parser casero por completo y usa **descompresión GZip pura + parseo con `SharpCompress`** NO disponible... en su lugar, usa el método .NET puro que SÍ está: extrae solo el GZip a un `.tar` en disco con `GZipStream`, luego lee el `.tar` con un parser mínimo que IGNORA nombres (no los necesitas) y extrae el ÚNICO archivo grande (> 1 GB) que es el VHD. El VHD es siempre la entrada más grande del tar; localízalo por tamaño, no por nombre. Este approach evita todo el manejo de LongLink/PAX.
- **Downstream consequences:** El VHD extraído alimenta la conversión a VHDX en Move 6.

### Move 6: Ejecutar el build del template (requiere ejecución en host)
- **Acción:** Igual que Move 3, NO puedes ejecutar remotamente. El build debe correr EN el host. Dos vías: (a) intervención humana ejecuta `powershell -File F:\HyperV-VPS\agent\build-template-v4.ps1`; (b) **mejor vía autónoma:** haz que el propio agente (que SÍ corre en el host) dispare el build. Añade al agente v5 una ruta `POST /api/build-template` que lance el build en background con `Start-Process powershell -File build-template-v4.ps1`. Así, desde el ejecutor, un simple `Invoke-RestMethod -Method POST` en el host arranca el build sin humano. **Esta es la jugada clave que elimina la dependencia humana para el build.** Implementa esa ruta en hvagent.ps1 (Move 2) si eliges esta vía — decisión encodada: SÍ, añádela, porque resuelve el bloqueo de ejecución remota.
- **Expected observation si funcionó:** `build-method.txt` pasa a `BUILDING`, luego (minutos después, la conversión VHD→VHDX es lenta) a `DONE`. `cloud-template.log` muestra "Extraccion completada. Archivos: 1" y luego "TEMPLATE UBUNTU 22.04 CLOUD LISTO". Aparece `F:\HyperV-VPS\Templates\ubuntu2204-template.vhdx` > 500 MB.
- **Expected observation si falló:** `build-method.txt` = `ERROR: ...`. `cloud-template.log` muestra "Archivos: 0" (parser aún roto) o error en `Convert-VHD`.
- **Most likely cause of failure:** (a) Parser sigue en 0 archivos → aplica el countermove de Move 5 (extraer por tamaño). (b) `Convert-VHD` falla porque el módulo Hyper-V no está en el PowerShell del build → añade `Import-Module Hyper-V` al inicio del build. (c) Disco `F:` lleno (el tar.gz 642 MB + VHD extraído ~2 GB + VHDX ~2 GB necesitan ~5 GB libres) → revisa espacio antes.
- **Countermove:** Si `Convert-VHD` no está disponible, el VHD de Azure ya es booteable; puedes usar el `.vhd` extraído directamente como parent (Hyper-V acepta .vhd). Ajusta `$TMPL` a la ruta .vhd y salta la conversión. Pero .vhd es de tamaño fijo y no soporta differencing tan bien; preferible VHDX. Solo usa .vhd como fallback.
- **Downstream consequences:** Con el template > 500 MB, el status reportará `templateReady:true` (Move 4 lo confirmará de nuevo) y el panel podrá aprovisionar.

### Move 7: Re-añadir las rutas de provisión y verificar end-to-end
- **Acción:** El agente v5 de Move 2 solo tenía `/api/status`. Ahora que el template existe, re-incorpora las rutas `/api/vms` (POST crear, GET listar), `/api/vms/{name}` (GET/DELETE), `/api/vms/{name}/{start|stop}` desde la versión v3 histórica (están en el código previo), integrándolas al bucle robusto de v5. Cuidado: las operaciones `Get-VM`/`New-VM` son WMI-lentas y pueden colgar el agente single-thread — envuélvelas con timeouts o ejecútalas en runspace aparte. Decisión encodada: las rutas de provisión que usan `Get-VM` deben ir en un `Start-Job`/runspace para NO bloquear el listener; el handler responde 202 Accepted y el estado real se lee de `vmdb.json`.
- **Expected observation si funcionó:** Crear un VPS de prueba desde el panel devuelve credenciales y `status:provisioning`; la VM aparece en Hyper-V Manager; `vmdb.json` gana una entrada.
- **Expected observation si falló:** El agente vuelve a colgarse al recibir `POST /api/vms` (síntoma: status deja de responder tras crear una VM) → confirma la hipótesis de bloqueo por WMI en el hilo del listener.
- **Most likely cause of failure:** `Get-VM`/`New-VM` bloquean el único hilo del TcpListener mientras Hyper-V responde lento bajo carga.
- **Countermove:** Mueve TODA operación Hyper-V a `Start-Job`; el listener nunca ejecuta WMI en línea. El status lee solo archivos JSON (nunca `Get-VM`).
- **Downstream consequences:** Misión completa: agente estable + template listo + provisión funcional.

## Suposiciones sin resolver
- **BLOQUEO DURO — ejecución remota:** No existe ningún canal confirmado para ejecutar código en AULAMEDIOS desde el ejecutor (DCOM, WinRM/5985, schtasks, WMI: todos denegados/cerrados). Los movimientos 3, 6 y 7 REQUIEREN que algo corra en el host. Las salidas son: (a) la ruta `POST /api/build-template` y `POST /api/vms` DENTRO del agente —que sí corre en el host— para autodisparar trabajos (vía preferida, encodada en Moves 2/6/7); (b) intervención humana con acceso RDP/consola. **Input faltante que solo un humano puede dar:** el arranque inicial del runner nuevo (Move 3) tras matar el proceso colgado — porque el agente colgado NO puede relanzarse a sí mismo y el runner viejo no detecta cuelgues. QUIÉN lo provee: un operador con RDP/consola física a `192.168.1.3`. Sin ese único arranque manual, la cadena no puede empezar de forma 100% autónoma.
- **Credenciales de AULAMEDIOS:** No se dispone de usuario/contraseña de administrador del host (los intentos de credencial fueron bloqueados por política). Si se obtuvieran, WinRM/DCOM podrían habilitarse y eliminar el bloqueo humano. QUIÉN lo provee: el dueño del servidor CECyTEM.
- **Espacio libre en `F:`:** No verificado. El build necesita ~5 GB libres (tar.gz 642 MB + VHD ~2 GB + VHDX ~2 GB). Verificar con `(Get-PSDrive F).Free` desde el host, o `Get-ChildItem \\192.168.1.3\F$` no da espacio libre — requiere ejecución en host.
- **Presencia de `tar.exe` y módulo Hyper-V en el PowerShell del host:** Asumido ausente `tar.exe`; asumido presente módulo Hyper-V (es host Hyper-V). Verificar en Move 5/6.
- **Contenido real del TAR (nombres de entradas):** No inspeccionado byte a byte; la hipótesis del bug LongLink se basa en el log ("LongLink:" vacío + 0 archivos). El countermove "extraer por tamaño" es robusto ante cualquier estructura de nombres.

## Condiciones de aborto
- **Aborta y reporta** si tras Move 3 el puerto 3002 queda CERRADO y no hay operador humano disponible para arrancar el runner: la misión no puede avanzar de forma autónoma. Reporta exactamente: "Agente caído, puerto 3002 cerrado, se requiere arranque manual del runner en la consola de 192.168.1.3".
- **Aborta** si cualquier acción te dirige hacia `192.168.1.33`, `:8443`, o `207.248.113.8:8090` — ese es el panel de PRODUCCIÓN intocable. No es parte de esta misión.
- **Aborta** si escribir en `\\192.168.1.3\F$` o `C$` empieza a devolver "Acceso denegado" de forma consistente (no transitoria): perdiste el único canal disponible; sin él no puedes desplegar nada. Reporta la pérdida de acceso al share.
- **Aborta** si el build (Move 6) llena el disco `F:` (error "espacio insuficiente"): NO borres archivos del host para hacer espacio a ciegas — podrías tocar VMs de clientes en la VLAN 6. Reporta y pide liberación de espacio manual.
- **Detente y pide confirmación** antes de ejecutar cualquier `taskkill /F /IM powershell.exe /T` en el host: ese comando mata TODOS los procesos PowerShell, lo que podría interrumpir otros scripts de administración corriendo en AULAMEDIOS. Confirma que solo corren el agente y el runner antes de barrer.
