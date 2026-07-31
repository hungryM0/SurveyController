import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { RunTaskState } from '../../types'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../../test/configFactory'
import { createWizardDraft } from './configWizardModel'
import ConfigurationWorkspace from './ConfigurationWorkspace'
import WizardFrame from './WizardFrame'

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

function renderRunFrame(status: RunTaskState['status']) {
  return renderToStaticMarkup(
    <WizardFrame
      draft={createWizardDraft(initialConfig, createTestSettings())}
      step="run"
      parsed
      highestStepIndex={5}
      busy={false}
      error=""
      statusMessage=""
      confirmDismiss={false}
      onURLChange={vi.fn()}
      onDecodeQRCode={vi.fn()}
      onImport={vi.fn()}
      onChange={vi.fn()}
      onStepSelect={vi.fn()}
      onBack={vi.fn()}
      onPrimary={vi.fn()}
      onRequestDismiss={vi.fn()}
      onDismiss={vi.fn()}
      onContinueEditing={vi.fn()}
      runTaskState={{ status, nextSequence: 1, droppedEvents: 0 }}
      onStartRun={vi.fn()}
      onPauseRun={vi.fn()}
      onResumeRun={vi.fn()}
      onStopRun={vi.fn()}
      onExportResult={vi.fn()}
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
    expect(html).toContain('第 2 步：答案')
    expect(html).toContain('第 3 步：任务')
    expect(html).toContain('第 6 步：运行')
    expect(html).toContain('aria-current="step"')
    expect(html).not.toContain('config-wizard-backdrop')
    expect(html).not.toContain('role="dialog"')
  })

  it('resumes a complete task at the final review step', () => {
    const html = renderWorkspace(true)

    expect(html).toContain('检查配置')
    expect(html).toContain('5 / 6')
    expect(html).toContain('保存并完成')
  })

  it.each([
    ['running', '运行中'],
    ['paused', '已暂停'],
    ['canceling', '正在停止'],
  ] as const)('does not offer a second start from the footer while %s', (status, label) => {
    const html = renderRunFrame(status as RunTaskState['status'])
    const footer = html.slice(html.indexOf('config-wizard-footer-actions'))

    expect(footer).toContain(label)
    expect(footer).toContain('disabled=""')
    expect(footer).not.toContain('启动任务')
  })
})
