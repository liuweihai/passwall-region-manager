# PassWall Region Manager

> **v0.1.0 — 预览/测试版；尚未实现无人值守故障切换。**

用于 OpenWrt/PassWall 的多国家节点筛选与独立出口校验。按名称识别美国、日本、香港、新加坡、台湾、韩国节点，使用临时 Xray 探测 HTTPS 连通性和出口地区。

## 当前能力

- `scan`：只读扫描已配置的节点。
- `verify US`：验证某个地区（US/JP/HK/SG/TW/KR）；`verify` 验证全部地区。
- `status`：查看验证结果；`plan`：预览 AIGC/Streaming/Proxy 映射。
- 最多四任务并发、单次连接超时、验证通过结果缓存。

## 安全边界

- 默认**不会**修改已运行的主节点、DNS、DHCP 或防火墙，也不会安装定时任务。
- 包含实验性的 `apply` 命令，但当前版本 **禁止用于生产网络**；请勿运行。
- **尚未实现**节点故障后自动切换，也尚未保证按网站分流上线。
- 节点名称标签不代表真实所在国家；地区服务不可用则不能当成通过验证。
- **绝对不要**上传 `/etc/config/passwall`、订阅地址、节点 UUID/REALITY 密钥、测试产生的临时 JSON 或 `verified.tsv` 到公开仓库。

## 在路由器上部署

通过 Mac 传输（当前 R2S 的 Dropbear 需要 `scp -O`）：

```sh
scp -O passwall-region-manager regions.conf.example root@192.168.31.2:/tmp/
```

在 OpenWrt SSH：

```sh
apk add jq
install -m 700 /tmp/passwall-region-manager /usr/bin/passwall-region-manager
mkdir -p /etc/passwall-region-manager
cp /tmp/regions.conf.example /etc/passwall-region-manager/regions.conf
sh -n /usr/bin/passwall-region-manager
/usr/bin/passwall-region-manager scan
/usr/bin/passwall-region-manager verify US
/usr/bin/passwall-region-manager status
/usr/bin/passwall-region-manager plan
```

如果已有 `/etc/passwall-region-manager/regions.conf`，**不要覆盖**，仅参照示例调整。

## 版本计划

- v0.1.x：完善扫描、缓存、快速验证和地区校验。
- v0.2.x：安全故障切换、失败回滚及定时监控。
- v0.3.x：各地区节点池与网站分流接入。

当前为公开仓库：严禁提交真实路由器配置、订阅凭据和节点密钥。
