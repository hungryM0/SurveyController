import type { RuntimeConfig } from '../../types'
import { normalizePair } from './configWizardModel'

export interface WizardReviewItem {
  label: string
  value: string
}

export function buildWizardReviewItems(draft: RuntimeConfig): WizardReviewItem[] {
  const questions = draft.questions_info?.length || draft.question_entries?.length || 0
  const [intervalStart, intervalEnd] = normalizePair(draft.submit_interval, [0, 0])
  const [durationStart, durationEnd] = normalizePair(draft.answer_duration, [60, 120])
  return [
    { label: '问卷', value: draft.survey_title?.trim() || '未命名问卷' },
    { label: '平台', value: resolveProviderLabel(draft.survey_provider) },
    { label: '题目', value: `${questions} 题` },
    { label: '目标份数', value: `${draft.target ?? 1} 份` },
    { label: '并发数', value: `${draft.threads ?? 1} 路` },
    { label: '提交间隔', value: `${intervalStart}–${intervalEnd} 秒` },
    { label: '作答时长', value: `${durationStart}–${durationEnd} 秒` },
    {
      label: '网络',
      value: draft.random_ip_enabled ? `随机 IP · ${resolveProxyLabel(draft.proxy_source)}` : '直连',
    },
    {
      label: '答案来源',
      value: draft.reverse_fill_enabled
        ? 'Excel 反填'
        : draft.ai_mode === 'provider' ? '自定义 AI 服务' : '限时免费 AI',
    },
  ]
}

function resolveProviderLabel(value: string | undefined): string {
  switch (value) {
    case 'qq':
    case 'tencent':
      return '腾讯问卷'
    case 'credamo':
      return '见数'
    default:
      return '问卷星'
  }
}

function resolveProxyLabel(value: string | undefined): string {
  switch (value) {
    case 'benefit':
    case '限时福利':
      return '限时福利'
    case 'custom':
    case '自定义':
      return '自定义'
    default:
      return '默认'
  }
}
