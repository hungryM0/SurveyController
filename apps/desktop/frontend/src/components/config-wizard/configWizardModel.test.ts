import { describe, expect, it } from 'vitest'
import type { RuntimeConfig } from '../../types'
import {
  cloneWizardDraft,
  createWizardDraft,
  isParsedConfig,
  mergeParsedConfig,
  updateWizardURL,
} from './configWizardModel'
import { buildWizardReviewItems } from './wizardReview'
import { validateWizardStep } from './wizardValidation'

const parsedConfig: RuntimeConfig = {
  url: 'https://www.wjx.cn/vm/example.aspx',
  survey_title: '产品体验问卷',
  survey_provider: 'wjx',
  target: 20,
  threads: 3,
  submit_interval: [2, 5],
  answer_duration: [60, 120],
  random_ip_enabled: false,
  proxy_source: 'default',
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
  question_entries: [{ question_type: 'single', probabilities: [20, 20, 20, 20, 20] }],
}

describe('configWizardModel', () => {
  it('creates an isolated draft with wizard defaults', () => {
    const source: RuntimeConfig = {
      ...parsedConfig,
      random_ua_ratios: { wechat: 20, mobile: 30, pc: 50 },
    }
    const draft = createWizardDraft(source)

    draft.random_ua_ratios!.wechat = 99
    draft.questions_info![0].title = '已修改'

    expect(source.random_ua_ratios?.wechat).toBe(20)
    expect(source.questions_info?.[0].title).toBe('满意度')
    expect(draft.fail_stop_enabled).toBe(true)
    expect(draft.ai_mode).toBe('free')
  })

  it('invalidates parser-owned data when URL changes', () => {
    const next = updateWizardURL(parsedConfig, 'https://wj.qq.com/s/example')

    expect(next.url).toBe('https://wj.qq.com/s/example')
    expect(next.survey_title).toBeUndefined()
    expect(next.survey_provider).toBeUndefined()
    expect(next.questions_info).toBeUndefined()
    expect(next.question_entries).toBeUndefined()
    expect(next.target).toBe(20)
    expect(next.threads).toBe(3)
  })

  it('keeps parser-owned data when URL does not change', () => {
    const next = updateWizardURL(parsedConfig, parsedConfig.url)

    expect(next.survey_title).toBe('产品体验问卷')
    expect(next.questions_info).toHaveLength(1)
  })

  it('merges parser output without overwriting wizard settings', () => {
    const current: RuntimeConfig = {
      ...parsedConfig,
      target: 300,
      threads: 12,
      submit_interval: [8, 15],
      answer_duration: [90, 180],
      random_ip_enabled: true,
      proxy_source: 'custom',
      custom_proxy_api: 'https://proxy.example/api',
      ai_mode: 'provider',
      ai_provider: 'custom',
      ai_api_key: 'secret',
    }
    const parserOutput: RuntimeConfig = {
      ...parsedConfig,
      survey_title: '最新标题',
      target: 1,
      threads: 1,
      submit_interval: [0, 0],
      answer_duration: [60, 120],
      random_ip_enabled: false,
      questions_info: [
        ...parsedConfig.questions_info!,
        {
          num: 2,
          title: '建议',
          description: '',
          type_code: 'text',
          options: 0,
          rows: 1,
          row_texts: [],
          option_texts: [],
          provider: 'wjx',
          provider_type: 'text',
          is_description: false,
          is_text_like: true,
          text_inputs: 1,
        },
      ],
    }

    const next = mergeParsedConfig(current, parserOutput)

    expect(next.survey_title).toBe('最新标题')
    expect(next.questions_info).toHaveLength(2)
    expect(next.target).toBe(300)
    expect(next.threads).toBe(12)
    expect(next.submit_interval).toEqual([8, 15])
    expect(next.answer_duration).toEqual([90, 180])
    expect(next.random_ip_enabled).toBe(true)
    expect(next.custom_proxy_api).toBe('https://proxy.example/api')
    expect(next.ai_api_key).toBe('secret')
  })

  it('validates each step and reports actionable messages', () => {
    expect(validateWizardStep('survey', { url: '' }, false)).toEqual({
      valid: false,
      message: '请先输入问卷链接。',
    })
    expect(validateWizardStep('survey', { url: 'not-a-url' }, false).message).toContain('http://')
    expect(validateWizardStep('survey', parsedConfig, true).valid).toBe(true)
    expect(validateWizardStep('task', { ...parsedConfig, threads: 0 }, true).message).toContain('并发数')
    expect(validateWizardStep('network', {
      ...parsedConfig,
      random_ip_enabled: true,
      proxy_source: 'custom',
      custom_proxy_api: '',
    }, true).message).toContain('代理 API')
    expect(validateWizardStep('answers', { ...parsedConfig, answer_duration: [0, 60] }, true).message).toContain('作答时长')
    expect(validateWizardStep('answers', {
      ...parsedConfig,
      ai_mode: 'provider',
      ai_provider: 'custom',
      ai_api_key: '',
    }, true).message).toContain('API 密钥')
    expect(validateWizardStep('answers', {
      ...parsedConfig,
      reverse_fill_enabled: true,
      reverse_fill_source_path: '',
    }, true).message).toContain('数据文件')
  })

  it('recognizes parsed data and builds a compact review', () => {
    expect(isParsedConfig({ url: parsedConfig.url })).toBe(false)
    expect(isParsedConfig(parsedConfig)).toBe(true)

    const review = buildWizardReviewItems(parsedConfig)
    expect(review).toContainEqual({ label: '问卷', value: '产品体验问卷' })
    expect(review).toContainEqual({ label: '题目', value: '1 题' })
    expect(review).toContainEqual({ label: '网络', value: '直连' })
    expect(buildWizardReviewItems({ ...parsedConfig, reverse_fill_enabled: true })).toContainEqual({
      label: '答案来源',
      value: 'Excel 反填',
    })
  })

  it('clones imported configuration before handing it to the wizard', () => {
    const cloned = cloneWizardDraft(parsedConfig)
    expect(cloned).toEqual(parsedConfig)
    expect(cloned).not.toBe(parsedConfig)
    expect(cloned.questions_info).not.toBe(parsedConfig.questions_info)
  })
})
