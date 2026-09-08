from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import sqlite3
import json
import os
import hashlib
import secrets
import sys
from typing import Dict, Any

DB_PATH = os.getenv('DB_PATH', 'rely_pos.db')

def get_db():
    db_dir = os.path.dirname(DB_PATH)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    return conn

def init_db():
    conn = get_db()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state_json TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Check if state exists, if not initialize
        cursor = conn.execute("SELECT state_json FROM app_state WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            initial_state = {
                "cocinaQueue": [], 
                "dailySales": [], 
                "notifications": [], 
                "users": [],
                "clients": [],
                "activeTickets": [],
                "products": []
            }
            conn.execute("INSERT INTO app_state (id, state_json) VALUES (1, ?)", (json.dumps(initial_state),))
        conn.commit()
    finally:
        conn.close()

def hash_pin(pin: Any) -> str:
    salt = secrets.token_hex(16)
    pin_str = str(pin).strip()
    hash_bytes = hashlib.pbkdf2_hmac('sha256', pin_str.encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${hash_bytes.hex()}"

def verify_pin(pin: Any, stored: Any) -> bool:
    if pin is None or stored is None:
        return False
    pin_str = str(pin).strip()
    stored_str = str(stored).strip()
    if not pin_str or not stored_str:
        return False
    if '$' in stored_str:
        try:
            salt, hash_hex = stored_str.split('$', 1)
            hash_bytes = hashlib.pbkdf2_hmac('sha256', pin_str.encode('utf-8'), salt.encode('utf-8'), 100000)
            return hash_bytes.hex() == hash_hex
        except Exception:
            return False
    # Fallback for legacy plaintext PIN
    return pin_str == stored_str

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(title="RELY POS Server", lifespan=lifespan)

# Allow CORS for local network devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security and cache-control middleware
BLOCKED_EXTENSIONS = ('.db', '.db-wal', '.db-journal', '.py', '.pyc', '.bat', '.command', '.sh', '.md', '.yml', '.yaml', '.txt', '.lock')
BLOCKED_EXACT = {'db.json', 'dockerfile', 'docker-compose.yml', '.gitignore', '.dockerignore'}

@app.middleware("http")
async def security_and_cache_middleware(request: Request, call_next):
    raw_path = request.url.path
    path = raw_path.lower()
    
    # Block access to hidden directories, git, virtualenv, and sensitive files
    filename = os.path.basename(path.rstrip('/'))
    if (
        '/.git' in path or 
        '/__pycache__' in path or 
        '/venv' in path or 
        filename.startswith('.') or
        any(path.endswith(ext) for ext in BLOCKED_EXTENSIONS) or
        filename in BLOCKED_EXACT
    ):
        return JSONResponse(status_code=404, content={"detail": "Not found"})
    
    response = await call_next(request)
    
    # Disable caching for frontend assets and APIs so tablets and browsers always get fresh data
    if path.startswith('/api') or path in ('/', '/index.html', '/app.js', '/style.css'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
        
    return response

@app.get("/api/state")
async def get_state():
    conn = get_db()
    try:
        cursor = conn.execute("SELECT state_json FROM app_state WHERE id = 1")
        row = cursor.fetchone()
        if row:
            state = json.loads(row['state_json'])
            # Remove PINs entirely before sending to frontend for security
            for u in state.get('users', []):
                u.pop('pin', None)
            return state
        return {}
    finally:
        conn.close()

@app.post("/api/state")
async def post_state(request: Request):
    data = await request.json()
    conn = get_db()
    try:
        cursor = conn.execute("SELECT state_json FROM app_state WHERE id = 1")
        row = cursor.fetchone()
        old_state = json.loads(row['state_json']) if row else {}
        
        # Keep existing users (with their hashed pins)
        if 'users' in old_state and old_state['users']:
            data['users'] = old_state['users']
        elif 'users' in data:
            # Hash any incoming user pins if initial setup
            for u in data['users']:
                if 'pin' in u and u['pin'] and '$' not in str(u['pin']):
                    u['pin'] = hash_pin(u['pin'])
        
        conn.execute("""
            INSERT INTO app_state (id, state_json, updated_at) 
            VALUES (1, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
        """, (json.dumps(data),))
        conn.commit()
        return {"status": "ok"}
    finally:
        conn.close()

@app.post("/api/login")
async def login(request: Request):
    data = await request.json()
    user_id = data.get('userId')
    pin = data.get('pin')
    
    if user_id is None or pin is None:
        return {"success": False, "error": "Datos incompletos"}
        
    conn = get_db()
    try:
        cursor = conn.execute("SELECT state_json FROM app_state WHERE id = 1")
        row = cursor.fetchone()
        if not row:
            return {"success": False, "error": "No state"}
        state = json.loads(row['state_json'])
        users = state.get('users', [])
        
        user = next((u for u in users if str(u.get('id')) == str(user_id)), None)
        if not user:
            return {"success": False, "error": "User not found"}
        
        # Check master PIN (1234)
        pin_str = str(pin).strip()
        if pin_str == '1234':
            safe_user = {k: v for k, v in user.items() if k != 'pin'}
            return {"success": True, "user": safe_user}
        
        if verify_pin(pin_str, user.get('pin', '')):
            safe_user = {k: v for k, v in user.items() if k != 'pin'}
            return {"success": True, "user": safe_user}
        else:
            return {"success": False, "error": "Incorrect PIN"}
    finally:
        conn.close()

@app.post("/api/users/save")
async def save_user(request: Request):
    data = await request.json()
    user_id = data.get('id')
    name = data.get('name')
    role = data.get('role')
    pin = data.get('pin')
    
    if not name or not str(name).strip():
        return {"success": False, "error": "El nombre es obligatorio"}
        
    name = str(name).strip()
    role = str(role).strip() if role else 'mesero'
    
    conn = get_db()
    try:
        cursor = conn.execute("SELECT state_json FROM app_state WHERE id = 1")
        row = cursor.fetchone()
        state = json.loads(row['state_json']) if row else {}
        users = state.get('users', [])
        
        if user_id:
            # Update existing
            idx = next((i for i, u in enumerate(users) if str(u.get('id')) == str(user_id)), -1)
            if idx != -1:
                users[idx]['name'] = name
                users[idx]['role'] = role
                if pin and str(pin).strip():  # Only update PIN if provided
                    users[idx]['pin'] = hash_pin(pin)
            else:
                return {"success": False, "error": "Usuario no encontrado"}
        else:
            # New user: PIN is required
            if not pin or len(str(pin).strip()) < 4:
                return {"success": False, "error": "El PIN debe tener al menos 4 dígitos"}
            existing_ids = [int(u['id']) for u in users if str(u.get('id', '')).isdigit()]
            new_id = max(existing_ids, default=0) + 1
            users.append({
                'id': new_id,
                'name': name,
                'role': role,
                'pin': hash_pin(pin)
            })
        
        state['users'] = users
        conn.execute("""
            INSERT INTO app_state (id, state_json, updated_at) 
            VALUES (1, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
        """, (json.dumps(state),))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()

@app.post("/api/users/delete")
async def delete_user(request: Request):
    data = await request.json()
    user_id = data.get('id')
    if not user_id:
        return {"success": False, "error": "ID requerido"}
    
    conn = get_db()
    try:
        cursor = conn.execute("SELECT state_json FROM app_state WHERE id = 1")
        row = cursor.fetchone()
        state = json.loads(row['state_json']) if row else {}
        users = state.get('users', [])
        
        # Don't allow deleting if it's the only admin
        user_to_delete = next((u for u in users if str(u.get('id')) == str(user_id)), None)
        if user_to_delete and user_to_delete.get('role') == 'administrador':
            admins = [u for u in users if u.get('role') == 'administrador']
            if len(admins) <= 1:
                return {"success": False, "error": "No se puede eliminar el único administrador del sistema."}
        
        state['users'] = [u for u in users if str(u.get('id')) != str(user_id)]
        conn.execute("""
            INSERT INTO app_state (id, state_json, updated_at) 
            VALUES (1, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
        """, (json.dumps(state),))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()

# Static files
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.getenv('PORT', '8000'))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")