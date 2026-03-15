"""后台更新检查Worker"""
from PySide6.QtCore import QThread, Signal
import logging


class UpdateCheckWorker(QThread):
    """后台检查更新的Worker线程"""

    # 信号：更新检查完成 (has_update: bool, update_info: dict)
    update_checked = Signal(bool, dict)

    def __init__(self, parent=None):
        super().__init__(parent)

    def run(self):
        """在后台线程执行更新检查"""
        try:
            from wjx.utils.update.updater import UpdateManager

            logging.info("后台检查更新开始...")
            update_info = UpdateManager.check_updates()

            # check_updates() 现在始终返回 dict，通过 status 字段区分结果
            if update_info is None:
                update_info = {"has_update": False, "status": "unknown"}

            has_update = update_info.get("has_update", False)
            status = update_info.get("status", "unknown")

            if has_update:
                logging.info(f"发现新版本: {update_info.get('version', 'unknown')}")
            else:
                logging.info(f"更新检查状态: {status}")

            # 发送结果信号
            self.update_checked.emit(has_update, update_info)

        except Exception as exc:
            error_msg = f"检查更新失败: {exc}"
            logging.warning(error_msg)
            # 异常情况也通过 update_checked 发送，status=unknown
            self.update_checked.emit(False, {"has_update": False, "status": "unknown"})

