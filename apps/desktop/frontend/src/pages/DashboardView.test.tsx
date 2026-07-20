import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { applyConfigToShell, normalizeRuntimeConfig } from '../services/stateMapper'
import { emptyShellState } from '../services/shellFixture'
import type { AppSettings } from '../types'
import { firstSupportedQRImageFile, isSupportedQRImage } from './DashboardView'
import DashboardView from './DashboardView'

const settings: AppSettings = {
  configDirectory: 'D:/configs',
  themeMode: 'system',
  showNavigationText: true,
  micaEnabled: true,
  topmost: false,
  notifications: true,
  autosaveLogCount: 5,
}

const dashboardProps: ComponentProps<typeof DashboardView> = {
  dashboard: emptyShellState.dashboard,
  customProxyAPI: '',
  onUpdateUrl: () => undefined,
  onAutoConfig: () => undefined,
  onLoadQRCode: () => undefined,
  onDecodeQRCodeImage: () => undefined,
  onLoadConfig: () => undefined,
  onSaveConfig: () => undefined,
  onOpenSetupWizard: () => undefined,
  onOpenRuntime: () => undefined,
  onTargetChange: () => undefined,
  onThreadsChange: () => undefined,
  onRandomIpChange: () => undefined,
  onProxySourceChange: () => undefined,
  onCustomProxyAPIChange: () => undefined,
  onSyncProxyStatus: () => undefined,
  onRedeemProxyCard: () => undefined,
  onRun: () => undefined,
  onCancelRun: () => undefined,
  onPauseRun: () => undefined,
  onResumeRun: () => undefined,
}

function renderDashboard(props: Partial<ComponentProps<typeof DashboardView>> = {}) {
  return renderToStaticMarkup(<DashboardView {...dashboardProps} {...props} />)
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

  it('reveals the custom proxy API field and health action', () => {
    const html = renderDashboard({
      dashboard: { ...emptyShellState.dashboard, proxySource: '自定义' },
      customProxyAPI: 'https://proxy.example/api',
    })

    expect(html).toContain('代理 API')
    expect(html).toContain('https://proxy.example/api')
    expect(html).toContain('验活')
    expect(html).toContain('custom-proxy-reveal')
  })

  it('keeps setup as the primary entry and uses consistent action labels', () => {
    const emptyHtml = renderDashboard()
    const configuredHtml = renderDashboard({
      dashboard: { ...emptyShellState.dashboard, surveyUrl: 'https://www.wjx.cn/vm/demo.aspx' },
    })

    expect(emptyHtml).toContain('配置问卷')
    expect(emptyHtml).toContain('解析问卷')
    expect(emptyHtml).toContain('导入配置')
    expect(emptyHtml).toContain('保存配置')
    expect(emptyHtml).toContain('并发数')
    expect(configuredHtml).toContain('重新配置')
    expect(configuredHtml).not.toContain('>配置问卷<')
  })

  it('keeps start disabled until the full configuration is ready', () => {
    const html = renderDashboard({
      dashboard: { ...emptyShellState.dashboard, surveyUrl: 'https://www.wjx.cn/vm/demo.aspx' },
      canRun: false,
      runBlockedReason: '请先解析问卷。',
    })

    expect(html).toContain('title="请先解析问卷。"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="请先解析问卷。"|<button[^>]*title="请先解析问卷。"[^>]*disabled=""/)
  })
})
