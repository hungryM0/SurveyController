import type { RuntimeConfig } from '../../types'

export type WizardStepId = 'survey' | 'task' | 'network' | 'answers' | 'review'

export interface WizardStepDefinition {
  id: WizardStepId
  title: string
  description: string
}

export const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  { id: 'survey', title: '添加问卷', description: '输入链接并解析问卷结构' },
  { id: 'task', title: '任务设置', description: '设置提交数量和并发方式' },
  { id: 'network', title: '网络设置', description: '选择代理和访问身份' },
  { id: 'answers', title: '答案设置', description: '设置作答时长和答案辅助' },
  { id: 'review', title: '检查并完成', description: '确认配置后保存' },
]

export type WizardDraft = RuntimeConfig

const PRESERVED_SETTING_KEYS: readonly (keyof RuntimeConfig)[] = [
  'target',
  'threads',
  'submit_interval',
  'answer_duration',
  'answer_datetime_window',
  'random_ip_enabled',
  'proxy_source',
  'custom_proxy_api',
  'proxy_area_code',
  'random_ua_enabled',
  'random_ua_ratios',
  'random_ua_preset',
  'fail_stop_enabled',
  'pause_on_aliyun_captcha',
  'reliability_mode_enabled',
  'psycho_target_alpha',
  'ai_mode',
  'ai_provider',
  'ai_api_key',
  'ai_base_url',
  'ai_api_protocol',
  'ai_model',
  'ai_system_prompt',
  'reverse_fill_enabled',
  'reverse_fill_source_path',
  'reverse_fill_format',
  'reverse_fill_start_row',
  'reverse_fill_threads',
]

const QUESTION_DATA_KEYS: readonly (keyof RuntimeConfig)[] = [
  'survey_title',
  'survey_provider',
  'question_entries',
  'questions_info',
  'answer_rules',
  'dimension_groups',
]

export function cloneWizardDraft(config: RuntimeConfig | null | undefined): WizardDraft {
  if (!config) {
    return { url: '' }
  }

  // RuntimeConfig is a JSON-shaped value. Clone nested arrays and records so
  // edits in the wizard never mutate the object owned by App.
  return cloneJsonValue(config) as WizardDraft
}

function cloneJsonValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneJsonValue(item)) as T
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = cloneJsonValue(item)
    }
    return result as T
  }
  return value
}

export function createWizardDraft(config: RuntimeConfig | null | undefined): WizardDraft {
  const draft = cloneWizardDraft(config)
  return {
    ...draft,
    url: draft.url ?? '',
    target: clampInt(draft.target, 1, 999999, 1),
    threads: clampInt(draft.threads, 1, 128, 1),
    submit_interval: normalizePair(draft.submit_interval, [0, 0]),
    answer_duration: normalizePair(draft.answer_duration, [60, 120]),
    random_ip_enabled: Boolean(draft.random_ip_enabled),
    proxy_source: draft.proxy_source || 'default',
    custom_proxy_api: draft.custom_proxy_api ?? '',
    random_ua_enabled: Boolean(draft.random_ua_enabled),
    fail_stop_enabled: draft.fail_stop_enabled ?? true,
    pause_on_aliyun_captcha: draft.pause_on_aliyun_captcha ?? true,
    reliability_mode_enabled: draft.reliability_mode_enabled ?? true,
    ai_mode: draft.ai_mode || 'free',
    ai_provider: draft.ai_provider || 'deepseek',
    ai_api_key: draft.ai_api_key ?? '',
    ai_base_url: draft.ai_base_url ?? '',
    ai_model: draft.ai_model ?? '',
  }
}

/**
 * Merge parser output without letting parser defaults overwrite choices the
 * user already made in the wizard.
 */
export function mergeParsedConfig(current: RuntimeConfig, parsed: RuntimeConfig, url = parsed.url): WizardDraft {
  const next = cloneWizardDraft(parsed)
  next.url = url
  for (const key of PRESERVED_SETTING_KEYS) {
    if (current[key] !== undefined) {
      ;(next as unknown as Record<string, unknown>)[key] = cloneJsonValue(current[key])
    }
  }
  return createWizardDraft(next)
}

export function updateWizardURL(current: RuntimeConfig, value: string): WizardDraft {
  const next = createWizardDraft(current)
  if (value === current.url) {
    return { ...next, url: value }
  }

  // A changed URL invalidates all parser-owned data. It must be parsed again
  // before the user can continue to task settings.
  for (const key of QUESTION_DATA_KEYS) {
    delete next[key]
  }
  return { ...next, url: value }
}

export function isParsedConfig(config: RuntimeConfig | null | undefined): boolean {
  if (!config || !String(config.url ?? '').trim()) {
    return false
  }
  return (config.questions_info?.length ?? 0) > 0
    || (config.question_entries?.length ?? 0) > 0
}

export function normalizePair(value: number[] | undefined, fallback: [number, number]): [number, number] {
  const start = finiteNumber(value?.[0], fallback[0])
  const end = finiteNumber(value?.[1], fallback[1])
  return start <= end ? [start, end] : [end, start]
}

export function formatPair(value: number[] | undefined, fallback: [number, number]): string {
  const [start, end] = normalizePair(value, fallback)
  return `${start}-${end}`
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return fallback
  }
  return Math.min(max, Math.max(min, Math.round(numeric)))
}

function finiteNumber(value: unknown, fallback: number): number {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback
}
