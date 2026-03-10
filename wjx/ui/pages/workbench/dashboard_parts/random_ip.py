"""DashboardPage 随机 IP 与卡密相关方法。"""
from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any, Optional

from PySide6.QtWidgets import QDialog
from qfluentwidgets import FluentIcon

from wjx.network.proxy.auth import has_authenticated_session
from wjx.network.proxy import (
    _format_status_payload,
    _validate_card,
    get_proxy_minute_by_answer_seconds,
    get_quota_cost_by_minute,
    get_random_ip_counter_snapshot_local,
    get_status,
    on_random_ip_toggle,
    refresh_ip_counter_display,
    show_random_ip_activation_dialog,
)
from wjx.ui.dialogs.card_unlock import CardUnlockDialog
from wjx.ui.dialogs.contact import ContactDialog
from wjx.utils.logging.log_utils import log_suppressed_exception

if TYPE_CHECKING:
    from qfluentwidgets import BodyLabel, CheckBox, PushButton
    from wjx.ui.controller import RunController
    from wjx.ui.pages.workbench.runtime import RuntimePage
    from wjx.ui.widgets.full_width_infobar import FullWidthInfoBar


class DashboardRandomIPMixin:
    """随机 IP、额度提示、卡密与调试重置逻辑。"""

    if TYPE_CHECKING:
        # 以下属性由 DashboardPage 主类提供，此处仅用于 Pylance 类型检查
        card_btn: PushButton
        random_ip_hint: BodyLabel
        random_ip_cb: CheckBox
        controller: RunController
        runtime_page: RuntimePage
        _ip_low_infobar: Optional[FullWidthInfoBar]
        _ip_cost_infobar: Optional[FullWidthInfoBar]
        _ip_low_infobar_dismissed: bool
        _ip_low_threshold: int
        _api_balance_cache: Optional[float]
        _ip_balance_fetch_lock: threading.Lock
        _ip_balance_fetching: bool
        _last_ip_balance_fetch_ts: float
        _ip_balance_fetch_interval_sec: float
        _ipBalanceChecked: Any   # 同上

        def _toast(self, text: str, level: str = "info", duration: int = 2000, show_progress: bool = False) -> Any: ...
        def window(self) -> Any: ...  # 继承自 QWidget，此处仅供类型检查

    def _set_runtime_ip_switch(self, enabled: bool) -> None:
        """设置运行时页面的随机IP开关，并同步展开区域的启用状态（绕过信号阻塞）。"""
        try:
            self.runtime_page.random_ip_switch.blockSignals(True)
            self.runtime_page.random_ip_switch.setChecked(enabled)
            self.runtime_page.random_ip_switch.blockSignals(False)
            self.runtime_page.random_ip_card._sync_ip_enabled(enabled)
        except Exception as exc:
            log_suppressed_exception("_set_runtime_ip_switch", exc, level=logging.WARNING)

    def update_random_ip_counter(self, count: int, limit: int, custom_api: bool):
        authenticated = has_authenticated_session()
        remaining = max(0, int(limit or 0) - int(count or 0))
        if authenticated:
            self.card_btn.setEnabled(True)
            self.card_btn.setText("重新激活")
            self.card_btn.setIcon(FluentIcon.SYNC)
            self.card_btn.setToolTip("重新核销卡密可刷新当前设备的随机IP登录状态")
        else:
            self.card_btn.setEnabled(True)
            self.card_btn.setText("领取试用/激活")
            self.card_btn.setIcon(FluentIcon.FINGERPRINT)
            self.card_btn.setToolTip("可先领取一次免费试用，领过后再使用卡密激活")

        if custom_api:
            self.random_ip_hint.setText("自定义接口")
            self.random_ip_hint.setStyleSheet("color:#ff8c00;")
            self._update_ip_low_infobar(count, limit, custom_api)
            self._update_ip_cost_infobar(custom_api)
            return
        if not authenticated:
            self.random_ip_hint.setText("未激活")
            self.random_ip_hint.setStyleSheet("color:#6b6b6b;")
            self._update_ip_low_infobar(count, limit, custom_api)
            self._update_ip_cost_infobar(custom_api)
            if self.random_ip_cb.isChecked():
                self.random_ip_cb.blockSignals(True)
                self.random_ip_cb.setChecked(False)
                self.random_ip_cb.blockSignals(False)
            return
        self.random_ip_hint.setText(f"剩余 {remaining}/{limit}")
        if remaining <= 0:
            self.random_ip_hint.setStyleSheet("color:red;")
        else:
            self.random_ip_hint.setStyleSheet("color:#6b6b6b;")
        self._update_ip_low_infobar(count, limit, custom_api)
        self._update_ip_cost_infobar(custom_api)
        if remaining <= 0 and self.random_ip_cb.isChecked():
            self.random_ip_cb.blockSignals(True)
            self.random_ip_cb.setChecked(False)
            self.random_ip_cb.blockSignals(False)
            self._set_runtime_ip_switch(False)

    @staticmethod
    def _format_duration_text(seconds: int) -> str:
        total = max(0, int(seconds))
        mins = total // 60
        secs = total % 60
        return f"{mins}分{secs}秒"

    def _refresh_ip_cost_infobar(self) -> None:
        """根据当前配置刷新随机IP成本提示条。"""
        try:
            _, _, custom_api = get_random_ip_counter_snapshot_local()
        except Exception:
            custom_api = False
        self._update_ip_cost_infobar(bool(custom_api))

    def _update_ip_cost_infobar(self, custom_api: bool) -> None:
        if not self._ip_cost_infobar:
            return
        if custom_api:
            self._ip_cost_infobar.hide()
            return

        try:
            timed_enabled = bool(self.runtime_page.timed_switch.isChecked())
        except Exception:
            timed_enabled = False
        if timed_enabled:
            self._ip_cost_infobar.hide()
            return

        try:
            answer_seconds = int(self.runtime_page.answer_card.getValue())
        except Exception:
            answer_seconds = 0

        minute = int(get_proxy_minute_by_answer_seconds(answer_seconds))
        if minute <= 1:
            self._ip_cost_infobar.hide()
            return

        quota_cost = int(get_quota_cost_by_minute(minute))
        content = (
            f"当前作答时长约 {self._format_duration_text(answer_seconds)}，成本较高，"
            f"将按 {quota_cost} 倍消耗速率扣减随机IP额度。"
        )
        try:
            # InfoBar 初始化时 title/content 都是空，会把对应 QLabel 设为隐藏。
            # 这里动态更新文本时，必须同步恢复标签可见性。
            self._ip_cost_infobar.title = content
            self._ip_cost_infobar.content = ""
            if hasattr(self._ip_cost_infobar, "titleLabel"):
                self._ip_cost_infobar.titleLabel.setVisible(True)
            if hasattr(self._ip_cost_infobar, "contentLabel"):
                self._ip_cost_infobar.contentLabel.setVisible(False)
            if hasattr(self._ip_cost_infobar, "_adjustText"):
                self._ip_cost_infobar._adjustText()
            self._ip_cost_infobar.show()
        except Exception as exc:
            log_suppressed_exception("_update_ip_cost_infobar", exc, level=logging.WARNING)

    def _on_random_ip_toggled(self, state: int):
        enabled = state != 0
        try:
            self.controller.adapter.random_ip_enabled_var.set(bool(enabled))
            on_random_ip_toggle(self.controller.adapter)
            enabled = bool(self.controller.adapter.random_ip_enabled_var.get())
        except Exception:
            enabled = bool(enabled)
        self.random_ip_cb.blockSignals(True)
        self.random_ip_cb.setChecked(enabled)
        self.random_ip_cb.blockSignals(False)
        self._set_runtime_ip_switch(enabled)
        refresh_ip_counter_display(self.controller.adapter)

    def _ask_card_code(self) -> Optional[str]:
        """向主窗口请求卡密输入，兜底弹出输入框。"""
        win = self.window()
        if hasattr(win, "_ask_card_code"):
            try:
                return win._ask_card_code()  # type: ignore[union-attr]
            except Exception as exc:
                log_suppressed_exception("_ask_card_code: main window passthrough", exc, level=logging.WARNING)
        dialog = CardUnlockDialog(
            self,
            status_fetcher=get_status,
            status_formatter=_format_status_payload,
            contact_handler=lambda: self._open_contact_dialog(default_type="卡密获取"),
        )
        if dialog.exec() == QDialog.DialogCode.Accepted:
            return dialog.get_card_code()
        return None

    def _open_contact_dialog(self, default_type: str = "报错反馈"):
        """打开联系对话框"""
        win = self.window()
        if hasattr(win, "_open_contact_dialog"):
            try:
                return win._open_contact_dialog(default_type)  # type: ignore[union-attr]
            except Exception as exc:
                log_suppressed_exception("_open_contact_dialog passthrough", exc, level=logging.WARNING)
        dlg = ContactDialog(self, default_type=default_type, status_fetcher=get_status, status_formatter=_format_status_payload)
        dlg.exec()

    def _on_card_code_clicked(self):
        """用户主动输入卡密解锁大额随机IP。"""
        if has_authenticated_session():
            dialog = CardUnlockDialog(
                self,
                status_fetcher=get_status,
                status_formatter=_format_status_payload,
                contact_handler=lambda: self._open_contact_dialog(default_type="卡密获取"),
                card_validator=_validate_card,
            )
            if dialog.exec() != QDialog.DialogCode.Accepted:
                return
            activated = bool(dialog.get_validation_result())
        else:
            activated = bool(show_random_ip_activation_dialog(self.controller.adapter))
        if activated:
            refresh_ip_counter_display(self.controller.adapter)
            self.random_ip_cb.setChecked(True)
            self._set_runtime_ip_switch(True)

    def _on_ip_low_infobar_closed(self):
        self._ip_low_infobar_dismissed = True
        if self._ip_low_infobar:
            self._ip_low_infobar.hide()

    def _update_ip_low_infobar(self, count: int, limit: int, custom_api: bool):
        """更新随机IP余额不足提示条。"""
        if not self._ip_low_infobar:
            return
        if custom_api:
            self._ip_low_infobar.hide()
            self._ip_low_infobar_dismissed = False
            return
        if not has_authenticated_session():
            self._ip_low_infobar.hide()
            self._ip_low_infobar_dismissed = False
            return
        remaining = max(0, int(limit or 0) - int(count or 0))
        threshold = max(5, min(50, int(limit or 0) // 5 if int(limit or 0) > 0 else 5))
        self._ip_low_threshold = threshold
        self._on_ip_balance_checked(remaining if remaining <= threshold else threshold + 1)

    def _on_ip_balance_checked(self, remaining_ip: int):
        """处理IP余额检查结果（在主线程中执行）"""
        if not self._ip_low_infobar:
            return
        threshold = max(5, min(50, int(getattr(self, "_ip_low_threshold", 20) or 20)))
        if remaining_ip < threshold:
            if not self._ip_low_infobar_dismissed:
                self._ip_low_infobar.show()
        else:
            self._ip_low_infobar.hide()
            self._ip_low_infobar_dismissed = False
