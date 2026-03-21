"""服务条款对话框"""
from PySide6.QtCore import Qt
from PySide6.QtWidgets import QDialog, QVBoxLayout
from qfluentwidgets import (
    ScrollArea,
    BodyLabel,
    TitleLabel,
    PrimaryPushButton,
)
from wjx.utils.app import get_resource_path


LEGAL_TEXT_FILES = (
    "wjx/assets/legal/service_terms.txt",
    "wjx/assets/legal/privacy_statement.txt",
)


def _read_legal_text(relative_path: str) -> str:
    """读取法律文本文件，缺失时给出可读提示。"""
    full_path = get_resource_path(relative_path)
    try:
        with open(full_path, "r", encoding="utf-8") as file:
            return file.read().strip()
    except OSError:
        return (
            "【文件缺失】\n\n"
            f"未找到条款文件：{relative_path}\n"
            "请检查安装包是否完整。"
        )


def _load_terms_content() -> str:
    sections = [_read_legal_text(path) for path in LEGAL_TEXT_FILES]
    return "\n\n".join(section for section in sections if section).strip()


class TermsOfServiceDialog(QDialog):
    """服务条款对话框"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_QuitOnClose, False)
        self.setWindowTitle("服务条款")
        self.resize(800, 600)

        main_layout = QVBoxLayout(self)
        main_layout.setContentsMargins(24, 24, 24, 24)
        main_layout.setSpacing(16)

        # 标题
        title = TitleLabel("服务条款与隐私声明", self)
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(title)

        # 滚动区域显示条款内容
        scroll = ScrollArea(self)
        scroll.setWidgetResizable(True)
        
        content_widget = BodyLabel(self)
        content_widget.setWordWrap(True)
        content_widget.setTextInteractionFlags(
            Qt.TextInteractionFlag.TextSelectableByMouse
        )
        
        content_widget.setText(_load_terms_content())
        content_widget.setStyleSheet("""
            BodyLabel {
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 15px;
                line-height: 1.6;
                padding: 12px;
            }
        """)
        
        scroll.setWidget(content_widget)
        main_layout.addWidget(scroll)

        # 关闭按钮
        close_btn = PrimaryPushButton("关闭", self)
        close_btn.setFixedWidth(120)
        close_btn.clicked.connect(self.accept)
        
        btn_layout = QVBoxLayout()
        btn_layout.addWidget(close_btn, 0, Qt.AlignmentFlag.AlignCenter)
        main_layout.addLayout(btn_layout)
