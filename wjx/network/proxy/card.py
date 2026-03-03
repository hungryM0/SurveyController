"""卡密验证 - 纯逻辑，无GUI依赖"""
import logging
from typing import Any, Optional

import wjx.network.http_client as http_client
from wjx.utils.app.config import CARD_VALIDATION_ENDPOINT, DEFAULT_HTTP_HEADERS

_CARD_VERIFY_TIMEOUT = 8


def _mask_card_code(code: str) -> str:
    if not code:
        return "***"
    code = str(code).strip()
    if len(code) <= 4:
        return "***"
    if len(code) <= 8:
        return f"{code[:2]}***{code[-2:]}"
    return f"{code[:3]}***{code[-3:]}"


def _summarize_http_response(response: Any) -> str:
    try:
        status = f"HTTP {getattr(response, 'status_code', '?')}"
        reason = getattr(response, "reason", "") or ""
        headers = getattr(response, "headers", {}) or {}
        interesting_keys = ("cf-ray", "server", "content-type", "content-length", "date")
        header_parts = [f"{k}={v}" for k in interesting_keys if (v := headers.get(k) or headers.get(k.title()))]
        header_text = "; ".join(header_parts) if header_parts else "no-key-headers"
        try:
            body = (response.text or "").strip()
        except Exception:
            body = "<unreadable body>"
        if body and len(body) > 300:
            body = body[:300] + "...(truncated)"
        return f"{status} {reason}; headers: {header_text}; body: {body or '<empty>'}"
    except Exception as exc:
        return f"无法摘要响应: {exc}"


def _validate_card(card_code: str) -> tuple[bool, Optional[int]]:
    if not card_code:
        return False, None
    if not CARD_VALIDATION_ENDPOINT:
        logging.error("未配置 CARD_VALIDATION_ENDPOINT，无法验证卡密")
        return False, None

    code = card_code.strip()
    masked = _mask_card_code(code)
    headers = {"Content-Type": "application/json", **DEFAULT_HTTP_HEADERS}

    try:
        response = http_client.post(
            CARD_VALIDATION_ENDPOINT, json={"code": code},
            headers=headers, timeout=_CARD_VERIFY_TIMEOUT, proxies={},
        )
    except Exception as exc:
        logging.error(f"卡密验证请求失败: {exc}")
        return False, None

    try:
        data = response.json()
    except Exception as exc:
        logging.error(f"解析卡密验证响应失败: {exc} | {_summarize_http_response(response)}")
        return False, None

    if isinstance(data, dict) and data.get("ok") is True:
        quota_val = data.get("quota")
        if quota_val is None:
            logging.error(f"卡密 {masked} 验证成功，但服务器响应缺少quota字段 | {_summarize_http_response(response)}")
            return False, None
        if not isinstance(quota_val, (int, float, str)):
            logging.error(f"卡密 {masked} 验证成功，但quota字段类型异常: {type(quota_val).__name__} | {_summarize_http_response(response)}")
            return False, None
        try:
            quota_val = int(quota_val)
        except (ValueError, TypeError) as e:
            logging.error(f"卡密 {masked} 验证成功，但quota值无法转换为整数: {quota_val!r} ({e}) | {_summarize_http_response(response)}")
            return False, None
        if quota_val <= 0:
            logging.error(f"卡密 {masked} 验证成功，但quota值无效: {quota_val}（可能卡密已被使用或无额度）| {_summarize_http_response(response)}")
            return False, None
        if quota_val > 10000:
            logging.error(f"卡密 {masked} 验证成功，但quota值超出限制: {quota_val} > 10000 | {_summarize_http_response(response)}")
            return False, None
        logging.info(f"卡密 {masked} 验证通过，额度+{quota_val}")
        return True, quota_val

    detail = data.get("detail", "未知错误") if isinstance(data, dict) else "响应格式异常"
    logging.warning(f"卡密验证失败：{detail} | {_summarize_http_response(response)}")
    return False, None
