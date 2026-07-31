import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import WizardProgress, { getCompactWizardSteps } from './WizardProgress'

describe('WizardProgress', () => {
  it('keeps later steps disabled until the parsed survey prerequisite is reached', () => {
    const html = renderToStaticMarkup(
      <WizardProgress currentStep="survey" highestStepIndex={0} onStepSelect={vi.fn()} />,
    )

    expect(html).toContain('第 1 步：问卷')
    expect(html).toContain('第 6 步：运行')
    expect(html).toContain('第 1 / 6 步 · 问卷')
    expect(html).toContain('aria-label="1. 问卷"')
    expect(html).toContain('class="config-wizard-progress-compact-line"')
    expect(html).toContain('role="combobox"')
    expect(html).toContain('class="sc-select-trigger"')
    expect(html).toContain('class="sc-select-icon"')
    expect(html).toContain('aria-autocomplete="none"')
    expect(html).not.toContain('<option')
    expect((html.match(/<button[^>]*disabled=""/g) ?? []).length).toBe(6)
    expect(getCompactWizardSteps('survey', 0).map((step) => step.id)).toEqual(['survey'])
  })

  it('keeps completed steps available in the compact menu', () => {
    const html = renderToStaticMarkup(
      <WizardProgress currentStep="task" highestStepIndex={3} onStepSelect={vi.fn()} />,
    )

    expect(html).toContain('第 3 / 6 步 · 任务')
    expect(html).toContain('3. 任务')
    expect(getCompactWizardSteps('task', 3).map((step) => step.id)).toEqual(['survey', 'answers', 'task', 'network'])
    expect(getCompactWizardSteps('task', 3).some((step) => step.id === 'review')).toBe(false)
    expect(getCompactWizardSteps('task', 3).some((step) => step.id === 'run')).toBe(false)
    expect(html).toContain('aria-label="第 1 步：问卷"')
    expect(html).toContain('aria-label="第 2 步：答案"')
    expect((html.match(/<button[^>]*disabled=""/g) ?? []).length).toBe(3)
  })
})
