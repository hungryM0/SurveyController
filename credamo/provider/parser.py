"""Credamo 见数问卷解析实现。"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Tuple

from software.core.engine.driver_factory import create_playwright_driver
from software.providers.common import SURVEY_PROVIDER_CREDAMO

_QUESTION_NUMBER_RE = re.compile(r"^\s*(?:Q|题目?)\s*(\d+)\b", re.IGNORECASE)
_MULTIPLE_MARKERS = ("多选", "multiple")
_SCALE_MARKERS = ("极不", "非常", "满意", "同意", "可能", "符合")


class CredamoParseError(RuntimeError):
    """Credamo 页面结构无法解析时抛出的业务异常。"""


def _normalize_text(value: Any) -> str:
    try:
        text = str(value or "").strip()
    except Exception:
        return ""
    return re.sub(r"\s+", " ", text)


def _infer_type_code(question: Dict[str, Any]) -> str:
    input_types = {str(item or "").strip().lower() for item in question.get("input_types") or []}
    title = str(question.get("title") or "")
    option_count = int(question.get("options") or 0)
    text_input_count = int(question.get("text_inputs") or 0)

    if "checkbox" in input_types or any(marker in title for marker in _MULTIPLE_MARKERS):
        return "4"
    if "radio" in input_types:
        if option_count >= 5 and any(marker in title for marker in _SCALE_MARKERS):
            return "5"
        return "3"
    if text_input_count > 1:
        return "1"
    if text_input_count == 1 or "textarea" in input_types or "text" in input_types:
        return "1"
    if option_count >= 2:
        return "3"
    return "1"


def _normalize_question(raw: Dict[str, Any], fallback_num: int) -> Dict[str, Any]:
    raw_title = _normalize_text(raw.get("title"))
    match = _QUESTION_NUMBER_RE.match(raw_title)
    question_num = fallback_num
    title = raw_title
    if match:
        try:
            question_num = int(match.group(1))
        except Exception:
            question_num = fallback_num
        title = _normalize_text(raw_title[match.end():]) or f"Q{question_num}"

    option_texts = [_normalize_text(text) for text in raw.get("option_texts") or []]
    option_texts = [text for text in option_texts if text]
    text_inputs = max(0, int(raw.get("text_inputs") or 0))
    normalized: Dict[str, Any] = {
        "num": question_num,
        "title": title or raw_title or f"Q{question_num}",
        "description": "",
        "type_code": "0",
        "options": len(option_texts),
        "rows": 1,
        "row_texts": [],
        "page": 1,
        "option_texts": option_texts,
        "provider": SURVEY_PROVIDER_CREDAMO,
        "provider_question_id": str(raw.get("question_id") or question_num),
        "provider_page_id": "1",
        "provider_type": str(raw.get("provider_type") or "").strip(),
        "required": bool(raw.get("required")),
        "text_inputs": text_inputs,
        "text_input_labels": [],
        "is_text_like": text_inputs > 0 and not option_texts,
        "is_multi_text": text_inputs > 1,
        "is_rating": False,
        "rating_max": 0,
    }
    normalized["type_code"] = _infer_type_code({**raw, **normalized, "title": raw_title})
    if normalized["type_code"] == "5":
        normalized["is_rating"] = True
        normalized["rating_max"] = max(len(option_texts), 1)
    return normalized


def _extract_questions_from_page(page: Any) -> List[Dict[str, Any]]:
    script = r"""
() => {
  const visible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
  const findQuestionRoot = (input) => {
    let current = input;
    for (let depth = 0; current && depth < 8; depth += 1) {
      const text = clean(current.innerText || '');
      if (/^Q\s*\d+\b/i.test(text)) return current;
      current = current.parentElement;
    }
    return input.closest('.answer-content, .question, [class*="question"], [class*="Question"], [class*="answer"]') || input.parentElement;
  };
  const roots = [];
  const seen = new Set();
  for (const input of Array.from(document.querySelectorAll('input, textarea, [role="radio"], [role="checkbox"]'))) {
    if (!visible(input)) continue;
    const type = clean(input.getAttribute('type')).toLowerCase();
    const role = clean(input.getAttribute('role')).toLowerCase();
    if (!['radio', 'checkbox', 'text', 'number', 'tel', 'email', ''].includes(type) && !['radio', 'checkbox'].includes(role) && input.tagName.toLowerCase() !== 'textarea') continue;
    const root = findQuestionRoot(input);
    if (!root || seen.has(root)) continue;
    seen.add(root);
    roots.push(root);
  }
  const data = [];
  roots.forEach((root, index) => {
    const allText = clean(root.innerText || '');
    const titleMatch = allText.match(/^Q\s*\d+\b[^\n\r]*/i);
    const inputs = Array.from(root.querySelectorAll('input, textarea, [role="radio"], [role="checkbox"]')).filter(visible);
    const inputTypes = inputs.map((input) => {
      const role = clean(input.getAttribute('role')).toLowerCase();
      if (role) return role;
      if (input.tagName.toLowerCase() === 'textarea') return 'textarea';
      return clean(input.getAttribute('type')).toLowerCase() || 'text';
    });
    const optionInputs = inputs.filter((input) => ['radio', 'checkbox'].includes(clean(input.getAttribute('type')).toLowerCase()) || ['radio', 'checkbox'].includes(clean(input.getAttribute('role')).toLowerCase()));
    const optionTexts = [];
    optionInputs.forEach((input) => {
      let container = input.closest('label') || input.parentElement;
      for (let depth = 0; container && depth < 3; depth += 1) {
        const text = clean(container.innerText || '');
        if (text && !/^Q\s*\d+\b/i.test(text)) {
          optionTexts.push(text);
          return;
        }
        container = container.parentElement;
      }
      const aria = clean(input.getAttribute('aria-label'));
      if (aria) optionTexts.push(aria);
    });
    const uniqueTexts = [];
    optionTexts.forEach((text) => {
      if (text && !uniqueTexts.includes(text)) uniqueTexts.push(text);
    });
    data.push({
      question_id: root.getAttribute('data-id') || root.getAttribute('id') || String(index + 1),
      title: titleMatch ? titleMatch[0] : allText.split(' ').slice(0, 12).join(' '),
      option_texts: uniqueTexts,
      input_types: inputTypes,
      text_inputs: inputs.filter((input) => {
        const tag = input.tagName.toLowerCase();
        const type = clean(input.getAttribute('type')).toLowerCase();
        return tag === 'textarea' || ['text', 'number', 'tel', 'email', ''].includes(type);
      }).length,
      required: /必答|必须|required/i.test(allText),
      provider_type: Array.from(new Set(inputTypes)).join(','),
    });
  });
  return data;
}
"""
    try:
        data = page.evaluate(script)
    except Exception as exc:
        raise CredamoParseError(f"无法读取 Credamo 页面题目结构：{exc}") from exc
    if not isinstance(data, list):
        return []
    questions: List[Dict[str, Any]] = []
    for index, item in enumerate(data, start=1):
        if isinstance(item, dict):
            questions.append(_normalize_question(item, index))
    return questions


def parse_credamo_survey(url: str) -> Tuple[List[Dict[str, Any]], str]:
    driver = None
    try:
        driver, _browser_name = create_playwright_driver(
            headless=True,
            prefer_browsers=["edge", "chrome"],
            persistent_browser=False,
            transient_launch=True,
        )
        driver.get(url, timeout=30000, wait_until="domcontentloaded")
        page = driver.page
        try:
            page.wait_for_load_state("networkidle", timeout=8000)
        except Exception:
            pass
        try:
            page.wait_for_selector("input, textarea, [role='radio'], [role='checkbox']", timeout=15000)
        except Exception as exc:
            logging.info("Credamo 解析等待题目控件超时：%s", exc)
        questions = _extract_questions_from_page(page)
        if not questions:
            raise CredamoParseError("没有识别到 Credamo 题目，请确认链接已开放且无需登录")
        title = _normalize_text(page.title())
        if not title:
            try:
                title = _normalize_text(
                    page.locator("h1, .title, [class*='title'], [class*='Title']").first.text_content(timeout=1000)
                )
            except Exception:
                title = ""
        return questions, title or "Credamo 见数问卷"
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                logging.info("关闭 Credamo 解析浏览器失败", exc_info=True)
