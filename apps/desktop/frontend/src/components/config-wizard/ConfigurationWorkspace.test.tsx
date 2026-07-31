import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../../test/configFactory'
import { createWizardDraft } from './configWizardModel'
import ConfigurationWorkspace from './ConfigurationWorkspace'

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

function renderWorkspace(open: boolean, config = initialConfig) {
  return renderToStaticMarkup(
    <ConfigurationWorkspace
      open={open}
      initialDraft={createWizardDraft(config, createTestSettings())}
      onDismiss={vi.fn()}
      onParseSurvey={vi.fn(async () => initialConfig)}
      onDecodeQRCode={vi.fn(async () => null)}
      onImportConfig={vi.fn(async () => null)}
      onSave={vi.fn(async (draft) => draft)}
    />,
  )
}

describe('ConfigurationWorkspace', () => {
  it('does not render while closed', () => {
    expect(renderWorkspace(false)).toBe('')
  })

  it('renders the first survey step and the full journey', () => {
    const html = renderWorkspace(true, createTestConfig())

    expect(html).toContain('class="config-wizard-workspace surface"')
    expect(html).toContain('配置任务')
    expect(html).toContain('添加要填写的问卷')
    expect(html).toContain('识别二维码')
    expect(html).toContain('导入已有配置')
    expect(html).toContain('稍后设置')
    expect(html).toContain('第 2 步：答案设置')
    expect(html).toContain('第 3 步：任务设置')
    expect(html).toContain('检查并完成')
    expect(html).toContain('aria-current="step"')
    expect(html).not.toContain('config-wizard-backdrop')
    expect(html).not.toContain('role="dialog"')
  })

  it('resumes a complete task at the final review step', () => {
    const html = renderWorkspace(true)

    expect(html).toContain('检查配置')
    expect(html).toContain('5 / 5')
    expect(html).toContain('保存并完成')
  })
})
