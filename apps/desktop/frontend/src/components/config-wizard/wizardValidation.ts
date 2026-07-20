import type { RuntimeConfig } from '../../types'
import { isParsedConfig, type WizardStepId } from './configWizardModel'

export interface WizardValidationResult {
  valid: boolean
  message?: string
}

export function validateWizardStep(
  step: WizardStepId,
  draft: RuntimeConfig,
  parsed = isParsedConfig(draft),
): WizardValidationResult {
  if (step === 'survey') {
    if (!String(draft.url ?? '').trim()) {
      return { valid: false, message: '请先输入问卷链接。' }
    }
    if (!isHttpUrl(draft.url)) {
      return { valid: false, message: '问卷链接需要以 http:// 或 https:// 开头。' }
    }
    if (!parsed) {
      return { valid: false, message: '请先解析问卷，确认问卷内容后再继续。' }
    }
  }

  if (step === 'task') {
    if (!isWholeNumberInRange(draft.target, 1, 999999)) {
      return { valid: false, message: '目标份数必须是 1 到 999999 之间的整数。' }
    }
    if (!isWholeNumberInRange(draft.threads, 1, 128)) {
      return { valid: false, message: '并发数必须是 1 到 128 之间的整数。' }
    }
    if (!validPair(draft.submit_interval, 0, 1800)) {
      return { valid: false, message: '提交间隔范围无效，请检查起止秒数。' }
    }
  }

  if (step === 'network' && (draft.proxy_source === 'custom' || draft.proxy_source === '自定义')) {
    if (draft.random_ip_enabled && !isHttpUrl(draft.custom_proxy_api ?? '')) {
      return { valid: false, message: '启用自定义代理时，请填写有效的代理 API 地址。' }
    }
  }

  if (step === 'answers') {
    if (!validPair(draft.answer_duration, 1, 3600)) {
      return { valid: false, message: '作答时长范围无效，请检查起止秒数。' }
    }
    if (draft.ai_mode === 'provider' && !String(draft.ai_api_key ?? '').trim()) {
      return { valid: false, message: '使用自定义 AI 服务时，请填写 API 密钥。' }
    }
    if (draft.ai_mode === 'provider' && draft.ai_provider === 'custom' && !isHttpUrl(draft.ai_base_url ?? '')) {
      return { valid: false, message: '请填写有效的 AI 接口地址。' }
    }
    if (draft.reverse_fill_enabled && !String(draft.reverse_fill_source_path ?? '').trim()) {
      return { valid: false, message: '启用反填时，请先选择数据文件。' }
    }
  }

  if (step === 'review') {
    for (const requiredStep of ['survey', 'task', 'network', 'answers'] as const) {
      const result = validateWizardStep(requiredStep, draft, parsed)
      if (!result.valid) {
        return result
      }
    }
  }

  return { valid: true }
}

function validPair(value: number[] | undefined, min: number, max: number): boolean {
  if (!value || value.length < 2) {
    return false
  }
  const [start, end] = value
  return Number.isFinite(start) && Number.isFinite(end) && Number.isInteger(start) && Number.isInteger(end)
    && start >= min && end >= min && start <= max && end <= max && start <= end
}

function isWholeNumberInRange(value: unknown, min: number, max: number): boolean {
  const numeric = Number(value)
  return Number.isInteger(numeric) && numeric >= min && numeric <= max
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}
