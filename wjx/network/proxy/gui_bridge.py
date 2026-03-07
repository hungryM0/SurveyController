"""GUI交互桥接 - 弹窗、线程派发、开关控制"""
import logging
import threading
from typing import Any, Callable, Optional

from wjx.network.proxy.card import _validate_card
from wjx.network.proxy.quota import get_random_ip_limit
from wjx.utils.logging.log_utils import (
    log_popup_confirm,
    log_popup_error,
    log_popup_info,
    log_popup_warning,
    log_suppressed_exception,
)
from wjx.utils.system.registry_manager import RegistryManager

_quota_limit_dialog_shown = False


def _resolve_ip_quota_cost() -> tuple[int, int]:
    """按当前代理 minute 计算一次提交消耗的额度计数。"""
    from wjx.network.proxy.provider import get_proxy_occupy_minute, get_quota_cost_by_minute

    minute = int(get_proxy_occupy_minute() or 1)
    quota_cost = int(get_quota_cost_by_minute(minute))
    return minute, quota_cost


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
    """随机IP启用确认（已移除使用声明弹窗）。"""
    if gui is not None:
        setattr(gui, "_random_ip_disclaimer_ack", True)
    return True


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
    count = RegistryManager.read_submit_count()
    limit = int(RegistryManager.read_quota_limit(0) or 0)
    if limit <= 0:
        _invoke_popup(gui, "warning", "提示", "随机IP额度不可用（本地未初始化且默认额度API不可用）。")
        _set_random_ip_enabled(gui, False)
        return
    if count >= limit:
        _invoke_popup(gui, "warning", "提示", f"随机IP已达{limit}份限制，请核销卡密后再启用。")
        _set_random_ip_enabled(gui, False)
        return
    if confirm_random_ip_usage(gui):
        return
    _set_random_ip_enabled(gui, False)


def ensure_random_ip_ready(gui: Any) -> bool:
    if getattr(gui, "_random_ip_disclaimer_ack", False):
        return True
    return confirm_random_ip_usage(gui)


def show_card_validation_dialog(gui: Any = None) -> bool:
    prompt = (
        "随机IP额度已用尽。\n\n"
        "如已获取卡密，请输入卡密以解锁大额额度；否则可选择取消并继续使用自定义代理接口。"
    )
    if not _invoke_popup(gui, "confirm", "随机IP额度", prompt):
        return False
    code_getter = getattr(gui, "request_card_code", None)
    if not callable(code_getter):
        log_popup_warning("需要卡密", "请在界面中输入卡密解锁随机IP额度")
        return False
    card_code = code_getter()
    ok, quota = _validate_card(str(card_code) if card_code else "")
    if ok:
        if quota is None:
            _invoke_popup(gui, "error", "验证失败", "卡密验证成功但缺少额度信息，请联系开发者。")
            return False
        quota_to_add = max(1, int(quota))
        new_limit = get_random_ip_limit() + quota_to_add
        RegistryManager.write_quota_limit(new_limit)
        RegistryManager.set_card_verified(True)
        _invoke_popup(gui, "info", "验证成功", f"卡密验证通过，已增加 {quota_to_add} 额度（当前总额度：{new_limit}）。")
        return True
    _invoke_popup(gui, "error", "验证失败", "卡密验证失败，请检查后重试。")
    return False


def refresh_ip_counter_display(gui: Any) -> None:
    from wjx.network.proxy.provider import is_custom_proxy_api_active
    if gui is None:
        return

    def _compute_and_update():
        limit = int(get_random_ip_limit() or 0)
        count = RegistryManager.read_submit_count()
        custom_api = is_custom_proxy_api_active()

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


def _disable_random_ip_and_show_dialog(gui: Any) -> None:
    global _quota_limit_dialog_shown

    def _action():
        global _quota_limit_dialog_shown
        if _quota_limit_dialog_shown:
            return
        _quota_limit_dialog_shown = True
        _set_random_ip_enabled(gui, False)
        show_card_validation_dialog(gui)

    _schedule_on_gui_thread(gui, _action)


def handle_random_ip_submission(gui: Any, stop_signal: Optional[threading.Event]) -> None:
    from wjx.network.proxy.provider import is_custom_proxy_api_active
    if is_custom_proxy_api_active():
        return
    limit = int(get_random_ip_limit() or 0)
    if limit <= 0:
        logging.warning("随机IP额度不可用，停止任务")
        if stop_signal:
            stop_signal.set()
        _set_random_ip_enabled(gui, False)
        return
    current_count = RegistryManager.read_submit_count()
    if current_count >= limit:
        logging.warning(f"随机IP提交已达{limit}份限制，停止任务并弹出卡密验证窗口")
        if stop_signal:
            stop_signal.set()
        _disable_random_ip_and_show_dialog(gui)
        return
    minute, quota_cost = _resolve_ip_quota_cost()
    remaining = max(0, limit - current_count)
    if remaining < quota_cost:
        logging.warning(
            "随机IP剩余额度不足（剩余%s，当前minute=%s需消耗%s），停止任务并弹出卡密验证窗口",
            remaining,
            minute,
            quota_cost,
        )
        if stop_signal:
            stop_signal.set()
        _disable_random_ip_and_show_dialog(gui)
        return
    ip_count = RegistryManager.increment_submit_count(quota_cost)
    logging.info(f"随机IP提交计数: {ip_count}/{limit}（minute={minute}，本次消耗={quota_cost}）")
    try:
        _schedule_on_gui_thread(gui, lambda: refresh_ip_counter_display(gui))
    except Exception as exc:
        log_suppressed_exception("gui_bridge.handle_random_ip_submission refresh counter", exc)
    if ip_count >= limit:
        logging.warning(f"随机IP提交已达{limit}份，停止任务并弹出卡密验证窗口")
        if stop_signal:
            stop_signal.set()
        _disable_random_ip_and_show_dialog(gui)
