import { normalizePair, type WizardDraft } from './configWizardModel'
import { normalizeNetworkMode } from '../../services/configDocumentValues'

export interface WizardReviewItem {
  label: string
  value: string
}

export function buildWizardReviewItems(draft: WizardDraft): WizardReviewItem[] {
  const config = draft.config
  const questions = config.survey.definition.questions?.length ?? 0
  const [intervalStart, intervalEnd] = normalizePair(config.execution.submitInterval, [0, 0])
  const [durationStart, durationEnd] = normalizePair(config.execution.answerDuration, [60, 120])
  return [
    { label: '问卷', value: config.survey.title.trim() || '未命名问卷' },
    { label: '平台', value: resolveProviderLabel(config.survey.provider) },
    { label: '题目', value: `${questions} 题` },
    { label: '目标份数', value: `${config.execution.target} 份` },
    { label: '并发数', value: `${config.execution.threads} 路` },
    { label: '提交间隔', value: `${intervalStart}–${intervalEnd} 秒` },
    { label: '作答时长', value: `${durationStart}–${durationEnd} 秒` },
    {
      label: '网络',
      value: networkLabel(config),
    },
    {
      label: '答案来源',
      value: config.reverseFill.enabled
        ? 'Excel 反填'
        : draft.aiProfile.mode === 'provider' ? '自定义 AI 服务' : '限时免费 AI',
    },
  ]
}

function resolveProviderLabel(value: string): string {
  if (value === 'qq' || value === 'tencent') return '腾讯问卷'
  if (value === 'credamo') return '见数'
  return '问卷星'
}

function resolveProxyLabel(value: string): string {
  if (value === 'benefit' || value === '限时福利') return '限时福利'
  if (value === 'custom' || value === '自定义') return '自定义'
  return '默认'
}

function networkLabel(config: WizardDraft['config']): string {
  const mode = normalizeNetworkMode(config.network.proxyMode, config.network)
  if (mode === 'fixed') return '固定代理'
  if (mode === 'random') return `随机 IP · ${resolveProxyLabel(config.network.proxySource)}`
  return '直连'
}
