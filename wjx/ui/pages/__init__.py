"""UI 页面模块。"""

from __future__ import annotations

from importlib import import_module
from typing import Any

_EXPORTS = {
    "DashboardPage": "wjx.ui.pages.workbench.dashboard",
    "RuntimePage": "wjx.ui.pages.workbench.runtime",
    "AnswerRulesPage": "wjx.ui.pages.workbench.answer_rules",
    "SettingsPage": "wjx.ui.pages.settings.settings",
    "QuestionPage": "wjx.ui.pages.workbench.question",
    "QuestionWizardDialog": "wjx.ui.pages.workbench.question",
    "LogPage": "wjx.ui.pages.workbench.log",
    "SupportPage": "wjx.ui.pages.more.support",
    "ChangelogPage": "wjx.ui.pages.more.changelog",
}

__all__ = list(_EXPORTS)


def __getattr__(name: str) -> Any:
    module_name = _EXPORTS.get(name)
    if module_name is None:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

    value = getattr(import_module(module_name), name)
    globals()[name] = value
    return value
