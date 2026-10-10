#!/bin/sh
# Build-time safety checks only: no network behavior is claimed.
set -eu
cd "$(dirname "$0")/.."
CORE=root/usr/sbin/bypass-failover
UI=htdocs/luci-static/resources/view/bypass-failover/dashboard.js
BUILD=build-ipk.sh
sh -n "$CORE"
# Prevent regression: the detached watchdog must write its real shell PID.
grep -F 'echo "$$" > "$TEST_PID"' "$CORE" >/dev/null || { echo 'FAIL: watchdog PID expansion missing' >&2; exit 1; }
if grep -F 'echo "$" > "$TEST_PID"' "$CORE" >/dev/null; then
 echo 'FAIL: broken watchdog PID expansion' >&2
 exit 1
fi
sh -n root/usr/libexec/bypass-failover-web
sh -n root/etc/init.d/bypass-failover
grep -Fx 'USE_PROCD=1' root/etc/init.d/bypass-failover >/dev/null
grep -F 'procd_set_param respawn' root/etc/init.d/bypass-failover >/dev/null
grep -F 'start) start;; stop) stop;; restart) stop; start;;' "$CORE" >/dev/null
grep -F 'prepare) prepare;;' "$CORE" >/dev/null
grep -F 'cleanup-owned) cleanup_owned;;' "$CORE" >/dev/null
sh -n root/etc/hotplug.d/iface/95-bypass-failover
if grep -Eq 'meta mark \$MARK.*snat ip|snat ip to 192\.168\.31\.1' "$CORE"; then
 echo 'FAIL: blanket primary SNAT is present' >&2
 exit 1
fi
grep -F 'chain observe_to_side' "$CORE" >/dev/null
grep -F 'fw4_forward_install()' "$CORE" >/dev/null
grep -F 'fw4_forward_clear()' "$CORE" >/dev/null
grep -F 'nft insert rule inet fw4 forward' "$CORE" >/dev/null
grep -F 'nft delete rule inet fw4 forward handle' "$CORE" >/dev/null
grep -F 'fw4_forward_rule=' "$CORE" >/dev/null
grep -F 'chain dns_to_side' "$CORE" >/dev/null
grep -F 'ip daddr $PRIMARY meta l4proto { tcp, udp } th dport 53' "$CORE" >/dev/null
grep -F 'lan_ingress_packets=' "$CORE" >/dev/null
grep -F 'side_egress_packets=' "$CORE" >/dev/null
grep -F 'client_end_to_end_unverified' "$CORE" >/dev/null
grep -F 'full_route_intact()' "$CORE" >/dev/null
grep -F 'current=direct' "$CORE" >/dev/null
grep -F 'ct status dnat meta l4proto' "$CORE" >/dev/null
grep -F 'ip daddr $PRIMARY meta l4proto' "$CORE" >/dev/null
grep -F 'dns_strategy=client_primary_to_side_when_bypass' "$CORE" >/dev/null
grep -F 'ipv6_strategy=unmanaged_not_a_full_ipv6_failover' "$CORE" >/dev/null
grep -F 'chain dns_return' "$CORE" >/dev/null
grep -F 'th dport 53 counter dnat ip to $BYPASS' "$CORE" >/dev/null
grep -F 'th dport 53 counter snat ip to $PRIMARY' "$CORE" >/dev/null
grep -F 'client_dns_redirect=' "$CORE" >/dev/null
grep -F 'dns=unavailable' "$CORE" >/dev/null
grep -F 'chain test_egress' "$CORE" >/dev/null
grep -F 'test-watchdog) test_watchdog' "$CORE" >/dev/null
grep -F 'mode=auto' "$CORE" >/dev/null
grep -F 'deployment=primary_only' "$CORE" >/dev/null
grep -F 'side_package_required=no' "$CORE" >/dev/null
grep -F 'policy_priority_10201=' "$CORE" >/dev/null
grep -F 'verified_client_connectivity=no' "$CORE" >/dev/null
grep -F 'health_report()' "$CORE" >/dev/null
grep -F 'side=offline' "$CORE" >/dev/null
grep -F 'external=skipped' "$CORE" >/dev/null
grep -F 'side=online' "$CORE" >/dev/null
grep -F 'external=reachable_via_side_route' "$CORE" >/dev/null
grep -F 'probe_transparent; then' "$CORE" >/dev/null
grep -F 'client_return_path=direct_l2_from_side_unverified' "$CORE" >/dev/null
grep -F 'decision=direct' "$CORE" >/dev/null
grep -F 'decision=side_candidate' "$CORE" >/dev/null
grep -F 'health-report) health_report' "$CORE" >/dev/null
grep -F 'health-report' root/usr/libexec/bypass-failover-web >/dev/null
grep -F 'disabled' "$UI" >/dev/null
grep -F 'meta l4proto { tcp, udp }' "$CORE" >/dev/null
grep -F 'live_routing=' "$CORE" >/dev/null
grep -F 'fallback_policy=main' "$CORE" >/dev/null
grep -F 'log_maintenance()' "$CORE" >/dev/null
grep -F 'log_limit_bytes=131072' "$CORE" >/dev/null
grep -F 'health_targets=' "$CORE" >/dev/null
grep -F 'HTTPS结果 target=1.1.1.1:443' "$CORE" >/dev/null
grep -F 'DNS结果 resolver=' "$CORE" >/dev/null
grep -F 'ICMP结果 target=' "$CORE" >/dev/null
grep -F 'lan_forwarding=' "$CORE" >/dev/null
grep -F '主路由 IPv4 转发未开启' "$CORE" >/dev/null
grep -F 'WORK/control/postinst' "$BUILD" >/dev/null
grep -F 'WORK/control/prerm' "$BUILD" >/dev/null
grep -F '/etc/init.d/bypass-failover restart' "$BUILD" >/dev/null

if grep -q 'bypass-failover-side_' "$BUILD"; then
 echo 'FAIL: main packaging must not create a side-router IPK' >&2
 exit 1
fi
echo 'primary-only experimental failover static checks passed'
