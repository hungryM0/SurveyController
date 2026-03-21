"""代理预取服务 - 封装代理池初始化逻辑"""
from __future__ import annotations

import threading
from typing import List, Optional

from wjx.core.task_context import ProxyLease
from wjx.network.proxy import get_effective_proxy_api_url
from wjx.network.proxy.provider import fetch_proxy_batch


def prefetch_proxy_pool(
    expected_count: int,
    proxy_api_url: Optional[str] = None,
    stop_signal: Optional[threading.Event] = None,
) -> List[ProxyLease]:
    """预取一批代理 IP。"""
    effective_url = proxy_api_url or get_effective_proxy_api_url()
    proxy_pool = fetch_proxy_batch(
        expected_count=max(1, expected_count),
        proxy_url=effective_url,
        notify_on_area_error=False,
        stop_signal=stop_signal,
    )
    return proxy_pool
