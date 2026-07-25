import { describe, expect, it } from 'vitest'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../../test/configFactory'
import {
  cloneWizardDraft,
  createWizardDraft,
  isParsedConfig,
  mergeParsedConfig,
  updateWizardURL,
  type WizardDraft,
} from './configWizardModel'
import { buildWizardReviewItems } from './wizardReview'
import { validateWizardStep } from './wizardValidation'

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

    const invalidNetwork = parsedDraft()
    invalidNetwork.config.network.randomProxyEnabled = true
    invalidNetwork.config.network.proxySource = 'custom'
    invalidNetwork.config.network.customProxyApi = ''
    expect(validateWizardStep('network', invalidNetwork).message).toContain('代理 API')

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

  it('recognizes parsed data and builds a compact review', () => {
    const draft = parsedDraft()
    expect(isParsedConfig(createWizardDraft(createTestConfig((config) => {
      config.survey.url = draft.config.survey.url
    }), createTestSettings()))).toBe(false)
    expect(isParsedConfig(draft)).toBe(true)

    const review = buildWizardReviewItems(draft)
    expect(review).toContainEqual({ label: '问卷', value: '产品体验问卷' })
    expect(review).toContainEqual({ label: '题目', value: '1 题' })
    expect(review).toContainEqual({ label: '网络', value: '直连' })
    draft.config.reverseFill.enabled = true
    expect(buildWizardReviewItems(draft)).toContainEqual({ label: '答案来源', value: 'Excel 反填' })
  })

  it('clones imported configuration before handing it to the wizard', () => {
    const source = parsedDraft()
    const cloned = cloneWizardDraft(source)
    expect(cloned).toEqual(source)
    expect(cloned).not.toBe(source)
    expect(cloned.config.survey.definition.questions).not.toBe(source.config.survey.definition.questions)
  })
})
