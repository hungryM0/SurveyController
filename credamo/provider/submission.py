"""Credamo 见数提交结果与验证识别。"""

from __future__ import annotations

import time
from typing import Any, Optional

from software.network.browser import BrowserDriver

_COMPLETION_MARKERS = (
    "提交成功",
    "作答完成",
    "问卷已完成",
    "感谢参与",
    "感谢作答",
    "感谢您的参与",
    "thank",
    "success",
)
_VERIFICATION_MARKERS = ("验证码", "验证", "captcha", "滑块")


def _body_text(driver: BrowserDriver) -> str:
    try:
        return str(driver.execute_script("return document.body ? document.body.innerText || '' : ''; ") or "")
    except Exception:
        return ""


def is_completion_page(driver: BrowserDriver) -> bool:
    try:
        url = str(driver.current_url or "").lower()
    except Exception:
        url = ""
    if any(marker in url for marker in ("complete", "success", "finish", "done")):
        return True
    text = _body_text(driver).lower()
    return any(marker.lower() in text for marker in _COMPLETION_MARKERS)


def submission_requires_verification(driver: BrowserDriver) -> bool:
    text = _body_text(driver).lower()
    return any(marker.lower() in text for marker in _VERIFICATION_MARKERS)


def submission_validation_message(driver: Optional[BrowserDriver] = None) -> str:
    del driver
    return "Credamo 见数提交命中验证码/安全验证，当前版本暂不支持自动处理"


def wait_for_submission_verification(
    driver: BrowserDriver,
    *,
    timeout: int = 3,
    stop_signal: Any = None,
) -> bool:
    deadline = time.time() + max(1, int(timeout or 1))
    while time.time() < deadline:
        if stop_signal is not None and stop_signal.is_set():
            return False
        if submission_requires_verification(driver):
            return True
        time.sleep(0.15)
    return submission_requires_verification(driver)


def handle_submission_verification_detected(ctx: Any, gui_instance: Any, stop_signal: Any) -> None:
    del ctx, gui_instance, stop_signal


def consume_submission_success_signal(driver: BrowserDriver) -> bool:
    return is_completion_page(driver)


def is_device_quota_limit_page(driver: BrowserDriver) -> bool:
    text = _body_text(driver)
    return "已达上限" in text or "次数已满" in text or "名额已满" in text

