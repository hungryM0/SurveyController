"""GUI 交互桥接 - 弹窗、线程派发、开关控制。"""
from __future__ import annotations

import logging
import threading
from typing import Any, Callable, Optional

from wjx.network.proxy.auth import (
    RandomIPAuthError,
    activate_trial,
    format_random_ip_error,
    get_quota_snapshot,
    get_session_snapshot,
    has_authenticated_session,
    load_session_for_startup,
)
from wjx.network.proxy.quota import get_random_ip_counter_snapshot_local
from wjx.network.proxy.card import _validate_card, get_last_card_error_message
from wjx.utils.logging.log_utils import (
    log_popup_confirm,
    log_popup_error,
    log_popup_info,
    log_popup_warning,
    log_suppressed_exception,
)


def _invoke_popup(gui: Any, kind: str, title: str, message: str) -> Any:
    gui_handler = getattr(gui, f"_log_popup_{kind}", None) if gui is not None else None
    if callable(gui_handler):
        try:
            return gui_handler(title, message)
        except Exception:
            logging.debug("GUI popup handler failed; falling back to global handler", exc_info=True)
    popup_map = {"info": log_popup_info, "warning": log_popup_warning, "error": log_popup_error, "confirm": log_popup_confirm}
    handler = popup_map.get(kind)
    return handler(title, message) if handler else None


def _set_random_ip_enabled(gui: Any, enabled: bool) -> None:
    if gui is None:
        return
    var = getattr(gui, "random_ip_enabled_var", None)
    if var and hasattr(var, "set"):
        try:
            var.set(bool(enabled))
        except Exception:
            logging.debug("无法更新随机IP开关状态", exc_info=True)


def _schedule_on_gui_thread(gui: Any, callback: Callable[[], None]) -> None:
    if gui is None:
        callback()
        return
    for attr in ("_post_to_ui_thread_async", "_post_to_ui_thread"):
        dispatcher = getattr(gui, attr, None)
        if callable(dispatcher):
            try:
                if attr == "_post_to_ui_thread_async":
                    dispatcher(callback)
                else:
                    threading.Thread(target=dispatcher, args=(callback,), daemon=True).start()
                return
            except Exception:
                logging.debug("派发到 GUI 线程失败", exc_info=True)
    try:
        callback()
    except Exception:
        logging.debug("执行回调失败", exc_info=True)


def confirm_random_ip_usage(gui: Any) -> bool:
    if gui is not None:
        setattr(gui, "_random_ip_disclaimer_ack", True)
    return True


def _build_counter_snapshot() -> tuple[int, int]:
    count, limit, _custom_api = get_random_ip_counter_snapshot_local()
    return int(count), int(limit)


def on_random_ip_toggle(gui: Any) -> None:
    from wjx.network.proxy.provider import is_custom_proxy_api_active

    if gui is None:
        return
    var = getattr(gui, "random_ip_enabled_var", None)
    enabled = bool(var.get() if var and hasattr(var, "get") else False)
    if not enabled:
        return
    if is_custom_proxy_api_active():
        if confirm_random_ip_usage(gui):
            return
        _set_random_ip_enabled(gui, False)
        return
    if not has_authenticated_session():
        activated = show_random_ip_activation_dialog(gui)
        if not activated:
            _set_random_ip_enabled(gui, False)
            return
    snapshot = get_quota_snapshot()
    remaining = int(snapshot["remaining_quota"])
    if remaining <= 0:
        _invoke_popup(gui, "warning", "提示", "随机IP额度不足，请先补充额度后再启用。")
        _set_random_ip_enabled(gui, False)
        return
    if confirm_random_ip_usage(gui):
        return
    _set_random_ip_enabled(gui, False)


def ensure_random_ip_ready(gui: Any) -> bool:
    if getattr(gui, "_random_ip_disclaimer_ack", False):
        return True
    return confirm_random_ip_usage(gui)


def _try_activate_trial(gui: Any = None) -> tuple[bool, bool]:
    try:
        session = activate_trial()
    except RandomIPAuthError as exc:
        message = format_random_ip_error(exc)
        if exc.detail in {"trial_already_claimed", "trial_already_used", "device_trial_already_claimed"}:
            _invoke_popup(gui, "warning", "试用已领取", message)
            return False, True
        _invoke_popup(gui, "error", "领取试用失败", message)
        return False, False
    except Exception as exc:
        _invoke_popup(gui, "error", "领取试用失败", f"领取试用失败：{exc}")
        return False, False

    quota_left = max(0, int(session.remaining_quota or 0))
    _invoke_popup(gui, "info", "试用已领取", f"已领取免费试用，随机IP剩余额度：{quota_left}。")
    try:
        refresh_ip_counter_display(gui)
    except Exception as exc:
        log_suppressed_exception("_try_activate_trial refresh counter", exc)
    return True, False


def show_random_ip_activation_dialog(gui: Any = None) -> bool:
    if has_authenticated_session():
        return show_card_validation_dialog(gui)

    prompt = (
        "默认随机IP现已支持一次免费试用。\n\n"
        "是否立即领取免费试用？\n"
        "取消则进入卡密激活流程。"
    )
    wants_trial = bool(_invoke_popup(gui, "confirm", "随机IP试用", prompt))
    if wants_trial:
        activated, should_fallback_to_card = _try_activate_trial(gui)
        if activated:
            return True
        if not should_fallback_to_card:
            return False

    return show_card_validation_dialog(gui)


def show_card_validation_dialog(gui: Any = None) -> bool:
    prompt = (
        "默认随机IP现已改为账号鉴权。\n\n"
        "请输入卡密激活随机IP服务；若暂时不想激活，可取消后继续使用自定义代理接口。"
    )
    if not _invoke_popup(gui, "confirm", "随机IP激活", prompt):
        return False
    code_getter = getattr(gui, "request_card_code", None)
    if not callable(code_getter):
        log_popup_warning("需要卡密", "请在界面中输入卡密激活随机IP服务")
        return False
    card_code = code_getter()
    ok, remaining = _validate_card(str(card_code) if card_code else "")
    if ok:
        quota_left = max(0, int(remaining or 0))
        _invoke_popup(gui, "info", "激活成功", f"卡密验证通过，随机IP剩余额度：{quota_left}。")
        try:
            refresh_ip_counter_display(gui)
        except Exception as exc:
            log_suppressed_exception("show_card_validation_dialog refresh counter", exc)
        return True
    message = get_last_card_error_message() or "卡密验证失败，请检查后重试。"
    _invoke_popup(gui, "error", "验证失败", message)
    return False


def refresh_ip_counter_display(gui: Any) -> None:
    from wjx.network.proxy.provider import is_custom_proxy_api_active

    load_session_for_startup()
    if gui is None:
        return

    def _compute_and_update():
        custom_api = is_custom_proxy_api_active()
        count, limit = _build_counter_snapshot()

        def _apply():
            handler = getattr(gui, "update_random_ip_counter", None)
            if not callable(handler):
                return
            handler(count, limit, custom_api)
            if not custom_api and limit > 0 and count >= limit:
                _set_random_ip_enabled(gui, False)

        _schedule_on_gui_thread(gui, _apply)

    if threading.current_thread() is threading.main_thread():
        threading.Thread(target=_compute_and_update, daemon=True, name="IPCounterRefresh").start()
    else:
        _compute_and_update()


def handle_random_ip_submission(gui: Any, stop_signal: Optional[threading.Event]) -> None:
    from wjx.network.proxy.provider import is_custom_proxy_api_active

    if gui is None or is_custom_proxy_api_active():
        return
    try:
        snapshot = get_session_snapshot()
        if not bool(snapshot.get("authenticated")):
            if stop_signal:
                stop_signal.set()
            _set_random_ip_enabled(gui, False)
            return
        refresh_ip_counter_display(gui)
    except Exception as exc:
        message = format_random_ip_error(exc)
        logging.warning("刷新随机IP状态失败：%s", message)
