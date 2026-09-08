# 🔧 Guía de Solución de Problemas - RELY POS

## Error: "Error al instalar dependencias"

### Causa
El error original ocurría porque:
1. El script ocultaba los errores reales (`> /dev/null 2>&1`)
2. macOS con Python del sistema tiene restricciones PEP 668
3. pip no estaba instalado o no tenía permisos
4. No se usaba un entorno virtual aislado

### Soluciones Implementadas ✅

#### 1. **Entorno Virtual (venv)**
El script ahora crea automáticamente un entorno virtual aislado en la carpeta `venv/`. Esto evita conflictos con el Python del sistema.

#### 2. **Múltiples Estrategias de Instalación**
Si una estrategia falla, automáticamente intenta:
- Instalación normal
- Instalación con `--user` (sin privilegios de administrador)
- Instalación con `--break-system-packages` (ignora PEP 668)
- Instalación manual de paquetes específicos

#### 3. **Mensajes de Error Visibles**
Ya no se ocultan los errores. Ahora verás exactamente qué está fallando.

#### 4. **Detección de IP Local**
El script ahora muestra tu IP real para acceder desde otros dispositivos.

---

## 🚀 Cómo Ejecutar el Sistema

### Opción 1: Doble clic en `INICIAR_RELY.command` (Recomendado)
```bash
# En Finder, haz doble clic en:
INICIAR_RELY.command
```

### Opción 2: Terminal
```bash
cd "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2"
./INICIAR_RELY.command
```

### Opción 3: Manual (si falla el launcher)
```bash
cd "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2"

# Crear entorno virtual
python3 -m venv venv

# Activar entorno virtual
source venv/bin/activate

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar servidor
python run.py
```

---

## 🔍 Diagnóstico Paso a Paso

### Paso 1: Verificar Python
```bash
python3 --version
# Debe ser Python 3.7 o superior
```

### Paso 2: Verificar pip
```bash
python3 -m pip --version
```

**Si pip no está instalado:**
```bash
curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py
python3 get-pip.py
```

### Paso 3: Verificar Permisos
```bash
ls -la "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2/"
```

Asegúrate de que tienes permisos de lectura/escritura.

### Paso 4: Instalar Dependencias Manualmente
```bash
cd "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2"
python3 -m pip install --user -r requirements.txt
```

---

## 🐛 Errores Comunes y Soluciones

### Error: "externally-managed-environment" (PEP 668)
**Causa:** macOS protege el Python del sistema.

**Solución:**
```bash
# El script ya lo maneja automáticamente, pero manualmente:
python3 -m pip install --user --break-system-packages -r requirements.txt

# O mejor: usar entorno virtual
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Error: "command not found: pip3"
**Causa:** pip no está instalado.

**Solución:**
```bash
# Instalar pip
curl https://bootstrap.pypa.io/get-pip.py -o get-pip.py
python3 get-pip.py
```

### Error: "Permission denied"
**Causa:** No tienes permisos para ejecutar el script.

**Solución:**
```bash
chmod +x "INICIAR_RELY.command"
chmod +x "run.py"
```

### Error: "Address already in use" (Puerto 8000 ocupado)
**Causa:** Otro proceso está usando el puerto 8000.

**Solución:**
```bash
# Usar puerto diferente
./INICIAR_RELY.command 8001

# O matar el proceso que usa el puerto
lsof -i :8000
kill -9 [PID]
```

### Error: "No module named 'fastapi'"
**Causa:** Dependencias no instaladas.

**Solución:**
```bash
# Activar venv si existe
source venv/bin/activate

# Instalar
pip install fastapi uvicorn pydantic
```

---

## 📱 Acceder desde Otros Dispositivos

### Paso 1: Verificar que estás en la misma red WiFi
Todos los dispositivos deben estar conectados a la misma red WiFi.

### Paso 2: Obtener la IP de tu Mac
El script ya muestra esto, pero puedes verificarlo manualmente:
```bash
ipconfig getifaddr en0
# O si no funciona:
ipconfig getifaddr en1
```

### Paso 3: Acceder desde tablet/celular
Abre el navegador y ve a:
```
http://[IP-DE-TU-MAC]:8000
```

**Ejemplo:** Si tu IP es `192.168.1.50`, accede a:
```
http://192.168.1.50:8000
```

### Paso 4: Agregar a pantalla de inicio (PWA)
1. Abre el sistema en Safari (iOS) o Chrome (Android)
2. Toca el botón "Compartir"
3. Selecciona "Agregar a pantalla de inicio"
4. Ahora se abrirá en modo kiosco (pantalla completa)

---

## 🔐 Firewall de macOS

Si otros dispositivos no pueden acceder, verifica el firewall:

1. Ve a **Preferencias del Sistema** → **Seguridad y privacidad** → **Firewall**
2. Si está activado, haz clic en **Opciones del firewall**
3. Agrega una excepción para **Python** o desactiva temporalmente el firewall para probar

---

## 📊 Verificar que Todo Funciona

### 1. Servidor Corriendo
Deberías ver en la terminal:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### 2. Acceso Local
Abre en tu navegador: http://localhost:8000

### 3. Acceso desde Red
Abre en otro dispositivo: http://[TU-IP]:8000

### 4. Verificar Base de Datos
```bash
ls -lh rely_pos.db
# Debería existir después de la primera ejecución
```

---

## 🆘 Soporte Adicional

### Reiniciar Todo desde Cero
Si nada funciona, empieza limpio:
```bash
cd "/Users/jorge/No sync/Proyectos/Obsidian Vault/Restaurantes v2"

# Eliminar entorno virtual
rm -rf venv/

# Eliminar base de datos (se recreará desde db.json)
rm -f rely_pos.db

# Ejecutar de nuevo
./INICIAR_RELY.command
```

### Logs de Depuración
Para ver todos los errores detallados, edita `INICIAR_RELY.command` y cambia:
```bash
$PYTHON_CMD -m pip install -r requirements.txt --quiet 2>&1
```
Por:
```bash
$PYTHON_CMD -m pip install -r requirements.txt
```

### Documentación de Dependencias
- [FastAPI](https://fastapi.tiangolo.com/)
- [Uvicorn](https://www.uvicorn.org/)
- [SQLite](https://www.sqlite.org/docs.html)

---

## ✅ Checklist de Verificación

Antes de reportar un problema, verifica:

- [ ] Python 3.7+ está instalado (`python3 --version`)
- [ ] El script es ejecutable (`chmod +x INICIAR_RELY.command`)
- [ ] Tienes permisos de escritura en la carpeta
- [ ] Estás en la misma red WiFi (para acceso desde otros dispositivos)
- [ ] El puerto 8000 no está ocupado
- [ ] El firewall permite conexiones entrantes
- [ ] Has intentado con `./INICIAR_RELY.command` (no doble clic si falla)

---

**Última actualización:** Septiembre 2026  
**Versión del sistema:** 2.1 (FastAPI + SQLite + Seguridad mejorada)
