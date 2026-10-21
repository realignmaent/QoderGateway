#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Qoder 账号凭据提取助手 (OAuth Device Flow)
通过 Qoder 官方设备码授权流程，在浏览器点击授权后，自动拉取 dt-/drt- 凭据并输出标准 JSON。
"""

import base64
import hashlib
import json
import random
import string
import sys
import time
import uuid
import httpx

DEVICE_CLIENT_ID = "e883ade2-e6e3-4d6d-adf7-f92ceff5fdcb"
DEVICE_VERIFIER_CHARS = string.ascii_letters + string.digits + "-._~"


def generate_flow():
    length = random.randint(43, 128)
    verifier = "".join(random.choices(DEVICE_VERIFIER_CHARS, k=length))
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )
    nonce = str(uuid.uuid4())
    mid = str(uuid.uuid4())
    auth_url = (
        f"https://qoder.com/device/selectAccounts?challenge={challenge}"
        f"&challenge_method=S256&nonce={nonce}&machine_id={mid}&client_id={DEVICE_CLIENT_ID}"
    )
    poll_url = (
        f"https://openapi.qoder.sh/api/v1/deviceToken/poll"
        f"?nonce={nonce}&verifier={verifier}&challenge_method=S256"
    )
    return auth_url, poll_url


def poll_credentials(poll_url: str, timeout: float = 300.0) -> dict | None:
    deadline = time.time() + timeout
    print("⏳ 等待浏览器授权中（点击网页上的“继续/授权”按钮）...")
    with httpx.Client(timeout=15) as client:
        while time.time() < deadline:
            try:
                r = client.get(poll_url, headers={"Accept": "application/json"})
                if r.status_code == 200:
                    return r.json()
            except Exception:
                pass
            time.sleep(2)
            sys.stdout.write(".")
            sys.stdout.flush()
    return None


def main():
    print("=" * 65)
    print("       Qoder 官方 OAuth 设备授权凭据提取器")
    print("=" * 65)

    auth_url, poll_url = generate_flow()

    print("\n👉 请复制以下链接并在已登录 Qoder 的浏览器中打开：\n")
    print(auth_url)
    print("\n" + "-" * 65)

    cred = poll_credentials(poll_url)
    if not cred:
        print("\n❌ 授权超时或失败，请重新运行脚本。")
        return

    print("\n\n✅ 授权成功！成功捕获凭据！")
    
    # 转换为 QoderGateway 批量导入的标准 JSON 格式
    formatted = [
        {
            "user_id": cred.get("user_id") or cred.get("uid") or "",
            "name": cred.get("name") or cred.get("email") or "QoderAccount",
            "token": cred.get("token") or cred.get("security_oauth_token") or "",
            "refresh_token": cred.get("refresh_token") or "",
            "expires_at": cred.get("expires_at") or "",
        }
    ]

    json_str = json.dumps(formatted, ensure_ascii=False, indent=2)
    print("\n📋 复制下方 JSON 数据，粘贴到控制台【账号池 -> 批量导入】中：\n")
    print(json_str)
    print("\n" + "=" * 65)


if __name__ == "__main__":
    main()
