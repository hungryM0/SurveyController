import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../../test/configFactory'
import { createWizardDraft } from './configWizardModel'
import ConfigurationWizard from './ConfigurationWizard'

const initialConfig = createTestConfig((config) => {
  config.survey.url = 'https://www.wjx.cn/vm/example.aspx'
  config.survey.title = '产品体验问卷'
  config.survey.definition.title = '产品体验问卷'
  config.survey.definition.questions = [createTestQuestion((question) => {
    question.title = '满意度'
    question.options = 5
  })]
  config.answers.questions = [createTestQuestionEntry((entry) => {
    entry.probabilities = { options: [20, 20, 20, 20, 20] }
  })]
  config.execution.target = 20
  config.execution.threads = 2
})

function renderWizard(open: boolean) {
  return renderToStaticMarkup(
    <ConfigurationWizard
      open={open}
      initialDraft={createWizardDraft(initialConfig, createTestSettings())}
      onDismiss={vi.fn()}
      onParseSurvey={vi.fn(async () => initialConfig)}
      onDecodeQRCode={vi.fn(async () => null)}
      onImportConfig={vi.fn(async () => null)}
      onSave={vi.fn(async (draft) => draft)}
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
