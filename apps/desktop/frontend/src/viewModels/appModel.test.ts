import { describe, expect, it } from 'vitest'
import { RunTaskStatus } from '../../bindings/github.com/hungrym0/SurveyController/apps/desktop/models'
import { createTestConfig, createTestQuestion, createTestQuestionEntry, createTestSettings } from '../test/configFactory'
import type { ProxyStatus, RunTaskState } from '../types'
import { buildAppModel, mapAppViewState } from './appModel'
import { questionTypeLabel } from './dashboard'

const credential = { value: '', operation: 'keep' as const }

describe('appModel', () => {
  it('maps the typed document into feature view models', () => {
    const config = createTestConfig((value) => {
      value.survey.url = 'https://wj.qq.com/s2/123/hash/'
      value.survey.provider = 'qq'
      value.survey.title = '腾讯测试'
      value.survey.definition.provider = 'qq'
      value.survey.definition.title = '腾讯测试'
      value.survey.definition.questions = [createTestQuestion((question) => {
        question.provider = 'qq'
      })]
      value.execution.target = 8
      value.execution.threads = 3
      value.network.randomProxyEnabled = true
      value.network.proxySource = 'custom'
      value.network.customProxyApi = 'https://proxy.example/api'
      value.network.randomUaEnabled = true
      value.network.randomUaRatios = { wechat: 50, mobile: 30, pc: 20 }
      value.reverseFill.enabled = true
      value.answers.questions = [createTestQuestionEntry((entry) => {
        entry.distribution_mode = 'random'
        entry.dimension = '服务'
      })]
      value.answers.dimensions = ['服务']
      value.answers.rules = [{
        condition_question_num: 1,
        condition_mode: 'selected',
        condition_option_indices: [0],
        target_question_num: 1,
        action_mode: 'must_select',
        target_option_indices: [1],
      }]
    })

    const view = mapAppViewState(buildAppModel(createTestSettings(), config), credential)

    expect(view.dashboard).toMatchObject({
      surveyTitle: '腾讯测试',
      platformLabel: '腾讯问卷',
      targetCount: 8,
    })
    expect(view.dashboard.questionRows).toEqual([{ index: 1, type: '单选题', dimension: '服务', strategy: 'random' }])
    expect(view.dimensionGroups).toEqual(['服务'])
    expect(view.strategyRules[0]).toEqual({
      condition: '第 1 题 选中 1',
      action: '必须选择',
      target: '第 1 题 2',
    })
    const runtimeFields = view.runtimeGroups.flatMap((group) => group.fields)
    expect(runtimeFields.some((field) => field.id === 'custom-proxy-api')).toBe(true)
    expect(runtimeFields.some((field) => field.id === 'reverse-fill-enabled')).toBe(false)
    expect(runtimeFields.filter((field) => field.id.startsWith('random-ua-')).map((field) => field.kind)).toEqual([
      'slider',
      'slider',
      'slider',
    ])
    expect(view.dashboard.quickActions.map((item) => item.label)).toEqual(['解析问卷', '导入配置', '保存配置', '高级参数'])
  })

  it('maps paused run state into dashboard status', () => {
    const runState: RunTaskState = {
      status: RunTaskStatus.RunTaskStatusPaused,
      pauseReason: '风控',
      nextSequence: 0,
      droppedEvents: 0,
    }
    const view = mapAppViewState(
      buildAppModel(createTestSettings(), createTestConfig()),
      credential,
      runState,
    )

    expect(view.dashboard.statusText).toBe('已暂停：风控')
  })

  it('maps proxy quota details without storing them in the config document', () => {
    const proxy: ProxyStatus = {
      available: 2,
      inUse: 1,
      userId: 73952,
      userKnown: true,
      poolRemainingIp: 75772,
      poolRemainingKnown: true,
      remainingQuota: '8',
      totalQuota: '10',
      quotaKnown: true,
      randomIpEnabled: true,
      source: 'default',
      message: '额度兑换成功',
      quota: { RemainingQuota: 8, TotalQuota: 10, UsedQuota: 2, QuotaKnown: true },
    }
    const config = createTestConfig((value) => {
      value.network.randomProxyEnabled = true
      value.network.randomUaEnabled = true
    })
    const view = mapAppViewState(buildAppModel(createTestSettings(), config), credential, null, proxy)

    expect(view.dashboard).toMatchObject({
      randomIpQuotaLabel: '额度兑换成功',
      proxyAvailable: 2,
      proxyInUse: 1,
      proxyUserId: 73952,
      proxyPoolRemainingIp: 75772,
      runtimeHint: '随机 UA 已开启',
    })
    expect(JSON.stringify(config)).not.toContain('remainingQuota')
  })

  it('keeps app-owned metadata outside the core document', () => {
    const model = buildAppModel(createTestSettings(), createTestConfig(), '', false, '5.0.0')
    const view = mapAppViewState(model, credential)

    expect(view.appTitle).toBe('SurveyController')
    expect(view.appVersion).toBe('5.0.0')
    expect(view.aboutItems.length).toBeGreaterThan(0)
    expect(view.donateItems.length).toBeGreaterThan(0)
  })

  it('labels provider question types without dynamic casts', () => {
    expect(questionTypeLabel({ provider_type: 'matrix', type_code: '' })).toBe('矩阵题')
    expect(questionTypeLabel({ provider_type: '', type_code: '7' })).toBe('下拉题')
  })
})
