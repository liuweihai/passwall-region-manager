#!/bin/sh
# Build-time safety checks only: no network behavior is claimed.
set -eu
cd "$(dirname "$0")/.."
CORE=root/usr/sbin/bypass-failover
UI=htdocs/luci-static/resources/view/bypass-failover/dashboard.js
BUILD=build-ipk.sh
sh -n "$CORE"
sh -n root/usr/libexec/bypass-failover-web
sh -n root/etc/init.d/bypass-failover
if grep -Eq 'snat ip to \$PRIMARY|snat ip to 192\.168\.31\.1' "$CORE"; then
 echo 'FAIL: obsolete primary SNAT is present' >&2
 exit 1
fi
grep -F 'chain observe_to_side' "$CORE" >/dev/null
grep -F 'chain test_egress' "$CORE" >/dev/null
grep -F 'client route test is safety locked' "$CORE" >/dev/null
grep -F 'full-home auto routing remains safety locked' "$CORE" >/dev/null
grep -F 'deployment=primary_only' "$CORE" >/dev/null
grep -F 'side_package_required=no' "$CORE" >/dev/null
grep -F 'policy_priority_10201=' "$CORE" >/dev/null
grep -F 'verified_client_connectivity=no' "$CORE" >/dev/null
grep -F 'health_report()' "$CORE" >/dev/null
grep -F 'transparent_proxy=unverified' "$CORE" >/dev/null
grep -F 'client_return_path=unverified' "$CORE" >/dev/null
grep -F 'automatic_switch=blocked' "$CORE" >/dev/null
grep -F 'health-report) health_report' "$CORE" >/dev/null
grep -F 'health-report' root/usr/libexec/bypass-failover-web >/dev/null
grep -F 'disabled' "$UI" >/dev/null
if grep -q 'bypass-failover-side_' "$BUILD"; then
 echo 'FAIL: main packaging must not create a side-router IPK' >&2
 exit 1
fi
echo 'primary-only beta7 static safety checks passed'
