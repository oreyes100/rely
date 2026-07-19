#!/bin/bash
# Gateway de la VLAN 6 (VPS) corriendo en el nodo pve.
# Los VPS viven en pve (tag=6 en vmbr0); su tráfico es local al bridge, así que
# NO pasa por la NIC tg3 de pvececyte (que rompía el tag). pve hace de router:
# IP .1, DHCP (dnsmasq), NAT hacia internet vía su uplink, y aislamiento.
# Ejecutar como root en el shell del nodo pve. Idempotente.
set -euo pipefail

VLAN=6
GWIP=192.168.6.1
NET=192.168.6.0/24
UPLINK=vmbr0            # salida a pfSense/internet (default route de pve)
IFACE=vmbr0v6

echo "[1/5] Interfaz VLAN $VLAN en pve ($GWIP)..."
bridge vlan add dev vmbr0 vid $VLAN self 2>/dev/null || true
ip link show $IFACE >/dev/null 2>&1 || ip link add link vmbr0 name $IFACE type vlan id $VLAN
ip addr replace $GWIP/24 dev $IFACE
ip link set $IFACE up

echo "[2/5] IP forwarding..."
sysctl -qw net.ipv4.ip_forward=1

# Port-forwards de entrada a VPS. Formato: "puerto_en_pve:ip_vps:puerto_vps"
# (llega vía pfSense WAN -> pve:puerto -> DNAT -> VPS). Agrega los que necesites.
PORTFWD=(
  "2202:192.168.6.152:22"    # ejemplo: SSH al VPS 202
)

echo "[3/5] NAT + aislamiento (nftables)..."
nft list table inet vpsgw >/dev/null 2>&1 && nft delete table inet vpsgw
nft -f - <<NFT
table inet vpsgw {
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
    ip saddr $NET accept
  }
}
NFT
for pf in "${PORTFWD[@]}"; do
  WP=${pf%%:*}; rest=${pf#*:}; VIP=${rest%%:*}; VPRT=${rest##*:}
  nft add rule inet vpsgw prerouting iif "$UPLINK" tcp dport $WP dnat ip to $VIP:$VPRT
done

echo "[4/5] DHCP/DNS (dnsmasq) en $IFACE..."
if ! command -v dnsmasq >/dev/null; then
  apt-get update -qq && apt-get install -y -qq dnsmasq
fi
mkdir -p /etc/dnsmasq.d
cat > /etc/dnsmasq.d/vps-vlan6.conf <<CONF
interface=$IFACE
bind-interfaces
except-interface=lo
dhcp-range=192.168.6.100,192.168.6.199,255.255.255.0,12h
dhcp-option=3,$GWIP
dhcp-option=6,$GWIP,8.8.8.8
CONF
systemctl enable dnsmasq >/dev/null 2>&1 || true
systemctl restart dnsmasq

echo "[5/5] OK. Gateway VLAN6 activo en pve."
echo "  IP:    $GWIP/24 en $IFACE"
echo "  DHCP:  192.168.6.100-199   NAT: $NET -> $UPLINK -> internet"
echo "GW_READY"
