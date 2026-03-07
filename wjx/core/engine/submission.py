"""提交流程处理 - 问卷提交与结果验证"""
import logging
import threading
import time
from typing import Optional
from urllib.parse import urljoin, urlparse

import httpx

from wjx.core.engine.runtime_control import _is_fast_mode, _sleep_with_stop
from wjx.core.questions.utils import extract_text_from_element as _extract_text_from_element
from wjx.core.task_context import TaskContext
from wjx.network.browser import By, BrowserDriver, NoSuchElementException, TimeoutException
from wjx.utils.app.config import SUBMIT_CLICK_SETTLE_DELAY, SUBMIT_INITIAL_DELAY
from wjx.utils.logging.log_utils import log_suppressed_exception


def _click_submit_button(driver: BrowserDriver, max_wait: float = 10.0) -> bool:
    """点击“提交”按钮（简单版）。"""

    submit_keywords = ("提交", "完成", "交卷", "确认提交", "确认")

    locator_candidates = [
        (By.CSS_SELECTOR, "#submit_button"),
        (By.CSS_SELECTOR, "#divSubmit"),
        (By.CSS_SELECTOR, "#ctlNext"),
        (By.CSS_SELECTOR, "#SM_BTN_1"),
        (By.CSS_SELECTOR, "#SubmitBtnGroup .submitbtn"),
        (By.CSS_SELECTOR, "button[type='submit']"),
        (By.XPATH, "//a[normalize-space(.)='提交' or normalize-space(.)='完成' or normalize-space(.)='交卷' or normalize-space(.)='确认提交' or normalize-space(.)='确认']"),
        (By.XPATH, "//button[normalize-space(.)='提交' or normalize-space(.)='完成' or normalize-space(.)='交卷' or normalize-space(.)='确认提交' or normalize-space(.)='确认']"),
    ]

    def _text_looks_like_submit(element) -> bool:
        text = (_extract_text_from_element(element) or "").strip()
        if not text:
            text = (element.get_attribute("value") or "").strip()
        if not text:
            return False
        return any(k in text for k in submit_keywords)

    deadline = time.time() + max(0.0, float(max_wait or 0.0))
    while True:
        for by, value in locator_candidates:
            try:
                elements = driver.find_elements(by, value)
            except Exception:
                continue
            for element in elements:
                try:
                    if not element.is_displayed():
                        continue
                except Exception:
                    continue

                if by == By.CSS_SELECTOR and value in ("button[type='submit']",):
                    if not _text_looks_like_submit(element):
                        continue

                try:
                    element.click()
                    logging.debug("成功点击提交按钮：%s=%s", by, value)
                    return True
                except Exception:
                    continue

        if time.time() >= deadline:
            break
        time.sleep(0.2)

    return False


def _click_submit_confirm_button(driver: BrowserDriver, settle_delay: float = 0.0) -> None:
    """点击可能出现的提交确认按钮（有则点，无则忽略）。"""
    try:
        confirm_candidates = [
            (By.XPATH, '//*[@id="layui-layer1"]/div[3]/a'),
            (By.CSS_SELECTOR, "#layui-layer1 .layui-layer-btn a"),
            (By.CSS_SELECTOR, ".layui-layer .layui-layer-btn a.layui-layer-btn0"),
        ]
        for by, value in confirm_candidates:
            try:
                el = driver.find_element(by, value)
            except Exception:
                el = None
            if not el:
                continue
            try:
                if not el.is_displayed():
                    continue
            except Exception:
                continue
            try:
                el.click()
                if settle_delay > 0:
                    time.sleep(settle_delay)
                break
            except Exception:
                continue
    except Exception as exc:
        log_suppressed_exception("submission._click_submit_confirm_button", exc)


def _parse_submit_response(raw_text: str) -> tuple[str, str]:
    """解析问卷星提交通用响应格式：`业务码〒内容`。"""
    text = str(raw_text or "").strip()
    if "〒" not in text:
        return text, ""
    code, payload = text.split("〒", 1)
    return code.strip(), payload.strip()


def _resolve_completion_url(submit_url: str, payload: str) -> str:
    """把提交响应中的完成页路径转为可访问 URL。"""
    value = str(payload or "").strip()
    if not value:
        return ""
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if value.startswith("/"):
        return urljoin(submit_url, value)
    return urljoin(submit_url, f"/{value}")


def _sanitize_request_headers(headers: dict) -> dict:
    """过滤不适合原样透传给 httpx 的头字段。"""
    if not isinstance(headers, dict):
        return {}
    blocked = {"host", "content-length", "connection", "accept-encoding"}
    cleaned = {}
    for key, value in headers.items():
        lower_key = str(key or "").strip().lower()
        if not lower_key or lower_key in blocked:
            continue
        cleaned[lower_key] = value
    return cleaned


def _collect_page_cookies(driver: BrowserDriver, submit_url: str) -> dict:
    """把当前浏览器上下文里的 cookie 迁移给 httpx。"""
    page = getattr(driver, "page", None)
    if page is None:
        return {}
    try:
        cookies = page.context.cookies([submit_url])
    except Exception as exc:
        log_suppressed_exception("submission._collect_page_cookies cookies()", exc, level=logging.WARNING)
        return {}

    cookie_map = {}
    for item in cookies or []:
        name = (item or {}).get("name")
        value = (item or {}).get("value")
        if name:
            cookie_map[str(name)] = str(value or "")
    return cookie_map


def _capture_submit_request_via_route(
    driver: BrowserDriver,
    *,
    stop_signal: Optional[threading.Event],
    settle_delay: float,
    max_wait: float = 12.0,
) -> dict:
    """通过 Playwright 路由拦截 processjq 请求，拿到完整 URL + payload。"""
    page = getattr(driver, "page", None)
    if page is None:
        raise RuntimeError("当前驱动不支持 page.route，无法走无头 httpx 提交")

    route_pattern = "**/joinnew/processjq.ashx*"
    captured: dict = {}
    captured_event = threading.Event()

    def _route_handler(route, request):
        if captured_event.is_set():
            try:
                route.abort()
            except Exception as exc:
                log_suppressed_exception("submission._capture_submit_request_via_route abort duplicated", exc, level=logging.WARNING)
            return
        try:
            captured["method"] = request.method
            captured["url"] = request.url
            captured["headers"] = dict(request.headers or {})
            captured["post_data"] = request.post_data or ""
        except Exception as exc:
            log_suppressed_exception("submission._capture_submit_request_via_route collect request", exc, level=logging.WARNING)
        finally:
            captured_event.set()
            try:
                route.abort()
            except Exception as exc:
                log_suppressed_exception("submission._capture_submit_request_via_route abort", exc, level=logging.WARNING)

    page.route(route_pattern, _route_handler)
    try:
        clicked = _click_submit_button(driver, max_wait=10.0)
        if not clicked:
            raise NoSuchElementException("Submit button not found")
        if settle_delay > 0:
            time.sleep(settle_delay)
        _click_submit_confirm_button(driver, settle_delay=settle_delay)

        deadline = time.time() + max(0.0, float(max_wait or 0.0))
        while not captured_event.is_set() and time.time() < deadline:
            if stop_signal and stop_signal.is_set():
                break
            time.sleep(0.05)
    finally:
        try:
            page.unroute(route_pattern, _route_handler)
        except Exception as exc:
            log_suppressed_exception("submission._capture_submit_request_via_route unroute", exc, level=logging.WARNING)

    if not captured:
        raise TimeoutException("无头提交流程未捕获到 processjq 请求")
    return captured


def _submit_via_headless_httpx(
    driver: BrowserDriver,
    *,
    stop_signal: Optional[threading.Event],
    settle_delay: float,
) -> None:
    """无头模式：先由页面生成提交请求，再用 httpx 真正发出。"""
    setattr(driver, "_headless_httpx_submit_success", False)
    logging.debug("无头模式启用：走 Playwright 抓包 + httpx 提交路线")
    captured = _capture_submit_request_via_route(
        driver,
        stop_signal=stop_signal,
        settle_delay=settle_delay,
    )
    submit_url = str(captured.get("url") or "").strip()
    method = str(captured.get("method") or "POST").upper()
    payload = str(captured.get("post_data") or "")
    if not submit_url:
        raise RuntimeError("无头提交流程捕获失败：提交 URL 为空")

    request_headers = _sanitize_request_headers(captured.get("headers") or {})
    cookies = _collect_page_cookies(driver, submit_url)
    timeout = httpx.Timeout(20.0, connect=10.0)

    try:
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            response = client.request(
                method=method,
                url=submit_url,
                headers=request_headers,
                content=payload,
                cookies=cookies,
            )
    except Exception as exc:
        raise RuntimeError(f"无头+httpx 提交请求失败: {exc}") from exc

    response_text = response.text or ""
    business_code, business_payload = _parse_submit_response(response_text)

    if response.status_code != 200:
        raise RuntimeError(f"无头+httpx 提交 HTTP 状态异常: {response.status_code}, 响应: {response_text[:200]}")

    if business_code != "10":
        if business_code == "22":
            raise RuntimeError("无头+httpx 提交被验证码拦截（业务码22：请输入验证码）")
        raise RuntimeError(f"无头+httpx 提交失败，业务码={business_code}，响应={business_payload or response_text[:200]}")

    completion_url = _resolve_completion_url(submit_url, business_payload)
    if completion_url:
        try:
            driver.get(completion_url, timeout=15000)
        except Exception as exc:
            log_suppressed_exception("submission._submit_via_headless_httpx open completion url", exc, level=logging.WARNING)
    setattr(driver, "_headless_httpx_submit_success", True)
    logging.debug("无头+httpx 提交成功，业务码=10")


def consume_headless_httpx_submit_success(driver: BrowserDriver) -> bool:
    """读取并清空无头+httpx提交成功标记。"""
    value = bool(getattr(driver, "_headless_httpx_submit_success", False))
    setattr(driver, "_headless_httpx_submit_success", False)
    return value


def submit(
    driver: BrowserDriver,
    ctx: Optional[TaskContext] = None,
    stop_signal: Optional[threading.Event] = None,
):
    """点击提交按钮并结束。

    仅保留最基础的行为：可选等待 -> 点击提交 -> 可选稳定等待。
    不再做弹窗确认/验证码检测/JS 强行触发等兜底逻辑。
    """
    fast_mode = _is_fast_mode(ctx) if ctx is not None else True
    settle_delay = 0 if fast_mode else SUBMIT_CLICK_SETTLE_DELAY
    pre_submit_delay = 0 if fast_mode else SUBMIT_INITIAL_DELAY

    if pre_submit_delay > 0 and _sleep_with_stop(stop_signal, pre_submit_delay):
        return
    if stop_signal and stop_signal.is_set():
        return

    if ctx is not None and bool(getattr(ctx, "headless_mode", False)):
        _submit_via_headless_httpx(
            driver,
            stop_signal=stop_signal,
            settle_delay=settle_delay,
        )
        return

    clicked = _click_submit_button(driver, max_wait=10.0)
    if not clicked:
        raise NoSuchElementException("Submit button not found")

    if settle_delay > 0:
        time.sleep(settle_delay)
    _click_submit_confirm_button(driver, settle_delay=settle_delay)


def _normalize_url_for_compare(value: str) -> str:
    """用于比较的 URL 归一化：去掉 fragment，去掉首尾空白。"""
    if value is None:
        return ""
    text = str(value).strip()
    if not text:
        return ""
    try:
        parsed = urlparse(text)
    except Exception:
        return text
    try:
        if parsed.fragment:
            parsed = parsed._replace(fragment="")
        return parsed.geturl()
    except Exception:
        return text


def _is_wjx_domain(url_value: str) -> bool:
    try:
        parsed = urlparse(str(url_value))
    except Exception:
        return False
    host = (parsed.netloc or "").split(":", 1)[0].lower()
    return bool(host == "wjx.cn" or host.endswith(".wjx.cn"))


def _looks_like_wjx_survey_url(url_value: str) -> bool:
    """粗略判断是否像问卷星问卷链接（用于“提交后分流到下一问卷”的识别）。"""
    if not url_value:
        return False
    text = str(url_value).strip()
    if not text:
        return False
    if not _is_wjx_domain(text):
        return False
    try:
        parsed = urlparse(text)
    except Exception:
        return False
    path = (parsed.path or "").lower()
    if "complete" in path:
        return False
    if not path.endswith(".aspx"):
        return False
    # 常见路径：/vm/xxxxx.aspx、/jq/xxxxx.aspx、/vj/xxxxx.aspx
    if any(segment in path for segment in ("/vm/", "/jq/", "/vj/")):
        return True
    return True


def _page_looks_like_wjx_questionnaire(driver: BrowserDriver) -> bool:
    """用 DOM 特征判断当前页是否为可作答的问卷页。"""
    script = r"""
        return (() => {
            const bodyText = (document.body?.innerText || '').replace(/\s+/g, '');
            const completeMarkers = ['答卷已经提交', '感谢您的参与', '感谢参与'];
            if (completeMarkers.some(m => bodyText.includes(m))) return false;

            // 开屏“开始作答”页（还未展示题目）
            if (bodyText.includes('开始作答') || bodyText.includes('开始答题') || bodyText.includes('开始填写')) {
                const startLike = Array.from(document.querySelectorAll('div, a, button, span')).some(el => {
                    const t = (el.innerText || el.textContent || '').replace(/\s+/g, '');
                    return t === '开始作答' || t === '开始答题' || t === '开始填写';
                });
                if (startLike) return true;
            }

            const questionLike = document.querySelector(
                '#div1, #divQuestion, [id^="divquestion"], .div_question, .question, .wjx_question, [topic]'
            );

            const actionLike = document.querySelector(
                '#submit_button, #divSubmit, #ctlNext, #divNext, #btnNext, #next, ' +
                '.next, .next-btn, .next-button, .btn-next, button[type="submit"], a.button.mainBgColor'
            );

            return !!(questionLike && actionLike);
        })();
    """
    try:
        return bool(driver.execute_script(script))
    except Exception:
        return False


def _is_device_quota_limit_page(driver: BrowserDriver) -> bool:
    """检测"设备已达到最大填写次数"提示页。"""
    script = r"""
        return (() => {
            const text = (document.body?.innerText || '').replace(/\s+/g, '');
            if (!text) return false;

            const limitMarkers = [
                '设备已达到最大填写次数',
                '已达到最大填写次数',
                '达到最大填写次数',
                '填写次数已达上限',
                '超过最大填写次数',
            ];
            const hasLimit = limitMarkers.some(marker => text.includes(marker));
            if (!hasLimit) return false;

            const hasThanks = text.includes('感谢参与') || text.includes('感谢参与!');
            const hasApology = text.includes('很抱歉') || text.includes('提示');
            if (!(hasThanks || hasApology)) return false;

            const questionLike = document.querySelector(
                '#divQuestion, [id^="divquestion"], .div_question, .question, .wjx_question, [topic]'
            );
            if (questionLike) return false;

            const startHints = ['开始作答', '开始答题', '开始填写', '继续作答', '继续填写'];
            if (startHints.some(hint => text.includes(hint))) return false;

            const submitSelectors = [
                '#submit_button',
                '#divSubmit',
                '#ctlNext',
                '#SM_BTN_1',
                '.submitDiv a',
                '.btn-submit',
                'button[type="submit"]',
                'a.mainBgColor',
            ];
            if (submitSelectors.some(sel => document.querySelector(sel))) return false;

            return true;
        })();
    """
    try:
        return bool(driver.execute_script(script))
    except Exception:
        return False

