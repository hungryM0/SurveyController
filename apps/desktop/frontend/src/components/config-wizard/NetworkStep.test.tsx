import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createTestConfig, createTestSettings } from '../../test/configFactory'
import { createWizardDraft } from './configWizardModel'
import NetworkStep, { isProxyStatusForSource } from './NetworkStep'

function renderNetwork(configure?: (config: ReturnType<typeof createTestConfig>) => void) {
  const config = createTestConfig(configure)
  return renderToStaticMarkup(
    <NetworkStep
      draft={createWizardDraft(config, createTestSettings())}
      busy={false}
      onChange={vi.fn()}
    />,
  )
}

describe('NetworkStep', () => {
  it('shows direct mode and explicitly marks proxy quota as not applicable', () => {
    const html = renderNetwork()

    expect(html).toContain('直连')
    expect(html).toContain('aria-label="访问方式"')
    expect(html).toContain('不适用（直连）')
    expect(html).toContain('刷新状态')
    expect(html).not.toContain('同步额度')
  })

  it('shows a real loading state and an explicit missing-url prompt for custom APIs', () => {
    const html = renderNetwork((config) => {
      config.network.randomProxyEnabled = true
      config.network.proxySource = 'custom'
      config.network.customProxyApi = ''
    })

    expect(html).toContain('正在读取代理状态')
    expect(html).toContain('需要代理 API 地址')
    expect(html).toContain('请先填写代理 API 地址，再测试连接。')
    expect(html).toContain('测试连接')
    expect(html).toContain('disabled=""')
  })

  it('does not show a fabricated success state before a custom API test returns', () => {
    const html = renderNetwork((config) => {
      config.network.randomProxyEnabled = true
      config.network.proxySource = 'custom'
      config.network.customProxyApi = 'https://proxy.example.test/api'
    })

    expect(html).toContain('测试连接')
    expect(html).not.toContain('代理 API 连接测试通过')
    expect(html).not.toContain('检测通过')
  })

  it('shows a fixed proxy input without fabricating a connection result', () => {
    const html = renderNetwork((config) => {
      config.network.proxyMode = 'fixed'
      config.network.fixedProxyAddress = '127.0.0.1:8080'
    })

    expect(html).toContain('固定代理地址')
    expect(html).toContain('测试连接')
    expect(html).toContain('固定代理尚未测试')
    expect(html).not.toContain('固定代理连接通过')
  })

  it('shows an immediate local error for an invalid fixed proxy address', () => {
    const html = renderNetwork((config) => {
      config.network.proxyMode = 'fixed'
      config.network.fixedProxyAddress = 'ftp://proxy.example:8080'
    })

    expect(html).toContain('固定代理地址无效')
    expect(html).toContain('地址必须是 HTTP 或 HTTPS 代理地址')
    expect(html).not.toContain('固定代理连接通过')
  })

  it('keeps the custom proxy layout in wizard CSS instead of inline styles', () => {
    const html = renderNetwork((config) => {
      config.network.randomProxyEnabled = true
      config.network.proxySource = 'custom'
      config.network.customProxyApi = 'https://proxy.example.test/api'
    })

    expect(html).toContain('config-wizard-custom-proxy-controls')
    expect(html).toContain('config-wizard-custom-proxy-row')
    expect(html).toContain('config-wizard-custom-proxy-input')
    expect(html).not.toContain('style="display:grid')
    expect(html).not.toContain('style="display:flex')
    expect(html).not.toContain('style="flex:1 1 14rem')
  })

  it('rejects proxy status returned for a different source', () => {
    expect(isProxyStatusForSource({ source: 'benefit' }, 'default')).toBe(false)
    expect(isProxyStatusForSource({ source: '限时福利' }, 'benefit')).toBe(true)
    expect(isProxyStatusForSource({ source: 'unknown' }, 'default')).toBe(false)
  })
})
