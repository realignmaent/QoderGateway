# Cloudflare Tunnel 安全边缘路由与网关工具

本目录提供可选的公网安全反代与安全门禁组件，适合将本地部署的 QoderGateway 配合其他反代服务（如 WorkBuddy / 本地模型）安全共享给好友或远程客户端（cc-switch / CherryStudio / NextChat）使用，无需公网 IP 与路由器端口映射。

## 核心特性
- **收敛路由白名单**：仅放行 `/v1/models` 与 `/v1/chat/completions`，所有管理后台路由（`/console`, `/ui`, `/admin`, `/.env` 等）直接拦截响应 403 Forbidden。
- **Bearer Token 虚拟化门禁**：无有效 Key 直接 401 丢弃，防扫描与爬虫，防暴力破解（连续 5 次错误自动封禁 IP 10 分钟）。
- **智能多路聚合**：支持单 Provider 模式（聚合全量模型并自动分流），亦支持独立子路径 `/qoder/v1` 与 `/wb/v1`。
- **硬件温控安全气囊**：内置机身/主板温度检测（默认阈值 45°C），过热自动熔断降温（返回 429）。

## 启动方法
```bash
chmod +x start_public_ai.sh
./start_public_ai.sh
```
启动成功后，终端将输出由 Cloudflare 分配的安全访问网址（或通过 `cat public_url.txt` 查看）。
