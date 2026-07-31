import { isParsedConfig, type WizardDraft, type WizardStepId } from './configWizardModel'
import type { ConfigDocument } from '../../types'
import { isHttpProxyAddress } from '../../services/configDocumentValues'
import { networkMode } from './networkStepModel'

export interface WizardValidationResult {
  valid: boolean
  message?: string
}

export interface TaskValidationErrors {
  target?: string
  threads?: string
  submitInterval?: string
  answerDatetimeWindow?: string
}

export function isRealSurveyConfig(config: ConfigDocument): boolean {
  return Boolean(isHttpUrl(config.survey.url)
    && config.survey.definition.questions?.some((question) => !question.is_description))
}

export function hasAnswerStrategyCoverage(config: ConfigDocument): boolean {
  const questions = config.survey.definition.questions?.filter((question) => !question.is_description) ?? []
  if (!questions.length) return false

  const strategyQuestionNumbers = new Set(
    (config.answers.questions ?? [])
      .map((strategy) => strategy.question_num)
      .filter((questionNum): questionNum is number => typeof questionNum === 'number'),
  )
  return questions.every((question) => strategyQuestionNumbers.has(question.num))
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
    if (!isRealSurveyConfig(config)) return invalid('问卷解析结果没有真实可作答题目。')
  }

  if (step === 'task') {
    const errors = getTaskValidationErrors(config)
    const message = errors.target ?? errors.threads ?? errors.submitInterval ?? errors.answerDatetimeWindow
    if (message) return invalid(message)
  }

  if (step === 'network') {
    const mode = networkMode(config.network)
    if (mode === 'fixed' && !isHttpProxyAddress(config.network.fixedProxyAddress)) {
      return invalid('固定代理模式需要填写有效的 HTTP 或 HTTPS 代理地址。')
    }
    if (mode === 'random' && config.network.proxySource === 'custom' && !isHttpUrl(config.network.customProxyApi ?? '')) {
      return invalid('启用自定义代理时，请填写有效的代理 API 地址。')
    }
  }

  if (step === 'answers') {
    if (!isRealSurveyConfig(config)) return invalid('问卷解析结果没有真实可作答题目。')
    if (!hasAnswerStrategyCoverage(config)) return invalid('请先为每道可作答题目生成答案策略。')
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

  if (step === 'run') {
    return { valid: true }
  }

  return { valid: true }
}

function hasUsableCredential(draft: WizardDraft): boolean {
  if (draft.credential.operation === 'replace') return Boolean(draft.credential.value.trim())
  if (draft.credential.operation === 'clear') return false
  return draft.aiProfile.hasAPIKey
}

export function getAnswerDatetimeWindowError(config: ConfigDocument): string {
  const provider = (config.survey.provider || config.survey.definition.provider).trim().toLowerCase()
  if (provider !== 'credamo') return ''

  const [start = '', end = ''] = config.execution.answerDatetimeWindow ?? []
  if (!start && !end) return ''
  if (!start || !end) return '时间窗口需要同时设置开始和结束时间。'

  const startTime = parseLocalDateTime(start)
  const endTime = parseLocalDateTime(end)
  if (!startTime || !endTime) return '时间窗口格式无效，请重新选择日期和时间。'
  if (endTime <= startTime) return '结束时间必须晚于开始时间。'

  const maxDuration = config.execution.answerDuration?.[1] ?? 0
  if (endTime.getTime() - startTime.getTime() < maxDuration * 1000) {
    return '时间窗口必须覆盖最长作答时长。'
  }
  return ''
}

export function getTaskValidationErrors(config: ConfigDocument): TaskValidationErrors {
  const errors: TaskValidationErrors = {}
  const targetValid = isWholeNumberInRange(config.execution.target, 1, 999999)
  const threadsValid = isWholeNumberInRange(config.execution.threads, 1, 128)

  if (!targetValid) {
    errors.target = '目标份数必须是 1 到 999999 之间的整数。'
  }
  if (!threadsValid) {
    errors.threads = '并发数必须是 1 到 128 之间的整数。'
  } else if (targetValid && config.execution.threads > config.execution.target) {
    errors.threads = '并发数不能大于目标份数。'
  }
  if (!validPair(config.execution.submitInterval, 0, 1800)) {
    errors.submitInterval = '提交间隔范围无效，请检查起止秒数。'
  }
  const datetimeWindowError = getAnswerDatetimeWindowError(config)
  if (datetimeWindowError) {
    errors.answerDatetimeWindow = datetimeWindowError
  }
  return errors
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

function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim())
  if (!match) return null
  const parts = match.slice(1).map(Number)
  const result = new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])
  return result.getFullYear() === parts[0]
    && result.getMonth() === parts[1] - 1
    && result.getDate() === parts[2]
    && result.getHours() === parts[3]
    && result.getMinutes() === parts[4]
    && result.getSeconds() === parts[5]
    ? result
    : null
}

function invalid(message: string): WizardValidationResult {
  return { valid: false, message }
}
