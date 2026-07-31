import { afterEach, describe, expect, it, vi } from 'vitest'
import { RunTaskStatus } from '../../../bindings/github.com/hungrym0/SurveyController/apps/desktop/models'
import { createWizardDraft } from './configWizardModel'
import { isRealSurveyConfig } from './wizardValidation'
import { resolveOpeningProgress } from './useWizardFlow'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../../test/configFactory'

function parsedDraft() {
  return createWizardDraft(createTestConfig((config) => {
    config.survey.url = 'https://www.wjx.cn/vm/example.aspx'
    config.survey.definition.questions = [createTestQuestion()]
    config.answers.questions = [createTestQuestionEntry()]
  }), createTestSettings())
}

describe('wizard opening progress', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('restores a persisted reachable step for the restored draft', () => {
    const storage = {
      getItem: () => JSON.stringify({
        surveyURL: 'https://www.wjx.cn/vm/example.aspx',
        step: 'task',
      }),
    }
    vi.stubGlobal('window', { localStorage: storage })

    expect(resolveOpeningProgress(parsedDraft(), true)).toEqual({
      step: 'task',
      highestStepIndex: 4,
    })
  })

  it('falls back to the first invalid step when a persisted step is no longer reachable', () => {
    const draft = parsedDraft()
    draft.config.execution.threads = 3
    draft.config.execution.target = 2
    const storage = {
      getItem: () => JSON.stringify({
        surveyURL: draft.config.survey.url,
        step: 'review',
      }),
    }
    vi.stubGlobal('window', { localStorage: storage })

    expect(resolveOpeningProgress(draft, true)).toEqual({
      step: 'task',
      highestStepIndex: 2,
    })
  })

  it('reopens the run step when a persisted task is still available', () => {
    vi.stubGlobal('window', { localStorage: { getItem: () => null } })

    expect(resolveOpeningProgress(parsedDraft(), true, {
      status: RunTaskStatus.RunTaskStatusRunning,
      nextSequence: 1,
      droppedEvents: 0,
    })).toEqual({
      step: 'run',
      highestStepIndex: 5,
    })
  })

  it('accepts parser output only when it has a URL and a non-description question', () => {
    const descriptionOnly = parsedDraft()
    descriptionOnly.config.survey.definition.questions![0].is_description = true
    expect(isRealSurveyConfig(descriptionOnly.config)).toBe(false)

    const missingURL = parsedDraft()
    missingURL.config.survey.url = ''
    expect(isRealSurveyConfig(missingURL.config)).toBe(false)

    expect(isRealSurveyConfig(parsedDraft().config)).toBe(true)
    expect(resolveOpeningProgress(descriptionOnly, true).step).toBe('survey')
  })
})
