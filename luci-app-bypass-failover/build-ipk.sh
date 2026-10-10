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
chmod 755 "$WORK/data/usr/sbin/bypass-failover" "$WORK/data/usr/libexec/bypass-failover-web" "$WORK/data/etc/init.d/bypass-failover" "$WORK/data/etc/hotplug.d/iface/95-bypass-failover"
sh -n "$WORK/data/usr/sbin/bypass-failover"
sh -n "$WORK/data/usr/libexec/bypass-failover-web"
sh -n "$WORK/data/etc/init.d/bypass-failover"
sh -n "$WORK/data/etc/hotplug.d/iface/95-bypass-failover"
python3 -m json.tool "$WORK/data/usr/share/luci/menu.d/luci-app-bypass-failover.json" >/dev/null
python3 -m json.tool "$WORK/data/usr/share/rpcd/acl.d/luci-app-bypass-failover.json" >/dev/null
cat > "$WORK/control/control" <<'EOF'
Package: luci-app-bypass-failover
Version: 1.6.0-rc1
Architecture: all
Maintainer: liuweihai
Depends: luci-base, curl, ip-full, nftables, jq, ca-bundle
Section: luci
Priority: optional
Description: Same-LAN bypass failover with detailed ICMP DNS HTTPS diagnostics and bounded logs
EOF
printf '%s\n' /etc/config/bypass_failover > "$WORK/control/conffiles"
# Use opkg lifecycle hooks to supervise auto mode after upgrades and
# withdraw owned nft / route resources before package removal.
cat > "$WORK/control/postinst" <<'POSTINST'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
[ -x /etc/init.d/bypass-failover ] || exit 0
/etc/init.d/bypass-failover enable || exit 1
# An unconfigured first install is valid: open LuCI and enter the side IP.
# Upgrade an already configured router by restarting its supervised daemon.
side=$(uci -q get bypass_failover.main.bypass 2>/dev/null || true)
if [ -n "$side" ]; then
  /etc/init.d/bypass-failover restart || {
    echo "bypass-failover: service failed to start; no routing activated" >&2
    # Package installation must not pretend service is operational.
    exit 1
  }
fi
exit 0
POSTINST
cat > "$WORK/control/prerm" <<'PRERM'
#!/bin/sh
[ -n "${IPKG_INSTROOT:-}" ] && exit 0
[ -x /etc/init.d/bypass-failover ] || exit 0
/etc/init.d/bypass-failover stop || exit 1
exit 0
PRERM
chmod 755 "$WORK/control/postinst" "$WORK/control/prerm"
sh -n "$WORK/control/postinst"
sh -n "$WORK/control/prerm"

printf '2.0\n' > "$WORK/debian-binary"
tar -C "$WORK/control" -czf "$WORK/control.tar.gz" .
tar -C "$WORK/data" -czf "$WORK/data.tar.gz" .
# OpenWrt 24.10 opkg expects the classic gzipped tar IPK envelope,
# not a Debian ar archive. Match OpenWrt scripts/ipkg-build.
(
  cd "$WORK"
  tar --format=gnu --numeric-owner -cf - ./debian-binary ./data.tar.gz ./control.tar.gz | gzip -n > "$OUT/luci-app-bypass-failover_1.6.0-rc1_all.ipk"
)
# Reject malformed packages at build time; verify both inner archives.
tar -tzf "$OUT/luci-app-bypass-failover_1.6.0-rc1_all.ipk" | grep -Fx './control.tar.gz' >/dev/null
tar -tzf "$OUT/luci-app-bypass-failover_1.6.0-rc1_all.ipk" | grep -Fx './data.tar.gz' >/dev/null
tar -tzf "$OUT/luci-app-bypass-failover_1.6.0-rc1_all.ipk" | grep -Fx './debian-binary' >/dev/null
echo "Built $OUT/luci-app-bypass-failover_1.6.0-rc1_all.ipk (OpenWrt opkg tar.gz format)"
