"""题目配置数据容器。"""
import logging
from typing import Any, Dict, List, Optional

from PySide6.QtCore import Signal
from PySide6.QtWidgets import QWidget, QVBoxLayout, QDialog
from qfluentwidgets import ScrollArea

from wjx.core.questions.config import QuestionEntry

from .add_dialog import QuestionAddDialog

logger = logging.getLogger(__name__)


class QuestionPage(ScrollArea):
    """隐藏页面：仅维护题目条目数据，不再承载可见 UI。"""

    entriesChanged = Signal(int)  # 当前题目配置条目数

    def __init__(self, parent=None):
        super().__init__(parent)
        self.entries: List[QuestionEntry] = []
        self.questions_info: List[Dict[str, Any]] = []
        self.view = QWidget(self)
        self.setWidget(self.view)
        self.setWidgetResizable(True)
        self.enableTransparentBackground()
        self._build_ui()

    def _build_ui(self):
        QVBoxLayout(self.view).setContentsMargins(0, 0, 0, 0)

    # ---------- data helpers ----------
    def set_questions(self, info: List[Dict[str, Any]], entries: List[QuestionEntry]):
        self.questions_info = info or []
        self.set_entries(entries, info)

    def set_entries(self, entries: List[QuestionEntry], info: Optional[List[Dict[str, Any]]] = None):
        self.questions_info = info or self.questions_info
        self.entries = list(entries or [])
        if self.questions_info:
            for idx, entry in enumerate(self.entries):
                if getattr(entry, "question_title", None):
                    continue
                if idx < len(self.questions_info):
                    title = self.questions_info[idx].get("title")
                    if title:
                        entry.question_title = str(title).strip()
        self._refresh_data()

    def get_entries(self) -> List[QuestionEntry]:
        return list(self.entries)

    # ---------- UI actions ----------
    def _add_entry(self):
        """显示新增题目的交互式弹窗。"""
        dialog = QuestionAddDialog(self.entries, self.window() or self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            new_entry = dialog.get_entry()
            if new_entry:
                self.entries.append(new_entry)
                self._refresh_data()

    def _refresh_data(self):
        try:
            self.entriesChanged.emit(int(len(self.entries)))
        except Exception as exc:
            logger.info(f"发送 entriesChanged 信号失败: {exc}")

