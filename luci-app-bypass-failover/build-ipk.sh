#!/usr/bin/env bash
# Portable builder for an all-architecture OpenWrt 24.10 ipk.
set -euo pipefail
TOP=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$TOP/.." && pwd)
OUT="$REPO/dist"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$OUT" "$WORK/control" "$WORK/data"
cp -a "$TOP/root/." "$WORK/data/"
cp -a "$TOP/htdocs/." "$WORK/data/www/"
chmod 755 "$WORK/data/usr/sbin/bypass-failover" "$WORK/data/usr/libexec/bypass-failover-web" "$WORK/data/etc/init.d/bypass-failover"
sh -n "$WORK/data/usr/sbin/bypass-failover"
sh -n "$WORK/data/usr/libexec/bypass-failover-web"
sh -n "$WORK/data/etc/init.d/bypass-failover"
python3 -m json.tool "$WORK/data/usr/share/luci/menu.d/luci-app-bypass-failover.json" >/dev/null
python3 -m json.tool "$WORK/data/usr/share/rpcd/acl.d/luci-app-bypass-failover.json" >/dev/null
cat > "$WORK/control/control" <<'EOF'
Package: luci-app-bypass-failover
Version: 0.3.0-beta1
Architecture: all
Maintainer: liuweihai
Depends: luci-base, curl, ip-full, nftables, jq, ca-bundle
Section: luci
Priority: optional
Description: Bypass router failover beta - direct mode by default, automatic routing gated by validation
EOF
printf '%s\n' /etc/config/bypass_failover > "$WORK/control/conffiles"
printf '2.0\n' > "$WORK/debian-binary"
tar -C "$WORK/control" -czf "$WORK/control.tar.gz" .
tar -C "$WORK/data" -czf "$WORK/data.tar.gz" .
(
  cd "$WORK"
  ar cr "$OUT/luci-app-bypass-failover_0.3.0-beta1_all.ipk" debian-binary control.tar.gz data.tar.gz
)
echo "Built $OUT/luci-app-bypass-failover_0.3.0-beta1_all.ipk"
