import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createTestConfig, createTestSettings } from '../test/configFactory'
import { mapRuntimeGroups } from '../viewModels/runtime'
import RuntimeView from './RuntimeView'

vi.mock('../services/shell', () => ({
  loadProxyAreaOptions: vi.fn(async () => ({
    source: 'default',
    hasAll: true,
    provinces: [{ code: '110000', name: '北京市', cities: [{ code: '110100', name: '市辖区' }] }],
  })),
  testCustomProxyAPI: vi.fn(async () => ({ success: true, message: '检测通过', proxies: ['1.2.3.4:9000'] })),
}))

const credential = { value: '', operation: 'keep' as const }

function runtimeGroups(configure?: Parameters<typeof createTestConfig>[0], configureSettings?: Parameters<typeof createTestSettings>[0]) {
  return mapRuntimeGroups(createTestConfig(configure), createTestSettings(configureSettings), credential)
}

function renderRuntime(groups: ReturnType<typeof runtimeGroups>) {
  return renderToStaticMarkup(
    <RuntimeView
      groups={groups}
      onFieldChange={() => undefined}
      onTestAIConnection={async () => ({ success: true, message: '连接成功' })}
    />,
  )
}

describe('RuntimeView data mapping', () => {
  it('exposes answer datetime window field', () => {
    const groups = runtimeGroups((config) => {
      config.execution.answerDatetimeWindow = ['2024-03-10 09:00:00', '2024-03-10 10:00:00']
    })
    const field = groups.flatMap((group) => group.fields).find((item) => item.id === 'answer-datetime-window')
    expect(field?.kind).toBe('datetime-window')
    expect(field?.value).toBe('2024-03-10 09:00:00 | 2024-03-10 10:00:00')
  })

  it('renders proxy area as province and city selectors', () => {
    const html = renderRuntime(runtimeGroups((config) => {
      config.network.randomProxyEnabled = true
      config.network.proxyAreaCode = '110100'
    }))

    expect(html).toContain('指定地区')
    expect(html).not.toContain('选择省份或城市')
  })

  it('renders Fluent datetime triggers without the native disclosure control', () => {
    const html = renderRuntime(runtimeGroups((config) => {
      config.execution.answerDatetimeWindow = ['2024-03-10 09:00:00', '2024-03-10 10:00:00']
    }))

    expect(html).toContain('开始时间')
    expect(html).toContain('结束时间')
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('2024年03月10日 09:00')
    expect(html).not.toContain('选择提交时间范围')
  })

  it('renders custom proxy API detector', () => {
    const html = renderRuntime(runtimeGroups((config) => {
      config.network.proxySource = 'custom'
      config.network.customProxyApi = 'https://proxy.example/api'
    }))

    expect(html).toContain('自定义代理 API')
    expect(html).toContain('检测')
    expect(html).not.toContain('仅支持 JSON 或纯文本返回代理地址')
  })

  it('keeps reverse fill controls on the reverse fill page', () => {
    const html = renderRuntime(runtimeGroups((config) => {
      config.reverseFill.enabled = true
      config.reverseFill.sourcePath = 'D:/answers.xlsx'
    }))

    expect(html).not.toContain('Excel 反填')
    expect(html).not.toContain('反填文件')
    expect(html).not.toContain('反填并发')
  })

  it('renders provider AI controls with test action and prompt editor', () => {
    const html = renderRuntime(runtimeGroups(undefined, (settings) => {
      settings.aiProfile.mode = 'provider'
      settings.aiProfile.provider = 'custom'
      settings.aiProfile.baseURL = 'https://ai.example/v1'
      settings.aiProfile.apiProtocol = 'responses'
      settings.aiProfile.model = 'demo-model'
      settings.aiProfile.hasAPIKey = true
    }))

    expect(html).toContain('隐私声明')
    expect(html).toContain('OpenAI 兼容')
    expect(html).toContain('测试 AI 连接')
    expect(html).toContain('系统提示词')
    expect(html).toContain('textarea')
  })
})
