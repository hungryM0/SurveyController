"""倾向设置页面：集中展示所有支持潜变量模式的题目，快速批量设置倾向"""
from typing import List, Dict, Any

from PySide6.QtCore import Qt
from PySide6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout
from qfluentwidgets import (
    ScrollArea,
    BodyLabel,
    CardWidget,
    CheckBox,
    ComboBox,
    SegmentedWidget,
)

from wjx.core.questions.config import QuestionEntry
from wjx.ui.pages.workbench.question.psycho_config import (
    PSYCHO_SUPPORTED_TYPES,
    PSYCHO_BIAS_CHOICES,
)
from wjx.ui.pages.workbench.question.utils import _shorten_text, _apply_label_color
from wjx.ui.pages.workbench.question.constants import _get_entry_type_label


class TendencySettingsPage(QWidget):
    """倾向设置页面：集中管理所有题目的潜变量模式配置"""

    def __init__(
        self,
        entries: List[QuestionEntry],
        info: List[Dict[str, Any]],
        psycho_check_map: Dict[int, CheckBox],
        psycho_bias_map: Dict[int, ComboBox],
        parent=None,
    ):
        super().__init__(parent)
        self.entries = entries
        self.info = info
        self.psycho_check_map = psycho_check_map
        self.psycho_bias_map = psycho_bias_map
        self.local_bias_map: Dict[int, ComboBox] = {}
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(16)

        # 批量操作栏
        batch_card = CardWidget(self)
        batch_layout = QHBoxLayout(batch_card)
        batch_layout.setContentsMargins(16, 12, 16, 12)
        batch_layout.setSpacing(12)

        batch_label = BodyLabel("一键设置总体倾向：", batch_card)
        batch_label.setStyleSheet("font-size: 13px; font-weight: 500;")
        batch_layout.addWidget(batch_label)

        self.batch_seg = SegmentedWidget(batch_card)
        for value, text in PSYCHO_BIAS_CHOICES:
            self.batch_seg.addItem(routeKey=value, text=text)
        self.batch_seg.setCurrentItem("center")
        self._prev_batch_key = "center"
        self.batch_seg.currentItemChanged.connect(self._on_batch_bias_changed)
        batch_layout.addWidget(self.batch_seg)

        batch_layout.addStretch(1)
        layout.addWidget(batch_card)

        # 滚动区域
        scroll = ScrollArea(self)
        scroll.setWidgetResizable(True)
        scroll.enableTransparentBackground()
        container = QWidget(self)
        scroll.setWidget(container)
        inner = QVBoxLayout(container)
        inner.setContentsMargins(4, 4, 12, 4)
        inner.setSpacing(8)

        supported_entries = [
            (idx, entry)
            for idx, entry in enumerate(self.entries)
            if entry.question_type in PSYCHO_SUPPORTED_TYPES
        ]

        if not supported_entries:
            empty_label = BodyLabel(
                "当前问卷中没有支持倾向模式的题目\n（支持：单选、量表、评分、下拉、矩阵）",
                container,
            )
            empty_label.setStyleSheet("color: #888; font-size: 14px; padding: 40px;")
            empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            empty_label.setWordWrap(True)
            inner.addWidget(empty_label)
        else:
            for idx, entry in supported_entries:
                self._build_question_row(idx, entry, container, inner)

        inner.addStretch(1)
        layout.addWidget(scroll, 1)

    def _build_question_row(
        self, idx: int, entry: QuestionEntry, container: QWidget, layout: QVBoxLayout
    ):
        # 切到倾向模式时默认全部启用
        entry.psycho_enabled = True

        qnum = ""
        title_text = ""
        if idx < len(self.info):
            qnum = str(self.info[idx].get("num") or "")
            title_text = str(self.info[idx].get("title") or "")

        card = CardWidget(container)
        card_layout = QHBoxLayout(card)
        card_layout.setContentsMargins(12, 8, 12, 8)
        card_layout.setSpacing(12)

        num_label = BodyLabel(f"第{qnum or idx + 1}题", card)
        num_label.setFixedWidth(60)
        num_label.setStyleSheet("font-size: 13px; font-weight: 500;")
        card_layout.addWidget(num_label)

        type_label = BodyLabel(f"[{_get_entry_type_label(entry)}]", card)
        type_label.setFixedWidth(70)
        type_label.setStyleSheet("font-size: 12px;")
        _apply_label_color(type_label, "#0078d4", "#4da6ff")
        card_layout.addWidget(type_label)

        title_label = BodyLabel(_shorten_text(title_text, 50), card)
        title_label.setStyleSheet("font-size: 13px;")
        title_label.setWordWrap(False)
        _apply_label_color(title_label, "#333333", "#e0e0e0")
        card_layout.addWidget(title_label, 1)

        bias_combo = ComboBox(card)
        bias_combo.setFixedWidth(160)
        for value, text in PSYCHO_BIAS_CHOICES:
            bias_combo.addItem(text, userData=value)

        current_bias = getattr(entry, "psycho_bias", "center")
        for i, (value, _) in enumerate(PSYCHO_BIAS_CHOICES):
            if value == current_bias:
                bias_combo.setCurrentIndex(i)
                break

        bias_combo.currentIndexChanged.connect(
            lambda index, i=idx: self._on_bias_changed(i, index)
        )
        card_layout.addWidget(bias_combo)

        layout.addWidget(card)

        self.local_bias_map[idx] = bias_combo
        self.psycho_bias_map[idx] = bias_combo

    def _on_bias_changed(self, idx: int, index: int):
        if 0 <= index < len(PSYCHO_BIAS_CHOICES):
            if idx < len(self.entries):
                self.entries[idx].psycho_bias = PSYCHO_BIAS_CHOICES[index][0]

    def _on_batch_bias_changed(self, route_key: str):
        if not self.local_bias_map:
            return
        for i, (value, _) in enumerate(PSYCHO_BIAS_CHOICES):
            if value == route_key:
                bias_index, bias_value = i, value
                break
        else:
            return
        for idx, combo in self.local_bias_map.items():
            combo.blockSignals(True)
            combo.setCurrentIndex(bias_index)
            combo.blockSignals(False)
            if idx < len(self.entries):
                self.entries[idx].psycho_bias = bias_value
