#!/bin/sh
# Static guardrails; these do not claim actual network correctness.
set -eu
cd "$(dirname "$0")/.."
CORE=root/usr/sbin/bypass-failover
SIDE=experimental/side-bypass-companion.sh
UI=htdocs/luci-static/resources/view/bypass-failover/dashboard.js
sh -n "$CORE"
sh -n "$SIDE"
# Primary never rewrite all client TCP to source .1, which previously
# risked same-interface conntrack hairpins.
if grep -Eq 'snat ip to \$PRIMARY|snat ip to 192\.168\.31\.1' "$CORE"; then
 echo 'FAIL: primary includes obsolete SNAT-to-primary rule' >&2
 exit 1
fi
grep -F 'chain observe_to_side' "$CORE" >/dev/null
grep -F 'chain test_egress' "$CORE" >/dev/null
grep -F 'single-arm return path is not validated; full-home auto routing remains safety locked' "$CORE" >/dev/null
grep -F 'client route test is safety locked' "$CORE" >/dev/null
grep -F 'disabled' "$UI" >/dev/null
grep -F 'type nat hook postrouting' "$SIDE" >/dev/null
grep -F 'ip saddr $CLIENT' "$SIDE" >/dev/null
grep -F 'lease_expire()' "$SIDE" >/dev/null
grep -F 'token="$(date +%s)-$"' "$SIDE" >/dev/null
grep -F 'expected=' "$SIDE" >/dev/null
echo 'Source-preserving strategy and safety-lock static tests passed'
