import { isParsedConfig, type WizardDraft, type WizardStepId } from './configWizardModel'

export interface WizardValidationResult {
  valid: boolean
  message?: string
}

export function validateWizardStep(
  step: WizardStepId,
  draft: WizardDraft,
  parsed = isParsedConfig(draft),
): WizardValidationResult {
  const config = draft.config
  if (step === 'survey') {
    if (!config.survey.url.trim()) return invalid('请先输入问卷链接。')
    if (!isHttpUrl(config.survey.url)) return invalid('问卷链接需要以 http:// 或 https:// 开头。')
    if (!parsed) return invalid('请先解析问卷，确认问卷内容后再继续。')
  }

  if (step === 'task') {
    if (!isWholeNumberInRange(config.execution.target, 1, 999999)) {
      return invalid('目标份数必须是 1 到 999999 之间的整数。')
    }
    if (!isWholeNumberInRange(config.execution.threads, 1, 128)) {
      return invalid('并发数必须是 1 到 128 之间的整数。')
    }
    if (!validPair(config.execution.submitInterval, 0, 1800)) {
      return invalid('提交间隔范围无效，请检查起止秒数。')
    }
  }

  if (step === 'network' && config.network.proxySource === 'custom') {
    if (config.network.randomProxyEnabled && !isHttpUrl(config.network.customProxyApi ?? '')) {
      return invalid('启用自定义代理时，请填写有效的代理 API 地址。')
    }
  }

  if (step === 'answers') {
    if (!validPair(config.execution.answerDuration, 1, 3600)) {
      return invalid('作答时长范围无效，请检查起止秒数。')
    }
    if (draft.aiProfile.mode === 'provider' && !hasUsableCredential(draft)) {
      return invalid('使用自定义 AI 服务时，请填写 API 密钥。')
    }
    if (draft.aiProfile.mode === 'provider' && draft.aiProfile.provider === 'custom' && !isHttpUrl(draft.aiProfile.baseURL ?? '')) {
      return invalid('请填写有效的 AI 接口地址。')
    }
    if (config.reverseFill.enabled && !config.reverseFill.sourcePath?.trim()) {
      return invalid('启用反填时，请先选择数据文件。')
    }
  }

  if (step === 'review') {
    for (const requiredStep of ['survey', 'task', 'network', 'answers'] as const) {
      const result = validateWizardStep(requiredStep, draft, parsed)
      if (!result.valid) return result
    }
  }

  return { valid: true }
}

function hasUsableCredential(draft: WizardDraft): boolean {
  if (draft.credential.operation === 'replace') return Boolean(draft.credential.value.trim())
  if (draft.credential.operation === 'clear') return false
  return draft.aiProfile.hasAPIKey
}

function validPair(value: number[] | undefined, min: number, max: number): boolean {
  if (!value || value.length < 2) return false
  const [start, end] = value
  return Number.isInteger(start) && Number.isInteger(end)
    && start >= min && end >= min && start <= max && end <= max && start <= end
}

function isWholeNumberInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim())
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function invalid(message: string): WizardValidationResult {
  return { valid: false, message }
}
