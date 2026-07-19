#!/bin/bash
# Gateway de VPS en el nodo pvececyte (segundo nodo de hosting).
# Los VPS viven aquí en un bridge INTERNO (vmbr7, sin puertos físicos): su tráfico
# es 100% local, no toca la NIC tg3 ni los switches ni la VLAN 6 de pve. Cada nodo
# es autónomo. Subred distinta (192.168.7.0/24) para no chocar con los VPS de pve.
# Ejecutar como root en el shell de pvececyte. Idempotente. NO toca pfSense.
set -euo pipefail

GWIP=192.168.7.1
NET=192.168.7.0/24
UPLINK=vmbr0            # salida de pvececyte a pfSense/internet (default route)
BR=vmbr7               # bridge interno para VPS (se crea si no existe)

echo "[1/5] Bridge interno $BR + IP $GWIP..."
if ! ip link show $BR >/dev/null 2>&1; then
  ip link add name $BR type bridge
fi
ip link set $BR up
ip addr replace $GWIP/24 dev $BR

echo "[2/5] IP forwarding..."
sysctl -qw net.ipv4.ip_forward=1

# Port-forwards de entrada a VPS. Formato: "puerto_en_pvececyte:ip_vps:puerto_vps"
# (llega vía pfSense WAN -> pvececyte(192.168.1.254):puerto -> DNAT -> VPS).
PORTFWD=(
  "2210:192.168.7.140:22"    # ejemplo: SSH al VPS 210
)

echo "[3/5] NAT + aislamiento (nftables, tabla propia vpsgw7)..."
nft list table inet vpsgw7 >/dev/null 2>&1 && nft delete table inet vpsgw7
nft -f - <<NFT
table inet vpsgw7 {
  chain prerouting {
    type nat hook prerouting priority dstnat; policy accept;
  }
  chain postrouting {
    type nat hook postrouting priority srcnat; policy accept;
    ip saddr $NET oif "$UPLINK" masquerade
  }
  chain forward {
    type filter hook forward priority filter; policy accept;
    ct state established,related accept
    ip saddr $NET ip daddr 192.168.0.0/22 drop
    ip saddr $NET ip daddr 192.168.2.0/24 drop
    ip saddr $NET ip daddr 192.168.4.0/24 drop
    ip saddr $NET ip daddr 192.168.5.0/24 drop
    ip saddr $NET ip daddr 192.168.6.0/24 drop
    ip saddr $NET accept
  }
}
NFT
for pf in "${PORTFWD[@]}"; do
  WP=${pf%%:*}; rest=${pf#*:}; VIP=${rest%%:*}; VPRT=${rest##*:}
  nft add rule inet vpsgw7 prerouting iif "$UPLINK" tcp dport $WP dnat ip to $VIP:$VPRT
done

echo "[4/5] DHCP/DNS (dnsmasq) en $BR..."
if ! command -v dnsmasq >/dev/null; then
  apt-get update -qq && apt-get install -y -qq dnsmasq
fi
mkdir -p /etc/dnsmasq.d
cat > /etc/dnsmasq.d/vps-vmbr7.conf <<CONF
interface=$BR
bind-interfaces
except-interface=lo
dhcp-range=192.168.7.100,192.168.7.199,255.255.255.0,12h
dhcp-option=3,$GWIP
dhcp-option=6,$GWIP,8.8.8.8
CONF
systemctl enable dnsmasq >/dev/null 2>&1 || true
systemctl restart dnsmasq

echo "[5/5] OK. Gateway VPS activo en pvececyte."
echo "  Bridge: $BR   IP: $GWIP/24"
echo "  DHCP:   192.168.7.100-199   NAT: $NET -> $UPLINK -> internet"
echo "GW7_READY"
