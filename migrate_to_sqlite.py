#!/usr/bin/env python3
"""
Migración de db.json a SQLite (rely_pos.db)
-------------------------------------------
Este script convierte el archivo plano db.json en una base de datos SQLite
transaccional, encriptando los PINs de los usuarios en el proceso.

Uso:
    python migrate_to_sqlite.py

Si ya existe rely_pos.db, se hará una copia de seguridad antes de sobrescribir.
"""

import json
import sqlite3
import os
import hashlib
import secrets
from datetime import datetime

def hash_pin(pin) -> str:
    """Genera un hash seguro para un PIN usando PBKDF2-HMAC-SHA256 con sal."""
    salt = secrets.token_hex(16)
    hash_bytes = hashlib.pbkdf2_hmac('sha256', str(pin).strip().encode('utf-8'), salt.encode('utf-8'), 100000)
    return f"{salt}${hash_bytes.hex()}"

DB_FILE = 'rely_pos.db'
JSON_FILE = 'db.json'

def migrate():
    print("=" * 60)
    print("  RELY POS - Migración a SQLite")
    print("=" * 60)
    print()
    
    # Backup existing DB
    if os.path.exists(DB_FILE):
        backup_name = f"{DB_FILE}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        print(f"⚠️  Ya existe {DB_FILE}. Creando copia de seguridad: {backup_name}")
        os.rename(DB_FILE, backup_name)
        print("✅ Copia de seguridad creada.")
        print()
    
    # Check if JSON exists
    if not os.path.exists(JSON_FILE):
        print(f"⚠️  No se encontró {JSON_FILE}. Creando base de datos vacía...")
        state = {
            "cocinaQueue": [], 
            "dailySales": [], 
            "notifications": [], 
            "users": [],
            "clients": [],
            "activeTickets": [],
            "products": []
        }
    else:
        print(f"📖 Leyendo {JSON_FILE}...")
        with open(JSON_FILE, 'r', encoding='utf-8') as f:
            state = json.load(f)
        print(f"✅ Datos leídos correctamente.")
        print()
        
        # Hash existing PINs
        print("🔐 Encriptando PINs de usuarios...")
        users = state.get('users', [])
        for u in users:
            if 'pin' in u and u['pin'] and '$' not in str(u['pin']):
                old_pin = str(u['pin'])
                u['pin'] = hash_pin(old_pin)
                print(f"   - Usuario '{u.get('name', 'N/A')}' (PIN: {old_pin}) → Encriptado ✅")
        print()
    
    # Create SQLite database
    print(f"💾 Creando base de datos SQLite: {DB_FILE}...")
    conn = sqlite3.connect(DB_FILE, timeout=10)
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS app_state (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                state_json TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.execute("""
            INSERT INTO app_state (id, state_json, updated_at) 
            VALUES (1, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(id) DO UPDATE SET state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP
        """, (json.dumps(state),))
        conn.commit()
        
        print("✅ Base de datos creada exitosamente.")
        print()
        
        # Show stats
        cursor = conn.execute("SELECT length(state_json) FROM app_state WHERE id = 1")
        size = cursor.fetchone()[0]
        print(f"📊 Estadísticas:")
        print(f"   - Tamaño del estado: {size:,} bytes")
        print(f"   - Usuarios: {len(state.get('users', []))}")
        print(f"   - Productos: {len(state.get('products', []))}")
        print(f"   - Tickets activos: {len(state.get('activeTickets', []))}")
        print(f"   - Ventas históricas: {len(state.get('dailySales', []))}")
        print(f"   - Cola de cocina: {len(state.get('cocinaQueue', []))}")
        print(f"   - Notificaciones: {len(state.get('notifications', []))}")
        print(f"   - Clientes: {len(state.get('clients', []))}")
        
    finally:
        conn.close()
    
    print()
    print("=" * 60)
    print("  ✅ MIGRACIÓN COMPLETADA")
    print("=" * 60)
    print()
    print("Próximos pasos:")
    print("1. Instala las dependencias: pip install -r requirements.txt")
    print("2. Ejecuta el servidor: python run.py")
    print(f"3. (Opcional) Elimina el antiguo {JSON_FILE} si todo funciona bien.")
    print()

if __name__ == "__main__":
    migrate()