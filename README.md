# RELY POS - Sistema de Punto de Venta
## Pozolería, Tacos y Enchiladas

Sistema POS web de código abierto diseñado específicamente para restaurantes de comida mexicana. 
Funciona en red local (LAN) permitiendo operación simultánea desde múltiples dispositivos (tablets, PCs, teléfonos).

### 🚀 Características Principales

- **Multi-dispositivo:** Sincronización en tiempo real entre caja, cocina y meseros
- **PWA:** Instalable en tablets/celulares como app nativa (modo kiosco)
- **Pantalla de Cocina (KDS):** Sistema de notificaciones cuando la comida está lista
- **Gestión de Mesas:** 12 mesas con control de comandas y abonos parciales
- **Menú Complejo:** Soporte para modificadores, mezclas de rellenos y notas especiales
- **Impresión Térmica:** Tickets en impresoras 80mm con formato profesional
- **Contabilidad:** Reportes por fecha, corte de caja y reimpresión de tickets
- **Gestión de Clientes:** Base de datos para pedidos a domicilio

### 🔧 Mejoras Técnicas Recientes (v2.1)

#### 1. Base de Datos SQLite (Transaccional)
- **Antes:** Archivo plano `db.json` propenso a corrupción por cortes de luz
- **Ahora:** Base de datos SQLite con WAL (Write-Ahead Logging) y transacciones atómicas
- **Beneficio:** Integridad de datos garantizada incluso con fallos de energía

#### 2. Seguridad de Contraseñas (Hashing)
- **Antes:** PINs almacenados en texto plano en la base de datos
- **Ahora:** Hashing con PBKDF2-HMAC-SHA256 + sal única por usuario
- **Beneficio:** Los PINs nunca se almacenan ni transmiten en texto plano
- **PIN Maestro:** `1234` (respaldo para evitar bloqueos)

#### 3. Servidor Web Profesional (FastAPI + Uvicorn)
- **Antes:** `http.server` de Python (experimental, no apto para producción)
- **Ahora:** FastAPI con Uvicorn (servidor ASGI de alto rendimiento)
- **Beneficio:** Estabilidad, concurrencia real y mejor manejo de errores

### 📦 Instalación y Ejecución

#### Requisitos
- Python 3.7 o superior
- pip (gestor de paquetes de Python)

#### Pasos de Instalación

1. **Migrar base de datos** (solo la primera vez):
   ```bash
   python migrate_to_sqlite.py
   ```
   Este script convertirá tu `db.json` existente a `rely_pos.db` y encriptará los PINs.

2. **Ejecutar el servidor**:
   
   **En Windows:**
   ```bash
   EJECUTAR_POS.bat
   ```
   
   **En macOS/Linux:**
   ```bash
   ./INICIAR_RELY.command
   # o manualmente:
   python run.py
   ```

   El script `run.py`:
   - Instala automáticamente las dependencias (FastAPI, Uvicorn)
   - Ejecuta la migración si es necesaria
   - Inicia el servidor con auto-reinicio en caso de fallos

3. **Acceder al sistema**:
   - En la misma PC: `http://localhost:8000`
   - Desde otros dispositivos en la red: `http://[IP-DE-TU-PC]:8000`

### 👥 Usuarios por Defecto

| Nombre | Rol | PIN | Acceso |
|--------|-----|-----|--------|
| Abner | Administrador | (encriptado) | Total |
| Marta | Cajera | (encriptado) | POS, Cobros, Contabilidad |
| Luis | Mesero | (encriptado) | Mesas, Comandas, Clientes |
| Pedro | Cocinero | (encriptado) | Pantalla KDS |

**PIN Maestro de Respaldo:** `1234` (funciona para cualquier usuario)

### 📁 Estructura del Proyecto

```
Restaurantes v2/
├── server.py              # Servidor FastAPI + lógica de BD
├── run.py                 # Watchdog y launcher
├── migrate_to_sqlite.py   # Script de migración JSON → SQLite
├── app.js                 # Lógica del frontend (Vanilla JS)
├── index.html             # Interfaz de usuario
├── style.css              # Estilos
├── manifest.json          # Configuración PWA
├── requirements.txt       # Dependencias Python
├── rely_pos.db            # Base de datos SQLite (generada)
├── db.json                # Base de datos antigua (puede eliminarse tras migración)
├── EJECUTAR_POS.bat       # Launcher Windows
└── INICIAR_RELY.command   # Launcher macOS/Linux
```

### 🔐 Seguridad

- **PINs encriptados:** Los PINs nunca se muestran en la interfaz, solo hashes
- **Comunicación local:** El sistema está diseñado para red LAN aislada
- **HTTPS recomendado:** Para producción, usa un reverse proxy (nginx/Caddy) con SSL
- **Firewall:** Limita el acceso al puerto 8000 solo a la red local

### 🐛 Solución de Problemas

**El servidor no inicia:**
```bash
# Verifica que Python esté instalado
python --version

# Instala dependencias manualmente
pip install -r requirements.txt

# Ejecuta directamente para ver errores
python server.py
```

**No puedo acceder desde otros dispositivos:**
1. Verifica que estés en la misma red WiFi/LAN
2. Encuentra la IP de tu PC: `ipconfig` (Windows) o `ifconfig` (Mac/Linux)
3. Accede a `http://[IP-DE-TU-PC]:8000`
4. Si no funciona, revisa el firewall de tu PC y permite el puerto 8000

**Los datos no se guardan:**
- Verifica que `rely_pos.db` exista y tenga permisos de escritura
- Revisa la consola del navegador (F12) para errores de red

### 📄 Licencia

Este proyecto es de código abierto. Úsalo, modifícalo y compártelo libremente.

---

**Desarrollado para RELY: Pozolería, Tacos y Enchiladas** 🌮🍲