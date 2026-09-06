import http.server
import json
import os
import sys

# Determinar puerto: argumento de línea de comandos > variable de entorno > 8000 por defecto
if len(sys.argv) > 1:
    PORT = int(sys.argv[1])
else:
    PORT = int(os.getenv('PORT', '8000'))
DB_FILE = 'db.json'

# Initialize database if it doesn't exist
if not os.path.exists(DB_FILE):
    with open(DB_FILE, 'w') as f:
        json.dump({
            "cocinaQueue": [], 
            "dailySales": [], 
            "notifications": [], 
            "users": [],
            "clients": [],
            "activeTickets": [],
            "products": []
        }, f)

class POSRequestHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        try:
            super().log_message(format, *args)
        except Exception:
            pass

    def end_headers(self):
        # Deshabilitar cache para que cambios de estilos, interfaz y estado se reflejen de inmediato
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_GET(self):
        if self.path == '/api/state':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            with open(DB_FILE, 'r') as f:
                self.wfile.write(f.read().encode('utf-8'))
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/state':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            with open(DB_FILE, 'w') as f:
                f.write(post_data.decode('utf-8'))
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404)
            self.end_headers()

try:
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), POSRequestHandler) as httpd:
        print(f"RELY POS Server running on port {PORT}")
        httpd.serve_forever()
except Exception as e:
    print(f"Error fatal en el servidor: {e}")
