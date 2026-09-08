#!/usr/bin/env python3
"""
RELY POS Watchdog & Launcher
-----------------------------
Este script instala las dependencias necesarias (FastAPI + Uvicorn),
ejecuta la migración a SQLite si es necesario, y lanza el servidor
con auto-reinicio en caso de fallos.

Uso:
    python run.py [puerto]
"""
import subprocess
import time
import sys
import os
import socket
import signal

# Asegurar que estamos en el directorio correcto
script_dir = os.path.dirname(os.path.abspath(__file__))
os.chdir(script_dir)

def install_deps():
    """Instala las dependencias de requirements.txt si no están presentes."""
    print("📦 Verificando dependencias...")
    try:
        import fastapi
        import uvicorn
        print("✅ FastAPI y Uvicorn ya están instalados.")
    except ImportError:
        print("⏳ Instalando dependencias desde requirements.txt...")
        
        # Intentar múltiples estrategias
        strategies = [
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--quiet"],
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--user", "--quiet"],
            [sys.executable, "-m", "pip", "install", "-r", "requirements.txt", "--break-system-packages", "--quiet"],
            [sys.executable, "-m", "pip", "install", "fastapi", "uvicorn[standard]", "pydantic", "--quiet"],
        ]
        
        for i, cmd in enumerate(strategies, 1):
            print(f"   Intento {i}/{len(strategies)}...")
            try:
                subprocess.check_call(cmd, stderr=subprocess.STDOUT)
                print("✅ Dependencias instaladas correctamente.")
                return
            except subprocess.CalledProcessError as e:
                if i == len(strategies):
                    print(f"\n❌ Error al instalar dependencias: {e}")
                    print("   Por favor ejecuta manualmente:")
                    print(f"   {sys.executable} -m pip install -r requirements.txt")
                    sys.exit(1)
                continue

def migrate_if_needed():
    """Ejecuta la migración a SQLite si no existe rely_pos.db pero sí db.json."""
    if not os.path.exists('rely_pos.db') and os.path.exists('db.json'):
        print("🔄 Base de datos SQLite no encontrada. Ejecutando migración...")
        try:
            subprocess.check_call([sys.executable, "migrate_to_sqlite.py"])
            print("✅ Migración completada.")
        except subprocess.CalledProcessError as e:
            print(f"❌ Error en la migración: {e}")
            sys.exit(1)
    elif not os.path.exists('rely_pos.db') and not os.path.exists('db.json'):
        print("⚠️  No se encontró db.json ni rely_pos.db. El servidor creará una BD vacía.")

def is_port_in_use(port):
    """Verifica si un puerto está en uso."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) == 0

def kill_process_on_port(port):
    """Intenta matar procesos que estén usando el puerto especificado."""
    try:
        # macOS: usar lsof
        if sys.platform == 'darwin':
            result = subprocess.run(
                ['lsof', '-ti', f':{port}'],
                capture_output=True,
                text=True
            )
            if result.returncode == 0 and result.stdout.strip():
                pids = result.stdout.strip().split('\n')
                print(f"🔪 Eliminando procesos huérfanos en puerto {port}...")
                for pid in pids:
                    if pid:
                        try:
                            subprocess.run(['kill', '-9', pid], check=True)
                            print(f"   ✓ Proceso {pid} terminado.")
                        except:
                            pass
                time.sleep(1)
                return True
        # Linux: usar fuser
        elif sys.platform.startswith('linux'):
            result = subprocess.run(
                ['fuser', '-k', f'{port}/tcp'],
                capture_output=True,
                stderr=subprocess.STDOUT
            )
            if result.returncode == 0:
                print(f"   ✓ Puerto {port} liberado.")
                time.sleep(1)
                return True
    except Exception as e:
        print(f"   ⚠️  No se pudo limpiar el puerto: {e}")
    return False

def find_free_port(start_port):
    """Encuentra un puerto libre empezando desde start_port."""
    for port in range(start_port, start_port + 10):
        if not is_port_in_use(port):
            return port
    return None

def run_server(port):
    """Lanza el servidor Uvicorn con auto-reinicio."""
    consecutive_errors = 0
    MAX_CONSECUTIVE_ERRORS = 3
    
    # Verificar si el puerto está en uso antes de iniciar
    if is_port_in_use(port):
        print(f"\n⚠️  El puerto {port} está en uso. Intentando liberarlo...")
        if kill_process_on_port(port):
            time.sleep(2)
            # Verificar nuevamente
            if is_port_in_use(port):
                print(f"   ⚠️  No se pudo liberar el puerto {port}. Buscando puerto alternativo...")
                new_port = find_free_port(port + 1)
                if new_port:
                    print(f"   ✅ Usando puerto alternativo: {new_port}")
                    port = new_port
                else:
                    print(f"   ❌ No se encontraron puertos libres entre {port+1} y {port+10}")
                    sys.exit(1)
        else:
            print(f"   ⚠️  No se pudo liberar el puerto. Buscando puerto alternativo...")
            new_port = find_free_port(port + 1)
            if new_port:
                print(f"   ✅ Usando puerto alternativo: {new_port}")
                port = new_port
            else:
                print(f"   ❌ No se encontraron puertos libres.")
                sys.exit(1)
    
    print(f"\n🚀 Iniciando RELY POS Server (FastAPI + Uvicorn) en puerto {port}...")
    print("-" * 60)
    print("  Accede al sistema desde cualquier dispositivo en tu red:")
    print(f"  http://localhost:{port}")
    print(f"  http://[IP-DE-TU-PC]:{port}")
    print("-" * 60)
    print("")
    
    while True:
        try:
            process = subprocess.Popen([
                sys.executable, "-m", "uvicorn", 
                "server:app", 
                "--host", "0.0.0.0", 
                "--port", str(port),
                "--log-level", "info"
            ])
            process.wait()
            
            if process.returncode != 0:
                # Si es error de puerto ocupado (código 3 en Uvicorn), manejar especialmente
                if process.returncode == 3:
                    consecutive_errors += 1
                    print(f"\n⚠️  Error: Puerto {port} en uso (intento {consecutive_errors}/{MAX_CONSECUTIVE_ERRORS})")
                    
                    if consecutive_errors >= MAX_CONSECUTIVE_ERRORS:
                        print(f"\n❌ El puerto {port} sigue ocupado después de {MAX_CONSECUTIVE_ERRORS} intentos.")
                        print("\n📋 Soluciones:")
                        print(f"   1. Cierra otros programas que puedan estar usando el puerto {port}")
                        print(f"   2. Ejecuta: lsof -i :{port}  (para ver qué está usando el puerto)")
                        print(f"   3. Mata el proceso: kill -9 [PID]")
                        print(f"   4. Usa otro puerto: python run.py 8001")
                        print(f"   5. Reinicia tu computadora")
                        sys.exit(1)
                    else:
                        print(f"   🔪 Intentando liberar puerto...")
                        if kill_process_on_port(port):
                            time.sleep(2)
                            if is_port_in_use(port):
                                print(f"   ⚠️  Puerto aún ocupado. Cambiando a puerto alternativo...")
                                new_port = find_free_port(port + 1)
                                if new_port:
                                    print(f"   ✅ Cambiando a puerto {new_port}")
                                    port = new_port
                                else:
                                    print(f"   ❌ No hay puertos alternativos disponibles.")
                                    sys.exit(1)
                        else:
                            print(f"   ⚠️  No se pudo liberar. Cambiando a puerto alternativo...")
                            new_port = find_free_port(port + 1)
                            if new_port:
                                print(f"   ✅ Cambiando a puerto {new_port}")
                                port = new_port
                            else:
                                print(f"   ❌ No hay puertos alternativos disponibles.")
                                sys.exit(1)
                else:
                    consecutive_errors = 0  # Reset counter for other types of errors
                    print(f"\n⚠️  Server crasheó con código {process.returncode}. Reiniciando en 3 segundos...")
            else:
                consecutive_errors = 0
                print("\n🛑 Server se detuvo voluntariamente. Reiniciando en 3 segundos...")
                
            time.sleep(3)
        except KeyboardInterrupt:
            print("\n👋 Cerrando watchdog...")
            if 'process' in locals():
                try:
                    process.terminate()
                    process.wait(timeout=2)
                except Exception:
                    pass
            break
        except Exception as e:
            print(f"\n❌ Error en watchdog: {e}. Reiniciando en 5 segundos...")
            time.sleep(5)

if __name__ == "__main__":
    # Determine port
    if len(sys.argv) > 1:
        port = int(sys.argv[1])
    else:
        port = int(os.getenv('PORT', '8000'))
    
    install_deps()
    migrate_if_needed()
    run_server(port)