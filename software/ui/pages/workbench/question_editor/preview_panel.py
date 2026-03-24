"""配置向导左侧只读预览面板。"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from PySide6.QtCore import QTimer, Qt, QUrl
from PySide6.QtGui import QDesktopServices
from PySide6.QtWidgets import QSizePolicy, QVBoxLayout, QHBoxLayout, QWidget
from qfluentwidgets import (
    BodyLabel,
    CaptionLabel,
    CardWidget,
    FluentIcon,
    PushButton,
    SubtitleLabel,
)

from .utils import _apply_label_color, _shorten_text

_QTWEBENGINE_IMPORT_ERROR = ""
try:
    from PySide6.QtWebEngineCore import QWebEnginePage
    from PySide6.QtWebEngineWidgets import QWebEngineView

    _QTWEBENGINE_AVAILABLE = True
except Exception as exc:  # pragma: no cover - 仅在缺失模块时走兜底
    QWebEnginePage = object  # type: ignore[assignment]
    QWebEngineView = QWidget  # type: ignore[assignment]
    _QTWEBENGINE_AVAILABLE = False
    _QTWEBENGINE_IMPORT_ERROR = f"{type(exc).__name__}: {exc}"


_PREVIEW_SYNC_SCRIPT = r"""
(() => {
    const ctx = __CTX__;
    const visible = (el) => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        if (!style) return false;
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    const forceShow = (el) => {
        if (!el) return;
        try {
            el.hidden = false;
            el.removeAttribute('hidden');
            el.style.setProperty('display', 'block', 'important');
            el.style.setProperty('visibility', 'visible', 'important');
            el.style.setProperty('opacity', '1', 'important');
        } catch (e) {}
    };

    const unhideChain = (el) => {
        let current = el;
        let guard = 0;
        while (current && guard < 10) {
            try {
                current.hidden = false;
                current.removeAttribute('hidden');
                const style = window.getComputedStyle(current);
                if (style && style.display === 'none') {
                    current.style.setProperty('display', 'block', 'important');
                }
                if (style && style.visibility === 'hidden') {
                    current.style.setProperty('visibility', 'visible', 'important');
                }
                if (style && style.opacity === '0') {
                    current.style.setProperty('opacity', '1', 'important');
                }
            } catch (e) {}
            current = current.parentElement;
            guard += 1;
        }
    };

    const ensurePreviewStyle = () => {
        const styleId = 'codex-wizard-preview-style';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            input, textarea, select, button, [role="button"], a[href], label[for],
            .ui-controlgroup, .ui-radio, .ui-checkbox, .option, .question-option,
            #submit_button, #divSubmit, #divNext, #ctlNext, #btnNext, .page-control {
                pointer-events: none !important;
                -webkit-user-select: none !important;
                user-select: none !important;
            }
            #submit_button, #divSubmit, #divNext, #ctlNext, #btnNext, .page-control {
                opacity: 0.45 !important;
            }
            .codex-wizard-preview-highlight {
                outline: 3px solid rgba(37, 99, 235, 0.95) !important;
                box-shadow: 0 0 0 9999px rgba(37, 99, 235, 0.06) !important;
                border-radius: 12px !important;
                scroll-margin-top: 48px !important;
                transition: outline-color 120ms ease-out;
            }
        `;
        document.head.appendChild(style);
    };

    const blockSubmit = () => {
        if (window.__codexWizardPreviewSubmitBlocked) return;
        window.__codexWizardPreviewSubmitBlocked = true;
        window.addEventListener('submit', (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
        document.addEventListener('click', (event) => {
            const target = event.target && event.target.closest
                ? event.target.closest('#submit_button, #divSubmit, button[type="submit"], input[type="submit"]')
                : null;
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }, true);
    };

    const dismissResumeDialog = () => {
        const cancelCandidates = [
            'a.layui-layer-btn1',
            '.layui-layer-btn a',
            '[role="listitem"] .t-popup__close',
        ];
        for (const selector of cancelCandidates) {
            const node = document.querySelector(selector);
            if (!node) continue;
            const text = String(node.innerText || node.textContent || '').trim();
            if (!text || text.includes('取消') || text.includes('关闭')) {
                try { node.click(); } catch (e) {}
                break;
            }
        }
    };

    const ensureStartGate = () => {
        const labels = new Set(['开始作答', '开始答题', '开始填写']);
        const candidates = Array.from(document.querySelectorAll('a, button, div, span'));
        for (const node of candidates) {
            if (!visible(node)) continue;
            const text = String(node.innerText || node.textContent || '').replace(/\s+/g, '');
            if (!labels.has(text)) continue;
            try { node.click(); } catch (e) {}
            break;
        }
    };

    const clearHighlight = () => {
        document.querySelectorAll('.codex-wizard-preview-highlight').forEach((node) => {
            try { node.classList.remove('codex-wizard-preview-highlight'); } catch (e) {}
        });
    };

    const findByQuestionNumber = (questionNum, scope) => {
        if (!questionNum || questionNum <= 0) return null;
        const root = scope || document;
        const candidates = [];
        candidates.push(...Array.from(root.querySelectorAll(`[topic="${questionNum}"]`)));
        candidates.push(...Array.from(root.querySelectorAll(`#div${questionNum}`)));
        for (const node of candidates) {
            if (!node) continue;
            unhideChain(node);
            return node;
        }
        return null;
    };

    const findQQQuestion = (questionId) => {
        if (!questionId) return null;
        const sections = Array.from(document.querySelectorAll('section.question[data-question-id]'));
        for (const section of sections) {
            if (String(section.getAttribute('data-question-id') || '') !== questionId) continue;
            unhideChain(section);
            return section;
        }
        return null;
    };

    const revealWjxPage = (pageNumber) => {
        const fieldsets = Array.from(document.querySelectorAll('#divQuestion fieldset[id^="fieldset"]'));
        if (!fieldsets.length) return false;
        const targetPage = Math.max(1, parseInt(pageNumber || 1, 10) || 1);
        fieldsets.forEach((fieldset, index) => {
            const active = index + 1 === targetPage;
            try {
                fieldset.hidden = false;
                fieldset.removeAttribute('hidden');
                fieldset.style.setProperty('display', active ? 'block' : 'none', 'important');
                fieldset.style.setProperty('visibility', 'visible', 'important');
                fieldset.style.setProperty('opacity', '1', 'important');
            } catch (e) {}
        });
        return true;
    };

    const revealQQPage = (questionIds) => {
        const wantedIds = new Set((Array.isArray(questionIds) ? questionIds : []).map((item) => String(item || '')).filter(Boolean));
        const sections = Array.from(document.querySelectorAll('section.question[data-question-id]'));
        if (!sections.length) return false;
        sections.forEach((section) => {
            const currentId = String(section.getAttribute('data-question-id') || '');
            const active = !wantedIds.size || wantedIds.has(currentId);
            try {
                section.hidden = false;
                section.removeAttribute('hidden');
                section.style.setProperty('display', active ? 'block' : 'none', 'important');
                section.style.setProperty('visibility', 'visible', 'important');
                section.style.setProperty('opacity', '1', 'important');
            } catch (e) {}
            if (active) unhideChain(section);
        });
        return true;
    };

    ensurePreviewStyle();
    blockSubmit();
    dismissResumeDialog();
    ensureStartGate();
    clearHighlight();

    const provider = String(ctx.provider || '').trim().toLowerCase();
    const questionNum = Number.parseInt(ctx.questionNum || 0, 10) || 0;
    const pageNumber = Number.parseInt(ctx.page || 1, 10) || 1;
    const providerQuestionId = String(ctx.providerQuestionId || '').trim();
    const pageQuestionIds = Array.isArray(ctx.pageQuestionIds) ? ctx.pageQuestionIds : [];

    let target = null;
    let pageApplied = false;

    if (provider === 'qq') {
        pageApplied = revealQQPage(pageQuestionIds);
        target = findQQQuestion(providerQuestionId);
    } else {
        pageApplied = revealWjxPage(pageNumber);
        const fieldset = document.querySelector(`#fieldset${pageNumber}`);
        target = findByQuestionNumber(questionNum, fieldset || document);
        if (!target) {
            target = findByQuestionNumber(questionNum, document);
        }
    }

    if (!target && providerQuestionId) {
        target = findQQQuestion(providerQuestionId);
    }
    if (!target && questionNum > 0) {
        target = findByQuestionNumber(questionNum, document);
    }

    if (!target) {
        return {
            ok: false,
            pageApplied: pageApplied,
            provider: provider,
            page: pageNumber,
            questionNum: questionNum,
            providerQuestionId: providerQuestionId,
            reason: 'question-not-found',
        };
    }

    unhideChain(target);
    try { target.classList.add('codex-wizard-preview-highlight'); } catch (e) {}
    try { target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' }); } catch (e) {}
    window.scrollBy(0, -32);

    return {
        ok: true,
        pageApplied: pageApplied,
        provider: provider,
        page: pageNumber,
        questionNum: questionNum,
        providerQuestionId: providerQuestionId,
    };
})()
"""


if _QTWEBENGINE_AVAILABLE:
    class SurveyPreviewPage(QWebEnginePage):
        """限制导航行为的只读预览页。"""

        def acceptNavigationRequest(self, url, nav_type, is_main_frame):  # type: ignore[override]
            nav_enum = getattr(QWebEnginePage, "NavigationType", None)
            link_clicked = getattr(nav_enum, "NavigationTypeLinkClicked", None)
            form_submitted = getattr(nav_enum, "NavigationTypeFormSubmitted", None)
            if nav_type == form_submitted:
                return False
            if nav_type == link_clicked and is_main_frame:
                QDesktopServices.openUrl(url)
                return False
            return super().acceptNavigationRequest(url, nav_type, is_main_frame)


class SurveyPreviewPanel(QWidget):
    """向导左侧网页预览面板。"""

    def __init__(
        self,
        survey_url: str,
        survey_provider: str,
        questions_info: Optional[List[Dict[str, Any]]] = None,
        parent=None,
    ):
        super().__init__(parent)
        self._survey_url = str(survey_url or "").strip()
        self._survey_provider = str(survey_provider or "wjx").strip().lower() or "wjx"
        self._questions_info = list(questions_info or [])
        self._is_page_ready = False
        self._pending_payload: Optional[Dict[str, Any]] = None
        self._sync_token = 0
        self._sync_retry_delays_ms = (120, 320, 750, 1300)

        self._build_ui()
        self._sync_external_button_state()
        self._load_initial_url()

    def _build_ui(self) -> None:
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self.preview_card = CardWidget(self)
        self.preview_card.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        card_layout = QVBoxLayout(self.preview_card)
        card_layout.setContentsMargins(18, 16, 18, 16)
        card_layout.setSpacing(10)

        header = QHBoxLayout()
        header.setSpacing(8)
        title = SubtitleLabel("页面预览", self.preview_card)
        header.addWidget(title)
        header.addStretch(1)

        self.reload_btn = PushButton("刷新", self.preview_card)
        self.reload_btn.setToolTip("重新加载预览")
        self.reload_btn.clicked.connect(self.reload_preview)
        header.addWidget(self.reload_btn)

        self.open_external_btn = PushButton("外部打开", self.preview_card, FluentIcon.LINK)
        self.open_external_btn.clicked.connect(self.open_in_external_browser)
        header.addWidget(self.open_external_btn)
        card_layout.addLayout(header)

        self.status_label = BodyLabel("预览准备中…", self.preview_card)
        self.status_label.setWordWrap(True)
        self.status_label.setStyleSheet("font-size: 13px;")
        _apply_label_color(self.status_label, "#444444", "#e8e8e8")
        card_layout.addWidget(self.status_label)

        self.detail_label = CaptionLabel("左侧为只读预览，不会真的提交问卷；右侧切题后这里会自动定位。", self.preview_card)
        self.detail_label.setWordWrap(True)
        self.detail_label.setStyleSheet("font-size: 12px;")
        _apply_label_color(self.detail_label, "#666666", "#bfbfbf")
        card_layout.addWidget(self.detail_label)

        self.content_host = QWidget(self.preview_card)
        self.content_host.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.content_layout = QVBoxLayout(self.content_host)
        self.content_layout.setContentsMargins(0, 6, 0, 0)
        self.content_layout.setSpacing(0)
        card_layout.addWidget(self.content_host, 1)

        self._fallback_label = BodyLabel("", self.content_host)
        self._fallback_label.setWordWrap(True)
        self._fallback_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._fallback_label.setStyleSheet("font-size: 13px; padding: 32px 18px;")
        _apply_label_color(self._fallback_label, "#666666", "#c8c8c8")
        self.content_layout.addWidget(self._fallback_label, 1)
        self._fallback_label.hide()

        self.web_view: Optional[QWidget] = None
        self.web_page: Optional[Any] = None
        if _QTWEBENGINE_AVAILABLE:
            web_view = QWebEngineView(self.content_host)
            web_view.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
            web_page = SurveyPreviewPage(web_view)
            web_view.setPage(web_page)
            web_view.loadStarted.connect(self._on_load_started)
            web_view.loadProgress.connect(self._on_load_progress)
            web_view.loadFinished.connect(self._on_load_finished)
            self.web_view = web_view
            self.web_page = web_page
            self.content_layout.addWidget(web_view, 1)
        else:
            self.web_view = None
            self.web_page = None

        layout.addWidget(self.preview_card)

    def _load_initial_url(self) -> None:
        if not self._survey_url:
            self._show_fallback("当前没有问卷链接，左侧无法加载预览。")
            return
        if not _QTWEBENGINE_AVAILABLE or self.web_view is None:
            reason = f"当前环境缺少 Qt WebEngine，无法在窗口内渲染网页。{_QTWEBENGINE_IMPORT_ERROR}".strip()
            self._show_fallback(reason)
            return
        self._hide_fallback()
        self._is_page_ready = False
        try:
            self.web_view.load(QUrl(self._survey_url))
        except Exception as exc:
            self._show_fallback(f"预览加载失败：{exc}")

    def _show_fallback(self, message: str) -> None:
        self._is_page_ready = False
        text = str(message or "").strip() or "预览暂不可用"
        self.status_label.setText("预览暂不可用")
        self.detail_label.setText(_shorten_text(text, 240))
        self._fallback_label.setText(text)
        if self.web_view is not None:
            self.web_view.hide()
        self._fallback_label.show()
        self._sync_external_button_state()

    def _hide_fallback(self) -> None:
        self._fallback_label.hide()
        if self.web_view is not None:
            self.web_view.show()

    def _sync_external_button_state(self) -> None:
        self.open_external_btn.setEnabled(bool(self._survey_url))
        self.reload_btn.setEnabled(bool(self._survey_url) and _QTWEBENGINE_AVAILABLE)

    def reload_preview(self) -> None:
        if self.web_view is None or not _QTWEBENGINE_AVAILABLE:
            self._load_initial_url()
            return
        self._is_page_ready = False
        self.status_label.setText("正在重新加载预览…")
        try:
            self.web_view.reload()
        except Exception as exc:
            self._show_fallback(f"重新加载失败：{exc}")

    def open_in_external_browser(self) -> None:
        if not self._survey_url:
            return
        QDesktopServices.openUrl(QUrl(self._survey_url))

    def sync_to_question(self, question_index: int, question_info: Optional[Dict[str, Any]]) -> None:
        payload = self._build_sync_payload(question_index, question_info)
        self._pending_payload = payload
        self._sync_token += 1
        self._apply_preview_sync(self._sync_token, retry_index=0)

    def _build_sync_payload(self, question_index: int, question_info: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        info = dict(question_info or {})
        try:
            page_number = max(1, int(info.get("page") or 1))
        except Exception:
            page_number = 1
        page_question_ids: List[str] = []
        page_question_nums: List[int] = []
        for item in self._questions_info:
            if not isinstance(item, dict) or bool(item.get("is_description")):
                continue
            try:
                item_page = max(1, int(item.get("page") or 1))
            except Exception:
                item_page = 1
            if item_page != page_number:
                continue
            provider_question_id = str(item.get("provider_question_id") or "").strip()
            if provider_question_id:
                page_question_ids.append(provider_question_id)
            try:
                question_num = int(item.get("num") or 0)
            except Exception:
                question_num = 0
            if question_num > 0:
                page_question_nums.append(question_num)
        try:
            question_num = int(info.get("num") or question_index + 1)
        except Exception:
            question_num = question_index + 1

        return {
            "provider": str(info.get("provider") or self._survey_provider or "wjx").strip().lower() or "wjx",
            "questionIndex": int(question_index),
            "questionNum": int(max(1, question_num)),
            "providerQuestionId": str(info.get("provider_question_id") or "").strip(),
            "page": int(page_number),
            "pageQuestionIds": page_question_ids,
            "pageQuestionNums": page_question_nums,
            "title": str(info.get("title") or "").strip(),
        }

    def _apply_preview_sync(self, sync_token: int, retry_index: int) -> None:
        if sync_token != self._sync_token:
            return
        if not self._pending_payload:
            return
        if self.web_page is None or self.web_view is None or not _QTWEBENGINE_AVAILABLE:
            return
        if not self._is_page_ready:
            self.status_label.setText("预览载入中，稍后会自动定位当前题…")
            return

        payload = dict(self._pending_payload)
        script = _PREVIEW_SYNC_SCRIPT.replace("__CTX__", json.dumps(payload, ensure_ascii=False))

        def _handle(result: Any) -> None:
            self._handle_sync_result(sync_token, retry_index, payload, result)

        try:
            self.web_page.runJavaScript(script, _handle)
        except Exception as exc:
            self.status_label.setText("题目定位失败")
            self.detail_label.setText(f"预览脚本执行失败：{exc}")

    def _handle_sync_result(
        self,
        sync_token: int,
        retry_index: int,
        payload: Dict[str, Any],
        result: Any,
    ) -> None:
        if sync_token != self._sync_token:
            return

        outcome = result if isinstance(result, dict) else {}
        question_num = int(payload.get("questionNum") or 1)
        page_number = int(payload.get("page") or 1)
        if bool(outcome.get("ok")):
            self.status_label.setText(f"已定位到第 {question_num} 题（第 {page_number} 页）")
            self.detail_label.setText("左侧为只读预览，不会提交问卷；滚动查看没问题，但表单点击已被拦住。")
            return

        if retry_index < len(self._sync_retry_delays_ms):
            delay = self._sync_retry_delays_ms[retry_index]
            self.status_label.setText(f"正在定位第 {question_num} 题（第 {page_number} 页）…")
            self.detail_label.setText("问卷页面还在渲染或切页，继续重试定位。")
            QTimer.singleShot(delay, lambda token=sync_token, step=retry_index + 1: self._apply_preview_sync(token, step))
            return

        self.status_label.setText("预览已加载，但暂未精确定位到当前题")
        reason = str(outcome.get("reason") or "页面结构和解析信息暂时没对上")
        self.detail_label.setText(f"当前保留在对应页附近。未命中原因：{reason}")

    def _on_load_started(self) -> None:
        self._is_page_ready = False
        self.status_label.setText("正在加载问卷预览…")
        self.detail_label.setText("左侧加载的是只读网页，不会真正提交。")

    def _on_load_progress(self, progress: int) -> None:
        safe_progress = max(0, min(100, int(progress or 0)))
        self.status_label.setText(f"正在加载问卷预览… {safe_progress}%")

    def _on_load_finished(self, ok: bool) -> None:
        self._is_page_ready = bool(ok)
        if not ok:
            self._show_fallback("网页预览加载失败。你仍然可以点“外部打开”在系统浏览器里查看问卷。")
            return
        self._hide_fallback()
        self.status_label.setText("预览已加载，正在同步当前题…")
        if self._pending_payload is not None:
            self._sync_token += 1
            self._apply_preview_sync(self._sync_token, retry_index=0)
        else:
            self.detail_label.setText("左侧为只读预览，不会提交问卷；右侧切题后这里会自动定位。")
