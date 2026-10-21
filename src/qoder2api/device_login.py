"""Qoder CN device-flow login (PKCE), mirroring the Qoder CLI flow.

The gateway generates a verifier/challenge pair, exposes only the authorization
URL, and polls the token endpoint. The verifier never leaves the server.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import time
import uuid
from typing import Any

import httpx

from .accounts import db_get_settings, db_set_settings
from .auth import new_machine
from .database import get_db

OPENAPI_BASE = "https://openapi.qoder.com.cn"
AUTH_PAGE = "https://qoder.com.cn/device/selectAccounts"
CLIENT_ID = "e883ade2-e6e3-4d6d-adf7-f92ceff5fdcb"
VERIFIER_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
FLOW_TTL = 300
POLL_INTERVAL = 1.2

_flows: dict[str, dict[str, Any]] = {}
_lock = threading.Lock()


def _pkce() -> tuple[str, str]:
    verifier = "".join(secrets.choice(VERIFIER_CHARS) for _ in range(64))
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def start_device_login() -> dict[str, Any]:
    verifier, challenge = _pkce()
    nonce = uuid.uuid4().hex
    machine_id, _, _ = new_machine()
    auth_url = (
        f"{AUTH_PAGE}?challenge={challenge}&challenge_method=S256"
        f"&nonce={nonce}&machine_id={machine_id}&client_id={CLIENT_ID}"
    )
    flow_id = uuid.uuid4().hex
    flow: dict[str, Any] = {
        "id": flow_id,
        "verifier": verifier,
        "nonce": nonce,
        "machine_id": machine_id,
        "created_at": time.time(),
        "status": "pending",
        "error": None,
        "account": None,
    }
    with _lock:
        if len(_flows) > 32:
            for key in [k for k, v in _flows.items() if v["status"] != "pending"][:-16]:
                _flows.pop(key, None)
        _flows[flow_id] = flow
    threading.Thread(target=_poll_loop, args=(flow,), daemon=True).start()
    return {"ok": True, "flow_id": flow_id, "auth_url": auth_url, "expires_in": FLOW_TTL}


def get_device_status(flow_id: str) -> dict[str, Any]:
    flow = _flows.get(flow_id)
    if not flow:
        return {"ok": False, "status": "unknown", "error": "流程不存在或已过期"}
    remaining = max(0, int(FLOW_TTL - (time.time() - flow["created_at"])))
    return {
        "ok": True,
        "status": flow["status"],
        "error": flow["error"],
        "account": flow["account"],
        "remaining": remaining,
    }


def _poll_loop(flow: dict[str, Any]) -> None:
    deadline = time.time() + FLOW_TTL
    params = {
        "nonce": flow["nonce"],
        "verifier": flow["verifier"],
        "challenge_method": "S256",
    }
    last_error: str | None = None
    while time.time() < deadline:
        if flow["status"] != "pending":
            return
        try:
            with httpx.Client(timeout=15) as client:
                resp = client.get(
                    f"{OPENAPI_BASE}/api/v1/deviceToken/poll",
                    params=params,
                    headers={"Accept": "application/json"},
                )
            if resp.status_code == 404:
                time.sleep(POLL_INTERVAL)
                continue
            if resp.status_code != 200:
                flow["status"] = "error"
                flow["error"] = f"授权接口返回 HTTP {resp.status_code}"
                return
            data = resp.json()
            token = data.get("token")
            if not isinstance(token, str) or not token:
                time.sleep(POLL_INTERVAL)
                continue
            flow["account"] = _save_account(flow, data)
            flow["status"] = "success"
            return
        except Exception as exc:  # network hiccup: keep polling until deadline
            last_error = str(exc)
            time.sleep(2)
    if flow["status"] == "pending":
        flow["status"] = "expired"
        flow["error"] = "授权超时（5 分钟内未完成登录）" + (f"：{last_error}" if last_error else "")


def _fetch_userinfo(token: str) -> dict[str, Any]:
    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{OPENAPI_BASE}/api/v1/userinfo",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
            )
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return {}


def _save_account(flow: dict[str, Any], data: dict[str, Any]) -> dict[str, Any]:
    uid = str(data.get("user_id") or "").strip()
    token = str(data.get("token") or "").strip()
    refresh = str(data.get("refresh_token") or "").strip()
    expires = str(data.get("expires_at") or "").strip()

    info = _fetch_userinfo(token)
    name = str(
        info.get("name")
        or info.get("username")
        or info.get("nickname")
        or info.get("email")
        or (uid[:12] if uid else "Qoder Account")
    )

    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO accounts (
                uid, name, user_type, security_oauth_token, refresh_token, machine_id,
                enabled, last_status, last_error, quota, is_quota_exceeded, plan, user_tag,
                next_reset_at, token_expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, 'ok', NULL, 0, 0, NULL, NULL, NULL, ?)
            ON CONFLICT(uid) DO UPDATE SET
                security_oauth_token = excluded.security_oauth_token,
                refresh_token = excluded.refresh_token,
                machine_id = excluded.machine_id,
                enabled = 1,
                last_status = 'ok',
                last_error = NULL,
                token_expires_at = excluded.token_expires_at
            """,
            (uid, name, "personal_standard", token, refresh, flow["machine_id"], expires),
        )
        if not db_get_settings("active_uid"):
            db_set_settings("active_uid", uid)

    return {"uid": uid, "name": name, "token_expires_at": expires}
