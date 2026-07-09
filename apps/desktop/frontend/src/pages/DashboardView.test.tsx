import { describe, expect, it } from 'vitest'
import { applyConfigToShell, normalizeRuntimeConfig } from '../services/stateMapper'
import { emptyShellState } from '../services/shellFixture'
import type { AppSettings } from '../types'
import { firstSupportedQRImageFile, isSupportedQRImage } from './DashboardView'

const settings: AppSettings = {
  configDirectory: 'D:/configs',
  themeMode: 'system',
  showNavigationText: true,
  micaEnabled: true,
  topmost: false,
  notifications: true,
  autosaveLogCount: 5,
}

describe('DashboardView', () => {
  it('keeps question and session data on the dashboard model', () => {
    const shell = applyConfigToShell(
      emptyShellState,
      settings,
      normalizeRuntimeConfig({
        url: 'https://www.wjx.cn/vm/demo.aspx',
        target: 5,
        threads: 2,
        random_ip_enabled: true,
        questions_info: [
          {
            num: 1,
            title: '单选',
            description: '',
            type_code: '3',
            options: 2,
            rows: 0,
            row_texts: [],
            option_texts: ['A', 'B'],
            provider: 'wjx',
            provider_type: 'single',
            is_description: false,
            is_text_like: false,
            text_inputs: 0,
          },
        ],
      }),
      null,
      null,
      {
        available: 1,
        inUse: 1,
        userId: 73952,
        userKnown: true,
        poolRemainingIp: 75772,
        poolRemainingKnown: true,
        remainingQuota: '3',
        totalQuota: '5',
        quotaKnown: true,
        randomIpEnabled: true,
        source: 'default',
        message: '额度已同步',
      },
    )

    expect(shell.dashboard.questionRows).toHaveLength(1)
    expect(shell.dashboard.sessionRows).toEqual([])
    expect(shell.dashboard.randomIpStatus).toBe('额度已同步')
    expect(shell.dashboard.quickActions.map((item) => item.id)).toEqual(['parse', 'load-config', 'save-config', 'open-runtime'])
  })

  it('detects pasted and dropped QR image files', () => {
    const png = new File(['demo'], 'survey.png', { type: 'image/png' })
    const txt = new File(['demo'], 'survey.txt', { type: 'text/plain' })
    const legacyBmp = new File(['demo'], 'survey.bmp', { type: '' })

    expect(isSupportedQRImage(png)).toBe(true)
    expect(isSupportedQRImage(txt)).toBe(false)
    expect(isSupportedQRImage(legacyBmp)).toBe(true)
    expect(firstSupportedQRImageFile([txt, png])).toBe(png)
    expect(firstSupportedQRImageFile([txt])).toBeNull()
  })
})
