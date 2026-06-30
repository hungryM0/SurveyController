import type { AppSettings } from '../types'

export function shouldAskSaveOnClose(settings: Pick<AppSettings, 'askSaveOnClose'> | null | undefined): boolean {
  return settings?.askSaveOnClose !== false
}

export function shouldCloseAfterSavePrompt(choice: string): boolean {
  return choice === '保存' || choice === '不保存'
}

export function shouldSaveBeforeClose(choice: string): boolean {
  return choice === '保存'
}

export async function applyTopmostSetting(
  windowApi: { SetAlwaysOnTop: (alwaysOnTop: boolean) => Promise<void> | void },
  settings: Pick<AppSettings, 'topmost'> | null | undefined,
): Promise<void> {
  await windowApi.SetAlwaysOnTop(Boolean(settings?.topmost))
}

export function shouldNotifyTaskResult(settings: Pick<AppSettings, 'taskResultNotification' | 'notifications'> | null | undefined): boolean {
  return settings?.taskResultNotification ?? settings?.notifications ?? true
}

export function buildTaskResultNotification(
  state: { result?: { success: number; fail: number } | null; error?: string } | null | undefined,
): { title: string; body: string } | null {
  if (!state?.result && !state?.error) {
    return null
  }
  if (state.error) {
    return {
      title: '任务执行失败',
      body: state.error,
    }
  }
  const success = state.result?.success ?? 0
  const fail = state.result?.fail ?? 0
  return {
    title: '任务执行完成',
    body: `成功 ${success} 份，失败 ${fail} 份`,
  }
}

export async function showTaskResultNotification(
  notificationApi: typeof Notification | undefined,
  message: { title: string; body: string },
): Promise<boolean> {
  if (!notificationApi) {
    return false
  }
  if (notificationApi.permission === 'default') {
    await notificationApi.requestPermission()
  }
  if (notificationApi.permission !== 'granted') {
    return false
  }
  new notificationApi(message.title, { body: message.body })
  return true
}
