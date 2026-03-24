"""QFluentWidgets 兼容补丁。"""
from __future__ import annotations

from PySide6.QtCore import QAbstractAnimation


def install_qfluentwidgets_animation_guards() -> None:
    """为已知的进度条动画状态问题打补丁，避免 Qt 警告刷屏。"""
    try:
        from qfluentwidgets import IndeterminateProgressBar
    except Exception:
        return

    if getattr(IndeterminateProgressBar, "_surveycontroller_resume_guard_installed", False):
        return

    original_start = IndeterminateProgressBar.start

    def _safe_resume(self):
        state = self.aniGroup.state()
        if state == QAbstractAnimation.State.Paused:
            self.aniGroup.resume()
        elif state == QAbstractAnimation.State.Stopped and not getattr(self, "_isError", False):
            original_start(self)
            return

        self.update()

    def _safe_set_paused(self, is_paused: bool):
        state = self.aniGroup.state()
        if is_paused:
            if state == QAbstractAnimation.State.Running:
                self.aniGroup.pause()
                self.update()
            return

        if state == QAbstractAnimation.State.Paused:
            self.aniGroup.resume()
            self.update()
        elif state == QAbstractAnimation.State.Stopped and not getattr(self, "_isError", False):
            original_start(self)
        else:
            self.update()

    IndeterminateProgressBar.resume = _safe_resume
    IndeterminateProgressBar.setPaused = _safe_set_paused
    IndeterminateProgressBar._surveycontroller_resume_guard_installed = True


__all__ = ["install_qfluentwidgets_animation_guards"]
