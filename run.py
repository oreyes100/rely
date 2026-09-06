import subprocess
import time
import sys

def run_server():
    print("RELY POS Server Watchdog iniciado.")
    while True:
        try:
            print("Iniciando RELY POS Server (server.py)...")
            # We use the current python executable to run server.py
            process = subprocess.Popen([sys.executable, "server.py"])
            
            # This will wait until the process finishes (crashes or is stopped)
            process.wait()
            
            if process.returncode != 0:
                print(f"Server crasheó con código {process.returncode}. Reiniciando en 3 segundos...")
            else:
                print("Server se detuvo voluntariamente. Reiniciando de todas formas...")
                
            time.sleep(3)
        except KeyboardInterrupt:
            print("Cerrando watchdog...")
            process.terminate()
            break
        except Exception as e:
            print(f"Error en watchdog: {e}. Reiniciando en 5 segundos...")
            time.sleep(5)

if __name__ == "__main__":
    run_server()
