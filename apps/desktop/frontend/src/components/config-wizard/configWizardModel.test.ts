import { describe, expect, it } from 'vitest'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../../test/configFactory'
import {
  WIZARD_STEPS,
  cloneWizardDraft,
  createWizardDraft,
  isParsedConfig,
  mergeParsedConfig,
  updateWizardURL,
  type WizardDraft,
} from './configWizardModel'
import { buildWizardReviewItems } from './wizardReview'
import { getAnswerDatetimeWindowError, getTaskValidationErrors, validateWizardStep } from './wizardValidation'

function parsedDraft(): WizardDraft {
  return createWizardDraft(createTestConfig((config) => {
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
    config.execution.threads = 3
    config.execution.submitInterval = [2, 5]
    config.execution.answerDuration = [60, 120]
  }), createTestSettings())
}

describe('configWizardModel', () => {
  it('keeps the user journey in task order', () => {
    expect(WIZARD_STEPS.map((step) => step.id)).toEqual(['survey', 'answers', 'task', 'network', 'review', 'run'])
    expect(WIZARD_STEPS.map((step) => step.title)).toEqual(['问卷', '答案', '任务', '网络', '检查', '运行'])
  })

  it('creates an isolated draft with wizard defaults', () => {
    const source = parsedDraft()
    source.config.network.randomUaRatios = { wechat: 20, mobile: 30, pc: 50 }
    const draft = createWizardDraft(source.config, createTestSettings())

    draft.config.network.randomUaRatios!.wechat = 99
    draft.config.survey.definition.questions![0].title = '已修改'

    expect(source.config.network.randomUaRatios?.wechat).toBe(20)
    expect(source.config.survey.definition.questions?.[0].title).toBe('满意度')
    expect(draft.config.execution.failStop).toBe(true)
    expect(draft.aiProfile.mode).toBe('free')
  })

  it('invalidates parser-owned data when URL changes', () => {
    const current = parsedDraft()
    const next = updateWizardURL(current, 'https://wj.qq.com/s/example')

    expect(next.config.survey.url).toBe('https://wj.qq.com/s/example')
    expect(next.config.survey.title).toBe('')
    expect(next.config.survey.provider).toBe('qq')
    expect(next.config.survey.definition.questions).toEqual([])
    expect(next.config.answers.questions).toEqual([])
    expect(next.config.execution.target).toBe(20)
    expect(next.config.execution.threads).toBe(3)
  })

  it('keeps parser-owned data when URL does not change', () => {
    const current = parsedDraft()
    const next = updateWizardURL(current, current.config.survey.url)

    expect(next.config.survey.title).toBe('产品体验问卷')
    expect(next.config.survey.definition.questions).toHaveLength(1)
  })

  it('merges parser output without overwriting wizard settings or credentials', () => {
    const current = parsedDraft()
    current.config.execution.target = 300
    current.config.execution.threads = 12
    current.config.execution.submitInterval = [8, 15]
    current.config.execution.answerDuration = [90, 180]
    current.config.network.randomProxyEnabled = true
    current.config.network.proxySource = 'custom'
    current.config.network.customProxyApi = 'https://proxy.example/api'
    current.aiProfile.mode = 'provider'
    current.aiProfile.provider = 'custom'
    current.credential = { operation: 'replace', value: 'secret' }

    const parserOutput = createTestConfig((config) => {
      config.survey.url = current.config.survey.url
      config.survey.title = '最新标题'
      config.survey.definition.title = '最新标题'
      config.survey.definition.questions = [
        createTestQuestion(),
        createTestQuestion((question) => {
          question.num = 2
          question.title = '建议'
          question.type_code = 'text'
          question.provider_type = 'text'
          question.options = 0
          question.rows = 1
          question.is_text_like = true
          question.text_inputs = 1
        }),
      ]
    })

    const next = mergeParsedConfig(current, parserOutput)

    expect(next.config.survey.title).toBe('最新标题')
    expect(next.config.survey.definition.questions).toHaveLength(2)
    expect(next.config.execution.target).toBe(300)
    expect(next.config.execution.threads).toBe(12)
    expect(next.config.execution.submitInterval).toEqual([8, 15])
    expect(next.config.execution.answerDuration).toEqual([90, 180])
    expect(next.config.network.randomProxyEnabled).toBe(true)
    expect(next.config.network.customProxyApi).toBe('https://proxy.example/api')
    expect(next.credential.value).toBe('secret')
  })

  it('validates each step and reports actionable messages', () => {
    const empty = createWizardDraft(createTestConfig(), createTestSettings())
    expect(validateWizardStep('survey', empty)).toEqual({ valid: false, message: '请先输入问卷链接。' })

    const malformed = createWizardDraft(createTestConfig((config) => {
      config.survey.url = 'not-a-url'
    }), createTestSettings())
    expect(validateWizardStep('survey', malformed).message).toContain('http://')
    expect(validateWizardStep('survey', parsedDraft()).valid).toBe(true)

    const invalidTask = parsedDraft()
    invalidTask.config.execution.threads = 0
    expect(validateWizardStep('task', invalidTask).message).toContain('并发数')

    const invalidTaskCombination = parsedDraft()
    invalidTaskCombination.config.execution.target = 2
    invalidTaskCombination.config.execution.threads = 3
    invalidTaskCombination.config.execution.submitInterval = [8, 2]
    expect(getTaskValidationErrors(invalidTaskCombination.config)).toEqual({
      threads: '并发数不能大于目标份数。',
      submitInterval: '提交间隔范围无效，请检查起止秒数。',
    })
    expect(validateWizardStep('task', invalidTaskCombination).message).toContain('并发数')

    const invalidDatetimeWindow = parsedDraft()
    invalidDatetimeWindow.config.survey.provider = 'credamo'
    invalidDatetimeWindow.config.survey.definition.provider = 'credamo'
    invalidDatetimeWindow.config.execution.answerDatetimeWindow = ['2024-03-10 10:00:00', '2024-03-10 09:00:00']
    expect(getAnswerDatetimeWindowError(invalidDatetimeWindow.config)).toContain('结束时间')
    expect(validateWizardStep('task', invalidDatetimeWindow).message).toContain('结束时间')

    const invalidNetwork = parsedDraft()
    invalidNetwork.config.network.randomProxyEnabled = true
    invalidNetwork.config.network.proxySource = 'custom'
    invalidNetwork.config.network.customProxyApi = ''
    expect(validateWizardStep('network', invalidNetwork).message).toContain('代理 API')

    const missingFixedProxy = parsedDraft()
    missingFixedProxy.config.network.proxyMode = 'fixed'
    missingFixedProxy.config.network.fixedProxyAddress = ''
    expect(validateWizardStep('network', missingFixedProxy).message).toContain('固定代理')

    const invalidFixedProxy = parsedDraft()
    invalidFixedProxy.config.network.proxyMode = 'fixed'
    invalidFixedProxy.config.network.fixedProxyAddress = 'ftp://proxy.example:8080'
    expect(validateWizardStep('network', invalidFixedProxy).valid).toBe(false)

    const validFixedProxy = parsedDraft()
    validFixedProxy.config.network.proxyMode = 'fixed'
    validFixedProxy.config.network.fixedProxyAddress = 'proxy.example:8080'
    expect(validateWizardStep('network', validFixedProxy).valid).toBe(true)

    const invalidDuration = parsedDraft()
    invalidDuration.config.execution.answerDuration = [0, 60]
    expect(validateWizardStep('answers', invalidDuration).message).toContain('作答时长')

    const invalidCredential = parsedDraft()
    invalidCredential.aiProfile.mode = 'provider'
    invalidCredential.aiProfile.provider = 'custom'
    invalidCredential.aiProfile.baseURL = 'https://ai.example/v1'
    invalidCredential.aiProfile.hasAPIKey = false
    expect(validateWizardStep('answers', invalidCredential).message).toContain('API 密钥')

    const invalidReverseFill = parsedDraft()
    invalidReverseFill.config.reverseFill.enabled = true
    invalidReverseFill.config.reverseFill.sourcePath = ''
    expect(validateWizardStep('answers', invalidReverseFill).message).toContain('数据文件')
  })

  it('requires real questions and matching answer strategies before continuing', () => {
    const descriptionOnly = createWizardDraft(createTestConfig((config) => {
      config.survey.url = 'https://www.wjx.cn/vm/example.aspx'
      config.survey.definition.questions = [createTestQuestion((question) => { question.is_description = true })]
    }), createTestSettings())
    expect(validateWizardStep('survey', descriptionOnly, true).message).toContain('真实可作答题目')

    const missingStrategy = parsedDraft()
    missingStrategy.config.survey.definition.questions = [
      ...(missingStrategy.config.survey.definition.questions ?? []),
      createTestQuestion((question) => { question.num = 2 }),
    ]
    expect(validateWizardStep('answers', missingStrategy).message).toContain('每道可作答题目')

    const mismatchedStrategy = parsedDraft()
    mismatchedStrategy.config.survey.definition.questions![0].num = 2
    expect(validateWizardStep('answers', mismatchedStrategy).valid).toBe(false)

    const covered = parsedDraft()
    covered.config.survey.definition.questions = [
      ...(covered.config.survey.definition.questions ?? []),
      createTestQuestion((question) => { question.num = 2 }),
    ]
    covered.config.answers.questions = [
      ...(covered.config.answers.questions ?? []),
      createTestQuestionEntry((entry) => { entry.question_num = 2 }),
    ]
    expect(validateWizardStep('answers', covered).valid).toBe(true)
  })

  it('recognizes parsed data and builds a compact review', () => {
    const draft = parsedDraft()
    expect(isParsedConfig(createWizardDraft(createTestConfig((config) => {
      config.survey.url = draft.config.survey.url
    }), createTestSettings()))).toBe(false)
    expect(isParsedConfig(createWizardDraft(createTestConfig((config) => {
      config.survey.url = draft.config.survey.url
      config.answers.questions = [createTestQuestionEntry()]
    }), createTestSettings()))).toBe(false)
    expect(isParsedConfig(draft)).toBe(true)

    const review = buildWizardReviewItems(draft)
    expect(review).toContainEqual({ label: '问卷', value: '产品体验问卷' })
    expect(review).toContainEqual({ label: '题目', value: '1 题' })
    expect(review).toContainEqual({ label: '网络', value: '直连' })
    draft.config.reverseFill.enabled = true
    expect(buildWizardReviewItems(draft)).toContainEqual({ label: '答案来源', value: 'Excel 反填' })
  })

  it('does not derive a question count from stale answer strategies', () => {
    const draft = createWizardDraft(createTestConfig((config) => {
      config.survey.url = 'https://www.wjx.cn/vm/example.aspx'
      config.answers.questions = [createTestQuestionEntry()]
    }), createTestSettings())

    expect(buildWizardReviewItems(draft)).toContainEqual({ label: '题目', value: '0 题' })
  })

  it('clones imported configuration before handing it to the wizard', () => {
    const source = parsedDraft()
    const cloned = cloneWizardDraft(source)
    expect(cloned).toEqual(source)
    expect(cloned).not.toBe(source)
    expect(cloned.config.survey.definition.questions).not.toBe(source.config.survey.definition.questions)
  })
})
