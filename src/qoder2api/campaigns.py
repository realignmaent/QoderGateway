import asyncio
import json
import logging
import threading
import time
import uuid
from typing import Any
import requests

from .database import get_db

logger = logging.getLogger("qoder2api.campaigns")

OPENAPI_HOST = "openapi.qoder.com.cn"
OPENAPI_DIRECT_IP = "47.116.142.188"  # 绕过手机 Fake-IP 劫持


def get_all_raw_accounts() -> list[dict[str, Any]]:
    """读取 SQLite 数据库中的所有账号完整凭据（包含 token 和 machine_id）。"""
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM accounts").fetchall()
        return [dict(r) for r in rows]


def build_sash_headers(access_token: str, machine_id: str, host: str = OPENAPI_HOST) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Cosy-ClientType": "10",
        "Cosy-Version": "1.13.3",
        "Cosy-MachineId": machine_id,
        "Cosy-MachineOS": "aarch64_linux",
        "Cosy-MachineHostname": "oneplus9",
        "User-Agent": "Qoder",
        "Host": host,
    }


def fetch_qoder_campaigns(access_token: str, machine_id: str | None = None) -> dict[str, Any]:
    """查询当前有效活动及签到状态。"""
    mid = machine_id or str(uuid.uuid4())
    headers = build_sash_headers(access_token, mid)
    url = f"https://{OPENAPI_DIRECT_IP}/sash/api/v1/me/campaigns?forceRefresh=true"
    try:
        r = requests.get(url, headers=headers, verify=False, timeout=10)
        if r.status_code == 200:
            return {"ok": True, "data": r.json()}
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def claim_qoder_campaign(access_token: str, campaign_id: str, machine_id: str | None = None) -> dict[str, Any]:
    """执行签到打卡领取 100 Credits。"""
    mid = machine_id or str(uuid.uuid4())
    headers = build_sash_headers(access_token, mid)
    url = f"https://{OPENAPI_DIRECT_IP}/sash/api/v1/me/campaigns/{campaign_id}/claim"
    try:
        r = requests.post(url, headers=headers, json={}, verify=False, timeout=10)
        if r.status_code == 200:
            return {"ok": True, "data": r.json()}
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def fetch_quota_usage(access_token: str, machine_id: str | None = None) -> dict[str, Any]:
    """获取详细配额与用量分析 (主配额 + 签到Add-on配额 + 到期时间)。"""
    mid = machine_id or str(uuid.uuid4())
    headers = build_sash_headers(access_token, mid)
    url = f"https://{OPENAPI_DIRECT_IP}/api/v2/quota/usage"
    try:
        r = requests.get(url, headers=headers, verify=False, timeout=10)
        if r.status_code == 200:
            return {"ok": True, "data": r.json()}
        return {"ok": False, "error": f"HTTP {r.status_code}: {r.text[:200]}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def claim_account_daily(acc: dict[str, Any]) -> dict[str, Any]:
    """为指定账号执行每日签到打卡流程。"""
    token = acc.get("security_oauth_token") or ""
    if not token:
        return {"ok": False, "error": "No token"}
    
    mid = acc.get("machine_id") or str(uuid.uuid4())
    c_res = fetch_qoder_campaigns(token, mid)
    if not c_res.get("ok"):
        return c_res
    
    data = c_res.get("data", {})
    campaigns = data.get("campaigns", [])
    if not campaigns:
        return {"ok": False, "error": "No active campaign found"}
    
    target_campaign = None
    for c in campaigns:
        if c.get("actionType") == "CLAIM_BENEFIT":
            target_campaign = c
            break
            
    if not target_campaign:
        target_campaign = campaigns[0]
        
    cid = target_campaign.get("campaignId")
    claim_status = target_campaign.get("claimStatus")
    
    if claim_status == "CLAIMED":
        return {
            "ok": True,
            "already_claimed": True,
            "message": "今日已完成签到",
            "campaign": target_campaign
        }
        
    res = claim_qoder_campaign(token, cid, mid)
    if res.get("ok"):
        return {
            "ok": True,
            "already_claimed": False,
            "message": "成功领取 100 Credits 算力！",
            "result": res.get("data")
        }
    return res


def run_auto_claim_routine():
    """自动签到例程（遍历所有启用账号并签到）。"""
    try:
        accounts = get_all_raw_accounts()
        for acc in accounts:
            if acc.get("enabled", 1):
                name = acc.get("name") or acc.get("uid")
                res = claim_account_daily(acc)
                logger.info(f"Auto claim for {name}: {res.get('message') or res.get('error')}")
    except Exception as exc:
        logger.warning(f"Auto claim routine exception: {exc}")


def auto_claim_worker():
    """后台常驻守护线程：开机自检签到，此后每日 10:05 自动执行。"""
    time.sleep(15)  # 启动后稍作等待
    logger.info("Starting initial check-in scan...")
    run_auto_claim_routine()

    while True:
        try:
            # 每小时巡检一次，若当前时间为 10:xx 且未过，执行签到
            now = time.localtime()
            if now.tm_hour == 10 and now.tm_min >= 5 and now.tm_min <= 20:
                run_auto_claim_routine()
                time.sleep(3600)  # 执行后跳过该小时
            else:
                time.sleep(300)
        except Exception as e:
            logger.error(f"Error in auto_claim_worker: {e}")
            time.sleep(600)


def start_auto_claim_loop():
    t = threading.Thread(target=auto_claim_worker, daemon=True)
    t.start()
    return t
