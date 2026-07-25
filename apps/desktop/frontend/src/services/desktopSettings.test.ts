import { describe, expect, it } from 'vitest'
import {
  applyTopmostSetting,
  buildTaskResultNotification,
  shouldAskSaveOnClose,
  shouldNotifyTaskResult,
  showTaskResultNotification,
} from './desktopSettings'

describe('desktop settings helpers', () => {
  it('keeps main close-confirm defaults', () => {
    expect(shouldAskSaveOnClose(null)).toBe(true)
    expect(shouldAskSaveOnClose({ askSaveOnClose: true })).toBe(true)
    expect(shouldAskSaveOnClose({ askSaveOnClose: false })).toBe(false)
  })

  it('applies topmost setting through Wails window API', async () => {
    const calls: boolean[] = []

    const windowApi = {
      SetAlwaysOnTop: (value: boolean) => {
        calls.push(value)
      },
    }

    await applyTopmostSetting(windowApi, { topmost: true })
    await applyTopmostSetting(windowApi, { topmost: false })
    await applyTopmostSetting(windowApi, null)

    expect(calls).toEqual([true, false, false])
  })

  it('builds task result notifications from run state', () => {
    expect(shouldNotifyTaskResult(null)).toBe(true)
    expect(shouldNotifyTaskResult({ taskResultNotification: false })).toBe(false)
    expect(shouldNotifyTaskResult({ taskResultNotification: true })).toBe(true)
    expect(buildTaskResultNotification({ result: { success: 3, fail: 1 } })).toEqual({
      title: '任务执行完成',
      body: '成功 3 份，失败 1 份',
    })
    expect(buildTaskResultNotification({ error: '网络错误' })).toEqual({
      title: '任务执行失败',
      body: '网络错误',
    })
  })

  it('shows notifications only when permission is granted', async () => {
    const created: Array<{ title: string; body?: string }> = []
    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      static async requestPermission(): Promise<NotificationPermission> {
        return this.permission
      }
      constructor(title: string, options?: NotificationOptions) {
        created.push({ title, body: options?.body })
      }
    }

    await expect(showTaskResultNotification(FakeNotification as unknown as typeof Notification, {
      title: '完成',
      body: '成功 1 份，失败 0 份',
    })).resolves.toBe(true)
    expect(created).toEqual([{ title: '完成', body: '成功 1 份，失败 0 份' }])

    FakeNotification.permission = 'denied'
    await expect(showTaskResultNotification(FakeNotification as unknown as typeof Notification, {
      title: '完成',
      body: '成功 1 份，失败 0 份',
    })).resolves.toBe(false)
  })
})
