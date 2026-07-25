import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildAppModel, mapAppViewState } from '../viewModels/appModel'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../test/configFactory'
import type { ProxyStatus } from '../types'
import { firstSupportedQRImageFile, isSupportedQRImage } from './DashboardView'
import DashboardView from './DashboardView'

const config = createTestConfig()
const settings = createTestSettings((value) => {
  value.configDirectory = 'D:/configs'
})
const dashboard = mapAppViewState(
  buildAppModel(settings, config),
  { value: '', operation: 'keep' },
).dashboard

const dashboardProps: ComponentProps<typeof DashboardView> = {
  dashboard,
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
  it('keeps question and proxy data on the dashboard model', () => {
    const nextConfig = createTestConfig((value) => {
      value.survey.url = 'https://www.wjx.cn/vm/demo.aspx'
      value.survey.definition.questions = [createTestQuestion()]
      value.answers.questions = [createTestQuestionEntry()]
      value.execution.target = 5
      value.execution.threads = 2
      value.network.randomProxyEnabled = true
    })
    const proxy: ProxyStatus = {
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
      quota: { RemainingQuota: 3, TotalQuota: 5, UsedQuota: 2, QuotaKnown: true },
    }
    const mapped = mapAppViewState(
      buildAppModel(settings, nextConfig),
      { value: '', operation: 'keep' },
      null,
      proxy,
    ).dashboard

    expect(mapped.questionRows).toHaveLength(1)
    expect(mapped.sessionRows).toEqual([])
    expect(mapped.randomIpStatus).toBe('额度已同步')
    expect(mapped.quickActions.map((item) => item.id)).toEqual(['parse', 'load-config', 'save-config', 'open-runtime'])
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
      dashboard: { ...dashboard, proxySource: '自定义' },
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
      dashboard: { ...dashboard, surveyUrl: 'https://www.wjx.cn/vm/demo.aspx' },
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
      dashboard: { ...dashboard, surveyUrl: 'https://www.wjx.cn/vm/demo.aspx' },
      canRun: false,
      runBlockedReason: '请先解析问卷。',
    })

    expect(html).toContain('title="请先解析问卷。"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*title="请先解析问卷。"|<button[^>]*title="请先解析问卷。"[^>]*disabled=""/)
  })
})
