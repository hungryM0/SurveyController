"""会话策略 - 代理切换与浏览器实例复用逻辑"""
from typing import Any, Optional, Tuple
import logging

from wjx.core.task_context import TaskContext
from wjx.network.proxy import _fetch_new_proxy_batch, _mask_proxy_for_log
from wjx.utils.io.load_save import _select_user_agent_from_keys, _select_user_agent_from_ratios
from wjx.utils.logging.log_utils import log_suppressed_exception


def _record_bad_proxy_and_maybe_pause(
    ctx: TaskContext,
    gui_instance: Optional[Any],
) -> bool:
    """
    记录连续无效代理次数；达到阈值时暂停执行以避免继续消耗代理 API 额度。
    返回 True 表示已触发暂停。
    """
    with ctx.lock:
        ctx._consecutive_bad_proxy_count += 1
        streak = int(ctx._consecutive_bad_proxy_count)
    if streak >= int(ctx.MAX_CONSECUTIVE_BAD_PROXIES):
        reason = f"代理连续{ctx.MAX_CONSECUTIVE_BAD_PROXIES}次不可用，已暂停以防继续扣费"
        logging.warning(reason)
        try:
            if gui_instance and hasattr(gui_instance, "pause_run"):
                gui_instance.pause_run(reason)
        except Exception as exc:
            log_suppressed_exception("session_policy._record_bad_proxy_and_maybe_pause pause_run", exc, level=logging.WARNING)
        return True
    return False


def _reset_bad_proxy_streak(ctx: TaskContext) -> None:
    with ctx.lock:
        ctx._consecutive_bad_proxy_count = 0


def _select_proxy_for_session(ctx: TaskContext) -> Optional[str]:
    if not ctx.random_proxy_ip_enabled:
        return None
    with ctx.lock:
        if ctx.proxy_ip_pool:
            return ctx.proxy_ip_pool.pop(0)

    # 代理池为空时，使用全局 fetch 锁避免多线程并发重复请求代理 API（会快速耗尽额度）
    with ctx._proxy_fetch_lock:
        with ctx.lock:
            if ctx.proxy_ip_pool:
                return ctx.proxy_ip_pool.pop(0)

        expected = max(1, int(ctx.num_threads or 1))
        try:
            fetched = _fetch_new_proxy_batch(expected_count=expected, stop_signal=ctx.stop_event)
        except Exception as exc:
            logging.warning(f"获取随机代理失败：{exc}")
            return None
        if not fetched:
            return None

        extra = fetched[1:]
        if extra:
            with ctx.lock:
                for proxy in extra:
                    if proxy not in ctx.proxy_ip_pool:
                        ctx.proxy_ip_pool.append(proxy)
        return fetched[0]


def _select_user_agent_for_session(ctx: TaskContext) -> Tuple[Optional[str], Optional[str]]:
    if not ctx.random_user_agent_enabled:
        return None, None
    # 优先使用占比配置
    if ctx.user_agent_ratios:
        return _select_user_agent_from_ratios(ctx.user_agent_ratios)
    # 兼容旧的keys配置
    return _select_user_agent_from_keys(ctx.user_agent_pool_keys)


def _discard_unresponsive_proxy(ctx: TaskContext, proxy_address: str) -> None:
    if not proxy_address:
        return
    with ctx.lock:
        removed = False
        while True:
            try:
                ctx.proxy_ip_pool.remove(proxy_address)
                removed = True
            except ValueError:
                break
        if removed:
            logging.debug(f"已移除无响应代理：{_mask_proxy_for_log(proxy_address)}")
