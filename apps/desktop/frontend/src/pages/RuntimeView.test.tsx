import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { applyConfigToShell, normalizeRuntimeConfig } from '../services/stateMapper'
import { emptyShellState } from '../services/shellFixture'
import RuntimeView from './RuntimeView'
import type { AppSettings } from '../types'

vi.mock('../services/shell', () => ({
  loadProxyAreaOptions: vi.fn(async () => ({
    source: 'default',
    hasAll: true,
    provinces: [{ code: '110000', name: '北京市', cities: [{ code: '110100', name: '市辖区' }] }],
  })),
  testAIConnection: vi.fn(async () => ({ success: true, message: '连接成功' })),
  testCustomProxyAPI: vi.fn(async () => ({ success: true, message: '检测通过', proxies: ['1.2.3.4:9000'] })),
}))

const settings: AppSettings = {
  configDirectory: 'D:/configs',
  themeMode: 'system',
  showNavigationText: true,
  micaEnabled: true,
  topmost: false,
  notifications: true,
  autosaveLogCount: 5,
}

describe('RuntimeView data mapping', () => {
  it('exposes answer datetime window field', () => {
    const shell = applyConfigToShell(
      emptyShellState,
      settings,
      normalizeRuntimeConfig({
        url: 'https://www.wjx.cn/vm/demo.aspx',
        answer_datetime_window: ['2024-03-10 09:00:00', '2024-03-10 10:00:00'],
      }),
      null,
    )
    const field = shell.runtimeGroups.flatMap((group) => group.fields).find((item) => item.id === 'answer-datetime-window')
    expect(field?.kind).toBe('datetime-window')
    expect(field?.value).toBe('2024-03-10 09:00:00 | 2024-03-10 10:00:00')
  })

  it('renders proxy area as province and city selectors', () => {
    const shell = applyConfigToShell(
      emptyShellState,
      settings,
      normalizeRuntimeConfig({
        url: 'https://www.wjx.cn/vm/demo.aspx',
        random_ip_enabled: true,
        proxy_area_code: '110100',
      }),
      null,
    )

    const html = renderToStaticMarkup(<RuntimeView groups={shell.runtimeGroups} onFieldChange={() => undefined} />)

    expect(html).toContain('指定地区')
    expect(html).toContain('选择省份或城市')
  })

  it('renders datetime inputs without a disclosure control', () => {
    const shell = applyConfigToShell(
      emptyShellState,
      settings,
      normalizeRuntimeConfig({
        url: 'https://www.wjx.cn/vm/demo.aspx',
        answer_datetime_window: ['2024-03-10 09:00:00', '2024-03-10 10:00:00'],
      }),
      null,
    )

    const html = renderToStaticMarkup(<RuntimeView groups={shell.runtimeGroups} onFieldChange={() => undefined} />)

    expect(html).toContain('开始时间')
    expect(html).toContain('结束时间')
    expect(html).toContain('type="datetime-local"')
    expect(html).not.toContain('选择提交时间范围')
  })

  it('renders custom proxy API detector', () => {
    const shell = applyConfigToShell(
      emptyShellState,
      settings,
      normalizeRuntimeConfig({
        url: 'https://www.wjx.cn/vm/demo.aspx',
        proxy_source: 'custom',
        custom_proxy_api: 'https://proxy.example/api',
      }),
      null,
    )

    const html = renderToStaticMarkup(<RuntimeView groups={shell.runtimeGroups} onFieldChange={() => undefined} />)

    expect(html).toContain('自定义代理 API')
    expect(html).toContain('检测')
    expect(html).toContain('仅支持 JSON 或纯文本返回代理地址')
  })

  it('keeps reverse fill controls on the reverse fill page', () => {
    const config = normalizeRuntimeConfig({
      url: 'https://www.wjx.cn/vm/demo.aspx',
      reverse_fill_enabled: true,
      reverse_fill_source_path: 'D:/answers.xlsx',
    })
    const shell = applyConfigToShell(emptyShellState, settings, config, null)
    const html = renderToStaticMarkup(<RuntimeView groups={shell.runtimeGroups} config={config} onFieldChange={() => undefined} />)

    expect(html).not.toContain('Excel 反填')
    expect(html).not.toContain('反填文件')
    expect(html).not.toContain('反填并发')
  })

  it('renders provider AI controls with test action and prompt editor', () => {
    const config = normalizeRuntimeConfig({
      url: 'https://www.wjx.cn/vm/demo.aspx',
      ai_mode: 'provider',
      ai_provider: 'custom',
      ai_api_key: 'sk-test',
      ai_base_url: 'https://ai.example/v1',
      ai_api_protocol: 'responses',
      ai_model: 'demo-model',
    })
    const shell = applyConfigToShell(emptyShellState, settings, config, null)

    const html = renderToStaticMarkup(<RuntimeView groups={shell.runtimeGroups} config={config} onFieldChange={() => undefined} />)

    expect(html).toContain('隐私声明')
    expect(html).toContain('OpenAI 兼容')
    expect(html).toContain('测试 AI 连接')
    expect(html).toContain('系统提示词')
    expect(html).toContain('textarea')
  })
})
