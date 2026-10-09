# PassWall Region Manager

**版本：v0.1.0（预览版）**

OpenWrt / PassWall 多地区节点管理器：按名称扫描 US、JP、HK、SG、TW、KR 节点，使用独立临时 Xray 实例检测 HTTPS 和实际出口国家，缓存合格节点，并提供分流预览。

> ⚠️ **当前未实现无人值守故障切换、定时监控和自动按网站分流。** 不要在生产网络执行 `apply`；先使用只读命令验证。在路由器上测试时，不需要改动现有小米 DHCP、PassWall 主节点或 DNS。

## 安装依赖

OpenWrt 25.12+：`apk add jq curl`，同时需要已经安装 Xray、PassWall 和 UCI。

安装主脚本到 `/usr/bin/passwall-region-manager`，赋予执行权限；如需修改默认映射，将 `regions.conf.example` 复制为路由器本地的 `/etc/passwall-region-manager/regions.conf`。

## 命令

```sh
passwall-region-manager scan
passwall-region-manager verify US
passwall-region-manager status
passwall-region-manager plan
```

`verify` 不带地区时会扫描所有支持的地区；已验证结果缓存约 30 分钟。检测可能影响 R2S 性能，建议先按国家测试。

## 安全与隐私

本仓库是 **Public**。仅包含通用脚本和示例文件。绝不要提交订阅 URL、UUID、REALITY 公私钥、`/etc/config/passwall`、实际节点配置、设备备份、`verified.tsv` 或临时探测 JSON。

**国家名称只是候选归类**，只有实际 IP 地区验证成功才可以视为合格；IP 地理位置数据库自身也可能不准确。

## 后续规划

- v0.1.x：探测兼容性、并发稳定性和错误分类
- v0.2.x：健康检查、锁机制、安全切换及回滚
- v0.3.x：多地区节点池接入网站分流

本版本代码尚未在全部 OpenWrt 设备上完成实机测试，不保证协议的完整兼容性。
