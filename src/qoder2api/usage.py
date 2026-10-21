"""Request usage tracking and aggregation (token counts are estimates)."""
from __future__ import annotations

import time
from datetime import datetime, timedelta
from typing import Any

from .database import get_db


def record_usage(
    model: str,
    account_uid: str | None,
    account_name: str | None,
    api_key: str | None,
    prompt_tokens: int,
    completion_tokens: int,
    status: str = "ok",
) -> None:
    try:
        with get_db() as conn:
            conn.execute(
                """
                INSERT INTO usage_events
                    (ts, model, account_uid, account_name, api_key, prompt_tokens, completion_tokens, total_tokens, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    int(time.time()),
                    model or "unknown",
                    account_uid or "",
                    account_name or "",
                    api_key or "",
                    max(0, int(prompt_tokens)),
                    max(0, int(completion_tokens)),
                    max(0, int(prompt_tokens) + int(completion_tokens)),
                    status,
                ),
            )
    except Exception:
        pass


def estimate_tokens(text: str) -> int:
    """Rough token estimate: 1 token per CJK char, ~4 chars per token otherwise."""
    if not text:
        return 0
    cjk = sum(1 for ch in text if "\u4e00" <= ch <= "\u9fff")
    return cjk + (len(text) - cjk) // 4


def _start_of_day(ts: float | None = None) -> int:
    now = datetime.fromtimestamp(ts if ts is not None else time.time())
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return int(start.timestamp())


def _start_of_week(ts: float | None = None) -> int:
    now = datetime.fromtimestamp(ts if ts is not None else time.time())
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    return int(start.timestamp())


def get_usage_stats(days: int = 14) -> dict[str, Any]:
    now = int(time.time())
    today_start = _start_of_day()
    week_start = _start_of_week()
    window_start = now - max(1, days) * 86400

    with get_db() as conn:
        def scalar(sql: str, params: tuple = ()) -> int:
            row = conn.execute(sql, params).fetchone()
            return int(row[0] or 0) if row else 0

        today_requests = scalar("SELECT COUNT(*) FROM usage_events WHERE ts >= ?", (today_start,))
        today_tokens = scalar("SELECT COALESCE(SUM(total_tokens),0) FROM usage_events WHERE ts >= ?", (today_start,))
        week_requests = scalar("SELECT COUNT(*) FROM usage_events WHERE ts >= ?", (week_start,))
        week_tokens = scalar("SELECT COALESCE(SUM(total_tokens),0) FROM usage_events WHERE ts >= ?", (week_start,))
        total_requests = scalar("SELECT COUNT(*) FROM usage_events")
        used_keys = scalar("SELECT COUNT(DISTINCT api_key) FROM usage_events WHERE ts >= ? AND api_key != ''", (week_start,))
        configured_keys = scalar("SELECT COUNT(*) FROM allowed_keys")

        hourly_rows = conn.execute(
            """
            SELECT (ts / 3600) * 3600 AS bucket,
                   COUNT(*) AS requests,
                   COALESCE(SUM(total_tokens),0) AS tokens
            FROM usage_events WHERE ts >= ?
            GROUP BY bucket ORDER BY bucket
            """,
            (today_start - 86400,),
        ).fetchall()

        daily_rows = conn.execute(
            """
            SELECT (ts / 86400) * 86400 AS bucket,
                   COUNT(*) AS requests,
                   COALESCE(SUM(total_tokens),0) AS tokens
            FROM usage_events WHERE ts >= ?
            GROUP BY bucket ORDER BY bucket
            """,
            (window_start,),
        ).fetchall()

        by_model_rows = conn.execute(
            """
            SELECT model, COUNT(*) AS requests, COALESCE(SUM(total_tokens),0) AS tokens
            FROM usage_events WHERE ts >= ?
            GROUP BY model ORDER BY requests DESC
            """,
            (week_start,),
        ).fetchall()

        by_key_rows = conn.execute(
            """
            SELECT api_key, COUNT(*) AS requests, COALESCE(SUM(total_tokens),0) AS tokens
            FROM usage_events WHERE ts >= ? AND api_key != ''
            GROUP BY api_key ORDER BY requests DESC
            """,
            (week_start,),
        ).fetchall()

        by_account_rows = conn.execute(
            """
            SELECT account_uid, account_name, COUNT(*) AS requests, COALESCE(SUM(total_tokens),0) AS tokens
            FROM usage_events WHERE ts >= ? AND account_uid != ''
            GROUP BY account_uid ORDER BY requests DESC
            """,
            (week_start,),
        ).fetchall()

    def fill_hours(rows) -> list[dict[str, Any]]:
        mapping = {int(r["bucket"]): r for r in rows}
        base = (today_start - 86400)
        out = []
        for i in range(24):
            bucket = base + i * 3600
            r = mapping.get(bucket)
            out.append({
                "ts": bucket,
                "label": datetime.fromtimestamp(bucket).strftime("%H:00"),
                "requests": int(r["requests"]) if r else 0,
                "tokens": int(r["tokens"]) if r else 0,
            })
        return out

    def fill_days(rows) -> list[dict[str, Any]]:
        mapping = {int(r["bucket"]): r for r in rows}
        out = []
        for i in range(days):
            bucket = (now - (days - 1 - i) * 86400) // 86400 * 86400
            r = mapping.get(bucket)
            out.append({
                "ts": bucket,
                "label": datetime.fromtimestamp(bucket).strftime("%m-%d"),
                "requests": int(r["requests"]) if r else 0,
                "tokens": int(r["tokens"]) if r else 0,
            })
        return out

    def mask_key(key: str) -> str:
        if not key:
            return "匿名"
        if len(key) <= 10:
            return key[:3] + "***"
        return key[:7] + "…" + key[-4:]

    return {
        "ok": True,
        "generated_at": now,
        "today": {"requests": today_requests, "tokens": today_tokens},
        "week": {"requests": week_requests, "tokens": week_tokens},
        "total": {"requests": total_requests},
        "keys": {"used": used_keys, "configured": configured_keys},
        "hourly": fill_hours(hourly_rows),
        "daily": fill_days(daily_rows),
        "by_model": [
            {"model": r["model"], "requests": int(r["requests"]), "tokens": int(r["tokens"])}
            for r in by_model_rows
        ],
        "by_key": [
            {"key": mask_key(r["api_key"]), "requests": int(r["requests"]), "tokens": int(r["tokens"])}
            for r in by_key_rows
        ],
        "by_account": [
            {"uid": r["account_uid"], "name": r["account_name"], "requests": int(r["requests"]), "tokens": int(r["tokens"])}
            for r in by_account_rows
        ],
    }
