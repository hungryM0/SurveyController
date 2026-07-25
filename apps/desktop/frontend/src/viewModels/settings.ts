import type { AppSettings, SettingField, SettingsGroup } from '../types'

export function mapSettingsGroups(settings: AppSettings): SettingsGroup[] {
  return [
    {
      title: '界面外观',
      fields: [
        field('theme', '主题', '跟随系统或固定明暗色', 'select', settings.themeMode || 'system', ['system', 'light', 'dark']),
        field('nav-text', '导航文字', '在侧栏显示页面名称', 'toggle', String(settings.showNavigationText)),
        field('mica', '窗口背景效果', '跟随系统主题显示半透明背景', 'toggle', String(settings.micaEnabled)),
      ],
    },
    {
      title: '行为设置',
      fields: [
        field('topmost', '窗口置顶', '任务运行时便于观察', 'toggle', String(settings.topmost)),
        field('ask-save-on-close', '关闭前询问是否保存', '', 'toggle', String(settings.askSaveOnClose)),
        field('prevent-sleep', '执行期间阻止自动休眠', '', 'toggle', String(settings.preventSleepDuringRun)),
        field('task-result-notification', '后台任务完成/失败时通知', '', 'toggle', String(settings.taskResultNotification)),
        field('submission-report-telemetry', '提交结果遥测', '向官方服务发送用户与设备标识、完整问卷链接、结果、代理来源和版本；不含答案与 API 密钥', 'toggle', String(settings.submissionReportTelemetry)),
        field('auto-save-logs', '自动保存日志', '任务结束后保存最近日志', 'toggle', String(settings.autoSaveLogs)),
        field('autosave', '日志保留数量', '保留最近几份日志', 'select', String(settings.autosaveLogCount || 10), ['3', '5', '10', '20', '30', '50']),
        field('config-directory', '配置目录', '打开和保存配置时使用的默认目录', 'text', settings.configDirectory || ''),
      ],
    },
    {
      title: '更新设置',
      fields: [
        field('auto-update', '在应用程序启动时检查更新', '', 'toggle', String(settings.autoCheckUpdate)),
      ],
    },
  ]
}

export function updateAppSettingsField(
  settings: AppSettings,
  fieldId: string,
  rawValue: string | boolean,
): AppSettings {
  const next = structuredClone(settings)
  const text = String(rawValue)
  switch (fieldId) {
    case 'nav-text': next.showNavigationText = Boolean(rawValue); break
    case 'mica': next.micaEnabled = Boolean(rawValue); break
    case 'topmost': next.topmost = Boolean(rawValue); break
    case 'ask-save-on-close': next.askSaveOnClose = Boolean(rawValue); break
    case 'prevent-sleep': next.preventSleepDuringRun = Boolean(rawValue); break
    case 'task-result-notification': next.taskResultNotification = Boolean(rawValue); break
    case 'submission-report-telemetry': next.submissionReportTelemetry = Boolean(rawValue); break
    case 'auto-update': next.autoCheckUpdate = Boolean(rawValue); break
    case 'auto-save-logs': next.autoSaveLogs = Boolean(rawValue); break
    case 'autosave': next.autosaveLogCount = clampInt(Number(text), 1, 100, 10); break
    case 'theme': next.themeMode = text; break
    case 'config-directory': next.configDirectory = text; break
  }
  return next
}

function field(
  id: string,
  label: string,
  description: string,
  kind: string,
  value: string,
  options?: string[],
): SettingField {
  return { id, label, description, kind, value, options }
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.trunc(value))) : fallback
}
