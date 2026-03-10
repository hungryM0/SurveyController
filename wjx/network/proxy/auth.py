"""随机 IP 鉴权与会话管理。"""
from __future__ import annotations

import logging
import re
import threading
import uuid
from dataclasses import dataclass, replace
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from PySide6.QtCore import QSettings

import wjx.network.http_client as http_client
from wjx.utils.app.config import (
    AUTH_ACTIVATE_ENDPOINT,
    AUTH_BONUS_CLAIM_ENDPOINT,
    AUTH_REFRESH_ENDPOINT,
    AUTH_TRIAL_ENDPOINT,
    DEFAULT_HTTP_HEADERS,
    IP_EXTRACT_ENDPOINT,
)
from wjx.utils.logging.log_utils import log_suppressed_exception
from wjx.utils.system.secure_store import delete_secret, get_secret, set_secret

_SETTINGS_ORG = "FuckWjx"
_SETTINGS_APP = "Settings"
_SESSION_PREFIX = "random_ip_auth/"
_DEVICE_SECRET_KEY = "random_ip/device_id"
_REFRESH_SECRET_KEY = "random_ip/refresh_token"
_TOKEN_EARLY_REFRESH_SECONDS = 60
_LOG_BODY_PREVIEW_LIMIT = 320
_SENSITIVE_PREVIEW_PATTERNS = (
    (re.compile(r'("?(?:access_token|refresh_token|account|password)"?\s*:\s*")[^"]*(")', re.IGNORECASE), r"\1***\2"),
    (re.compile(r"(Authorization\s*:\s*Bearer\s+)[^\s]+", re.IGNORECASE), r"\1***"),
)


class RandomIPAuthError(RuntimeError):
    def __init__(self, detail: str, *, status_code: int = 0, retry_after_seconds: int = 0):
        self.detail = str(detail or "unknown_error")
        self.status_code = int(status_code or 0)
        self.retry_after_seconds = max(0, int(retry_after_seconds or 0))
        super().__init__(self.detail)


@dataclass(frozen=True)
class RandomIPSession:
    device_id: str = ""
    access_token: str = ""
    refresh_token: str = ""
    expires_at: Optional[datetime] = None
    refresh_expires_at: Optional[datetime] = None
    remaining_quota: int = 0
    total_quota: int = 0

    @property
    def has_refresh_token(self) -> bool:
        return bool(self.refresh_token and self.refresh_expires_at and self.refresh_expires_at > _utc_now())

    @property
    def has_access_token(self) -> bool:
        return bool(self.access_token and self.expires_at and self.expires_at > _utc_now())


_session_lock = threading.RLock()
_session_loaded = False
_session = RandomIPSession()


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _get_settings() -> QSettings:
    return QSettings(_SETTINGS_ORG, _SETTINGS_APP)


def _settings_key(name: str) -> str:
    return f"{_SESSION_PREFIX}{name}"


def _parse_datetime(raw: Any) -> Optional[datetime]:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        normalized = text.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
    except Exception:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _serialize_datetime(value: Optional[datetime]) -> str:
    if value is None:
        return ""
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_non_negative_int(value: Any, default: int = 0) -> int:
    try:
        parsed = int(value)
    except Exception:
        return max(0, int(default))
    return max(0, parsed)


def _ensure_loaded() -> None:
    global _session_loaded, _session
    with _session_lock:
        if _session_loaded:
            return
        settings = _get_settings()
        device_id = get_secret(_DEVICE_SECRET_KEY).strip()
        if not device_id:
            device_id = str(settings.value(_settings_key("device_id")) or "").strip()
        if not device_id:
            device_id = uuid.uuid4().hex
            set_secret(_DEVICE_SECRET_KEY, device_id)
        refresh_token = get_secret(_REFRESH_SECRET_KEY).strip()
        refresh_expires_at = _parse_datetime(settings.value(_settings_key("refresh_expires_at")))
        if refresh_token and refresh_expires_at and refresh_expires_at <= _utc_now():
            refresh_token = ""
            refresh_expires_at = None
            delete_secret(_REFRESH_SECRET_KEY)
        remaining_quota = _to_non_negative_int(settings.value(_settings_key("remaining_quota")), 0)
        total_quota = _to_non_negative_int(settings.value(_settings_key("total_quota")), remaining_quota)
        _session = RandomIPSession(
            device_id=device_id,
            refresh_token=refresh_token,
            refresh_expires_at=refresh_expires_at,
            remaining_quota=remaining_quota,
            total_quota=max(total_quota, remaining_quota),
        )
        _session_loaded = True


def _persist_session_locked() -> None:
    settings = _get_settings()
    settings.setValue(_settings_key("device_id"), str(_session.device_id or "").strip())
    settings.setValue(_settings_key("remaining_quota"), int(_session.remaining_quota))
    settings.setValue(_settings_key("total_quota"), int(max(_session.total_quota, _session.remaining_quota)))
    settings.setValue(_settings_key("refresh_expires_at"), _serialize_datetime(_session.refresh_expires_at))
    settings.sync()
    set_secret(_DEVICE_SECRET_KEY, _session.device_id)
    set_secret(_REFRESH_SECRET_KEY, _session.refresh_token)


def _set_session(new_session: RandomIPSession) -> RandomIPSession:
    global _session
    with _session_lock:
        _ensure_loaded()
        _session = replace(
            new_session,
            total_quota=max(int(new_session.total_quota or 0), int(new_session.remaining_quota or 0)),
            remaining_quota=max(0, int(new_session.remaining_quota or 0)),
        )
        _persist_session_locked()
        return _session


def _read_session() -> RandomIPSession:
    _ensure_loaded()
    with _session_lock:
        return replace(_session)


def _update_quota(remaining_quota: int, total_hint: Optional[int] = None) -> RandomIPSession:
    global _session
    with _session_lock:
        _ensure_loaded()
        total_quota = int(_session.total_quota or 0)
        if total_hint is not None:
            total_quota = max(total_quota, int(total_hint))
        total_quota = max(total_quota, int(remaining_quota))
        session = replace(
            _session,
            remaining_quota=max(0, int(remaining_quota)),
            total_quota=total_quota,
        )
        _session = session
        _persist_session_locked()
        return replace(session)


def get_device_id() -> str:
    return _read_session().device_id


def clear_session() -> None:
    global _session
    with _session_lock:
        _ensure_loaded()
        _session = RandomIPSession(device_id=_session.device_id)
        delete_secret(_REFRESH_SECRET_KEY)
        settings = _get_settings()
        settings.remove(_settings_key("remaining_quota"))
        settings.remove(_settings_key("total_quota"))
        settings.remove(_settings_key("refresh_expires_at"))
        settings.sync()


def has_authenticated_session() -> bool:
    session = _read_session()
    return bool(session.has_refresh_token or session.has_access_token)


def get_session_snapshot() -> Dict[str, Any]:
    session = _read_session()
    return {
        "authenticated": bool(session.has_refresh_token or session.has_access_token),
        "device_id": session.device_id,
        "remaining_quota": int(session.remaining_quota),
        "total_quota": int(session.total_quota),
        "has_access_token": bool(session.has_access_token),
        "has_refresh_token": bool(session.has_refresh_token),
    }


def _build_quota_snapshot(session: RandomIPSession) -> Dict[str, int]:
    total_quota = max(0, int(session.total_quota or 0))
    remaining_quota = max(0, int(session.remaining_quota or 0))
    used_quota = max(0, total_quota - remaining_quota)
    return {
        "used_quota": used_quota,
        "total_quota": total_quota,
        "remaining_quota": remaining_quota,
    }


def format_random_ip_error(exc: BaseException) -> str:
    if not isinstance(exc, RandomIPAuthError):
        return str(exc or "请求失败，请稍后重试")
    detail = exc.detail
    if detail in {"bonus_already_claimed", "easter_egg_already_claimed"}:
        return "彩蛋已触发，无需重复领取"
    if detail in {"bonus_claim_not_available", "easter_egg_not_available"}:
        return "当前暂时无法领取彩蛋奖励，请稍后再试"
    if detail == "device_id_required":
        return "设备标识缺失，请重启软件后重试"
    if detail == "invalid_request_body":
        return "请求格式不正确，请更新客户端后重试"
    if detail == "code_required":
        return "请输入卡密"
    if detail == "invalid_code":
        return "卡密无效，请检查后重试"
    if detail == "device_owned_by_other_user":
        return "当前设备已绑定其他账号，请联系开发者处理"
    if detail == "activate_rate_limited":
        if exc.retry_after_seconds > 0:
            return f"验证过于频繁，请 {exc.retry_after_seconds} 秒后再试"
        return "验证过于频繁，请稍后再试"
    if detail in {"trial_already_claimed", "trial_already_used", "device_trial_already_claimed"}:
        return "当前设备已领取过免费试用，请改用卡密激活"
    if detail == "trial_rate_limited":
        if exc.retry_after_seconds > 0:
            return f"领取试用过于频繁，请 {exc.retry_after_seconds} 秒后再试"
        return "领取试用过于频繁，请稍后再试"
    if detail == "invalid_refresh_token":
        return "登录状态已失效，请重新核销卡密"
    if detail == "device_banned":
        return "当前设备已被封禁，请联系开发者"
    if detail == "user_banned":
        return "当前账号已被封禁，请联系开发者"
    if detail == "unauthorized":
        return "随机IP登录状态失效，请重新核销卡密"
    if detail == "minute_not_allowed":
        return "代理时长参数不被后端接受，请更新客户端"
    if detail == "pool_not_allowed":
        return "代理池参数不被后端接受，请更新客户端"
    if detail == "area_not_allowed":
        return "地区参数不被后端接受，请更新客户端或检查地区配置"
    if detail == "invalid_area":
        return "指定地区无效，请重新选择地区后再试"
    if detail == "insufficient_quota":
        return "随机IP额度不足，请先补充额度"
    if detail == "token_rate_limited":
        return "当前账号请求过于频繁，请稍后再试"
    if detail == "device_rate_limited":
        return "当前设备请求过于频繁，请稍后再试"
    if detail == "ip_rate_limited":
        return "当前网络请求过于频繁，请稍后再试"
    if detail == "user_daily_limit_exceeded":
        return "今日随机IP额度已达到上限"
    if detail == "site_daily_limit_exceeded":
        return "服务端今日额度已达上限，请稍后再试"
    if detail == "upstream_surplus_exhausted":
        return "上游代理余额不足，请稍后再试"
    if detail == "upstream_rejected":
        return "上游代理服务拒绝了请求，请稍后重试"
    if detail == "not_authenticated":
        return "请先领取免费试用或核销卡密激活随机IP"
    if detail.startswith("network_error:"):
        return f"网络请求失败：{detail.split(':', 1)[1].strip()}"
    if detail.startswith("invalid_response"):
        return "服务端返回格式异常，请稍后重试"
    if detail.startswith("http_"):
        return f"服务端暂时不可用（{detail[5:]}）"
    return detail or "请求失败，请稍后重试"


def _build_headers(*, authorized: bool = False, access_token: str = "") -> Dict[str, str]:
    headers = {
        "Content-Type": "application/json",
        "X-Device-ID": get_device_id(),
        **DEFAULT_HTTP_HEADERS,
    }
    if authorized and access_token:
        headers["Authorization"] = f"Bearer {access_token}"
    return headers


def _preview_text(value: Any, *, limit: int = _LOG_BODY_PREVIEW_LIMIT) -> str:
    text = str(value or "").strip()
    if not text:
        return "<empty>"
    for pattern, replacement in _SENSITIVE_PREVIEW_PATTERNS:
        text = pattern.sub(replacement, text)
    text = text.replace("\r", "\\r").replace("\n", "\\n")
    if len(text) > limit:
        return f"{text[:limit]}...(truncated)"
    return text


def _response_content_type(response: Any) -> str:
    headers = getattr(response, "headers", {}) or {}
    return str(headers.get("Content-Type") or headers.get("content-type") or "").strip()


def _response_header_value(response: Any, header_name: str) -> str:
    headers = getattr(response, "headers", {}) or {}
    return str(headers.get(header_name) or headers.get(str(header_name).lower()) or "").strip()


def _response_body_preview(response: Any) -> str:
    try:
        return _preview_text(getattr(response, "text", ""))
    except Exception as exc:
        return f"<unavailable:{exc}>"


def _log_extract_proxy_issue(
    message: str,
    *,
    request_body: Dict[str, Any],
    attempt: int,
    response: Any = None,
    error: Optional[BaseException] = None,
) -> None:
    status_code = int(getattr(response, "status_code", 0) or 0) if response is not None else 0
    detail = ""
    if isinstance(error, RandomIPAuthError):
        detail = error.detail
    elif error is not None:
        detail = str(error)
    logging.warning(
        "%s attempt=%s status=%s detail=%s minute=%s pool=%s area=%s cf_ray=%s content_type=%s response=%s",
        message,
        int(attempt),
        status_code,
        detail,
        request_body.get("minute"),
        request_body.get("pool"),
        request_body.get("area", ""),
        _response_header_value(response, "CF-RAY") if response is not None else "",
        _response_content_type(response) if response is not None else "",
        _response_body_preview(response) if response is not None else "<no-response>",
    )


def _extract_error_payload(response: Any) -> RandomIPAuthError:
    retry_after = 0
    headers = getattr(response, "headers", {}) or {}
    try:
        retry_after = int(headers.get("Retry-After") or 0)
    except Exception:
        retry_after = 0
    detail = ""
    try:
        payload = response.json()
    except Exception:
        payload = None
    if isinstance(payload, dict):
        detail = str(payload.get("detail") or "").strip()
        retry_after = max(retry_after, _to_non_negative_int(payload.get("retry_after_seconds"), retry_after))
    if not detail:
        detail = f"http_{getattr(response, 'status_code', 0) or 0}"
    return RandomIPAuthError(detail, status_code=int(getattr(response, "status_code", 0) or 0), retry_after_seconds=retry_after)


def _post_json(url: str, *, json_body: Dict[str, Any], authorized: bool = False, access_token: str = "") -> Any:
    try:
        return http_client.post(
            url,
            json=json_body,
            headers=_build_headers(authorized=authorized, access_token=access_token),
            timeout=10,
            proxies={},
        )
    except Exception as exc:
        raise RandomIPAuthError(f"network_error:{exc}") from exc


def _parse_session_response(response: Any) -> RandomIPSession:
    try:
        data = response.json()
    except Exception as exc:
        raise RandomIPAuthError(f"invalid_response:{exc}") from exc
    if not isinstance(data, dict):
        raise RandomIPAuthError("invalid_response")
    session = RandomIPSession(
        device_id=get_device_id(),
        access_token=str(data.get("access_token") or "").strip(),
        refresh_token=str(data.get("refresh_token") or "").strip(),
        expires_at=_parse_datetime(data.get("expires_at")),
        refresh_expires_at=_parse_datetime(data.get("refresh_expires_at")),
        remaining_quota=_to_non_negative_int(data.get("remaining_quota"), 0),
        total_quota=_to_non_negative_int(data.get("total_quota"), _to_non_negative_int(data.get("remaining_quota"), 0)),
    )
    if not session.refresh_token:
        raise RandomIPAuthError("invalid_response")
    return session


def activate_card(card_code: str) -> RandomIPSession:
    code = str(card_code or "").strip()
    if not code:
        raise RandomIPAuthError("code_required")
    response = _post_json(AUTH_ACTIVATE_ENDPOINT, json_body={"code": code})
    if int(getattr(response, "status_code", 0) or 0) != 200:
        raise _extract_error_payload(response)
    session = _parse_session_response(response)
    return _set_session(session)


def activate_trial() -> RandomIPSession:
    response = _post_json(AUTH_TRIAL_ENDPOINT, json_body={})
    if int(getattr(response, "status_code", 0) or 0) != 200:
        raise _extract_error_payload(response)
    session = _parse_session_response(response)
    return _set_session(session)


def _should_refresh(session: RandomIPSession, *, force: bool = False) -> bool:
    if force or not session.access_token or session.expires_at is None:
        return True
    return session.expires_at <= (_utc_now() + timedelta(seconds=_TOKEN_EARLY_REFRESH_SECONDS))


def refresh_session(*, force: bool = False) -> RandomIPSession:
    session = _read_session()
    if not session.has_refresh_token:
        raise RandomIPAuthError("not_authenticated")
    if not _should_refresh(session, force=force):
        return session
    response = _post_json(
        AUTH_REFRESH_ENDPOINT,
        json_body={"refresh_token": session.refresh_token},
        authorized=False,
    )
    if int(getattr(response, "status_code", 0) or 0) != 200:
        error = _extract_error_payload(response)
        if error.detail == "invalid_refresh_token":
            clear_session()
        raise error
    try:
        data = response.json()
    except Exception as exc:
        raise RandomIPAuthError(f"invalid_response:{exc}") from exc
    if not isinstance(data, dict):
        raise RandomIPAuthError("invalid_response")
    refreshed = RandomIPSession(
        device_id=session.device_id,
        access_token=str(data.get("access_token") or "").strip(),
        refresh_token=str(data.get("refresh_token") or "").strip(),
        expires_at=_parse_datetime(data.get("expires_at")),
        refresh_expires_at=_parse_datetime(data.get("refresh_expires_at")),
        remaining_quota=_to_non_negative_int(data.get("remaining_quota"), session.remaining_quota),
        total_quota=max(
            _to_non_negative_int(data.get("total_quota"), session.total_quota),
            _to_non_negative_int(data.get("remaining_quota"), session.remaining_quota),
        ),
    )
    if not refreshed.refresh_token:
        raise RandomIPAuthError("invalid_refresh_token")
    return _set_session(refreshed)


def ensure_access_token() -> str:
    session = refresh_session(force=False)
    if session.has_access_token:
        return session.access_token
    refreshed = refresh_session(force=True)
    if not refreshed.access_token:
        raise RandomIPAuthError("unauthorized")
    return refreshed.access_token


def update_remaining_quota(remaining_quota: int, *, total_hint: Optional[int] = None) -> RandomIPSession:
    return _update_quota(max(0, int(remaining_quota or 0)), total_hint=total_hint)


def extract_proxy(*, minute: int, pool: str, area: Optional[str]) -> Dict[str, Any]:
    body: Dict[str, Any] = {
        "minute": int(minute),
        "pool": str(pool or "").strip(),
    }
    area_code = str(area or "").strip()
    if area_code:
        body["area"] = area_code

    last_error: Optional[RandomIPAuthError] = None
    for attempt in range(2):
        access_token = ensure_access_token()
        try:
            response = _post_json(
                IP_EXTRACT_ENDPOINT,
                json_body=body,
                authorized=True,
                access_token=access_token,
            )
        except RandomIPAuthError as exc:
            _log_extract_proxy_issue("随机IP提取请求异常", request_body=body, attempt=attempt + 1, error=exc)
            raise
        status_code = int(getattr(response, "status_code", 0) or 0)
        if status_code == 200:
            try:
                data = response.json()
            except Exception as exc:
                _log_extract_proxy_issue("随机IP提取响应解析失败", request_body=body, attempt=attempt + 1, response=response, error=exc)
                raise RandomIPAuthError(f"invalid_response:{exc}") from exc
            if not isinstance(data, dict):
                _log_extract_proxy_issue("随机IP提取响应结构异常", request_body=body, attempt=attempt + 1, response=response)
                raise RandomIPAuthError("invalid_response")
            host = str(data.get("host") or "").strip()
            port = _to_non_negative_int(data.get("port"), 0)
            account = str(data.get("account") or "").strip()
            password = str(data.get("password") or "").strip()
            if not host or port <= 0:
                _log_extract_proxy_issue("随机IP提取响应缺少 host/port", request_body=body, attempt=attempt + 1, response=response)
                raise RandomIPAuthError("invalid_response")
            if not account or not password:
                _log_extract_proxy_issue("随机IP提取响应缺少 account/password", request_body=body, attempt=attempt + 1, response=response)
                raise RandomIPAuthError("invalid_response")
            remaining_quota = _to_non_negative_int(data.get("remaining_quota"), 0)
            quota_cost = _to_non_negative_int(data.get("quota_cost"), 0)
            total_quota = _to_non_negative_int(data.get("total_quota"), remaining_quota + quota_cost)
            update_remaining_quota(remaining_quota, total_hint=total_quota)
            return {
                "host": host,
                "port": port,
                "account": account,
                "password": password,
                "expire_at": str(data.get("expire_at") or "").strip(),
                "quota_cost": quota_cost,
                "remaining_quota": remaining_quota,
                "total_quota": total_quota,
            }
        error = _extract_error_payload(response)
        last_error = error
        _log_extract_proxy_issue("随机IP提取失败", request_body=body, attempt=attempt + 1, response=response, error=error)
        if error.detail == "unauthorized" and attempt == 0:
            refresh_session(force=True)
            continue
        raise error
    raise last_error or RandomIPAuthError("unauthorized")


def get_quota_snapshot() -> Dict[str, int]:
    return _build_quota_snapshot(_read_session())


def get_fresh_quota_snapshot() -> Dict[str, int]:
    return _build_quota_snapshot(refresh_session(force=True))


def _apply_quota_payload(data: Dict[str, Any]) -> RandomIPSession:
    session = _read_session()
    remaining_quota = _to_non_negative_int(data.get("remaining_quota"), session.remaining_quota)
    total_quota = _to_non_negative_int(data.get("total_quota"), session.total_quota)
    updated = replace(
        session,
        remaining_quota=remaining_quota,
        total_quota=max(total_quota, remaining_quota),
    )
    return _set_session(updated)


def claim_easter_egg_bonus() -> Dict[str, Any]:
    access_token = ensure_access_token()
    response = _post_json(
        AUTH_BONUS_CLAIM_ENDPOINT,
        json_body={},
        authorized=True,
        access_token=access_token,
    )
    if int(getattr(response, "status_code", 0) or 0) != 200:
        raise _extract_error_payload(response)
    try:
        data = response.json()
    except Exception as exc:
        raise RandomIPAuthError(f"invalid_response:{exc}") from exc
    if not isinstance(data, dict):
        raise RandomIPAuthError("invalid_response")

    session = _apply_quota_payload(data)
    claimed = bool(data.get("claimed", False))
    bonus_quota = _to_non_negative_int(data.get("bonus_quota"), 0)
    detail = str(data.get("detail") or "").strip()
    return {
        "claimed": claimed,
        "bonus_quota": bonus_quota,
        "detail": detail,
        "remaining_quota": int(session.remaining_quota),
        "total_quota": int(session.total_quota),
    }


def load_session_for_startup() -> None:
    try:
        _ensure_loaded()
    except Exception as exc:
        log_suppressed_exception("auth.load_session_for_startup", exc, level=logging.WARNING)
