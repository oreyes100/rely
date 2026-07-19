# MANUAL 1 — Cómo crear un nuevo VPS

Guía paso a paso para generar y entregar un servidor nuevo a un cliente.
Tienes **dos nodos** de hosting; cada uno es autónomo (su propia red/DHCP/NAT):

| Nodo | Acceso Proxmox | RAM libre p/VPS | Subred VPS | Gateway | Bridge de la NIC |
|---|---|---|---|---|---|
| **pve** (servidor 1) | https://192.168.1.4:8006 | ~17 GB | 192.168.6.0/24 | 192.168.6.1 | `vmbr0` (tag 6) |
| **pvececyte** (servidor 2) | https://192.168.1.254:8006 | ~8 GB | 192.168.7.0/24 | 192.168.7.1 | `vmbr7` (interno) |

> Elige el nodo según capacidad. Ambos tienen el mismo template `9000` con el stack
> (Node.js, Python, Docker, Supabase 1-click) y el SSH por contraseña ya habilitado.

---

## Paso 1 — Abrir el shell del nodo
En el Proxmox del nodo elegido: selecciona el nodo (pve / pvececyte) en el árbol
izquierdo → botón **>_ Shell**. (O SSH a la IP del nodo como root.)

## Paso 2 — Elegir VMID, recursos y plan
Cada VPS necesita un **VMID único** (número). Convención sugerida: 2xx para pve,
3xx para pvececyte. Planes de referencia:

| Plan | vCPU | RAM (MB) | Disco (GB) | Para |
|---|---|---|---|---|
| Dev | 1 | 2048 | 20 | Node/Python, apps chicas |
| Startup | 2 | 4096 | 40 | Supabase self-hosted completo |
| Pro | 4 | 8192 | 80 | Supabase + varias apps |

## Paso 3 — Aprovisionar (un solo comando)
El script clona el template, ajusta recursos, pone una contraseña y arranca el VPS.
Ya está en cada nodo como `/root/provision-vps.sh` (si no, cópialo de
`C:\vpsserver\scripts\provision-vps.sh`).

```bash
# Uso: ./provision-vps.sh <VMID> <nombre> [cores] [ram_MB] [disco_G] [password]
# Ejemplo — plan Startup para "cliente-acme" en este nodo:
./provision-vps.sh 203 cliente-acme 2 4096 40
```

El script imprime al final la **IP, usuario (`devops`) y password**. El primer
arranque tarda ~3-5 min (cloud-init instala Node/Python/Docker con internet).

### Alternativa manual (equivale al script)
```bash
qm clone 9000 203 --name cliente-acme --full
qm set 203 --cores 2 --memory 4096
qm set 203 --cipassword 'UnaClaveFuerte123!'
qm disk resize 203 scsi0 40G      # solo si quieres > 20 GB
qm start 203
```

## Paso 4 — Obtener la IP asignada
```bash
qm guest cmd 203 network-get-interfaces | grep -oE '192\.168\.[67]\.[0-9]+'
# o revisa el DHCP del nodo:
grep <nombre> /var/lib/misc/dnsmasq.leases
```
El VPS toma IP automáticamente del rango del nodo (`.100–.199`).

## Paso 5 — (Opcional) Dar acceso SSH desde internet
Los VPS no tienen IP pública propia; se exponen por **port-forward**:
`WAN → pfSense → nodo → DNAT → VPS`.

**5a. En el nodo** — edita `/root/pve-vlan6-gateway.sh` (pve) o
`/root/pvececyte-vps-gateway.sh` (pvececyte) y agrega una línea al array `PORTFWD`:
```bash
PORTFWD=(
  "2203:192.168.6.NNN:22"   # <puertoWAN>:<IP_del_VPS>:22   (SSH)
)
```
Luego re-corre el script (idempotente, persiste vía systemd):
```bash
bash /root/pve-vlan6-gateway.sh      # (o pvececyte-vps-gateway.sh)
```
Convención de puertos: SSH = `2000 + últimos dígitos`, HTTP = `8000 + …`, etc.
Fija además la IP del VPS con una reserva DHCP para que no cambie:
```bash
echo 'dhcp-host=<MAC_del_VPS>,192.168.6.NNN' >> /etc/dnsmasq.d/vps-static.conf
systemctl restart dnsmasq
# la MAC la ves con:  qm config <vmid> | grep net0
```

**5b. En pfSense** (https://192.168.1.1:8443) — Firewall → NAT → Port Forward → Add:
- Interface **WAN**, Protocol **TCP**
- Destination **WAN address**, Dest. port **2203**
- Redirect target IP **192.168.1.4** (pve) ó **192.168.1.254** (pvececyte)
- Redirect target port **2203**
- Marca "Add associated filter rule" → **Save** + **Apply**

Cliente conecta con: `ssh -p 2203 devops@207.248.113.8`

## Paso 6 — Para el "Supabase propio" (opcional, lo hace el cliente)
Dentro del VPS: `sudo install-supabase` → despliega Supabase self-hosted (Docker),
genera claves únicas, y expone Studio/API en el puerto 8000 del VPS (mapéalo con
otro port-forward si quiere acceso externo).

## Operaciones día-2
```bash
qm shutdown <vmid>              # suspender (p.ej. por impago)
qm start <vmid>                 # reactivar
qm set <vmid> --memory 8192 --cores 4   # subir de plan
qm disk resize <vmid> scsi0 +20G         # más disco (solo crecer)
qm destroy <vmid> --purge      # baja definitiva
```

## Checklist de entrega al cliente
- [ ] IP interna del VPS y/o **IP:puerto público** (207.248.113.8:2203)
- [ ] Usuario `devops` + **password** (pídele que la cambie: `passwd`)
- [ ] Nota: stack Node/Python/Docker preinstalado; `sudo install-supabase` para BaaS
- [ ] (Si aplica) port-forwards de sus servicios (web 80/443, etc.)
