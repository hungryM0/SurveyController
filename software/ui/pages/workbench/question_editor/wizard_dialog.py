"""配置向导弹窗：用滑块快速设置权重/概率，编辑填空题答案。"""
import copy
from typing import List, Dict, Any, Optional, Union, cast

from PySide6.QtCore import Qt, QPropertyAnimation, QEasingCurve, QPointF, QTimer, QSize, Signal
from PySide6.QtGui import QColor, QPainter
from PySide6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QDialog,
    QButtonGroup,
    QFrame,
)
from qfluentwidgets import (
    ScrollArea,
    SubtitleLabel,
    BodyLabel,
    CardWidget,
    PushButton,
    PrimaryPushButton,
    LineEdit,
    CheckBox,
    SegmentedWidget,
)

from software.ui.widgets.no_wheel import NoWheelSlider
from software.core.questions.config import QuestionEntry
from software.app.config import DEFAULT_FILL_TEXT

from .constants import _get_entry_type_label
from .utils import _shorten_text, _apply_label_color, _bind_slider_input
from .wizard_sections import WizardSectionsMixin, _TEXT_RANDOM_NONE, _get_segmented_route_key
from .psycho_config import BIAS_PRESET_CHOICES


# ---------------------------------------------------------------------------
# QuestionWizardDialog — 主对话框
# ---------------------------------------------------------------------------


class QuestionDotNavigator(QWidget):
    """自绘题目导航点阵：整条都能点，不再依赖 PipsPager 的命中逻辑。"""

    currentIndexChanged = Signal(int)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._page_count = 0
        self._current_index = 0
        self._spacing = 10
        self._visible_number = 0
        self._dot_size = 8
        self._selected_dot_size = 12
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    def count(self) -> int:
        return self._page_count

    def currentIndex(self) -> int:
        return self._current_index

    def setCurrentIndex(self, index: int) -> None:
        if self._page_count <= 0:
            return
        clamped = max(0, min(int(index), self._page_count - 1))
        if clamped == self._current_index:
            return
        self._current_index = clamped
        self.update()
        self.currentIndexChanged.emit(clamped)

    def setPageNumber(self, count: int) -> None:
        self._page_count = max(0, int(count))
        if self._page_count <= 0:
            self._current_index = 0
        else:
            self._current_index = max(0, min(self._current_index, self._page_count - 1))
        self.update()

    def setVisibleNumber(self, count: int) -> None:
        self._visible_number = max(0, int(count))

    def visibleNumber(self) -> int:
        return self._visible_number

    def setSpacing(self, spacing: int) -> None:
        self._spacing = max(0, int(spacing))
        self.update()

    def spacing(self) -> int:
        return self._spacing

    def sizeHint(self) -> QSize:
        return QSize(18, 200)

    def minimumSizeHint(self) -> QSize:
        return QSize(18, 120)

    def paintEvent(self, event) -> None:
        if self._page_count <= 0:
            return
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setPen(Qt.PenStyle.NoPen)

        center_x = self.width() / 2
        for idx, center_y in enumerate(self._dot_positions()):
            selected = idx == self._current_index
            radius = self._selected_dot_size / 2 if selected else self._dot_size / 2
            color = QColor(92, 184, 255, 255) if selected else QColor(255, 255, 255, 165)
            painter.setBrush(color)
            painter.drawEllipse(QPointF(center_x, center_y), radius, radius)

    def mousePressEvent(self, event) -> None:
        super().mousePressEvent(event)
        target_index = self._index_from_y(event.position().y())
        if target_index is not None:
            self.setCurrentIndex(target_index)

    def _dot_positions(self) -> List[float]:
        if self._page_count <= 0:
            return []
        max_dot_diameter = self._selected_dot_size
        if self._page_count <= 1:
            step = 0
        else:
            available_span = max(max_dot_diameter, self.height() - max_dot_diameter)
            preferred_step = max_dot_diameter + self._spacing
            max_step = available_span / float(self._page_count - 1)
            step = min(preferred_step, max_step)
        top = self._selected_dot_size / 2
        return [top + idx * step for idx in range(self._page_count)]

    def _index_from_y(self, y: float) -> Optional[int]:
        positions = self._dot_positions()
        if not positions:
            return None
        nearest_index = 0
        nearest_distance = None
        for idx, center_y in enumerate(positions):
            distance = abs(float(y) - center_y)
            if nearest_distance is None or distance < nearest_distance:
                nearest_distance = distance
                nearest_index = idx
        return nearest_index


class FloatingPagerShell(QWidget):
    """透明外壳：只负责把分页器摆在左侧空白带中间。"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.pager = QuestionDotNavigator(self)

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self.pager.setGeometry(0, 0, self.width(), self.height())


class QuestionWizardDialog(WizardSectionsMixin, QDialog):
    """配置向导：用滑块快速设置权重/概率，编辑填空题答案。"""

    TextEditsValue = Union[List[LineEdit], List[List[LineEdit]]]

    def _resolve_matrix_weights(self, entry: QuestionEntry, rows: int, columns: int) -> List[List[float]]:
        """解析矩阵题的配比配置，返回按行的默认权重。"""
        def _clean_row(raw_row: Any) -> Optional[List[float]]:
            if not isinstance(raw_row, (list, tuple)):
                return None
            cleaned: List[float] = []
            for value in raw_row:
                try:
                    cleaned.append(max(0.0, float(value)))
                except Exception:
                    cleaned.append(0.0)
            if not cleaned:
                return None
            if len(cleaned) < columns:
                cleaned = cleaned + [1.0] * (columns - len(cleaned))
            elif len(cleaned) > columns:
                cleaned = cleaned[:columns]
            if all(v <= 0 for v in cleaned):
                cleaned = [1.0] * columns
            return cleaned

        raw = entry.custom_weights if entry.custom_weights else entry.probabilities
        if isinstance(raw, list) and any(isinstance(item, (list, tuple)) for item in raw):
            per_row: List[List[float]] = []
            last_row = None
            for idx in range(rows):
                row_raw = raw[idx] if idx < len(raw) else last_row
                row_values = _clean_row(row_raw)
                if row_values is None:
                    row_values = [1.0] * columns
                per_row.append(row_values)
                if row_raw is not None:
                    last_row = row_raw
            return per_row
        if isinstance(raw, list):
            uniform = _clean_row(raw)
            if uniform is None:
                uniform = [1.0] * columns
            return [list(uniform) for _ in range(rows)]
        return [[1.0] * columns for _ in range(rows)]

    @staticmethod
    def _to_float(value: Any, default: float) -> float:
        try:
            return float(value)
        except Exception:
            return float(default)

    def _resolve_slider_bounds(self, idx: int, entry: QuestionEntry) -> tuple[int, int]:
        min_val = 0.0
        max_val = 10.0

        if idx < len(self.info):
            question_info = self.info[idx] or {}
            min_val = self._to_float(question_info.get("slider_min"), min_val)
            raw_max = question_info.get("slider_max")
            max_val = self._to_float(raw_max, 100.0 if raw_max is None else max_val)

        if max_val <= min_val:
            max_val = min_val + 100.0

        if isinstance(entry.custom_weights, (list, tuple)) and entry.custom_weights:
            current = self._to_float(entry.custom_weights[0], min_val)
            max_val = max(max_val, current)

        min_int = int(round(min_val))
        max_int = int(round(max_val))
        if max_int <= min_int:
            max_int = min_int + 1
        return (min_int, max_int)

    def __init__(
        self,
        entries: List[QuestionEntry],
        info: List[Dict[str, Any]],
        survey_title: Optional[str] = None,
        parent=None,
        reliability_mode_enabled: bool = True,
    ):
        super().__init__(parent)
        window_title = "配置向导"
        if survey_title:
            window_title = f"{window_title} - {_shorten_text(survey_title, 36)}"
        self.setWindowTitle(window_title)
        self.resize(900, 800)
        self.entries = entries
        self.info = info or []
        self.reliability_mode_enabled = reliability_mode_enabled
        self.slider_map: Dict[int, List[NoWheelSlider]] = {}
        self.matrix_row_slider_map: Dict[int, List[List[NoWheelSlider]]] = {}
        self.text_edit_map: Dict[int, QuestionWizardDialog.TextEditsValue] = {}
        self.ai_check_map: Dict[int, CheckBox] = {}
        self.text_container_map: Dict[int, QWidget] = {}
        self.text_add_btn_map: Dict[int, PushButton] = {}
        self.text_random_mode_map: Dict[int, str] = {}
        self.text_random_name_check_map: Dict[int, CheckBox] = {}
        self.text_random_mobile_check_map: Dict[int, CheckBox] = {}
        self.text_random_group_map: Dict[int, QButtonGroup] = {}
        self.bias_preset_map: Dict[int, Any] = {}
        self.attached_select_slider_map: Dict[int, List[Dict[str, Any]]] = {}
        self._entry_snapshots: List[QuestionEntry] = [copy.deepcopy(entry) for entry in entries]
        self._has_content = False
        self._current_question_idx = 0
        self._question_cards: List[CardWidget] = []
        self._scroll_area: Optional[ScrollArea] = None
        self._content_container: Optional[QWidget] = None
        self._content_layout: Optional[QVBoxLayout] = None
        self._question_shell: Optional[FloatingPagerShell] = None
        self._question_pager: Optional[QuestionDotNavigator] = None
        self._navigation_item_count = 0
        self._scroll_animation: Optional[QPropertyAnimation] = None
        self._is_animating_scroll = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(16)

        intro = BodyLabel("配置各题目的选项权重/概率或填空答案", self)
        intro.setStyleSheet("font-size: 13px;")
        _apply_label_color(intro, "#666666", "#bfbfbf")
        layout.addWidget(intro)

        scroll = ScrollArea(self)
        scroll.setWidgetResizable(True)
        scroll.enableTransparentBackground()
        self._scroll_area = scroll
        container = QWidget(self)
        scroll.setWidget(container)
        self._content_container = container
        inner = QVBoxLayout(container)
        inner.setContentsMargins(4, 4, 12, 4)
        inner.setSpacing(20)
        self._content_layout = inner
        layout.addWidget(scroll, 1)

        # 批量倾向预设（在滚动区内最顶部）
        master_row = QHBoxLayout()
        master_row.setSpacing(8)
        master_lbl = BodyLabel("批量倾向预设：", container)
        master_lbl.setStyleSheet("font-size: 13px;")
        _apply_label_color(master_lbl, "#444444", "#e0e0e0")
        master_row.addWidget(master_lbl)
        _master_seg = SegmentedWidget(container)
        for _v, _t in BIAS_PRESET_CHOICES:
            _master_seg.addItem(routeKey=_v, text=_t)
        _master_seg.setCurrentItem("custom")
        master_row.addWidget(_master_seg)
        master_row.addStretch(1)
        inner.addLayout(master_row)

        for idx, entry in enumerate(self.entries):
            self._question_cards.append(self._build_entry_card(idx, entry, container, inner))

        self._master_applying = False

        def _on_master_preset(route_key: str):
            if route_key == "custom":
                return
            self._master_applying = True
            for seg in self.bias_preset_map.values():
                if isinstance(seg, list):
                    for s in seg:
                        s.setCurrentItem(route_key)
                else:
                    seg.setCurrentItem(route_key)
            self._master_applying = False
        _master_seg.currentItemChanged.connect(_on_master_preset)

        def _reset_master(_=None):
            if self._master_applying:
                return
            if _get_segmented_route_key(_master_seg) != "custom":
                _master_seg.setCurrentItem("custom")
        for seg in self.bias_preset_map.values():
            if isinstance(seg, list):
                for s in seg:
                    s.currentItemChanged.connect(_reset_master)
            else:
                seg.currentItemChanged.connect(_reset_master)

        if not self._has_content:
            empty_label = BodyLabel("当前无题目需要配置", container)
            empty_label.setStyleSheet("color: #888; font-size: 14px; padding: 40px;")
            empty_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            inner.addWidget(empty_label)

        inner.addStretch(1)
        self._question_shell = self._build_navigation_shell(self)
        self._question_pager = self._question_shell.pager
        self._configure_navigation_pager(len(self._question_cards))
        self._refresh_navigation_state(len(self._question_cards))
        self._navigate_to_question(0, animate=False)
        scroll.verticalScrollBar().valueChanged.connect(self._on_scroll_value_changed)
        QTimer.singleShot(0, self._update_navigation_pager_geometry)

        # 底部按钮
        btn_row = QHBoxLayout()
        btn_row.setSpacing(12)
        btn_row.addStretch(1)
        cancel_btn = PushButton("取消", self)
        cancel_btn.setFixedWidth(80)
        ok_btn = PrimaryPushButton("保存", self)
        ok_btn.setFixedWidth(80)
        btn_row.addWidget(cancel_btn)
        btn_row.addWidget(ok_btn)
        layout.addLayout(btn_row)

        ok_btn.clicked.connect(self.accept)
        cancel_btn.clicked.connect(self.reject)

    def _build_navigation_shell(self, parent: QWidget) -> FloatingPagerShell:
        shell = FloatingPagerShell(parent)
        shell.pager.currentIndexChanged.connect(self._on_question_pager_changed)
        shell.raise_()
        return shell

    def _configure_navigation_pager(self, total: int) -> None:
        if self._question_pager is None:
            return
        normalized_total = max(1, int(total))
        if self._navigation_item_count == normalized_total:
            return
        self._navigation_item_count = normalized_total
        self._question_pager.blockSignals(True)
        self._question_pager.setPageNumber(normalized_total)
        self._question_pager.setVisibleNumber(normalized_total)
        self._question_pager.blockSignals(False)

    def _update_navigation_pager_geometry(self) -> None:
        if self._question_shell is None or self._scroll_area is None:
            return
        scroll_geo = self._scroll_area.geometry()
        content_left = scroll_geo.left() + 4
        if self._question_cards:
            first_card_pos = self._question_cards[0].mapTo(self, self._question_cards[0].rect().topLeft())
            content_left = max(content_left, first_card_pos.x())
        if self._question_pager is not None:
            total = max(1, len(self._question_cards))
            preferred_spacing = 12
            if total >= 12:
                preferred_spacing = 10
            if total >= 18:
                preferred_spacing = 8
            if total >= 26:
                preferred_spacing = 6
            if total >= 36:
                preferred_spacing = 4
            available_height = max(120, scroll_geo.height() - 96)
            max_spacing = 0
            if total > 1:
                max_spacing = max(0, (available_height - 30 - total * 12) // (total - 1))
            spacing = min(preferred_spacing, max_spacing)
            self._question_pager.setSpacing(spacing)
            shell_height = min(available_height, max(120, 30 + total * 12 + max(0, total - 1) * spacing))
        else:
            shell_height = max(120, min(scroll_geo.height() - 96, 160))
        shell_width = 24
        x = max(0, (content_left - shell_width) // 2)
        y = scroll_geo.top() + max(12, (scroll_geo.height() - shell_height) // 2)
        self._question_shell.setGeometry(x, y, shell_width, shell_height)
        self._question_shell.raise_()

    def _on_question_pager_changed(self, question_idx: int) -> None:
        self._navigate_to_question(question_idx, animate=True)

    def _navigate_to_question(self, question_idx: int, animate: bool) -> None:
        total = len(self._question_cards)
        if total <= 0:
            self._current_question_idx = 0
            self._refresh_navigation_state(0)
            self._scroll_to_question(None, animate=False)
            return

        clamped = max(0, min(question_idx, total - 1))
        self._current_question_idx = clamped
        self._refresh_navigation_state(total)
        self._scroll_to_question(clamped, animate=animate)

    def _refresh_navigation_state(self, total: int) -> None:
        if self._question_pager is not None:
            self._question_pager.blockSignals(True)
            current = max(0, min(self._current_question_idx, max(total - 1, 0)))
            if self._question_pager.currentIndex() != current:
                self._question_pager.setCurrentIndex(current)
            self._question_pager.setEnabled(total > 1)
            self._question_pager.blockSignals(False)

    def _scroll_to_question(self, question_idx: Optional[int], animate: bool) -> None:
        if self._scroll_area is None or self._content_layout is None or self._content_container is None:
            return
        scroll_bar = self._scroll_area.verticalScrollBar()
        if question_idx is None or not (0 <= question_idx < len(self._question_cards)):
            scroll_bar.setValue(0)
            return
        card = self._question_cards[question_idx]
        target_value = max(0, min(card.y() - 12, scroll_bar.maximum()))
        if not animate:
            self._stop_scroll_animation()
            scroll_bar.setValue(target_value)
            return
        self._animate_scroll_to(target_value)

    def _animate_scroll_to(self, target_value: int) -> None:
        if self._scroll_area is None:
            return
        scroll_bar = self._scroll_area.verticalScrollBar()
        start_value = scroll_bar.value()
        if abs(target_value - start_value) <= 1:
            scroll_bar.setValue(target_value)
            return

        self._stop_scroll_animation()
        curve = QEasingCurve(QEasingCurve.Type.BezierSpline)
        curve.addCubicBezierSegment(QPointF(0.215, 0.61), QPointF(0.355, 1.0), QPointF(1.0, 1.0))

        self._scroll_animation = QPropertyAnimation(scroll_bar, b"value", self)
        self._scroll_animation.setStartValue(start_value)
        self._scroll_animation.setEndValue(target_value)
        self._scroll_animation.setDuration(self._resolve_scroll_duration(start_value, target_value))
        self._scroll_animation.setEasingCurve(curve)
        self._is_animating_scroll = True
        self._scroll_animation.finished.connect(self._on_scroll_animation_finished)
        self._scroll_animation.start()

    @staticmethod
    def _resolve_scroll_duration(start_value: int, target_value: int) -> int:
        distance = abs(int(target_value) - int(start_value))
        return max(160, min(420, 160 + int(distance * 0.11)))

    def _stop_scroll_animation(self) -> None:
        if self._scroll_animation is None:
            return
        try:
            self._scroll_animation.stop()
        except Exception:
            pass
        self._scroll_animation.deleteLater()
        self._scroll_animation = None
        self._is_animating_scroll = False

    def _on_scroll_animation_finished(self) -> None:
        self._is_animating_scroll = False
        if self._scroll_animation is not None:
            self._scroll_animation.deleteLater()
            self._scroll_animation = None
        self._sync_current_question_from_scroll()

    def _on_scroll_value_changed(self, _value: int) -> None:
        if self._is_animating_scroll:
            return
        self._sync_current_question_from_scroll()

    def _sync_current_question_from_scroll(self) -> None:
        if self._is_animating_scroll or self._scroll_area is None or not self._question_cards:
            return
        scroll_bar = self._scroll_area.verticalScrollBar()
        if scroll_bar.value() >= max(0, scroll_bar.maximum() - 2):
            current_idx = len(self._question_cards) - 1
            if current_idx == self._current_question_idx:
                return
            self._current_question_idx = current_idx
            self._refresh_navigation_state(len(self._question_cards))
            return
        viewport_height = max(0, self._scroll_area.viewport().height())
        current_value = scroll_bar.value() + max(24, viewport_height // 2)
        current_idx = 0
        for idx, card in enumerate(self._question_cards):
            if card.y() <= current_value:
                current_idx = idx
            else:
                break
        if current_idx == self._current_question_idx:
            return
        self._current_question_idx = current_idx
        self._refresh_navigation_state(len(self._question_cards))

    # ------------------------------------------------------------------ #
    #  题目配置卡片                                                        #
    # ------------------------------------------------------------------ #

    def _build_entry_card(self, idx: int, entry: QuestionEntry, container: QWidget, inner: QVBoxLayout) -> CardWidget:
        """构建单个题目的配置卡片。"""
        # 获取题目信息
        qnum = ""
        title_text = ""
        option_texts: List[str] = []
        row_texts: List[str] = []
        multi_min_limit: Optional[int] = None
        multi_max_limit: Optional[int] = None
        if idx < len(self.info):
            qnum = str(self.info[idx].get("num") or "")
            title_text = str(self.info[idx].get("title") or "")
            opt_raw = self.info[idx].get("option_texts")
            if isinstance(opt_raw, list):
                option_texts = [str(x) for x in opt_raw]
            row_raw = self.info[idx].get("row_texts")
            if isinstance(row_raw, list):
                row_texts = [str(x) for x in row_raw]
            # 获取多选题的选择数量限制
            if entry.question_type == "multiple":
                multi_min_limit = self.info[idx].get("multi_min_limit")
                multi_max_limit = self.info[idx].get("multi_max_limit")

        # 题目卡片
        card = CardWidget(container)
        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(20, 16, 20, 16)
        card_layout.setSpacing(12)

        # 题目标题行
        header = QHBoxLayout()
        header.setSpacing(12)
        title = SubtitleLabel(f"第{qnum or idx + 1}题", card)
        title.setStyleSheet("font-size: 15px; font-weight: 600;")
        header.addWidget(title)
        type_label = BodyLabel(f"[{_get_entry_type_label(entry)}]", card)
        type_label.setStyleSheet("color: #0078d4; font-size: 12px;")
        header.addWidget(type_label)

        # 跳题逻辑警告徽标
        has_jump = False
        if idx < len(self.info):
            has_jump = bool(self.info[idx].get("has_jump"))
        if has_jump:
            jump_badge = BodyLabel("[含跳题逻辑]", card)
            jump_badge.setStyleSheet("font-size: 12px; font-weight: 500;")
            _apply_label_color(jump_badge, "#d97706", "#e5a00d")
            header.addWidget(jump_badge)

        header.addStretch(1)
        if entry.question_type == "slider":
            slider_note = BodyLabel("目标值会自动做小幅随机抖动，避免每份都填同一个数", card)
            slider_note.setStyleSheet("font-size: 12px;")
            slider_note.setWordWrap(False)
            slider_note.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            _apply_label_color(slider_note, "#777777", "#bfbfbf")
            header.addWidget(slider_note)
        if entry.question_type == "multiple":
            # 构建多选题提示文本
            multi_note_text = "每个选项被选中的概率相互独立，不要求总和100%"
            if multi_min_limit is not None or multi_max_limit is not None:
                limit_parts = []
                if multi_min_limit is not None and multi_max_limit is not None:
                    if multi_min_limit == multi_max_limit:
                        limit_parts.append(f"必须选择 {multi_min_limit} 项")
                    else:
                        limit_parts.append(f"最少 {multi_min_limit} 项，最多 {multi_max_limit} 项")
                elif multi_min_limit is not None:
                    limit_parts.append(f"最少选择 {multi_min_limit} 项")
                elif multi_max_limit is not None:
                    limit_parts.append(f"最多选择 {multi_max_limit} 项")
                if limit_parts:
                    multi_note_text += f"  |  {limit_parts[0]}"
            multi_note = BodyLabel(multi_note_text, card)
            multi_note.setStyleSheet("font-size: 12px;")
            multi_note.setWordWrap(False)
            multi_note.setAlignment(Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter)
            _apply_label_color(multi_note, "#777777", "#bfbfbf")
            header.addWidget(multi_note)
        card_layout.addLayout(header)

        # 题目描述
        if title_text:
            display_text = title_text
            # 多项填空题：在题目内容中标注填空项位置
            if idx < len(self.info):
                text_inputs = self.info[idx].get("text_inputs", 0)
                is_multi_text = self.info[idx].get("is_multi_text", False)
                if (is_multi_text or text_inputs > 1) and text_inputs > 0:
                    # 将题目文本按空格分隔，为每个部分添加编号
                    parts = title_text.split()
                    if len(parts) >= text_inputs:
                        display_text = " ".join([f"{parts[i]}____(填空{i+1})" for i in range(text_inputs)])
            desc = BodyLabel(_shorten_text(display_text, 120), card)
            desc.setWordWrap(True)
            desc.setStyleSheet("font-size: 12px; margin-bottom: 4px;")
            _apply_label_color(desc, "#555555", "#c8c8c8")
            card_layout.addWidget(desc)

        # 跳题逻辑风险提示
        if has_jump:
            jump_warn = BodyLabel(
                "⚠️ 此题包含跳题逻辑。若给跳题选项分配较高概率，"
                "可能导致大量样本提前结束或跳过后续题目，请谨慎设定配比。",
                card,
            )
            jump_warn.setWordWrap(True)
            jump_warn.setStyleSheet("font-size: 12px; padding: 4px 0;")
            _apply_label_color(jump_warn, "#b45309", "#e5a00d")
            card_layout.addWidget(jump_warn)

        # 根据题型构建不同的配置区域
        if entry.question_type in ("text", "multi_text"):
            self._build_text_section(idx, entry, card, card_layout)
        elif entry.question_type == "matrix":
            self._build_matrix_section(idx, entry, card, card_layout, option_texts, row_texts)
        elif entry.question_type == "order":
            self._build_order_section(card, card_layout, option_texts)
        else:
            self._build_slider_section(idx, entry, card, card_layout, option_texts)
        self._build_attached_select_section(idx, entry, card, card_layout)

        inner.addWidget(card)
        return card

    def _build_attached_select_section(self, idx: int, entry: QuestionEntry, card: CardWidget, card_layout: QVBoxLayout) -> None:
        raw_configs = getattr(entry, "attached_option_selects", None) or []
        if not isinstance(raw_configs, list) or not raw_configs:
            return

        stored_configs: List[Dict[str, Any]] = []
        separator = QFrame(card)
        separator.setFrameShape(QFrame.Shape.HLine)
        separator.setFrameShadow(QFrame.Shadow.Plain)
        separator.setStyleSheet("color: rgba(255, 255, 255, 0.16); margin-top: 6px; margin-bottom: 6px;")
        card_layout.addWidget(separator)

        section_title = BodyLabel("嵌入式下拉配比：", card)
        section_title.setStyleSheet("font-size: 12px; font-weight: 600; margin-top: 4px;")
        _apply_label_color(section_title, "#444444", "#e0e0e0")
        card_layout.addWidget(section_title)

        section_hint = BodyLabel("只有命中对应单选项时，下面这些嵌入式下拉权重才会生效；底部会自动换算成目标占比。", card)
        section_hint.setWordWrap(True)
        section_hint.setStyleSheet("font-size: 12px;")
        _apply_label_color(section_hint, "#666666", "#bfbfbf")
        card_layout.addWidget(section_hint)

        for item in raw_configs:
            if not isinstance(item, dict):
                continue
            select_options_raw = item.get("select_options")
            if not isinstance(select_options_raw, list):
                continue
            select_options = [str(opt or "").strip() for opt in select_options_raw if str(opt or "").strip()]
            if not select_options:
                continue
            try:
                raw_option_index = item.get("option_index")
                if raw_option_index is None:
                    raise ValueError("option_index is missing")
                option_index = int(raw_option_index)
            except Exception:
                option_index = len(stored_configs)
            option_text = str(item.get("option_text") or "").strip() or f"第{option_index + 1}项"

            raw_weights = item.get("weights")
            weights: List[float] = []
            if isinstance(raw_weights, list) and raw_weights:
                for opt_idx in range(len(select_options)):
                    raw_weight = raw_weights[opt_idx] if opt_idx < len(raw_weights) else 0.0
                    try:
                        weights.append(max(0.0, float(raw_weight)))
                    except Exception:
                        weights.append(0.0)
            if len(weights) < len(select_options):
                weights.extend([1.0] * (len(select_options) - len(weights)))
            if not any(weight > 0 for weight in weights):
                weights = [1.0] * len(select_options)

            item_title = BodyLabel(f"当选择“{_shorten_text(option_text, 40)}”时：", card)
            item_title.setWordWrap(True)
            item_title.setStyleSheet("font-size: 12px; margin-top: 6px;")
            _apply_label_color(item_title, "#0f6cbd", "#63b3ff")
            card_layout.addWidget(item_title)

            sliders: List[NoWheelSlider] = []
            for opt_idx, select_text in enumerate(select_options):
                row_widget = QWidget(card)
                row_layout = QHBoxLayout(row_widget)
                row_layout.setContentsMargins(0, 2, 0, 2)
                row_layout.setSpacing(12)

                num_label = BodyLabel(f"{opt_idx + 1}.", card)
                num_label.setFixedWidth(24)
                num_label.setStyleSheet("font-size: 12px;")
                _apply_label_color(num_label, "#888888", "#a6a6a6")
                row_layout.addWidget(num_label)

                text_label = BodyLabel(_shorten_text(select_text, 40), card)
                text_label.setFixedWidth(160)
                text_label.setStyleSheet("font-size: 13px;")
                row_layout.addWidget(text_label)

                slider = NoWheelSlider(Qt.Orientation.Horizontal, card)
                slider.setRange(0, 100)
                slider.setValue(int(min(100, max(0, round(weights[opt_idx])))))
                slider.setMinimumWidth(200)
                row_layout.addWidget(slider, 1)

                value_input = LineEdit(card)
                value_input.setFixedWidth(60)
                value_input.setAlignment(Qt.AlignmentFlag.AlignCenter)
                value_input.setText(str(slider.value()))
                _bind_slider_input(slider, value_input)
                row_layout.addWidget(value_input)

                card_layout.addWidget(row_widget)
                sliders.append(slider)

            ratio_preview_label = BodyLabel("", card)
            ratio_preview_label.setWordWrap(True)
            ratio_preview_label.setStyleSheet("font-size: 12px; margin-bottom: 2px;")
            _apply_label_color(ratio_preview_label, "#666666", "#bfbfbf")
            card_layout.addWidget(ratio_preview_label)

            def _update_option_preview(_value: int = 0, _label=ratio_preview_label, _sliders=sliders, _options=select_options):
                self._refresh_ratio_preview_label(
                    _label,
                    _sliders,
                    _options,
                    "嵌入式下拉目标占比：",
                )

            for slider in sliders:
                slider.valueChanged.connect(_update_option_preview)
            _update_option_preview()

            stored_configs.append({
                "option_index": option_index,
                "option_text": option_text,
                "select_options": select_options,
                "sliders": sliders,
            })

        if stored_configs:
            self.attached_select_slider_map[idx] = stored_configs

    def _restore_entries(self) -> None:
        limit = min(len(self.entries), len(self._entry_snapshots))
        for idx in range(limit):
            snapshot = copy.deepcopy(self._entry_snapshots[idx])
            self.entries[idx].__dict__.update(snapshot.__dict__)

    def reject(self) -> None:
        self._restore_entries()
        super().reject()

    def resizeEvent(self, event) -> None:
        super().resizeEvent(event)
        self._update_navigation_pager_geometry()

    # ------------------------------------------------------------------ #
    #  结果获取接口                                                        #
    # ------------------------------------------------------------------ #

    def get_results(self) -> Dict[int, Any]:
        """获取滑块权重/概率结果"""
        result: Dict[int, Any] = {}
        for idx, sliders in self.slider_map.items():
            weights = [max(0, s.value()) for s in sliders]
            if all(w <= 0 for w in weights):
                weights = [1] * len(weights)
            result[idx] = weights

        for idx, row_sliders in self.matrix_row_slider_map.items():
            row_weights: List[List[int]] = []
            for row in row_sliders:
                weights = [max(0, s.value()) for s in row]
                if all(w <= 0 for w in weights):
                    weights = [1] * len(weights)
                row_weights.append(weights)
            result[idx] = row_weights
        return result

    def get_text_results(self) -> Dict[int, List[str]]:
        """获取填空题答案结果"""
        from software.core.questions.types.text import MULTI_TEXT_DELIMITER
        result: Dict[int, List[str]] = {}
        for idx, edits in self.text_edit_map.items():
            if edits and isinstance(edits[0], list):
                # 多项填空题：二维列表
                texts = []
                matrix_edits = cast(List[List[LineEdit]], edits)
                for row_edits in matrix_edits:
                    row_values = [edit.text().strip() for edit in row_edits]
                    merged = MULTI_TEXT_DELIMITER.join(row_values)
                    if merged:
                        texts.append(merged)
            else:
                # 普通填空题：一维列表
                flat_edits = cast(List[LineEdit], edits)
                texts = [e.text().strip() for e in flat_edits if e.text().strip()]
            if not texts:
                texts = [DEFAULT_FILL_TEXT]
            result[idx] = texts
        return result

    def get_text_random_modes(self) -> Dict[int, str]:
        """获取填空题随机值模式（none/name/mobile）"""
        return {idx: mode for idx, mode in self.text_random_mode_map.items()}

    def get_multi_text_blank_modes(self) -> Dict[int, List[str]]:
        """获取多项填空题每个填空项的随机模式"""
        from .wizard_sections import _TEXT_RANDOM_NONE, _TEXT_RANDOM_NAME, _TEXT_RANDOM_MOBILE
        result: Dict[int, List[str]] = {}
        if not hasattr(self, "multi_text_blank_radio_groups"):
            return result
        for idx, groups in self.multi_text_blank_radio_groups.items():
            modes: List[str] = []
            for group in groups:
                checked_id = group.checkedId()
                if checked_id == 1:
                    modes.append(_TEXT_RANDOM_NAME)
                elif checked_id == 2:
                    modes.append(_TEXT_RANDOM_MOBILE)
                else:
                    modes.append(_TEXT_RANDOM_NONE)
            result[idx] = modes
        return result

    def get_multi_text_blank_ai_flags(self) -> Dict[int, List[bool]]:
        """获取多项填空题每个填空项的AI标志"""
        result: Dict[int, List[bool]] = {}
        if not hasattr(self, "multi_text_blank_ai_checkboxes"):
            return result
        for idx, checkboxes in self.multi_text_blank_ai_checkboxes.items():
            result[idx] = [cb.isChecked() for cb in checkboxes]
        return result

    def get_ai_flags(self) -> Dict[int, bool]:
        """获取填空题是否启用 AI"""
        result: Dict[int, bool] = {}
        for idx, cb in self.ai_check_map.items():
            random_mode = self.text_random_mode_map.get(idx, _TEXT_RANDOM_NONE)
            result[idx] = False if random_mode != _TEXT_RANDOM_NONE else cb.isChecked()
        return result

    def get_attached_select_results(self) -> Dict[int, List[Dict[str, Any]]]:
        result: Dict[int, List[Dict[str, Any]]] = {}
        for idx, config_items in self.attached_select_slider_map.items():
            serialized_items: List[Dict[str, Any]] = []
            for item in config_items:
                sliders = item.get("sliders") or []
                weights = [max(0, slider.value()) for slider in sliders]
                if weights and not any(weight > 0 for weight in weights):
                    weights = [1] * len(weights)
                serialized_items.append({
                    "option_index": int(item.get("option_index", 0)),
                    "option_text": str(item.get("option_text") or "").strip(),
                    "select_options": list(item.get("select_options") or []),
                    "weights": weights,
                })
            result[idx] = serialized_items
        return result

    def get_bias_presets(self) -> Dict[int, Any]:
        """获取每个题目的倾向预设值（矩阵题返回列表）"""
        result: Dict[int, Any] = {}
        for idx, seg in self.bias_preset_map.items():
            if isinstance(seg, list):
                result[idx] = [_get_segmented_route_key(s) for s in seg]
            else:
                result[idx] = _get_segmented_route_key(seg)
        return result

