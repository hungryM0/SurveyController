# -*- coding: utf-8 -*-
"""
请不要滥用

"""

import logging
import sys

# 只在 Windows 平台导入 winreg
if sys.platform == "win32":
    import winreg
else:
    winreg = None


class RegistryManager:

    REGISTRY_PATH = r"Software\FuckWJX"
    REGISTRY_KEY = "RandomIPSubmitCount"
    REGISTRY_KEY_LIMIT = "RandomIPQuotaLimit"
    REGISTRY_KEY_CONFETTI_PLAYED = "ConfettiPlayed"
    
    @staticmethod
    def read_submit_count() -> int:
        if winreg is None:
            return 0
        
        try:
            hkey = winreg.HKEY_CURRENT_USER
            with winreg.OpenKey(hkey, RegistryManager.REGISTRY_PATH) as key:
                value, _ = winreg.QueryValueEx(key, RegistryManager.REGISTRY_KEY)
                count = int(value) if value is not None else 0
                return count
        except FileNotFoundError:
            return 0
        except (OSError, ValueError):
            return 0
        except Exception:
            return 0
    
    @staticmethod
    def write_submit_count(count: int) -> bool:
        if winreg is None:
            return False
        
        try:
            hkey = winreg.HKEY_CURRENT_USER
            key = winreg.CreateKeyEx(hkey, RegistryManager.REGISTRY_PATH, 0, winreg.KEY_WRITE)
            winreg.SetValueEx(key, RegistryManager.REGISTRY_KEY, 0, winreg.REG_DWORD, int(count))
            winreg.CloseKey(key)
            return True
        except OSError:
            return False
        except Exception:
            return False
    
    @staticmethod
    def increment_submit_count(step: int = 1) -> int:
        current = RegistryManager.read_submit_count()
        safe_step = max(1, int(step or 1))
        new_count = current + safe_step
        RegistryManager.write_submit_count(new_count)
        return new_count

    @staticmethod
    def read_quota_limit(default: int = 20) -> int:
        if winreg is None:
            return default
        try:
            hkey = winreg.HKEY_CURRENT_USER
            with winreg.OpenKey(hkey, RegistryManager.REGISTRY_PATH) as key:
                value, _ = winreg.QueryValueEx(key, RegistryManager.REGISTRY_KEY_LIMIT)
                limit = int(value)
                return limit if limit > 0 else default
        except FileNotFoundError:
            return default
        except Exception as e:
            logging.info(f"读取额度上限失败: {e}")
            return default

    @staticmethod
    def write_quota_limit(limit: int) -> bool:
        if winreg is None:
            return False
        try:
            limit_val = max(1, int(limit))
            hkey = winreg.HKEY_CURRENT_USER
            key = winreg.CreateKeyEx(hkey, RegistryManager.REGISTRY_PATH, 0, winreg.KEY_WRITE)
            winreg.SetValueEx(key, RegistryManager.REGISTRY_KEY_LIMIT, 0, winreg.REG_DWORD, limit_val)
            winreg.CloseKey(key)
            logging.info(f"随机IP额度上限已设置为 {limit_val}")
            return True
        except Exception as e:
            logging.warning(f"写入额度上限失败: {e}")
            return False

    @staticmethod
    def is_confetti_played() -> bool:
        """检查彩带动画是否已播放过"""
        if winreg is None:
            return False
        try:
            hkey = winreg.HKEY_CURRENT_USER
            with winreg.OpenKey(hkey, RegistryManager.REGISTRY_PATH) as key:
                value, _ = winreg.QueryValueEx(key, RegistryManager.REGISTRY_KEY_CONFETTI_PLAYED)
                return bool(int(value))
        except FileNotFoundError:
            return False
        except Exception:
            return False

    @staticmethod
    def set_confetti_played(played: bool) -> bool:
        """设置彩带动画播放状态"""
        if winreg is None:
            return False
        try:
            hkey = winreg.HKEY_CURRENT_USER
            key = winreg.CreateKeyEx(hkey, RegistryManager.REGISTRY_PATH, 0, winreg.KEY_WRITE)
            winreg.SetValueEx(key, RegistryManager.REGISTRY_KEY_CONFETTI_PLAYED, 0, winreg.REG_DWORD, int(played))
            winreg.CloseKey(key)
            return True
        except Exception:
            return False

