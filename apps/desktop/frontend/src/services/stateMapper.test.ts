import { describe, expect, it } from 'vitest'
import { emptyShellState } from './shellFixture'
import {
  applyConfigToShell,
  normalizeRuntimeConfig,
  questionTypeLabel,
  syncRuntimeDefaultsFromConfig,
  updateAppSettingsField,
  updateRuntimeConfigField,
} from './stateMapper'
import type { AppSettings, RuntimeConfig } from '../types'

const settings: AppSettings = {
  configDirectory: 'D:/configs',
  themeMode: 'system',
  showNavigationText: true,
  micaEnabled: true,
  topmost: false,
  notifications: true,
  autosaveLogCount: 5,
}

const baseConfig: RuntimeConfig = {
  url: 'https://www.wjx.cn/vm/demo.aspx',
  survey_title: '示例问卷',
  target: 3,
  threads: 2,
}

describe('stateMapper', () => {
  it('maps runtime config into dashboard and runtime groups', () => {
    const config: RuntimeConfig = {
      url: 'https://wj.qq.com/s2/123/hash/',
      survey_title: '腾讯测试',
      survey_provider: 'qq',
      target: 8,
      threads: 3,
      random_ip_enabled: true,
      proxy_source: 'custom',
      custom_proxy_api: 'https://proxy.example/api',
      random_ua_enabled: true,
      random_ua_ratios: { wechat: 50, mobile: 30, pc: 20 },
      reverse_fill_enabled: true,
      questions_info: [
        {
          num: 1,
          title: '单选',
          description: '',
          type_code: '3',
          options: 2,
          rows: 0,
          row_texts: [],
          option_texts: ['A', 'B'],
          provider: 'qq',
          provider_type: 'single',
          is_description: false,
          is_text_like: false,
          text_inputs: 0,
        },
      ],
      question_entries: [{ question_type: 'single', probabilities: [1, 1], question_num: 1, distribution_mode: 'random', dimension: '服务' }],
      answer_rules: [{
        condition_question_num: 1,
        condition_mode: 'selected',
        condition_option_indices: [0],
        target_question_num: 1,
        action_mode: 'must_select',
        target_option_indices: [1],
      }],
    }

    const shell = applyConfigToShell(emptyShellState, settings, config, null)

    expect(shell.dashboard.surveyTitle).toBe('腾讯测试')
    expect(shell.dashboard.platformLabel).toBe('腾讯问卷')
    expect(shell.dashboard.targetCount).toBe(8)
    expect(shell.dashboard.questionRows).toEqual([{ index: 1, type: '单选题', dimension: '服务', strategy: 'random' }])
    expect(shell.dimensionGroups).toEqual(['服务'])
    expect(shell.strategyRules[0]).toEqual({
      condition: '第 1 题 选中 1',
      action: '必须选择',
      target: '第 1 题 2',
    })
    expect(shell.runtimeGroups.some((group) => group.fields.some((field) => field.id === 'custom-proxy-api'))).toBe(true)
    expect(shell.runtimeGroups.some((group) => group.fields.some((field) => field.id === 'proxy-area-code'))).toBe(true)
    expect(shell.runtimeGroups.some((group) => group.fields.some((field) => field.id === 'reverse-fill-enabled'))).toBe(false)
    expect(shell.runtimeGroups.some((group) => group.fields.some((field) => field.id === 'ai-api-key'))).toBe(true)
    expect(shell.runtimeGroups.some((group) => group.fields.some((field) => field.id === 'ai-api-protocol'))).toBe(true)
    expect(shell.runtimeGroups.some((group) => group.fields.some((field) => field.id === 'ai-test-connection'))).toBe(true)
    expect(shell.runtimeGroups.flatMap((group) => group.fields).find((field) => field.id === 'ai-mode')?.value).toBe('限时免费')
    expect(shell.runtimeGroups.flatMap((group) => group.fields).filter((field) => field.id.startsWith('random-ua-')).map((field) => field.id)).toEqual([
      'random-ua-wechat',
      'random-ua-mobile',
      'random-ua-pc',
    ])
    expect(shell.runtimeGroups.flatMap((group) => group.fields).filter((field) => field.id.startsWith('random-ua-')).map((field) => field.kind)).toEqual([
      'slider',
      'slider',
      'slider',
    ])
    expect(shell.runtimeGroups.flatMap((group) => group.fields).find((field) => field.id === 'answer-datetime-window')?.kind).toBe('datetime-window')
  })

  it('normalizes missing runtime values', () => {
    const config = normalizeRuntimeConfig({ url: 'https://www.wjx.cn/vm/demo.aspx', target: -1, threads: 0 })

    expect(config.survey_provider).toBe('wjx')
    expect(config.target).toBe(1)
    expect(config.threads).toBe(1)
    expect(config.reverse_fill_threads).toBe(1)
  })

  it('maps paused run state into dashboard status', () => {
    const shell = applyConfigToShell(
      emptyShellState,
      settings,
      normalizeRuntimeConfig({ url: 'https://www.wjx.cn/vm/demo.aspx', target: 3, threads: 1 }),
      null,
      { running: true, canceling: false, paused: true, pauseReason: '风控' },
    )

    expect(shell.dashboard.statusText).toBe('已暂停：风控')
  })

  it('maps proxy status into dashboard quota details', () => {
    const shell = applyConfigToShell(
      emptyShellState,
      settings,
      normalizeRuntimeConfig({ url: 'https://www.wjx.cn/vm/demo.aspx', target: 3, threads: 1, random_ip_enabled: true, random_ua_enabled: true }),
      null,
      null,
      {
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
      },
    )

    expect(shell.dashboard.randomIpQuotaLabel).toBe('额度兑换成功')
    expect(shell.dashboard.randomIpStatus).toBe('额度兑换成功')
    expect(shell.dashboard.proxyAvailable).toBe(2)
    expect(shell.dashboard.proxyInUse).toBe(1)
    expect(shell.dashboard.proxyUserId).toBe(73952)
    expect(shell.dashboard.proxyUserKnown).toBe(true)
    expect(shell.dashboard.proxyPoolRemainingIp).toBe(75772)
    expect(shell.dashboard.proxyPoolRemainingKnown).toBe(true)
    expect(shell.dashboard.runtimeHint).toBe('随机 UA 已开启')
    expect(shell.dashboard.quickActions).toHaveLength(4)
  })

  it('updates runtime fields from editable controls', () => {
    let config = normalizeRuntimeConfig({ url: '', target: 1, threads: 1 })

    config = updateRuntimeConfigField(config, 'target', '12')
    config = updateRuntimeConfigField(config, 'threads', '4')
    config = updateRuntimeConfigField(config, 'random-ip', true)
    config = updateRuntimeConfigField(config, 'proxy-source', '自定义')
    config = updateRuntimeConfigField(config, 'proxy-area-code', '110100')
    config = updateRuntimeConfigField(config, 'custom-proxy-api', 'https://proxy.example/api')
    config = updateRuntimeConfigField(config, 'random-ua', true)
    config = updateRuntimeConfigField(config, 'random-ua-wechat', '60')
    config = updateRuntimeConfigField(config, 'interval', '2-5')
    config = updateRuntimeConfigField(config, 'answer-duration', '45-90')
    config = updateRuntimeConfigField(config, 'ai-mode', '自定义服务商')
    config = updateRuntimeConfigField(config, 'ai-provider', 'OpenAI 兼容')
    config = updateRuntimeConfigField(config, 'ai-api-key', 'sk-test')
    config = updateRuntimeConfigField(config, 'ai-api-protocol', 'responses')
    config = updateRuntimeConfigField(config, 'reliability-mode', false)
    config = updateRuntimeConfigField(config, 'psycho-target-alpha', '0.9')
    config = updateRuntimeConfigField(config, 'answer-datetime-window', '2024-03-10 09:00:00 | 2024-03-10 10:00:00')

    expect(config.target).toBe(12)
    expect(config.threads).toBe(4)
    expect(config.random_ip_enabled).toBe(true)
    expect(config.proxy_source).toBe('custom')
    expect(config.proxy_area_code).toBe('110100')
    expect(config.custom_proxy_api).toBe('https://proxy.example/api')
    expect(config.random_ua_enabled).toBe(true)
    expect(config.random_ua_ratios).toEqual({ wechat: 60, mobile: 6, pc: 34 })
    expect(config.submit_interval).toEqual([2, 5])
    expect(config.answer_duration).toEqual([45, 90])
    expect(config.ai_mode).toBe('provider')
    expect(config.ai_provider).toBe('custom')
    expect(config.ai_api_key).toBe('sk-test')
    expect(config.ai_api_protocol).toBe('responses')
    expect(config.reliability_mode_enabled).toBe(false)
    expect(config.psycho_target_alpha).toBe(0.9)
    expect(config.answer_datetime_window).toEqual(['2024-03-10 09:00:00', '2024-03-10 10:00:00'])

    config = updateRuntimeConfigField(config, 'proxy-area-code', 'bad')
    expect(config.proxy_area_code).toBeNull()
  })

  it('updates persisted app settings fields', () => {
    let next = updateAppSettingsField(settings, 'autosave', '10')
    next = updateAppSettingsField(next, 'ask-save-on-close', false)
    next = updateAppSettingsField(next, 'prevent-sleep', false)
    next = updateAppSettingsField(next, 'task-result-notification', false)
    next = updateAppSettingsField(next, 'submission-report-telemetry', false)
    next = updateAppSettingsField(next, 'auto-update', false)
    next = updateAppSettingsField(next, 'auto-save-logs', false)

    expect(next.autosaveLogCount).toBe(10)
    expect(next.askSaveOnClose).toBe(false)
    expect(next.preventSleepDuringRun).toBe(false)
    expect(next.taskResultNotification).toBe(false)
    expect(next.notifications).toBe(false)
    expect(next.submissionReportTelemetry).toBe(false)
    expect(next.autoCheckUpdate).toBe(false)
    expect(next.autoSaveLogs).toBe(false)
    expect(updateAppSettingsField(next, 'nav-text', false).showNavigationText).toBe(false)
  })

  it('syncs AI runtime defaults from runtime config changes', () => {
    const config = normalizeRuntimeConfig({
      url: '',
      ai_mode: 'provider',
      ai_provider: 'custom',
      ai_api_key: 'sk-local',
      ai_base_url: 'https://ai.example/v1',
      ai_api_protocol: 'responses',
      ai_model: 'demo-model',
      ai_system_prompt: '自定义提示词',
    })

    const ignored = syncRuntimeDefaultsFromConfig(settings, config, 'threads')
    expect(ignored.runtimeDefaults).toBeUndefined()

    const next = syncRuntimeDefaultsFromConfig(settings, config, 'ai-api-key')
    expect(next.runtimeDefaults).toMatchObject({
      ai_mode: 'provider',
      ai_provider: 'custom',
      ai_api_key: 'sk-local',
      ai_base_url: 'https://ai.example/v1',
      ai_api_protocol: 'responses',
      ai_model: 'demo-model',
      ai_system_prompt: '自定义提示词',
    })
  })

  it('maps main settings switches into setting groups', () => {
    const shell = applyConfigToShell(emptyShellState, settings, baseConfig, null)
    const fieldIds = shell.settingsGroups.flatMap((group) => group.fields.map((field) => field.id))
    const autosaveField = shell.settingsGroups.flatMap((group) => group.fields).find((field) => field.id === 'autosave')

    expect(fieldIds).toEqual(expect.arrayContaining([
      'ask-save-on-close',
      'prevent-sleep',
      'task-result-notification',
      'submission-report-telemetry',
      'auto-save-logs',
      'autosave',
      'auto-update',
    ]))
    expect(autosaveField?.options).toEqual(['3', '5', '10', '20', '30', '50'])
  })

  it('labels provider question types', () => {
    expect(questionTypeLabel({ provider_type: 'matrix', type_code: '', num: 1 } as any)).toBe('矩阵题')
    expect(questionTypeLabel({ provider_type: '', type_code: '7', num: 1 } as any)).toBe('下拉题')
  })

  it('keeps more-page data available in the shell model', () => {
    const shell = applyConfigToShell(emptyShellState, settings, baseConfig, null)

    expect(shell.aboutItems.length).toBeGreaterThan(0)
    expect(shell.donateItems.length).toBeGreaterThan(0)
  })
})
