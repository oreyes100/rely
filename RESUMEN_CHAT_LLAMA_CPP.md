# Resumen del Chat - Setup Llama.cpp en pfSense

## Proyecto
Configurar un servidor de IA local con llama.cpp en pfSense para usar como LLM de respaldo del MCP.

## Hardware del Servidor pfSense
- **CPU:** QEMU Virtual CPU (4 cores)
- **RAM:** 8 GB total, ~2.7 GB disponibles
- **GPU:** Ninguna (solo CPU)
- **OS:** pfSense (FreeBSD-based)
- **IP:** 192.168.200.99

## Paso 1: Conexión al Servidor
```bash
ssh root@192.168.200.99
# Password: 40155229
```

## Paso 2: Instalación de Dependencias en pfSense
```bash
# Actualizar sistema
pkg update && pkg upgrade -y

# Instalar dependencias de compilación
pkg install -y git gmake cmake gcc gcc-libs
pkg install -y curl wget bash

# Instalar herramientas adicionales
pkg install -y pkgconf autoconf automake libtool
```

## Paso 3: Clonar y Compilar llama.cpp
```bash
# Clonar repositorio
cd /usr/local
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp

# Compilar (sin GPU, solo CPU)
cmake -B build -DLLAMA_CUBLAS=OFF -DLLAMA_METAL=OFF
cmake --build build --config Release -j4

# Verificar compilación
ls -la build/bin/
```

## Paso 4: Descargar Modelo GGUF
```bash
# Modelo ligero recomendado para 8GB RAM
cd /usr/local/llama.cpp

# Opción 1: Modelo pequeño (~2GB)
wget https://huggingface.co/TheBloke/Mistral-7B-v0.1-GGUF/resolve/main/mistral-7b-v0.1.Q4_K_M.gguf

# Opción 2: Modelo muy ligero (~500MB)
wget https://huggingface.co/TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/resolve/main/tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf
```

## Paso 5: Ejecutar el Servidor
```bash
# Servidor básico en puerto 8080
./build/bin/llama-server -m ./mistral-7b-v0.1.Q4_K_M.gguf --host 0.0.0.0 --port 8080

# O con modelo TinyLlama (más rápido)
./build/bin/llama-server -m ./tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf --host 0.0.0.0 --port 8080
```

## Paso 6: Probar el Servidor
```bash
# Desde otra terminal o desde Windows
curl http://192.168.200.99:8080/v1/models

# Enviar petition de prueba
curl http://192.168.200.99:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral-7b-v0.1",
    "messages": [
      {"role": "user", "content": "Hola, ¿cómo estás?"}
    ]
  }'
```

## Paso 7: Servicio Systemd (Automático al Iniciar)
```bash
# Crear servicio
cat > /usr/local/etc/rc.d/llamacpp << 'EOF'
#!/bin/sh
# PROVIDE: llamacpp
# REQUIRE: NETWORKING_SERVERS
# KEYWORD: shutdown

. /etc/rc.subr

name="llamacpp"
rcvar="${name}_enable"

command="/usr/local/llama.cpp/build/bin/llama-server"
command_args="-m /usr/local/llama.cpp/mistral-7b-v0.1.Q4_K_M.gguf --host 0.0.0.0 --port 8080"

load_rc_config $name
run_rc_command "$1"
EOF

chmod +x /usr/local/etc/rc.d/llamacpp

# Habilitar servicio
sysrc llamacpp_enable=YES
service llamacpp start
```

## Paso 8: Abrir Puerto en Firewall (pfSense)
```bash
# Desde la GUI de pfSense o por SSH:
# Ir a Firewall > Rules > WAN
# Agregar regla:
# - Protocolo: TCP
# - Puerto destino: 8080
# - Acción: Permitir
# - Descripción: Llama.cpp LLM Server
```

## Paso 9: Configurar en opencode.json
```json
{
  "llm": {
    "provider": "openai",
    "model": "mistral-7b-v0.1",
    "apiKey": "no-key-needed",
    "baseURL": "http://192.168.200.99:8080/v1"
  }
}
```

## Herramientas Instaladas en Windows

### Scoop (Package Manager)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
```

### LLMFit (Recomendador de Modelos)
```powershell
scoop install llmfit
llmfit
```

**Resultado de LLMFit para este hardware:**
- CPU: QEMU Virtual CPU (4 cores)
- RAM: 2.7 GB disponibles / 8.0 GB total
- GPU: ninguna (CPU only)
- Modelos recomendados: versiones pequeñas (75M-420M params), scores 73-77
- Top: AlignmentResearch/Llama-3.3-Tiny-Instruct-boolq (75M, score 77, 168 tok/s)

## Comandos Útiles

### En el servidor pfSense:
```bash
# Ver si llama.cpp está corriendo
ps aux | grep llama

# Ver logs
tail -f /var/log/llamacpp.log

# Detener/reiniciar
service llamacpp stop
service llamacpp start
```

### En Windows (PowerShell):
```powershell
# Recargar PATH
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

# Probar conexión al servidor
curl http://192.168.200.99:8080/v1/models
```

## Notas Importantes
- El servidor pfSense tiene specs limitados (CPU virtual, 8GB RAM, sin GPU)
- Modelos recomendados: TinyLlama 1.1B o Mistral 7B en quantización Q4_K_M
- El servicio debe correr en puerto 8080 para ser compatible con la API de OpenAI
- No necesita API key (se puede usar "no-key-needed")
- La URL base es `http://192.168.200.99:8080/v1`

## Estado Actual
- [x] Conexión SSH al servidor
- [x] Instalación de dependencias
- [x] Compilación de llama.cpp
- [ ] Descarga de modelo (pendiente - ver paso 4)
- [ ] Ejecución del servidor
- [ ] Pruebas de conectividad
- [ ] Configuración en opencode.json
