#!/bin/sh
# Source installer for Xiaomi/OpenWrt main router only. No auto-enable.
set -eu
[ "$(uci -q get network.lan.ipaddr)" = 192.168.31.1 ] || { echo "Wrong device: expected main router 192.168.31.1"; exit 1; }
[ -d /www/luci-static ] || { echo 'LuCI installation required'; exit 1; }
for cmd in curl jq base64; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd"; exit 1; }; done
BASE=https://api.github.com/repos/liuweihai/passwall-region-manager/contents/luci-app-bypass-failover
get() {
 src=$1; dst=$2; tmp=/tmp/bf-install-$$
 mkdir -p "${dst%/*}"
 curl -fLsS --connect-timeout 8 --max-time 40 -H 'Accept: application/vnd.github+json' "$BASE/$src" -o "$tmp.json"
 jq -er '.content' "$tmp.json" | base64 -d > "$tmp"
 [ -s "$tmp" ] || { echo "empty download: $src"; exit 1; }
 [ ! -f "$dst" ] || cp "$dst" "$dst.before-bf"
 cp "$tmp" "$dst"
 rm -f "$tmp" "$tmp.json"
 echo "Installed $dst"
}
get root/usr/sbin/bypass-failover /usr/sbin/bypass-failover
chmod 755 /usr/sbin/bypass-failover
sh -n /usr/sbin/bypass-failover
get root/etc/init.d/bypass-failover /etc/init.d/bypass-failover
chmod 755 /etc/init.d/bypass-failover
[ -f /etc/config/bypass_failover ] || get root/etc/config/bypass_failover /etc/config/bypass_failover
get root/usr/libexec/bypass-failover-web /usr/libexec/bypass-failover-web
chmod 755 /usr/libexec/bypass-failover-web
get root/usr/share/luci/menu.d/luci-app-bypass-failover.json /usr/share/luci/menu.d/luci-app-bypass-failover.json
get root/usr/share/rpcd/acl.d/luci-app-bypass-failover.json /usr/share/rpcd/acl.d/luci-app-bypass-failover.json
get htdocs/luci-static/resources/view/bypass-failover/dashboard.js /www/luci-static/resources/view/bypass-failover/dashboard.js
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
echo 'Installed but NOT enabled. See Services > 旁路由智能容灾.'
