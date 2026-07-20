import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RuntimeConfig } from '../../types'
import ConfigurationWizard from './ConfigurationWizard'

const initialConfig: RuntimeConfig = {
  url: 'https://www.wjx.cn/vm/example.aspx',
  survey_title: '产品体验问卷',
  survey_provider: 'wjx',
  target: 20,
  threads: 2,
  questions_info: [{
    num: 1,
    title: '满意度',
    description: '',
    type_code: 'single',
    options: 5,
    rows: 0,
    row_texts: [],
    option_texts: [],
    provider: 'wjx',
    provider_type: 'single',
    is_description: false,
    is_text_like: false,
    text_inputs: 0,
  }],
}

function renderWizard(open: boolean) {
  return renderToStaticMarkup(
    <ConfigurationWizard
      open={open}
      initialConfig={initialConfig}
      onDismiss={vi.fn()}
      onParseSurvey={vi.fn(async () => initialConfig)}
      onDecodeQRCode={vi.fn(async () => null)}
      onImportConfig={vi.fn(async () => null)}
      onSave={vi.fn(async (config) => config)}
    />,
  )
}

describe('ConfigurationWizard', () => {
  it('does not render while closed', () => {
    expect(renderWizard(false)).toBe('')
  })

  it('renders the survey step with reachable actions', () => {
    const html = renderWizard(true)

    expect(html).toContain('配置向导')
    expect(html).toContain('添加要填写的问卷')
    expect(html).toContain('产品体验问卷')
    expect(html).toContain('识别二维码')
    expect(html).toContain('导入已有配置')
    expect(html).toContain('稍后设置')
    expect(html).toContain('>继续<')
    expect(html).toContain('aria-current="step"')
  })

  it('keeps later steps present in the progress navigation but unreachable', () => {
    const html = renderWizard(true)

    expect(html).toContain('任务设置')
    expect(html).toContain('网络设置')
    expect(html).toContain('答案设置')
    expect(html).toContain('检查并完成')
    expect(html).toContain('第 2 步：任务设置')
    expect(html).toContain('disabled=""')
  })
})
