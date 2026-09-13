# Método de conexión a servidores VPS y Proxmox

Documento que resume el método usado para conectarse a los servidores virtuales (VPS) y a los nodos **Proxmox VE** (`pve` y `pvedell`). Todo se ejecuta desde **Windows PowerShell**.

---

## 1. Diagrama de conexión

```
Windows (PowerShell)
   │
   │  ssh root@192.168.1.4          (nodo Proxmox "pve", puente/bastión)
   ▼
192.168.1.4  "pve"   ── Proxmox VE (11 VMs)
   │
   │  sshpass -p '...' ssh root@192.168.1.96
   ▼
192.168.1.96 "pvedell" ── Proxmox VE (VMs 500, 9001 + storage vmdata)
```

- **Windows NO tiene `sshpass`**, por eso se usa el nodo `pve` (192.168.1.4) como **puente/bastion** para llegar a `pvedell` (192.168.1.96).
- `sshpass` está instalado dentro de `pve` (192.168.1.4) y permite pasar la contraseña por línea de comandos.
- `scp` desde Windows también funciona pasando por el puente.

---

## 2. Credenciales

| Host | Rol | SSH | Contraseña root |
|---|---|---|---|
| `192.168.1.4` | `pve`, nodo Proxmox + bastión SSH | `ssh root@192.168.1.4` | `uljTQZj_MKCuayAQ` |
| `192.168.1.96` | `pvedell`, nodo Proxmox | `ssh root@192.168.1.96` (vía puente) | `Michoacan1` |

Accesos web (WebUI):
- `https://192.168.1.96:8006` → login `root@pam` / `Michoacan1`
- `https://192.168.1.4:8006` → login `root@pam`

> **Nota:** estas credenciales provienen de la infraestructura del usuario y se documentan aquí para referencia operativa. No exponer externamente.

---

## 3. Conexión directa a `pve` (192.168.1.4)

Desde PowerShell:

```powershell
ssh -o StrictHostKeyChecking=no root@192.168.1.4
```

Entra sin clave SSH configurada (se usa la contraseña `uljTQZj_MKCuayAQ`). Dentro de `pve` hay instalado `sshpass`.

---

## 4. Conexión a `pvedell` (192.168.1.96) vía puente

### 4.1 Un comando ejecutar un script remoto

```powershell
scp -o StrictHostKeyChecking=no "C:\Users\User\AppData\Local\Temp\opencode\script.sh" root@192.168.1.4:/tmp/
ssh -o StrictHostKeyChecking=no root@192.168.1.4 "bash /tmp/script.sh"
```

Donde `script.sh` **empieza con**:

```bash
#!/bin/bash
sshpass -p 'Michoacan1' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=25 root@192.168.1.96 '
  ... comandos remotos de pvedell ...
'
```

### 4.2 Ejecutar una línea directa en pvedell

```bash
sshpass -p 'Michoacan1' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=25 root@192.168.1.96 'uptime; pvecm status'
```

### 4.3 Patrón estándar (single script autocontenido)

```powershell
# en Windows:
scp -o StrictHostKeyChecking=no script.sh root@192.168.1.4:/tmp/script.sh
ssh -o StrictHostKeyChecking=no root@192.168.1.4 "bash /tmp/script.sh"
```

```bash
# script.sh (se copia a 192.168.1.4 y se ejecuta ahí):
#!/bin/bash
sshpass -p 'Michoacan1' ssh -o StrictHostKeyChecking=no root@192.168.1.96 <<'REMOTE'
set -e
# comandos remotos en pvedell...
pvecm status
journalctl -u pveproxy --since "1 hour ago" --no-pager | tail -30
REMOTE
```

---

## 5. Notas de PowerShell

- **No** se usan `cd` dentro de los comandos (se usa el parámetro `workdir` cuando se necesita otro directorio).
- Se encadenan comandos dependientes con `cmd1; if ($?) { cmd2 }`, NO con `&&` (PowerShell 5.1 no lo soporta).
- Para llamar a un binario con ruta con espacios: `& "ruta\con espacios\exe" args`.
- Las salidas largas se capturan a un archivo; se usan `Read`/`Grep` sobre ese archivo en lugar de `Select-String`/`Select-Object -First` para no truncar.

---

## 6. Triggers para `scp` de scripts

Los scripts que se suben suelen dejar su copia local en `C:\Users\User\AppData\Local\Temp\opencode\` antes de subirlos vía `scp` a `root@192.168.1.4:/tmp/`.

Ejemplo real de la sesión (diagnóstico del nodo pvedell):

```powershell
scp -o StrictHostKeyChecking=no "C:\Users\User\AppData\Local\Temp\opencode\pvedell_diag401.sh" root@192.168.1.4:/tmp/ 2>&1 | Out-Null
ssh -o StrictHostKeyChecking=no root@192.168.1.4 "bash /tmp/pvedell_diag401.sh" 2>&1 | Select-Object -Last 60
```

---

## 7. Verificación rápida del estado de los nodos Proxmox

```bash
# en pvedell (por puente):
systemctl is-active corosync pve-cluster pveproxy pvedaemon
pvecm status | grep -E "Quorate|Total votes"
curl -sk -o /dev/null -w "%{http_code}\n" https://127.0.0.1:8006   # 200 = WebUI ok

# en pve (directo):
ssh root@192.168.1.4 'systemctl is-active pveproxy; pvecm status | head -5'
```

---

## 8. Conclusión / flujo recomendado

1. Verificar que `192.168.1.4` responde por SSH.
2. Subir script a `/tmp` del puente con `scp`.
3. Ejecutarlo desde el puente con `ssh root@192.168.1.4 "bash /tmp/script.sh"`.
4. El script interno usa `sshpass` para entrar a `pvedell` y correr los comandos remotos.
5. Para tareas de diagnóstico WebUI: usar la API local `https://127.0.0.1:8006/api2/json` con login `root@pam` (obtener ticket y usarlo en las llamadas).