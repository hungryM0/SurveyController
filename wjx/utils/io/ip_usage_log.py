"""IP 使用记录数据接口 - 从自建 API 获取每日提取记录"""
import wjx.network.http_client as http_client
from wjx.utils.app.config import DEFAULT_HTTP_HEADERS

_API_URL = "https://api-wjx.hungrym0.top/ipzan/usage"


def get_usage_history() -> list:
    """返回近 30 日每日 IP 提取记录，按日期升序排列。"""
    resp = http_client.get(_API_URL, timeout=10, headers=DEFAULT_HTTP_HEADERS, proxies={})
    resp.raise_for_status()
    return resp.json()
