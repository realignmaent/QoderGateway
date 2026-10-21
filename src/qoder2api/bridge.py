import copy
import hashlib
import json
import time
import uuid
import base64
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse

import httpx
from cryptography.hazmat.primitives import padding, serialization
from cryptography.hazmat.primitives.asymmetric import padding as asymmetric_padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from . import encoding
from .auth import SessionContext, SERVER_PUBKEY_PEM
from .env import httpx_client_kwargs


QODER_CHAT_URL_NEW = "https://api2-v2.qoder.sh/model/v1/chat/completions"
QODER_CN_CHAT_URL = "https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1"

CN_MODEL_ALIASES: dict[str, str] = {
    # Auto
    "auto": "auto",
    "qoder": "auto",
    "qoder-cn": "auto",
    
    # 通义千问 Qwen 系列
    "qwen3.8-max": "qmodel_38max",
    "qwen-3.8-max": "qmodel_38max",
    "qmodel_38max": "qmodel_38max",
    
    "qwen3.8-flash": "qfmodel",
    "qwen-3.8-flash": "qfmodel",
    "qfmodel": "qfmodel",
    
    "qwen3.7-plus": "qmodel",
    "qwen-3.7-plus": "qmodel",
    "qmodel": "qmodel",
    
    "qwen3.7-max": "qmodel_latest",
    "qwen-3.7-max": "qmodel_latest",
    "qmodel_latest": "qmodel_latest",
    
    "qwen3.7-flash": "q37fmodel",
    "qwen-3.7-flash": "q37fmodel",
    "q37fmodel": "q37fmodel",
    
    # DeepSeek 深度求索系列
    "deepseek-v4-pro": "dmodel",
    "deepseek-v4": "dmodel",
    "deepseek-v3": "dmodel",
    "deepseek-r1": "dmodel",
    "dmodel": "dmodel",
    
    "deepseek-flash": "dfmodel",
    "deepseek-v4-flash": "dfmodel",
    "dfmodel": "dfmodel",
    
    # 智谱 GLM 系列
    "glm-5.3": "gmodel",
    "glm-5": "gmodel",
    "gmodel": "gmodel",
    
    "glm-5.3-flash": "gfmodel",
    "glm-5-flash": "gfmodel",
    "gfmodel": "gfmodel",
    
    # 月之暗面 Kimi 系列
    "kimi-k3": "kmodel_latest",
    "kmodel_latest": "kmodel_latest",
    
    "kimi-k2.8": "kmodel",
    "kimi-k2.8-preview": "kmodel",
    "kimi-k2.7-code": "kmodel",
    "kmodel": "kmodel",
    
    # MiniMax 系列
    "minimax-m3.1-flash": "mmodel",
    "minimax-m2.7": "mmodel",
    "mmodel": "mmodel",
}


ONE_MILLION_MODELS = {
    "qmodel_38max", "qfmodel", "qmodel", "qmodel_latest", "q37fmodel",
    "dmodel", "dfmodel", "gmodel", "gfmodel", "kmodel_latest", "kmodel"
}

# 各模型最高思考强度档位定义
MODEL_MAX_EFFORT: dict[str, str] = {
    # Qwen 系列：最高档位为 xhigh (极高深度思考)
    "qmodel_38max": "xhigh",
    "qfmodel": "xhigh",
    "qmodel_latest": "xhigh",
    "q37fmodel": "xhigh",
    
    # DeepSeek 系列：最高档位为 max (极致推理)
    "dmodel": "max",
    "dfmodel": "max",
    
    # GLM 系列：最高档位为 max (深度推演)
    "gmodel": "max",
    "gfmodel": "max",
    
    # Kimi 系列：最高档位为 max (超长思考链)
    "kmodel_latest": "max",
    "kmodel": "max",
}



def parse_model_and_effort(requested: str, explicit_effort: str | None = None) -> tuple[str, str | None, bool, str | None]:
    raw = requested.strip()
    effort = explicit_effort
    enable_thinking = True
    context_tag = None
    
    # 解析可能存在的多个标签 (如 deepseek-v4-pro:1m:max, qwen3.8-max:low, auto:off)
    parts = raw.split(":")
    base = parts[0]
    for tag in parts[1:]:
        t = tag.strip().lower()
        if t in {"off", "none", "false", "0"}:
            enable_thinking = False
        elif t in {"low", "medium", "high", "max", "xhigh"}:
            effort = t
        elif t in {"1m", "400k", "200k"}:
            context_tag = t
            
    if "-effort-" in base:
        base_name, tag = base.split("-effort-", 1)
        if tag in {"low", "medium", "high", "max", "xhigh"}:
            effort = tag
            base = base_name
            
    mapped_key = CN_MODEL_ALIASES.get(base.lower(), "auto")
    return mapped_key, effort, enable_thinking, context_tag



def is_cn_session(sess: SessionContext) -> bool:
    token = sess.identity.security_oauth_token or ""
    return token.startswith("jt-")


def now_ms() -> int:
    return int(time.time() * 1000)


def blank_response_meta() -> dict[str, Any]:
    return {
        "id": "",
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "completion_tokens_details": {"reasoning_tokens": 0},
            "prompt_tokens_details": {"cached_tokens": 0},
        },
    }


def normalize_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [normalize_content_part(item) for item in content]
        return "\n\n".join(part for part in parts if part.strip())
    return normalize_content_part(content)


def normalize_content_part(item: Any) -> str:
    if item is None:
        return ""
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        if isinstance(item.get("text"), str):
            return item["text"]
        if item.get("type") in {"image_url", "input_image"} and isinstance(item.get("image_url"), dict):
            url = item["image_url"].get("url")
            if isinstance(url, str):
                return f"[image] {url}"
        if isinstance(item.get("content"), (dict, list)):
            return normalize_content(item["content"])
        return json.dumps(item, ensure_ascii=False)
    return json.dumps(item, ensure_ascii=False)


def normalize_message_text(message: dict[str, Any]) -> str:
    text = normalize_content(message.get("content"))
    return text if text.strip() else normalize_content(message.get("contents"))


def extract_latest_user_prompt(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages or []):
        if message.get("role") == "user":
            text = normalize_message_text(message)
            if text.strip():
                return text
    return ""


def build_user_message(text: str) -> dict[str, Any]:
    return {
        "role": "user",
        "content": "",
        "contents": [{"type": "text", "text": text}],
        "response_meta": blank_response_meta(),
        "reasoning_content_signature": "",
    }


def build_structured_message(role: str, text: str) -> dict[str, Any]:
    return {"role": role, "content": text or "", "response_meta": blank_response_meta(), "reasoning_content_signature": ""}


def normalize_tool_arguments(arguments: Any) -> str:
    if arguments is None:
        return ""
    if isinstance(arguments, str):
        return arguments
    return json.dumps(arguments, ensure_ascii=False, separators=(",", ":"))


def normalize_tool_calls(raw_tool_calls: Any) -> list[dict[str, Any]] | None:
    if not isinstance(raw_tool_calls, list):
        return None
    normalized = []
    for raw in raw_tool_calls:
        function = raw.get("function", {}) if isinstance(raw, dict) else {}
        name = function.get("name", "")
        arguments = normalize_tool_arguments(function.get("arguments"))
        if not name and not arguments:
            continue
        normalized.append({"id": raw.get("id", ""), "type": raw.get("type", "function"), "function": {"name": name, "arguments": arguments}})
    return normalized or None


def parse_tool_calls_text(text: str | None) -> list[dict[str, Any]] | None:
    if not text:
        return None
    trimmed = text.strip()
    if not trimmed.startswith("Tool calls:"):
        return None
    payload = trimmed[len("Tool calls:") :].strip()
    if payload.startswith("```") and payload.endswith("```"):
        newline = payload.find("\n")
        if newline >= 0:
            payload = payload[newline + 1 : -3].strip()
    if not payload.startswith("["):
        return None
    try:
        return normalize_tool_calls(json.loads(payload))
    except json.JSONDecodeError:
        return None


def render_tool_result(message: dict[str, Any], text: str) -> str:
    label = "Tool result"
    if message.get("name"):
        label += f" ({message['name']})"
    if message.get("tool_call_id"):
        label += f" [{message['tool_call_id']}]"
    return f"{label}:\n{text}" if text.strip() else label


def build_qoder_body(req: dict[str, Any], sess: SessionContext) -> tuple[dict[str, Any], str, bool]:
    """国际版协议 body：OpenAI 原生格式。"""
    model = req.get("model") or "lite"
    messages = req.get("messages") if isinstance(req.get("messages"), list) else []
    tools_enabled = bool(req.get("tools"))
    rid = str(uuid.uuid4())
    body: dict[str, Any] = {
        "model": model,
        "messages": copy.deepcopy(messages or []),
        "stream": True,
        "stream_options": {"include_usage": True},
        "metadata": {
            "context": {
                "request_id": rid,
                "request_set_id": rid,
                "session_id": str(uuid.uuid4()),
                "task_id": "common",
                "client_type": "qodercli",
            }
        },
    }
    if tools_enabled:
        body["tools"] = copy.deepcopy(req["tools"])
    return body, model, tools_enabled


def build_qoder_cn_body_and_headers(req: dict[str, Any], sess: SessionContext) -> tuple[str, dict[str, str], str, bool]:
    """国内版协议 (Qoder CN)：COSY 签名 + Base64 编码 Body + 推理档位适配。"""
    requested_model = req.get("model") or "auto"
    explicit_effort = req.get("reasoning_effort")
    mapped_model, effort, enable_thinking, context_tag = parse_model_and_effort(requested_model, explicit_effort)
    
    messages = req.get("messages") if isinstance(req.get("messages"), list) else []
    tools_raw = req.get("tools") or []
    tools_enabled = bool(tools_raw)

    last_user_text = extract_latest_user_prompt(messages) or "hi"

    normalized_messages = []
    for msg in messages:
        role = msg.get("role", "user")
        content = normalize_message_text(msg)
        normalized_messages.append({"role": role, "content": content})

    parameters: dict[str, Any] = {"max_tokens": 8192}
    if effort:
        parameters["reasoning_effort"] = effort
        parameters["enable_thinking"] = True
    elif not enable_thinking:
        parameters["enable_thinking"] = False
    else:
        # 思考强度默认拉满至模型最大可用档位 (如 Qwen 为 xhigh, DeepSeek/GLM/Kimi 为 max)
        max_effort = MODEL_MAX_EFFORT.get(mapped_model)
        if max_effort:
            parameters["reasoning_effort"] = max_effort
            parameters["enable_thinking"] = True
            effort = max_effort
        else:
            parameters["enable_thinking"] = True


    # 上下文窗口智能最大化 (默认针对全部支持 1M 的模型锁定 1,000,000 Tokens)
    if mapped_model in ONE_MILLION_MODELS:
        if context_tag == "400k":
            max_input_tokens = 400000
            ctx_cfg = {"400K": {"token_count": 400000, "is_default": True}, "200K": {"token_count": 200000}, "1M": {"token_count": 1000000}}
        elif context_tag == "200k":
            max_input_tokens = 200000
            ctx_cfg = {"200K": {"token_count": 200000, "is_default": True}, "400K": {"token_count": 400000}, "1M": {"token_count": 1000000}}
        else:
            max_input_tokens = 1000000
            ctx_cfg = {"1M": {"token_count": 1000000, "is_default": True}, "400K": {"token_count": 400000}, "200K": {"token_count": 200000}}
    else:
        max_input_tokens = 200000
        ctx_cfg = {"200K": {"token_count": 200000, "is_default": True}}

    rec_id = str(uuid.uuid4())
    body_obj = {
        "request_id": str(uuid.uuid4()),
        "request_set_id": rec_id,
        "chat_record_id": rec_id,
        "session_id": str(uuid.uuid4()),
        "stream": True,
        "chat_task": "FREE_INPUT",
        "is_reply": True,
        "is_retry": False,
        "source": 1,
        "version": "3",
        "session_type": "qodercli",
        "agent_id": "agent_common",
        "task_id": "common",
        "code_language": "",
        "chat_prompt": "",
        "image_urls": None,
        "aliyun_user_type": "",
        "system": "",
        "messages": normalized_messages,
        "tools": tools_raw,
        "parameters": parameters,
        "chat_context": {
            "chatPrompt": "",
            "imageUrls": None,
            "extra": {
                "context": [],
                "modelConfig": {
                    "key": mapped_model,
                    "is_reasoning": enable_thinking,
                    "max_input_tokens": max_input_tokens,
                    "context_config": ctx_cfg
                },
                "originalContent": last_user_text,
            },
            "features": [],
            "text": last_user_text,
        },
        "model_config": {
            "key": mapped_model,
            "display_name": mapped_model,
            "is_reasoning": enable_thinking,
            "source": "system",
            "max_input_tokens": max_input_tokens,
            "context_config": ctx_cfg
        },

        "business": {
            "product": "cli",
            "version": "1.0.0",
            "type": "agent",
            "stage": "start",
            "id": str(uuid.uuid4()),
            "name": last_user_text[:30],
            "begin_at": now_ms(),
        },
    }

    raw_json = json.dumps(body_obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded_body = encoding.encode(raw_json)

    # COSY 签名计算
    aes_key = uuid.uuid4().hex[:16]
    user_info = {
        "uid": sess.identity.uid,
        "security_oauth_token": sess.identity.security_oauth_token,
        "name": sess.identity.name or "",
        "aid": "",
        "email": "",
    }
    padder = padding.PKCS7(128).padder()
    padded = padder.update(json.dumps(user_info, separators=(",", ":")).encode("utf-8")) + padder.finalize()
    cipher = Cipher(algorithms.AES(aes_key.encode("ascii")), modes.CBC(aes_key.encode("ascii")))
    encryptor = cipher.encryptor()
    info_b64 = base64.b64encode(encryptor.update(padded) + encryptor.finalize()).decode("ascii")

    pubkey = serialization.load_pem_public_key(SERVER_PUBKEY_PEM)
    cosy_key = base64.b64encode(pubkey.encrypt(aes_key.encode("ascii"), asymmetric_padding.PKCS1v15())).decode("ascii")

    timestamp = str(int(time.time()))
    req_id = str(uuid.uuid4())
    cosy_payload = {
        "version": "v1",
        "requestId": req_id,
        "info": info_b64,
        "cosyVersion": "1.1.38",
        "ideVersion": "",
    }
    payload_b64 = base64.b64encode(json.dumps(cosy_payload, separators=(",", ":")).encode("utf-8")).decode("ascii")

    sig_path = "/api/v2/service/pro/sse/agent_chat_generation"
    body_bytes = encoded_body.encode("utf-8")

    m = hashlib.md5()
    m.update(payload_b64.encode("utf-8"))
    m.update(b"\n")
    m.update(cosy_key.encode("utf-8"))
    m.update(b"\n")
    m.update(timestamp.encode("utf-8"))
    m.update(b"\n")
    m.update(body_bytes)
    m.update(b"\n")
    m.update(sig_path.encode("utf-8"))
    sig = m.hexdigest()

    body_hash = hashlib.md5(body_bytes).hexdigest()
    body_len = str(len(body_bytes))
    machine_id = sess.machine_id or str(uuid.uuid4())

    headers = {
        "Authorization": f"Bearer COSY.{payload_b64}.{sig}",
        "Cosy-Key": cosy_key,
        "Cosy-User": sess.identity.uid,
        "Cosy-Date": timestamp,
        "Cosy-Version": "1.1.38",
        "Cosy-Machineid": machine_id,
        "Cosy-Machinetoken": machine_id,
        "Cosy-Machinetype": "5",
        "Cosy-Machineos": "aarch64_linux",
        "Cosy-Clienttype": "5",
        "Cosy-Clientip": "127.0.0.1",
        "Cosy-Bodyhash": body_hash,
        "Cosy-Bodylength": body_len,
        "Cosy-Sigpath": sig_path,
        "Cosy-Data-Policy": "disagree",
        "Cosy-Organization-Id": "",
        "Cosy-Organization-Tags": "",
        "Login-Version": "v2",
        "X-Request-Id": str(uuid.uuid4()),
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "Cache-Control": "no-cache",
        "Accept-Encoding": "identity",
        "X-Model-Key": mapped_model,
        "X-Model-Source": "system",
    }
    return encoded_body, headers, requested_model, tools_enabled


@dataclass
class BridgeDelta:
    role: str = ""
    content: str = ""
    reasoning_content: str = ""
    tool_calls: list[dict[str, Any]] | None = None

    @property
    def is_empty(self) -> bool:
        return not self.role and not self.content and not self.reasoning_content and not self.tool_calls


def extract_delta(data_line: str) -> BridgeDelta:
    try:
        obj = json.loads(data_line)
        if not isinstance(obj, dict):
            return BridgeDelta()
        # 新版：标准 OpenAI chunk（choices 直接在顶层）
        if "choices" in obj:
            for choice in obj.get("choices", []):
                delta = choice.get("delta", {}) if isinstance(choice, dict) else {}
                role = delta.get("role") or ""
                content = delta.get("content") or ""
                reasoning = delta.get("reasoning_content") or delta.get("reasoning") or ""
                tool_calls = delta.get("tool_calls") if isinstance(delta.get("tool_calls"), list) else None
                if role or content or reasoning or tool_calls:
                    return BridgeDelta(role, content, reasoning, tool_calls)
            return BridgeDelta()
        # 老版 / 国内版：wrapper 内嵌 body 字符串
        inner = obj.get("body") or ""
        if not inner or inner == "[DONE]":
            return BridgeDelta()
        try:
            inner_json = json.loads(inner)
        except Exception:
            return BridgeDelta()
        for choice in inner_json.get("choices", []):
            delta = choice.get("delta", {}) if isinstance(choice, dict) else {}
            role = delta.get("role") or ""
            content = delta.get("content") or ""
            reasoning = delta.get("reasoning_content") or ""
            tool_calls = delta.get("tool_calls") if isinstance(delta.get("tool_calls"), list) else None
            if role or content or reasoning or tool_calls:
                return BridgeDelta(role, content, reasoning, tool_calls)
    except (TypeError, json.JSONDecodeError):
        return BridgeDelta()
    return BridgeDelta()


def make_chunk(chunk_id: str, created: int, model: str, delta: dict[str, Any] | None = None, finish_reason: str | None = None) -> dict[str, Any]:
    return {"id": chunk_id, "object": "chat.completion.chunk", "created": created, "model": model, "choices": [{"index": 0, "delta": delta or {}, "finish_reason": finish_reason}]}


class ToolCallAccumulator:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    def append(self, delta_calls: list[dict[str, Any]]) -> None:
        for delta in delta_calls:
            index = delta.get("index") if isinstance(delta.get("index"), int) else len(self.calls)
            while len(self.calls) <= index:
                self.calls.append({"id": "", "type": "function", "function": {"name": "", "arguments": ""}})
            existing = self.calls[index]
            if isinstance(delta.get("id"), str):
                existing["id"] = delta["id"]
            if isinstance(delta.get("type"), str):
                existing["type"] = delta["type"]
            function = delta.get("function") or {}
            if isinstance(function.get("name"), str):
                existing["function"]["name"] = function["name"]
            if isinstance(function.get("arguments"), str):
                existing["function"]["arguments"] += function["arguments"]

    def snapshot(self) -> list[dict[str, Any]]:
        return copy.deepcopy(self.calls)


async def qoder_stream_lines(sess: SessionContext, req: dict[str, Any]) -> tuple[AsyncIterator[str], str, bool]:
    """自适应路由：国内版走 gateway.qoder.com.cn，国际版走 api2-v2.qoder.sh。"""
    if is_cn_session(sess):
        encoded_body, headers, model, tools_enabled = build_qoder_cn_body_and_headers(req, sess)

        async def _cn_gen() -> AsyncIterator[str]:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=15), **httpx_client_kwargs()) as client:
                async with client.stream("POST", QODER_CN_CHAT_URL, content=encoded_body, headers=headers) as response:
                    if response.status_code != 200:
                        text = await response.aread()
                        raise RuntimeError(f"HTTP {response.status_code} {text.decode(errors='replace')}")
                    async for line in response.aiter_lines():
                        if line:
                            yield line

        return _cn_gen(), model, tools_enabled

    # 国际版协议
    body, model, tools_enabled = build_qoder_body(req, sess)
    ctx = (body.get("metadata") or {}).get("context") or {}
    headers = {
        "Authorization": f"Bearer {sess.identity.security_oauth_token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "User-Agent": "qoder/1.1.16",
        "X-Request-ID": ctx.get("request_id", ""),
        "X-Session-ID": ctx.get("session_id", ""),
    }

    async def _global_gen() -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=15), **httpx_client_kwargs()) as client:
            async with client.stream("POST", QODER_CHAT_URL_NEW, json=body, headers=headers) as response:
                if response.status_code != 200:
                    text = await response.aread()
                    raise RuntimeError(f"HTTP {response.status_code} {text.decode(errors='replace')}")
                async for line in response.aiter_lines():
                    if line:
                        yield line

    return _global_gen(), model, tools_enabled


async def stream_openai_response(req: dict[str, Any], sess: SessionContext) -> AsyncIterator[str]:
    lines_iter, model, tools_enabled = await qoder_stream_lines(sess, req)
    chunk_id = "chatcmpl-" + uuid.uuid4().hex[:24]
    created = int(time.time())
    tool_calls = ToolCallAccumulator()
    emitted = False
    pending = ""
    streaming_text = False
    pending_role = "assistant"

    def event(payload: dict[str, Any]) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))}\n\n"

    async for line in lines_iter:
        if not line.startswith("data:"):
            continue
        raw_data = line[5:].strip()
        if raw_data == "[DONE]":
            break
        delta = extract_delta(raw_data)
        if delta.is_empty:
            continue
        if delta.role:
            pending_role = delta.role

        # 思考链 (Reasoning Content)
        if delta.reasoning_content:
            out_delta: dict[str, Any] = {"reasoning_content": delta.reasoning_content}
            if not emitted:
                out_delta["role"] = pending_role
            emitted = True
            yield event(make_chunk(chunk_id, created, model, out_delta))
            continue

        if delta.tool_calls:
            pending = "" if tools_enabled and pending.lstrip().startswith("Tool calls:") else pending
            indexed = []
            for index, call in enumerate(delta.tool_calls):
                item = copy.deepcopy(call)
                item.setdefault("index", index)
                indexed.append(item)
            tool_calls.append(indexed)
            out_delta = {"tool_calls": indexed}
            if not emitted:
                out_delta["role"] = pending_role
            emitted = True
            yield event(make_chunk(chunk_id, created, model, out_delta))
            continue

        if not delta.content:
            continue

        if not tools_enabled or streaming_text:
            out_delta = {"content": delta.content}
            if not emitted:
                out_delta["role"] = pending_role
            emitted = True
            streaming_text = True
            yield event(make_chunk(chunk_id, created, model, out_delta))
            continue

        pending += delta.content
        candidate = pending.lstrip()
        if "Tool calls:".startswith(candidate) or candidate.startswith("Tool calls:"):
            continue
        streaming_text = True
        out_delta = {"content": pending}
        if not emitted:
            out_delta["role"] = pending_role
        emitted = True
        pending = ""
        yield event(make_chunk(chunk_id, created, model, out_delta))

    parsed_calls = parse_tool_calls_text(pending) if tools_enabled else None
    if parsed_calls:
        indexed = []
        for index, call in enumerate(parsed_calls):
            item = copy.deepcopy(call)
            item.setdefault("index", index)
            indexed.append(item)
        tool_calls.append(indexed)
        yield event(make_chunk(chunk_id, created, model, {"tool_calls": indexed, "role": pending_role} if not emitted else {"tool_calls": indexed}))
    elif pending:
        yield event(make_chunk(chunk_id, created, model, {"content": pending, "role": pending_role} if not emitted else {"content": pending}))

    finish_reason = "tool_calls" if tool_calls.calls else "stop"
    yield event(make_chunk(chunk_id, created, model, {}, finish_reason))
    yield "data: [DONE]\n\n"


async def complete_openai_response(req: dict[str, Any], sess: SessionContext) -> dict[str, Any]:
    lines_iter, model, tools_enabled = await qoder_stream_lines(sess, req)
    completion_id = "chatcmpl-" + uuid.uuid4().hex[:24]
    created = int(time.time())
    full_content = []
    full_reasoning = []
    tool_calls = ToolCallAccumulator()

    async for line in lines_iter:
        if not line.startswith("data:"):
            continue
        raw_data = line[5:].strip()
        if raw_data == "[DONE]":
            break
        delta = extract_delta(raw_data)
        if delta.content:
            full_content.append(delta.content)
        if delta.reasoning_content:
            full_reasoning.append(delta.reasoning_content)
        if delta.tool_calls:
            tool_calls.append(delta.tool_calls)

    content = "".join(full_content)
    fallback_tool_calls = None if tool_calls.calls or not tools_enabled else parse_tool_calls_text(content)
    message: dict[str, Any] = {"role": "assistant"}
    if fallback_tool_calls:
        message["content"] = None
        message["tool_calls"] = fallback_tool_calls
    elif not content and tool_calls.calls:
        message["content"] = None
    else:
        message["content"] = content

    if full_reasoning:
        message["reasoning_content"] = "".join(full_reasoning)

    if tool_calls.calls:
        message["tool_calls"] = tool_calls.snapshot()

    return {
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "message": message, "finish_reason": "tool_calls" if tool_calls.calls or fallback_tool_calls else "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }
