#!/bin/sh
# Install the region-manager LuCI UI on the PassWall router ONLY (192.168.31.2).
set -eu
REPO=liuweihai/passwall-region-manager
PREFIX=luci-app-passwall-region-manager
for cmd in curl jq base64; do command -v "$cmd" >/dev/null 2>&1 || { echo "Missing $cmd"; exit 1; }; done
[ -x /usr/bin/passwall-region-manager ] || { echo "Region manager CLI not found: install on the PassWall side router"; exit 1; }
[ -d /www/luci-static ] || { echo "LuCI files not found"; exit 1; }
install_file() {
  rel="$1"; dst="$2"
  dir=${dst%/*}; mkdir -p "$dir"
  tmp="/tmp/prm-install-$$"
  url="https://api.github.com/repos/$REPO/contents/$PREFIX/$rel"
  curl -fLsS --connect-timeout 8 --max-time 40 -H 'Accept: application/vnd.github+json' "$url" |
    jq -er '.content' | base64 -d > "$tmp"
  [ -s "$tmp" ] || { echo "Empty download $rel"; exit 1; }
  if [ -f "$dst" ]; then cp "$dst" "$dst.before-prm-ui"; fi
  cp "$tmp" "$dst"; rm -f "$tmp"
  echo "Installed $dst"
}
install_file root/usr/libexec/prm-web /usr/libexec/prm-web
chmod 755 /usr/libexec/prm-web
install_file root/usr/share/rpcd/acl.d/luci-app-passwall-region-manager.json /usr/share/rpcd/acl.d/luci-app-passwall-region-manager.json
install_file root/usr/share/luci/menu.d/luci-app-passwall-region-manager.json /usr/share/luci/menu.d/luci-app-passwall-region-manager.json
install_file htdocs/luci-static/resources/view/passwall-region-manager/dashboard.js /www/luci-static/resources/view/passwall-region-manager/dashboard.js
/etc/init.d/rpcd restart
/etc/init.d/uhttpd restart
echo "Done. Open LuCI > Services > 地区节点管理"
