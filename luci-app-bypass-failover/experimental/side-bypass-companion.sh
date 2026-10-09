#!/bin/sh
# Side-router companion for single-arm PassWall. EXPERIMENTAL, opt-in.
# NEVER installed or started on the primary router.
set -u
TABLE=bypass_failover_side
LEASE=/tmp/bypass-failover-side-lease.token
CFG=/etc/config/bypass_failover_side
get() { uci -q get "bypass_failover_side.main.$1" 2>/dev/null || printf '%s' "$2"; }
valid_ip() {
 case "$1" in ''|*[!0-9.]*|.*|*..*|*.) return 1;; esac
 printf '%s\n' "$1" | awk -F. 'NF==4 {for(i=1;i<=4;i++) if($i !~ /^[0-9]+$/ || $i>255 || length($i)>3) exit 1; exit 0} {exit 1}'
}
check() {
 SIDE=$(get side '')
 PRIMARY=$(get primary '')
 CLIENT=$(get client '')
 LAN=$(get lan br-lan)
 for ip in "$SIDE" "$PRIMARY" "$CLIENT"; do valid_ip "$ip" || { echo "invalid IPv4: $ip" >&2; return 1; }; done
 [ "$SIDE" != "$PRIMARY" ] && [ "$SIDE" != "$CLIENT" ] && [ "$PRIMARY" != "$CLIENT" ] || return 1
 ip -4 addr show dev "$LAN" | grep -Fq "$SIDE/" || { echo 'side IP is not assigned to LAN' >&2; return 1; }
 ip -4 route show default | grep -Fq "via $PRIMARY dev $LAN" || { echo 'side default route must be via primary on LAN' >&2; return 1; }
 [ "$(get role side)" = side ] || { echo 'wrong router role' >&2; return 1; }
 [ "$(cat /proc/sys/net/ipv4/ip_forward)" = 1 ] || { echo 'IPv4 forwarding disabled' >&2; return 1; }
 nft list table inet passwall >/dev/null 2>&1 || { echo 'PassWall nft table absent' >&2; return 1; }
 # Explicitly refuse if the client is currently connected through a bridge
 # other than the configured LAN; never guess interface names.
 ip -4 route get "$CLIENT" | grep -Fq "dev $LAN" || { echo 'client not on same LAN' >&2; return 1; }
}
audit() {
 check || return 1
 echo "side=$SIDE"
 echo "primary=$PRIMARY"
 echo "client=$CLIENT"
 echo "lan=$LAN"
 echo "passwall_table=present"
 echo "forwarding=enabled"
 echo "default_via_primary=yes"
 if nft list table inet "$TABLE" >/dev/null 2>&1; then echo 'companion=installed'; else echo 'companion=absent'; fi
 echo "warning=only_forwarded_direct_TCP_is_snat_to_side"
 echo "activation=manual_opt_in"
 echo "end_to_end=not_verified"
}
apply() {
 [ "$(get allow_apply 0)" = 1 ] || { echo 'explicit allow_apply=1 required' >&2; return 1; }
 check || return 1
 nft list table inet "$TABLE" >/dev/null 2>&1 && { echo 'companion already installed; refusing overwrite' >&2; return 1; }
 # Only forward-path packets from the named client that PassWall did NOT
 # REDIRECT to Xray qualify; local proxy egress originates at SIDE and never
 # matches CLIENT. Do not alter existing PassWall table or its TCP listener.
 nft -f - <<EOF
table inet $TABLE {
 set trial_clients {
  type ipv4_addr
  flags timeout
  elements = { $CLIENT timeout 60s }
 }
 chain direct_snat {
  type nat hook postrouting priority srcnat - 5; policy accept;
  ip saddr @trial_clients ip daddr != 10.0.0.0/8 ip daddr != 172.16.0.0/12 ip daddr != 192.168.0.0/16 ip daddr != 127.0.0.0/8 ip daddr != 169.254.0.0/16 ip daddr != 224.0.0.0/4 meta l4proto tcp oifname "$LAN" counter snat ip to $SIDE
 }
}
EOF
 if ! nft list table inet "$TABLE" >/dev/null 2>&1; then
  echo 'side NAT could not be verified after application' >&2
  return 1
 fi
 # Kernel-enforced nft set-element expiry stops matching after 60 seconds,
 # even if the detached userspace cleanup process crashes.
 # The detached worker also removes the inert table afterward.
 token="$(date +%s)-$"
 printf '%s\n' "$token" > "$LEASE"
 ( "$0" lease-expire "$token" </dev/null >/dev/null 2>&1 & )
 echo 'companion applied for up to 60 seconds; not a connectivity proof'
}
lease_expire() {
 # Only withdraw our own generation: an older worker may not delete a newer
 # test's rules after the operator removes and reapplies them.
 expected="${1:-}"
 [ -n "$expected" ] || return 1
 sleep 60
 [ "$(cat "$LEASE" 2>/dev/null)" = "$expected" ] || return 0
 nft delete table inet "$TABLE" >/dev/null 2>&1 || true
 rm -f "$LEASE"
}
remove() {
 # Own table only; never touch PassWall/fw4/custom NAT tables.
 if nft list table inet "$TABLE" >/dev/null 2>&1; then
  nft delete table inet "$TABLE" || return 1
 fi
 rm -f "$LEASE"
 echo 'companion removed'
}
case "${1:-audit}" in
 audit) audit;;
 apply) apply;;
 remove) remove;;
 lease-expire) lease_expire "${2:-}";;
 *) echo 'usage: audit|apply|remove' >&2; exit 2;;
esac
