"""卡密激活 - 纯逻辑，无 GUI 依赖。"""
from __future__ import annotations

import logging
from typing import Optional

from wjx.network.proxy.auth import (
    RandomIPAuthError,
    activate_card,
    format_random_ip_error,
)

_last_card_error_message = ""


def _mask_card_code(code: str) -> str:
    if not code:
        return "***"
    text = str(code).strip()
    if len(text) <= 4:
        return "***"
    if len(text) <= 8:
        return f"{text[:2]}***{text[-2:]}"
    return f"{text[:3]}***{text[-3:]}"


def get_last_card_error_message() -> str:
    return str(_last_card_error_message or "").strip()


def _validate_card(card_code: str) -> tuple[bool, Optional[int]]:
    global _last_card_error_message
    code = str(card_code or "").strip()
    if not code:
        _last_card_error_message = "请输入卡密"
        return False, None

    masked = _mask_card_code(code)
    try:
        session = activate_card(code)
    except RandomIPAuthError as exc:
        _last_card_error_message = format_random_ip_error(exc)
        logging.warning("卡密 %s 激活失败：%s", masked, _last_card_error_message)
        return False, None
    except Exception as exc:
        _last_card_error_message = f"激活失败：{exc}"
        logging.error("卡密 %s 激活异常：%s", masked, exc)
        return False, None

    _last_card_error_message = ""
    logging.info("卡密 %s 激活成功，剩余额度=%s", masked, session.remaining_quota)
    return True, int(session.remaining_quota)
