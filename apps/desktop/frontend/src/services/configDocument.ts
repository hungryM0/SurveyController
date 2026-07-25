import type { ConfigDocument } from '../types'
import { createEmptyConfigDocument, inferProvider } from './configDocumentDefaults'
import {
  clampFloat,
  clampInt,
  formatDateTimeWindow,
  normalizePair,
  normalizeProvider,
  normalizeProxyAreaCode,
  normalizeProxySource,
  normalizeRandomUARatios,
  normalizeStringPair,
  parseDateTimeWindowPair,
  parseRangePair,
  proxyValue,
  updateRandomUARatio,
} from './configDocumentValues'

export { createEmptyConfigDocument, formatDateTimeWindow, normalizePair, normalizeStringPair, parseRangePair }

export function cloneConfigDocument(config: ConfigDocument): ConfigDocument {
  return structuredClone(config)
}

export function normalizeConfigDocument(config: ConfigDocument): ConfigDocument {
  const next = cloneConfigDocument(config)
  const provider = normalizeProvider(next.survey.provider, next.survey.url)
  const threads = clampInt(next.execution.threads, 1, 128, 1)

  next.schemaVersion = 2
  next.survey.url = next.survey.url?.trim() ?? ''
  next.survey.provider = provider
  next.survey.title = next.survey.title?.trim() ?? ''
  next.survey.definition.provider = provider
  next.survey.definition.title = next.survey.title || next.survey.definition.title || ''
  next.survey.definition.questions ??= []
  next.execution.target = clampInt(next.execution.target, 1, 999999, 1)
  next.execution.threads = threads
  next.execution.submitInterval = normalizePair(next.execution.submitInterval, [0, 0])
  next.execution.answerDuration = normalizePair(next.execution.answerDuration, [60, 120])
  next.execution.answerDatetimeWindow = normalizeStringPair(next.execution.answerDatetimeWindow)
  next.execution.failStop ??= true
  next.execution.pauseOnAliyunCaptcha ??= true
  next.network.randomProxyEnabled = Boolean(next.network.randomProxyEnabled)
  next.network.proxySource = normalizeProxySource(next.network.proxySource)
  next.network.customProxyApi = next.network.customProxyApi?.trim() ?? ''
  next.network.proxyAreaCode = normalizeProxyAreaCode(next.network.proxyAreaCode)
  next.network.randomUaEnabled = Boolean(next.network.randomUaEnabled)
  next.network.randomUaRatios = normalizeRandomUARatios(next.network.randomUaRatios)
  next.answers.rules ??= []
  next.answers.dimensions ??= []
  next.answers.questions ??= []
  next.reverseFill.enabled = Boolean(next.reverseFill.enabled)
  next.reverseFill.sourcePath = next.reverseFill.sourcePath?.trim() ?? ''
  next.reverseFill.format ||= 'auto'
  next.reverseFill.startRow = clampInt(next.reverseFill.startRow, 1, 999999, 1)
  next.reverseFill.threads = clampInt(next.reverseFill.threads, 1, 128, threads)
  next.psychometrics.enabled = Boolean(next.psychometrics.enabled)
  next.psychometrics.targetAlpha = clampFloat(next.psychometrics.targetAlpha, 0.6, 0.95, 0.85)
  return next
}

export function updateConfigDocumentField(
  config: ConfigDocument,
  fieldId: string,
  rawValue: string | boolean,
): ConfigDocument {
  const next = normalizeConfigDocument(config)
  const text = String(rawValue)
  switch (fieldId) {
    case 'target':
      next.execution.target = clampInt(Number(text), 1, 999999, 1)
      break
    case 'threads':
      next.execution.threads = clampInt(Number(text), 1, 128, 1)
      next.reverseFill.threads = Math.max(1, next.reverseFill.threads || next.execution.threads)
      break
    case 'interval':
      next.execution.submitInterval = parseRangePair(text, [0, 0])
      break
    case 'answer-duration':
      next.execution.answerDuration = parseRangePair(text, [60, 120])
      break
    case 'answer-datetime-window':
      next.execution.answerDatetimeWindow = parseDateTimeWindowPair(text)
      break
    case 'random-ip':
      next.network.randomProxyEnabled = Boolean(rawValue)
      break
    case 'proxy-source':
      next.network.proxySource = proxyValue(text)
      break
    case 'custom-proxy-api':
      next.network.customProxyApi = text
      break
    case 'proxy-area-code':
      next.network.proxyAreaCode = normalizeProxyAreaCode(text)
      break
    case 'random-ua':
      next.network.randomUaEnabled = Boolean(rawValue)
      break
    case 'random-ua-wechat':
      next.network.randomUaRatios = updateRandomUARatio(next.network.randomUaRatios, 'wechat', Number(text))
      break
    case 'random-ua-mobile':
      next.network.randomUaRatios = updateRandomUARatio(next.network.randomUaRatios, 'mobile', Number(text))
      break
    case 'random-ua-pc':
      next.network.randomUaRatios = updateRandomUARatio(next.network.randomUaRatios, 'pc', Number(text))
      break
    case 'fail-stop':
      next.execution.failStop = Boolean(rawValue)
      break
    case 'pause-captcha':
      next.execution.pauseOnAliyunCaptcha = Boolean(rawValue)
      break
    case 'reverse-fill-enabled':
      next.reverseFill.enabled = Boolean(rawValue)
      break
    case 'reverse-fill-path':
      next.reverseFill.sourcePath = text
      break
    case 'reverse-fill-format':
      next.reverseFill.format = text
      break
    case 'reverse-fill-start-row':
      next.reverseFill.startRow = clampInt(Number(text), 1, 999999, 1)
      break
    case 'reverse-fill-threads':
      next.reverseFill.threads = clampInt(Number(text), 1, 128, next.execution.threads)
      break
    case 'reliability-mode':
      next.psychometrics.enabled = Boolean(rawValue)
      break
    case 'psycho-target-alpha':
      next.psychometrics.targetAlpha = clampFloat(Number(text), 0.6, 0.95, 0.85)
      break
  }
  return normalizeConfigDocument(next)
}

export function mergeParsedDocument(
  current: ConfigDocument,
  parsed: ConfigDocument,
  url = parsed.survey.url,
): ConfigDocument {
  const next = normalizeConfigDocument(parsed)
  next.survey.url = url
  next.execution = structuredClone(current.execution)
  next.network = structuredClone(current.network)
  next.reverseFill = structuredClone(current.reverseFill)
  next.psychometrics = structuredClone(current.psychometrics)
  return normalizeConfigDocument(next)
}

export function updateSurveyURL(config: ConfigDocument, value: string): ConfigDocument {
  const next = normalizeConfigDocument(config)
  if (value === next.survey.url) {
    next.survey.url = value
    return next
  }
  const provider = inferProvider(value)
  next.survey = {
    url: value,
    provider,
    title: '',
    definition: {
      provider,
      title: '',
      questions: [],
    },
  }
  next.answers = { rules: [], dimensions: [], questions: [] }
  return next
}

export function isParsedDocument(config: ConfigDocument | null | undefined): boolean {
  if (!config?.survey.url.trim()) {
    return false
  }
  return Boolean(config.survey.definition.questions?.length || config.answers.questions?.length)
}
