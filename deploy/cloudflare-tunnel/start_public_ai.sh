#!/data/data/com.termux/files/usr/bin/bash
# OnePlus 9 双反代安全公网隧道拉起与守护脚本

DIR="$(cd "$(dirname "$0")" && pwd)"
GATEWAY_PY="$DIR/public_ai_gateway.py"
LOG_DIR="$DIR/logs"
mkdir -p "$LOG_DIR"

GATEWAY_LOG="$LOG_DIR/gateway.log"
CF_LOG="$LOG_DIR/cloudflared.log"
URL_FILE="$DIR/public_url.txt"

# 1. 停止旧进程
pkill -f "public_ai_gateway.py" 2>/dev/null
pkill -f "cloudflared tunnel" 2>/dev/null
sleep 1

# 2. 启动双反代安全融合网关 (:8081)
nohup python3 "$GATEWAY_PY" > "$GATEWAY_LOG" 2>&1 &
echo "[1/3] 双反代安全融合网关已在后台启动 (:8081)..."
sleep 1

# 3. 启动 Cloudflare Tunnel 安全隧道
rm -f "$CF_LOG"
nohup cloudflared tunnel --url http://127.0.0.1:8081 > "$CF_LOG" 2>&1 &
echo "[2/3] Cloudflare Tunnel 正在建立出站安全隧道..."

# 4. 轮询提取 trycloudflare 公网安全域名（排除 api.trycloudflare.com）
echo "[3/3] 正在获取公网访问安全网址 (通常需 5~15 秒)..."
URL=""
for i in {1..30}; do
    sleep 1
    if [ -f "$CF_LOG" ]; then
        URL=$(grep -o 'https://[-a-zA-Z0-9]*\.trycloudflare\.com' "$CF_LOG" | grep -v 'api\.trycloudflare\.com' | head -n 1)
        if [ -n "$URL" ]; then
            break
        fi
    fi
done

if [ -n "$URL" ]; then
    echo "$URL" > "$URL_FILE"
fi

echo "=========================================================="
if [ -n "$URL" ]; then
    echo "🎉 恭喜！OnePlus 9 双反代公网安全通道已就绪！"
    echo ""
    echo "🌟 【极简推荐】cc-switch 统一聚合接入（单 Provider 畅享全模型）："
    echo "   API Base URL : $URL/v1"
    echo "   API Key      : sk-friend-vip888"
    echo "   操作方式     : 点击「获取模型列表」，即可自动拉取 Qoder 与 WorkBuddy 全量模型！"
    echo ""
    echo "📌 【分立模式】各自独立 Provider 接入："
    echo "   Qoder 端点   : $URL/qoder/v1 (Key: sk-friend-vip888)"
    echo "   WorkBuddy端点: $URL/wb/v1    (Key: sk-friend-vip888)"
    echo ""
    echo "🛡️ 安全防线："
    echo "   • 仅暴露 /v1/models 与 /v1/chat/completions，拒绝所有管理后台路径（403 阻断）"
    echo "   • 强制 Bearer Key 门禁，无 Key 直接拒绝（401 阻断）"
    echo "   • 异常 IP 封禁与 45°C 电池温控熔断保护"
else
    echo "⚠️ 域名获取超时，请查看日志: cat $CF_LOG"
fi
echo "=========================================================="
