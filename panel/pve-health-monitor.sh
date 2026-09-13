#!/bin/bash
# Proxmox host + VM health monitor
# Ejecutar via cron cada 5 min

set -euo pipefail

LOG="/var/log/pve-health.log"
ALERT_LOG="/var/log/pve-alerts.log"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG"; }
alert() { echo "[$(date '+%F %T')] ALERT: $*" | tee -a "$ALERT_LOG" | logger -t pve-health; }

# 1. Host: carga, memoria, disco
load=$(uptime | awk -F"load average:" '{print $2}' | awk '{print $1}' | sed 's/,//')
mem_free=$(free -m | awk '/Mem:/ {print $7}')
disk_root=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
disk_lvm=$(df -h /var/lib/vz | awk 'NR==2 {print $5}' | sed 's/%//')

[ "${load%.*}" -gt 50 ] && alert "HOST LOAD alto: $load"
[ "$mem_free" -lt 500 ] && alert "HOST MEM libre baja: ${mem_free}MB"
[ "$disk_root" -gt 85 ] && alert "HOST DISK / alto: ${disk_root}%"
[ "$disk_lvm" -gt 85 ] && alert "HOST DISK /var/lib/vz alto: ${disk_lvm}%"

# 2. LVM-thin pool usage
lvm_usage=$(lvs --noheadings -o data_percent pve/data 2>/dev/null | tr -d ' %' | cut -d'.' -f1)
[ -n "$lvm_usage" ] && [ "$lvm_usage" -gt 80 ] && alert "LVM-THIN pool usage alto: ${lvm_usage}%"

# 3. VMs críticas: estado, guest-agent, ping
for vmid in 100 210 211 250 300; do
    status=$(qm status $vmid 2>/dev/null | awk '{print $2}')
    [ "$status" != "running" ] && alert "VM $vmid NO RUNNING (status=$status)"
    
    # Guest agent ping
    if [ "$status" = "running" ]; then
        ga=$(qm guest cmd $vmid ping 2>/dev/null | grep -c "pong" || true)
        [ "$ga" -eq 0 ] && alert "VM $vmid guest-agent NO RESPONDE"
    fi
done

# 4. SMART disk health
smartctl -H /dev/sda 2>/dev/null | grep -q "PASSED" || alert "SMART /dev/sda FAIL"

# 5. Kernel errors en dmesg
dmesg -l err,crit,alert,emerg 2>/dev/null | grep -q "." && alert "Kernel errors en dmesg"

log "Health check OK: load=$load mem_free=${mem_free}MB disk_root=${disk_root}% lvm=${lvm_usage}%"