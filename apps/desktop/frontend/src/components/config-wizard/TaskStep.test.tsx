import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createWizardDraft } from './configWizardModel'
import TaskStep from './TaskStep'
import { createTestConfig, createTestSettings } from '../../test/configFactory'

describe('TaskStep', () => {
  it('exposes the configured task fields and time window', () => {
    const html = renderToStaticMarkup(
      <TaskStep
        draft={createWizardDraft(createTestConfig(), createTestSettings())}
        busy={false}
        onChange={vi.fn()}
      />,
    )

    expect(html).toContain('目标份数')
    expect(html).toContain('并发数')
    expect(html).toContain('提交间隔')
    expect(html).toContain('时间窗口')
    expect(html).toContain('开始时间')
    expect(html).toContain('结束时间')
  })

  it('shows task errors before the user tries to continue', () => {
    const config = createTestConfig((value) => {
      value.execution.target = 2
      value.execution.threads = 3
      value.execution.submitInterval = [8, 2]
    })
    const draft = createWizardDraft(config, createTestSettings())
    draft.config.execution.submitInterval = [8, 2]
    const html = renderToStaticMarkup(
      <TaskStep
        draft={draft}
        busy={false}
        onChange={vi.fn()}
      />,
    )

    expect(html).toContain('并发数不能大于目标份数。')
    expect(html).toContain('提交间隔范围无效，请检查起止秒数。')
    expect(html).toContain('aria-invalid="true"')
  })

  it('shows a Credamo time-window error in the task step', () => {
    const config = createTestConfig((value) => {
      value.survey.provider = 'credamo'
      value.survey.definition.provider = 'credamo'
      value.execution.answerDatetimeWindow = ['2024-03-10 10:00:00', '2024-03-10 09:00:00']
    })
    const html = renderToStaticMarkup(
      <TaskStep
        draft={createWizardDraft(config, createTestSettings())}
        busy={false}
        onChange={vi.fn()}
      />,
    )

    expect(html).toContain('结束时间必须晚于开始时间。')
  })
})
