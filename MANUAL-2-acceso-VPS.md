# MANUAL 2 — Acceso a los VPS creados

Credenciales, direcciones, puertos y comandos SSH listos para copiar/pegar de los
VPS que ya están creados y **verificados** (DHCP + internet + stack + SSH).

- **IP pública (WAN) del sitio:** `207.248.113.8`
- **Usuario en todos:** `devops`  (tiene `sudo`; el SSH por contraseña ya está habilitado)
- Recomienda al cliente cambiar la contraseña al entrar: `passwd`

---

## VPS #1 — `vps-demo`  (nodo pve)

| Dato | Valor |
|---|---|
| Nodo | **pve** (192.168.1.4) |
| VMID | 202 |
| IP interna | **192.168.6.152** |
| Usuario | `devops` |
| Password | `VpsDemo-2026!` |
| Puerto WAN SSH | **2202** (regla pfSense activa ✅) |
| Stack | Node.js, Python 3.12, Docker, `install-supabase` |

**Acceso SSH desde internet (cualquier lado):**
```bash
ssh -p 2202 devops@207.248.113.8
# password: VpsDemo-2026!
```

**Acceso desde la consola del nodo pve** (Shell de Proxmox, red directa):
```bash
ssh devops@192.168.6.152
```

**Consola de emergencia (sin red, desde Proxmox):**
```bash
qm terminal 202        # consola serie ; salir con Ctrl+O
```

---

## VPS #2 — `vps-demo-n2`  (nodo pvececyte)

| Dato | Valor |
|---|---|
| Nodo | **pvececyte** (192.168.1.254) |
| VMID | 210 |
| IP interna | **192.168.7.140** |
| Usuario | `devops` |
| Password | `VpsDemo2-2026!` |
| Puerto WAN SSH | **2210** (DNAT del nodo listo ✅ — falta 1 regla en pfSense, ver abajo) |
| Stack | Node.js, Python 3.12, Docker, `install-supabase` |

**Acceso SSH desde internet** (funcionará al agregar la regla pfSense):
```bash
ssh -p 2210 devops@207.248.113.8
# password: VpsDemo2-2026!
```
> Regla que falta en pfSense (Firewall → NAT → Port Forward → Add):
> WAN · TCP · WAN address · puerto **2210** · redirect a **192.168.1.254** puerto **2210** · Save+Apply.

**Acceso desde la consola del nodo pvececyte:**
```bash
ssh devops@192.168.7.140       # password: VpsDemo2-2026!
qm terminal 210                # consola serie de emergencia
```

---

## VPS #3 — `pachucacv`  (nodo pvececyte)

| Dato | Valor |
|---|---|
| Nodo | **pvececyte** (192.168.1.254) |
| VMID | 300 |
| IP interna | **192.168.7.186** |
| Usuario | `devops` |
| Password | `cloud-init` |
| Puerto WAN SSH | **2300** (DNAT regla existente ✅ — `2300→192.168.7.186:22`) |
| Stack | Node.js, Python 3.12, Docker, `install-supabase` |

**Acceso SSH desde internet:**
```bash
ssh -p 2300 devops@207.248.113.8
# password: cloud-init
```

**Acceso desde la consola del nodo pvececyte:**
```bash
ssh devops@192.168.7.186       # password: cloud-init
qm terminal 300                  # consola serie de emergencia
```

**Reserva DHCP nueva MAC:**
La VM 300 usa la MAC `BC:24:11:93:8C:35` reservada para `192.168.7.186`.

---

## Ejemplos de uso (aplican a cualquier VPS)

Una vez dentro (`ssh -p 2202 devops@207.248.113.8`):

**Ver el stack instalado:**
```bash
node --version      # v18/22
python3 --version   # 3.12
docker --version
```

**Correr una app Node con PM2 (queda de servicio, reinicia sola):**
```bash
mkdir ~/app && cd ~/app
echo 'require("http").createServer((_,r)=>r.end("Hola VPS")).listen(3000)' > server.js
pm2 start server.js --name miapp
pm2 save && pm2 startup     # persistir tras reboot (sigue la línea que imprime)
curl localhost:3000         # -> Hola VPS
```

**Entorno Python aislado (venv):**
```bash
python3 -m venv ~/venv && source ~/venv/bin/activate
pip install flask
```

**Docker:**
```bash
docker run -d -p 8080:80 --name web nginx
curl localhost:8080
```

**Desplegar el "Supabase propio" (BaaS estilo Supabase):**
```bash
sudo install-supabase
# al terminar imprime: Studio en http://<IP-del-VPS>:8000, usuario supabase + password,
# y las claves ANON_KEY / SERVICE_ROLE_KEY (también en /opt/supabase/docker/.env)
```

**Exponer un servicio del VPS a internet** (p.ej. su web en el 80, o Supabase 8000):
pídelo con otro port-forward igual que el SSH (ver MANUAL-1, paso 5), eligiendo un
puerto WAN libre → IP del VPS : puerto interno.

---

## Cómo cambiar/asignar contraseña de un VPS
Desde el shell del nodo (Proxmox):
```bash
qm set 202 --cipassword 'NuevaClave123!'   # aplica al usuario devops
# (si el VPS ya arrancó, además dentro del VPS: sudo passwd devops)
```

## Acceso por llave SSH (más seguro que password — recomendado a futuro)
Al crear el VPS, inyecta la llave pública del cliente:
```bash
qm set <vmid> --sshkeys /ruta/cliente.pub   # antes de arrancar, o re-aplica y reinicia
```
Luego el cliente entra sin contraseña: `ssh -p <puerto> devops@207.248.113.8`.

---

## Resumen ultra-rápido (tarjeta de entrega)
```
VPS vps-demo    -> ssh -p 2202 devops@207.248.113.8   pass: VpsDemo-2026!
VPS vps-demo-n2 -> ssh -p 2210 devops@207.248.113.8   pass: VpsDemo2-2026!  (falta regla pfSense 2210)
VPS pachucacv   -> ssh -p 2300 devops@207.248.113.8   pass: cloud-init  (MAC BC:24:11:93:8C:35)
Usuario: devops (sudo)  |  Stack: Node+Python+Docker  |  BaaS: sudo install-supabase
```
